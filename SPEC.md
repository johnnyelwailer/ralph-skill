# Issue #74: Proof agent: baseline management and subagent delegation hints

## Objective
Complete the proof-agent plumbing so proof artifacts are reusable across iterations and delegation guidance is injected only when supported.

This issue delivers two missing behaviors:
1. Baseline management after review approval (copy approved proof artifacts into `artifacts/baselines/`).
2. `{{SUBAGENT_HINTS}}` expansion for proof prompts (opencode only, empty for other providers).

## Architectural Context
- Loop runners (`aloop/bin/loop.sh`, `aloop/bin/loop.ps1`) are execution orchestrators only. They may invoke host utilities but must not implement business logic (Constitution Rule 1).
- Proof baseline selection/copying is runtime business logic and belongs in TypeScript under `aloop/cli/src/`, then invoked from loop scripts as a thin hook.
- Prompt compilation currently happens in `aloop/cli/src/commands/compile-loop-plan.ts` (cycle/frontmatter generation). This is the correct integration point to inject provider+phase-aware `{{SUBAGENT_HINTS}}` into compiled prompt files.
- Proof artifacts are produced under `${SESSION_DIR}/artifacts/iter-<N>/` with `proof-manifest.json`; baseline source files must be taken only from manifest-declared `baselines_updated` entries.
- `aloop/templates/subagent-hints-proof.md` is the phase hint source and must match the SPEC delegation model (vision, accessibility, perf analyzers).

## Scope
In-scope implementation files:
- `aloop/cli/src/update-baselines.ts` (new): TypeScript utility that:
  - Reads latest proof manifest.
  - Copies `baselines_updated` artifacts into `artifacts/baselines/`.
  - Creates target directory when missing.
  - Runs only when review verdict is PASS.
- `aloop/bin/loop.sh`: minimal post-review hook to call the TS utility.
- `aloop/bin/loop.ps1`: minimal post-review hook to call the TS utility.
- `aloop/cli/src/commands/compile-loop-plan.ts`: add `{{SUBAGENT_HINTS}}` expansion with provider/phase logic.
- `aloop/templates/PROMPT_proof.md`: ensure `{{SUBAGENT_HINTS}}` placeholder is present where delegation guidance belongs.
- `aloop/templates/subagent-hints-proof.md`: include `vision-reviewer`, `accessibility-checker`, and `perf-analyzer` guidance.

In-scope tests:
- `aloop/cli/src/commands/compile-loop-plan.test.ts` (or equivalent prompt-compilation tests).
- `aloop/cli/src/update-baselines.test.ts` (new).
- `aloop/bin/loop.tests.ps1` and/or relevant loop shell tests for hook invocation behavior.

## Out of Scope
Do not modify:
- Orchestrator/GitHub workflows (`aloop/cli/src/commands/orchestrate.ts`, `process-requests.ts`, GH command flows). This issue is loop proof plumbing only (Constitution Rules 2, 12, 19).
- Dashboard parsing/rendering (`aloop/cli/src/commands/dashboard.ts` and dashboard UI). No UI feature work is required (Rule 12).
- Pipeline topology or unrelated prompt sequencing in `.aloop/pipeline.yml` (Rule 19).
- Provider feature expansion for non-opencode delegation. claude/copilot/codex support remains intentionally empty for now per SPEC scope (Rule 12).

## Constraints
- Keep shell/PowerShell changes as thin wrappers only; all baseline decision logic must live in TypeScript (Constitution Rule 1).
- Preserve inner-loop/runtime separation: no GH/network side effects added to loop runners (Rule 2).
- Use manifest-driven behavior only; do not hardcode artifact filenames (Rules 6, 15).
- Limit the change to this concern; no refactors unrelated to proof baselines or subagent hint expansion (Rules 12, 19).
- Add/adjust automated tests for every new behavior (Rule 11).

## Deliverables
### 1. Baseline copy after review approval
- Add TypeScript baseline utility and invoke it after review PASS.
- Utility reads latest `proof-manifest.json` and copies each path in `baselines_updated` into `artifacts/baselines/`.
- Create `artifacts/baselines/` on demand.

### 2. `{{SUBAGENT_HINTS}}` template variable expansion
- Expand `{{SUBAGENT_HINTS}}` during prompt compilation.
- Proof phase under `opencode` receives proof-phase hints.
- Non-delegation providers receive an empty string.

### 3. Update proof hint content
- `aloop/templates/subagent-hints-proof.md` must include:
  - `vision-reviewer`
  - `accessibility-checker`
  - `perf-analyzer`

## Acceptance Criteria
- [ ] When review verdict is PASS and latest proof manifest contains `baselines_updated`, each listed artifact is copied to `artifacts/baselines/` with the same filename.
- [ ] `artifacts/baselines/` is created automatically if absent.
- [ ] When review verdict is FAIL (or no PASS verdict), baseline copy is a no-op.
- [ ] Baseline update logic resides in TypeScript (`aloop/cli/src/update-baselines.ts`); loop scripts only invoke it.
- [ ] `{{SUBAGENT_HINTS}}` is replaced with proof hints for opencode proof prompts during compile.
- [ ] `{{SUBAGENT_HINTS}}` resolves to empty string for non-opencode providers.
- [ ] `subagent-hints-proof.md` includes vision, accessibility, and perf subagent entries.
- [ ] Automated tests cover PASS copy path, FAIL/no-op path, missing-directory creation, and provider-conditional hint expansion.

## Labels
`aloop/sub-issue`, `aloop/needs-refine`

**Wave:** 1
**Dependencies:** none

