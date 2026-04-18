# Agents

> **Reference document.** Invariants and contracts consumed by agents at runtime. Work items live in GitHub issues; hard rules live in CONSTITUTION.md.
>
> Sources: SPEC.md §Proof-of-Work Phase, §QA Agent, §Spec-Gap Analysis, §Documentation Sync, §CLAUDECODE Sanitization (lines ~398-909) (pre-decomposition, 2026-04-18).

## Table of contents

- Proof-of-work phase
- Default pipeline
- Completion finalizer
- Proof agent behavior
- Proof manifest
- Baseline management
- Proof skip protocol
- Proof prompt template
- QA agent — black-box user testing
- QA artifacts
- QA prompt template
- Spec-gap analysis agent
- Documentation sync agent
- CLAUDECODE environment variable sanitization

---

## Proof-of-work phase

A dedicated agent (`proof`) autonomously decides what evidence to generate for the work completed in preceding build iterations. The proof agent is not told what to prove via keyword matching or hardcoded rules — it inspects the actual work (TODO.md, commits, changed files, SPEC) and uses its judgment to determine what proof is possible, appropriate, and valuable.

## Default pipeline

```
Continuous cycle:  plan → build × 5 → qa → review  (repeats until all tasks done)
                                                      ↓ (all tasks done at cycle boundary)
Finalizer:         spec-gap → docs → spec-review → final-review → final-qa → proof
                      ↓ (any agent adds TODOs)
                   abort finalizer → reset finalizerPosition → resume cycle
```

QA and review run every cycle to catch bugs and code quality issues early. Proof does NOT run in the cycle — it's expensive and only meaningful as final evidence. Proof runs only at the end — it's the last step of the finalizer.

## Completion finalizer

The loop script has two prompt arrays: `cycle[]` (repeating work) and `finalizer[]` (one-shot completion validation). Both are compiled from `pipeline.yml` into `loop-plan.json` at session start.

When all TODO.md tasks are marked done at a **cycle boundary**, the loop switches from the cycle array to the finalizer array. If any finalizer agent creates new TODOs, the finalizer aborts and the cycle resumes. This is entirely self-contained in the loop script — no runtime, no trigger resolution, no external process needed.

**Important:** The finalizer agents are **separate prompt files** from the cycle agents, even when they reuse the same instructions (via `{{include:}}`). This prevents the cycle's `qa` or `review` from accidentally appearing in the finalizer.

**How it works:**

1. Cycle completes (last cycle agent finishes). Loop checks `allTasksMarkedDone` (mechanical TODO.md checkbox count).
2. If false → start next cycle (wrap `cyclePosition` to 0).
3. If true → switch to finalizer mode. Pick prompt at `finalizerPosition` from `finalizer[]`.
4. Run finalizer agent. Advance `finalizerPosition`.
5. **After each finalizer agent**: re-check TODO.md. If new open TODOs → reset `finalizerPosition` to 0, set `allTasksMarkedDone` to false, resume cycle. Log `finalizer_aborted`.
6. If `finalizerPosition` reaches end of `finalizer[]` and no new TODOs → set `state: "completed"` in `status.json`, log `finalizer_completed`, exit loop.

**Queue still takes priority during finalizer** — steering, merge agent, or any other queue entry interrupts the finalizer just like it interrupts the cycle.

**The finalizer agents:**

1. **spec-gap** — validates codebase against SPEC.md. Finds config drift, hallucinated features, cross-runtime parity issues. Analysis only — writes `[spec-gap]` items to TODO.md. If it finds anything, the finalizer aborts and the loop goes back to building.
2. **docs** — syncs documentation to reality. Updates README, CLI help, completeness markers. Can modify doc files.
3. **spec-review** — focuses solely on: "do the changes satisfy the requirements from the spec?" Verifies every acceptance criterion is met. Does NOT look at code quality — only requirement coverage.
4. **final-review** — reuses review instructions (`{{include:instructions/review.md}}`). Same 9 gates as the cycle's review.
5. **final-qa** — reuses QA instructions (`{{include:instructions/qa.md}}`). Final round of user-perspective testing.
6. **proof** — generates human-verifiable evidence: screenshots, API captures, CLI recordings, before/after comparisons. Only runs here, never in the continuous cycle. **This is the only agent whose clean completion means the loop is truly done.**

**Self-healing:** If any finalizer agent creates new TODOs, the loop goes back to plan → build × 5 → qa → review. When all tasks are done again, the entire finalizer fires from the beginning (`finalizerPosition` resets to 0). No partial re-entry.

**`loop-plan.json` structure:**
```json
{
  "cycle": [
    "PROMPT_plan.md",
    "PROMPT_build.md", "PROMPT_build.md", "PROMPT_build.md",
    "PROMPT_build.md", "PROMPT_build.md",
    "PROMPT_qa.md",
    "PROMPT_review.md"
  ],
  "finalizer": [
    "PROMPT_spec-gap.md",
    "PROMPT_docs.md",
    "PROMPT_spec-review.md",
    "PROMPT_final-review.md",
    "PROMPT_final-qa.md",
    "PROMPT_proof.md"
  ],
  "cyclePosition": 0,
  "finalizerPosition": 0,
  "iteration": 1,
  "allTasksMarkedDone": false,
  "version": 1
}
```

## Orchestrator review layer

After a child loop signals completion, the orchestrator performs its own review before creating/merging a PR:

1. **Spec compliance review** — does the child's work match the original issue/sub-spec? The orchestrator has the global picture and checks for scope drift, missing requirements, and cross-issue consistency.
2. **Proof validation** — are the proof artifacts meaningful? Do they actually demonstrate the feature works? Test output and file listings are NOT proof. The orchestrator rejects empty or filler proof.
3. **Integration check** — will this PR conflict with other child loops' work? Does it break the overall architecture?

Only after the orchestrator is satisfied does it create the PR and run automated gates (CI, coverage, merge conflicts).

## Proof agent behavior

The proof agent has full autonomy over what to prove and how. It receives:

**Input (via prompt + worktree context):**
- `TODO.md` — what tasks were worked on this cycle
- Recent commits — what files changed and why
- `SPEC.md` — what acceptance criteria exist
- Available tooling — what's installed (Playwright, curl, node, etc.)
- Previous proof baselines — what the app looked like before (if any)

**The agent decides:**

1. **What needs proof** — inspects the work and determines which deliverables have provable, observable output. Could be UI screenshots, API response captures, CLI behavior captures, before/after visual comparisons, accessibility reports, or videos — whatever is appropriate and human-verifiable.
2. **What proof is possible** — considers what tooling is available. If Playwright is installed and there's a frontend, screenshots are possible. If it's a CLI tool, output captures. If nothing is visually or behaviorally provable (pure refactoring, type-only/internal plumbing changes), the agent says "nothing to prove" and the phase completes as a skip.
3. **How to generate it** — the agent runs the actual commands: launches servers, runs Playwright, captures screenshots, diffs against baselines, saves artifacts. It uses whatever tools make sense.
4. **What to skip** — not everything needs proof. The agent explicitly notes what it chose not to prove and why.

**Subagent delegation**: The proof agent does not need to be a vision model itself. It captures screenshots and delegates visual analysis to a `vision-reviewer` subagent (running on a vision-capable model like Gemini Flash Lite or Seed-2.0-Lite). Similarly, it can delegate accessibility checks to an `accessibility-checker` subagent or performance analysis to a `perf-analyzer`. The proof agent orchestrates; subagents analyze.

**Output:**

The agent writes artifacts to the session directory and produces a manifest:

```
~/.aloop/sessions/<session-id>/
  artifacts/
    iter-<N>/
      proof-manifest.json
      <agent-chosen artifact files>
```

## Proof manifest

The manifest is structured so the reviewer and dashboard can consume it, but the content is entirely agent-determined:

```json
{
  "iteration": 7,
  "phase": "proof",
  "provider": "copilot",
  "timestamp": "2026-03-04T12:00:00Z",
  "summary": "Captured 3 screenshots of the redesigned dashboard layout and verified API health endpoint returns valid JSON.",
  "artifacts": [
    {
      "type": "screenshot",
      "path": "dashboard-main.png",
      "description": "Dashboard main view showing dense layout with TODO, log, and health panels",
      "metadata": { "viewport": "1920x1080", "url": "http://localhost:3000" }
    },
    {
      "type": "visual_diff",
      "path": "dashboard-main-diff.png",
      "description": "Pixel diff against previous baseline — 12.3% change, all in the log panel area",
      "metadata": { "baseline": "baselines/dashboard-main.png", "diff_percentage": 12.3 }
    },
    {
      "type": "api_response",
      "path": "health-endpoint.json",
      "description": "GET /api/state returns valid JSON with session status and provider health",
      "metadata": { "status_code": 200, "content_type": "application/json" }
    }
  ],
  "skipped": [
    {
      "task": "Add provider health file locking in loop.ps1",
      "reason": "PowerShell script internals — no observable external output to capture"
    }
  ],
  "baselines_updated": ["dashboard-main.png"]
}
```

The `type` field is free-form — the agent chooses whatever artifact types make sense. Common types might include `screenshot`, `visual_diff`, `api_response`, `cli_output`, `test_summary`, `accessibility_snapshot`, `video`, but the agent is not limited to these.

## Baseline management

Baselines are stored per-session and updated when the reviewer approves:

```
artifacts/
  baselines/
    dashboard-main.png      ← updated after review approval
    calendar-view.png
```

- **First proof run**: No baselines exist. Agent captures initial screenshots, these become the baselines.
- **Subsequent runs**: Agent diffs against baselines. Large diffs are noted in the manifest.
- **After review approval**: Current screenshots replace baselines (harness copies them).
- **After review rejection**: Baselines stay as-is. Next build + proof cycle generates new screenshots to compare against the unchanged baselines.

## Proof skip protocol

When the proof agent determines nothing is provable:

```json
{
  "iteration": 7,
  "phase": "proof",
  "summary": "No provable artifacts this cycle. All completed tasks involve internal script logic with no observable external output.",
  "artifacts": [],
  "skipped": [
    { "task": "Fix CLAUDECODE env var sanitization", "reason": "Internal env var handling" },
    { "task": "Add file lock retry logic", "reason": "Concurrent file access internals" }
  ]
}
```

The reviewer sees this and can agree (approve) or disagree (reject with "actually, you could have tested the CLI output of `aloop status` after the health file changes").

## Proof prompt template

`PROMPT_proof.md` instructs the agent:
- Read TODO.md for recently completed tasks
- Read recent commits for changed files
- Inspect what tooling is available (Playwright, curl, etc.)
- Decide what proof is valuable and possible
- Produce observable, human-verifiable artifacts (screenshots, API captures, CLI behavior output, visual comparisons, videos when appropriate)
- Do **not** treat CI output as proof (`npm test` pass counts, `tsc --noEmit`, lint summaries)
- Do **not** treat git diffs or commit summaries as proof artifacts
- Generate artifacts, save to `<session-dir>/artifacts/iter-<N>/`
- Write `proof-manifest.json`
- `output.txt` is saved per-iteration (extracted from `LOG_FILE.raw` by byte offset after provider invocation) — contains raw provider output for dashboard parsing (model, tokens, cost)
- If nothing is visually or behaviorally provable, write "nothing to prove" with empty artifacts and explanations in skipped

The prompt does NOT prescribe what types of proof to generate or what tools to use — that's the agent's judgment call.

---

## QA agent — black-box user testing

A dedicated QA agent that tests features as a real user would — running commands, clicking through the dashboard, testing error paths — without ever reading source code. It runs after proof and before review in the default pipeline.

### QA agent behavior

The QA agent is a **black-box tester**. It:
- Reads the SPEC to understand expected behavior (source of truth)
- Reads TODO.md for recently completed tasks (test candidates)
- Reads QA_COVERAGE.md for features never tested or previously failed
- Tests 3-5 features per iteration through their public interface
- Files bugs as `[qa/P1]` tasks in TODO.md with reproduction steps
- Maintains QA_COVERAGE.md (feature × result matrix) and QA_LOG.md (session transcript)
- Commits its own artifacts (QA_COVERAGE.md, QA_LOG.md, TODO.md updates)

**The QA agent NEVER reads source code.** It tests exclusively through CLI commands, HTTP endpoints, and browser interaction (via Playwright).

### Test scope per iteration

- **3-5 features** per QA session — focused and thorough, not broad and shallow
- **Happy path + error paths + edge cases** for each feature
- **Layout verification** (mandatory for dashboard/UI changes) — screenshot at desktop viewport, verify panel count and element visibility match spec
- **GitHub integration E2E** (when GH features are claimed complete) — creates throwaway test repo, runs lifecycle, cleans up. Must use `--max-iterations 3` or similar to keep test runs short. Must clean up even on failure.
- **Re-test previously failed features** from QA_COVERAGE.md

## QA artifacts

- `QA_COVERAGE.md` — feature coverage matrix: feature name, last tested date, commit, PASS/FAIL, notes
- `QA_LOG.md` — append-only session log with full command transcripts, stdout/stderr, exit codes, screenshots
- `[qa/P1]` tasks in TODO.md — bugs with format: `what you did → what happened → what spec says should happen`

## QA prompt template

`PROMPT_qa.md` instructs the agent:
- Study the spec for expected behavior
- Select test targets from recently completed tasks and coverage gaps
- Set up realistic test environments (temp dirs, real git repos, real dependencies)
- Test through public interfaces only (CLI, HTTP, browser)
- Log every command with exact output
- File bugs, update coverage, write session log, commit

---

## Spec-gap analysis agent

A dedicated agent (`PROMPT_spec-gap.md`) that validates codebase consistency against SPEC.md. It runs **both periodically during the loop and in the completion chain**. The loop cannot finish while spec-gap findings remain open.

### Purpose

The plan and review agents focus on individual tasks. Neither cross-references the full spec against the full codebase. This creates drift:
- Config files fall out of sync with runtime code (e.g., `config.yml` missing a provider that loop scripts support)
- Features get implemented but never added to spec, or spec describes features that were never built
- QA/build agents hallucinate features not in spec, and subsequent agents treat them as real
- TODO items reference code that no longer exists

The spec-gap agent catches these systematically.

### When it runs

**1. Periodically during the loop** — runs before every 2nd plan phase (i.e., every other cycle). This catches drift early, while builds are still happening. Gaps found become `[spec-gap]` TODO items that the build agent picks up in the next cycle.

```
Cycle 1:  plan → build x5 → qa → review
Cycle 2:  spec-gap → plan → build x5 → qa → docs → review
Cycle 3:  plan → build x5 → qa → review
Cycle 4:  spec-gap → plan → build x5 → qa → docs → review
...
```

**2. In the finalizer** — spec-gap is the first element of the `finalizer[]` array in `loop-plan.json`. When all tasks are done at the cycle boundary, the loop switches to the finalizer. If spec-gap finds gaps, it creates new TODO items, the finalizer aborts, and the cycle resumes. The loop only finishes when spec-gap produces zero findings.

```
finalizer[]:  spec-gap → docs → spec-review → final-review → final-qa → proof
                  ↓ (if gaps found)        ↓ (if docs stale)
            new TODO items → finalizer aborts → cycle resumes → build fixes them → ...
```

**Unlimited runs** — there is no cap on how many times spec-gap can run. It runs every other cycle plus at every finalizer attempt. The loop is done when the spec is fully fulfilled.

### What it checks

1. **Config completeness** — config.yml vs loop script provider/model support
2. **Spec vs code alignment** — acceptance criteria referencing removed code, undocumented features
3. **Prompt template consistency** — frontmatter referencing invalid providers, orphan templates
4. **Cross-runtime parity** — validation sets in CLI vs loop.sh vs loop.ps1
5. **TODO hygiene** — stale items, hallucinated features, completed items still open

### Rules

- Analysis only — documents gaps in TODO.md, does not fix them
- Prioritize most impactful gaps first
- Tags items as `[spec-gap]` with priority P1/P2/P3
- Distinguishes "spec is wrong" vs "code is wrong"
- If zero gaps found, writes "spec-gap analysis: no discrepancies" and allows the chain to proceed

---

## Documentation sync agent

A dedicated agent (`PROMPT_docs.md`) that keeps project documentation accurate and honest about implementation status. It runs **periodically** (every 2nd cycle, after qa) and in the **finalizer** (after spec-gap, before spec-review).

### Purpose

Documentation drifts from reality fast during iterative development. README claims features that are half-built, CLI help text references flags that changed, and there's no honest accounting of what's actually done vs planned. The docs agent fixes this by cross-referencing docs against actual code.

### When it runs

- **Periodic**: every 2nd cycle, after qa (same cycles as spec-gap)
- **Finalizer**: second element of `finalizer[]` array (after spec-gap, before spec-review)
- The docs agent **can modify documentation files** (unlike spec-gap which is analysis-only)

### What it does

1. Syncs README.md feature lists with actual implementation state
2. Updates CLI help text to match current flags/commands
3. Adds honest completeness markers: "Implemented", "Partial (missing X)", "Planned", "Experimental"
4. Documents config fields and override precedence
5. Does NOT modify SPEC.md or code — only documentation files

---

## CLAUDECODE environment variable sanitization

When aloop is invoked from inside a Claude Code session (the normal case — user types `/aloop:start`), the `CLAUDECODE` env var is inherited. All entry points that launch provider CLIs must unset it to prevent "cannot launch inside another session" errors:

| Location | Fix |
|----------|-----|
| `aloop/bin/loop.ps1` | `$env:CLAUDECODE = $null` at script top |
| `aloop/bin/loop.sh` | `unset CLAUDECODE` at script top |
| `aloop/cli/src/index.ts` | `delete process.env.CLAUDECODE` at entry |
| `Invoke-Provider` (loop.ps1) | Also unset in the provider invocation block (defense-in-depth, in case something re-sets it) |
| `invoke_provider` (loop.sh) | Same — `unset CLAUDECODE` before each provider call |
