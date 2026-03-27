# Sub-Spec: Issue #101 — Proof artifact storage, baseline management, and manifest validation

## Objective

Implement the runtime infrastructure for proof artifact storage: directory creation before proof agent runs, baseline directory initialization, post-proof manifest existence checks, and expanded subagent delegation hints. Business logic (JSON validation, skip-protocol detection, baseline promotion) belongs in the runtime layer, not in the loop scripts.

## Architectural Context

The proof phase runs as a normal loop iteration, selected via the loop-plan.json or the 8-step cycle (`plan-build-review` mode). The loop invokes the proof agent the same way it invokes any other phase — by running `invoke_provider` with the resolved prompt content.

**What already exists:**
- `ARTIFACTS_DIR="$SESSION_DIR/artifacts"` is set at `loop.sh:260` and `$artifactsDir = Join-Path $SessionDir "artifacts"` at `loop.ps1:836`
- `{{ARTIFACTS_DIR}}` and `{{ITERATION}}` are already substituted by `substitute_prompt_placeholders` (`loop.sh:283-292`; `loop.ps1:949-954`)
- `mkdir -p "$SESSION_DIR/artifacts/iter-$ITERATION"` exists in loop.sh at line 2300 — but this runs **after** `invoke_provider` returns, so the proof agent cannot write to it during execution
- `loop.ps1` has no equivalent `mkdir` for `artifacts/iter-N` at all

**What is missing:**
1. `artifacts/iter-N/` must exist **before** the proof agent is invoked
2. `artifacts/baselines/` is never created
3. No check that `proof-manifest.json` was written after the proof phase
4. `subagent-hints-proof.md` is sparse (5 lines); lacks vision-model delegation examples

**Baseline promotion** is specified in SPEC line 601: _"After review approval: Current screenshots replace baselines (harness copies them)."_ The word "harness" in the spec refers to the aloop CLI runtime (`process-requests.ts` / `aloop` CLI), not to `loop.sh`. Promotion requires knowing whether the review was approved — this is business logic that must live in the runtime, not in a loop script (constitution rule #1).

**Manifest JSON validation and skip-protocol detection** (parsing JSON to check for empty `artifacts` array) are also business logic and must live in the runtime. The loop script may only perform an existence check.

## Scope

Files in-scope for modification:

- `aloop/bin/loop.sh` — move `mkdir -p artifacts/iter-N` to before `invoke_provider`; add `mkdir -p "$ARTIFACTS_DIR/baselines"` at session init; add existence-only check for `proof-manifest.json` after proof phase; write structured log entry on proof completion
- `aloop/bin/loop.ps1` — add equivalent `New-Item -ItemType Directory -Force` calls for `artifacts/iter-N` (before provider invoke) and `artifacts/baselines` (at session init); existence check + log entry after proof phase
- `aloop/templates/subagent-hints-proof.md` — expand with concrete vision-model delegation examples referencing `aloop/agents/opencode/vision-reviewer.md`

## Out of Scope

- **`proof-manifest.json` JSON structure validation** — business logic, belongs in the runtime (`aloop` CLI). Must NOT be added to loop.sh/loop.ps1 (constitution rule #1: no business logic in loop scripts).
- **Baseline promotion** (copying `iter-N/` artifacts → `baselines/` after review approval) — requires understanding review state, belongs in the runtime. Must NOT be added to loop.sh/loop.ps1 (constitution rule #1).
- **Skip-protocol detection** (parsing manifest to detect empty `artifacts` array) — JSON parsing = business logic, belongs in the runtime. The loop may only log that the manifest was or was not present.
- **Dashboard artifact serving** (`/api/artifacts/<iteration>/<filename>`) — separate issue.
- **Any prompt files other than `subagent-hints-proof.md`** — PROMPT_proof.md is already complete.
- **`process-requests.ts` or any runtime TypeScript** — baseline management and manifest validation for the runtime are separate issues.

## Constraints

- **Constitution rule #1**: loop.sh/loop.ps1 are dumb runners. No business logic, no GH calls, no convention-file processing. No new functions unless explicitly authorized. This issue explicitly authorizes: (a) moving the existing `mkdir -p` to before `invoke_provider`, (b) adding `mkdir -p artifacts/baselines` at session init, (c) adding a file-existence check for the manifest with a log warning.
- **Constitution rule #6**: No hardcoded paths. Use `$ARTIFACTS_DIR` (already defined) and `$ITERATION` (already defined) — never inline the path string.
- **Constitution rule #15**: No hardcoded values — the `proof` mode name must come from the prompt frontmatter (`agent: proof`) which is already parsed into `FRONTMATTER_AGENT`, not hardcoded in the loop.
- **The proof phase is detected by `iter_mode = "proof"` or `FRONTMATTER_AGENT = "proof"`**, not by the `trigger: final-qa` frontmatter field. `FRONTMATTER_TRIGGER` is currently parsed but only logged (`loop.sh:2188`) — it does not drive any conditional logic. The pre-proof mkdir should guard on `iter_mode = "proof"` (or equivalent in ps1) so the baselines dir creation happens at session init, not only on proof phases.
- **Both scripts must behave identically.** Every behavior added to loop.sh must have an equivalent in loop.ps1.
- **The existing `mkdir -p "$SESSION_DIR/artifacts/iter-$ITERATION"` at line 2300** (loop.sh) also creates the iter dir for non-proof phases (for `output.txt` extraction). That post-iteration mkdir must be kept; the new pre-proof mkdir is an additional, earlier creation specifically for the proof agent.

## Acceptance Criteria

- [ ] `artifacts/iter-N/` exists on the filesystem before `invoke_provider` is called for a proof iteration (loop.sh and loop.ps1)
- [ ] `artifacts/baselines/` exists at session init time in both scripts (created with `mkdir -p` / `New-Item -Force` — idempotent)
- [ ] After a proof iteration completes (success or failure), the loop writes a log entry indicating whether `proof-manifest.json` was found at `$ARTIFACTS_DIR/iter-$ITERATION/proof-manifest.json`; missing manifest logs a warning but does NOT fail the iteration
- [ ] `{{ARTIFACTS_DIR}}` and `{{ITERATION}}` resolve correctly in the proof prompt (already works — verify no regression)
- [ ] `subagent-hints-proof.md` includes at least one concrete example of delegating a screenshot to `vision-reviewer` using the task tool, with the correct model reference from `vision-reviewer.md` frontmatter
- [ ] No JSON parsing added to loop.sh or loop.ps1
- [ ] No baseline promotion logic added to loop.sh or loop.ps1
- [ ] All new shell code in loop.sh passes `bash -n` (syntax check)
- [ ] All new PowerShell code in loop.ps1 passes PSScriptAnalyzer or equivalent syntax check

**Wave:** 1  
**Dependencies:** none
