# Agents

> **Reference document.** Per-agent contracts for the bundled agent catalog. What each agent reads, writes, and commits to. What it may do and must not. Agents are **pipeline participants**, not built-in roles — projects can add, remove, or replace any of them via `pipeline.yml`.
>
> Hard rules live in CONSTITUTION.md. Work items live in GitHub issues.
>
> Sources: SPEC.md §Proof-of-Work Phase, §QA Agent, §Spec-Gap Analysis, §Documentation Sync, §CLAUDECODE Sanitization (pre-decomposition, 2026-04-18). Consolidated against `pipeline.md`, `provider-contract.md`, `work-tracker.md`, `refinement.md`.

## Table of contents

- Agents as pipeline participants
- Universal contract (all agents)
- `plan`
- `build`
- `qa`
- `review`
- `proof`
- `spec-gap`
- `docs`
- `spec-review`
- `final-review`, `final-qa`
- Orchestrator-side agents
- Subagent catalog

---

## Agents as pipeline participants

Every agent is a **named prompt with a role, a role's permissions, and a contract for what it reads/writes**. Agents are data (prompt files + frontmatter). The pipeline declares which agents run and in what order (see `pipeline.md`).

Aloop ships a bundled catalog (the ones described below). Projects can:

- Drop any of them from `pipeline.yml`.
- Reorder them.
- Add their own (`verify`, `debugger`, `security-audit`, `guard`, `migration`, etc.).
- Replace a shipped agent by writing a new prompt file with the same role name — project prompt takes precedence over bundled.

No agent is hardcoded in the daemon. The session runner only knows "run the prompt at `cycle[cyclePosition]` or `finalizer[finalizerPosition]` or the next queue item." Agent identity matters only to the prompt templates and to the permissions table.

The bundled default pipeline (see `pipeline.yml` in the project or the installed defaults) is one configuration. Everything below describes each agent's contract, not the pipeline structure.

## Universal contract (all agents)

Every agent operates under the same ground rules:

- **Runs under a permit** issued by the scheduler. Turn start is gated; turn end releases.
- **Receives a compiled prompt body** with template variables already expanded.
- **Has `aloop-agent` on `PATH`** with an `AUTH_HANDLE` env var scoped to the session.
- **Communicates through `aloop-agent`**: `submit`, `todo add/complete/dequeue/list/all-done`, `tracker ...`. Never calls tracker APIs directly. Never writes JSON files into `.aloop/output/` (retired by CR #135).
- **Emits events as it runs** — the provider adapter streams `agent.chunk` events; the daemon persists them in the session's JSONL.
- **Operates in a worktree** (when the session has one). Changes committed under the agent's authorship with a provenance trailer:
  ```
  Aloop-Agent: <role>
  Aloop-Iteration: <n>
  Aloop-Session: <id>
  ```
- **Has role-based permissions** (see `pipeline.md` §Agent contract — the permissions table defining what each role may submit and which tasks it may close).
- **Does not modify the pipeline itself.** Only humans and the compile step edit `pipeline.yml`.

## `plan`

**Role:** Gap analysis between spec and code. Produces or refreshes tasks.

**Reads:** Spec files (`{{SPEC_FILES}}`), session's `tasks.json` via `aloop-agent todo list`, worktree state (git log, TODO markers), RESEARCH.md, REVIEW_LOG.md, CONSTITUTION.md.

**Writes:** Tasks, via `aloop-agent todo add` with `from: plan` and appropriate `for` role. Task order reflects priority. May commit a regenerated TODO.md rendering (`aloop-agent todo list --format md > TODO.md`) as a convenience for agents reading markdown; authoritative state is `tasks.json`.

**May not:** Modify code, modify the spec, merge change sets, delete history.

**Completion signal:** `aloop-agent submit --type plan_result` with a terse summary and the list of task slugs produced or updated. Also sets `abstract_status` of the parent Story to `in_progress` if it was `dor_validated`.

When the assigned Story turns out to be under-specified, contradictory, or stale, `plan` should not paper over the gap by inventing product behavior. It should separate safe work from decision-bound work and route the unresolved part back into the existing refinement/conversation machinery described in `refinement.md`.

## `build`

**Role:** Implement one task at a time. Validate. Commit.

**Reads:** One task from `aloop-agent todo dequeue --for build` (or for its specialization — `frontend`, `backend`, `fullstack`, `migration`, `infra`, `docs-generator`, etc.). Reads code, tests, and whichever spec/reference files the task points at.

**Writes:** Code and tests. Commits per iteration. Marks task done via `aloop-agent todo complete <id>`.

**May not:** Create new unrelated tasks (those should come from plan/review). Touch files outside its scope without justification (see CONSTITUTION.md §Scope Control). Skip validation commands.

**Validation:** Before committing, runs the project's `{{VALIDATION_COMMANDS}}` (types, tests, lint). Failed validation keeps the task open; the turn is recorded as failed and retries per the pipeline's `onFailure` rule.

**Completion signal:** `aloop-agent submit --type build_result` with the commit SHAs, changed files, validation outcome, and usage stats.

## `qa`

**Role:** Black-box user testing. Never reads source code.

**Reads:** Spec files for expected behavior. `tasks.json` for recently completed tasks (test candidates). `QA_COVERAGE.md` for coverage gaps and previously failed features.

**Writes:** Test artifacts (`QA_COVERAGE.md`, `QA_LOG.md`) committed from the worktree. Files bugs as tasks via `aloop-agent todo add --from qa --for build --priority high` with reproduction steps in the body (`what you did → what happened → what spec says should happen`). Never writes bug tags into TODO.md markdown — the task store is the truth.

**May not:** Read source files. Read implementation details. Invent test targets outside the spec.

**Scope per turn:** 3–5 features, happy path + error paths + edge cases. Layout verification mandatory for UI changes (screenshot at configured viewport). GitHub integration E2E (where applicable) creates throwaway test repos and always cleans up.

**Completion signal:** `aloop-agent submit --type qa_result` with pass/fail per feature, coverage delta, bug task IDs filed.

## `review`

**Role:** Code-level quality gate. Inspects change set against 9 gates (spec compliance, test depth, coverage, code quality, integration sanity, proof verification, layout verification, version compliance, doc freshness). Full gate definitions in `instructions/review.md` (included via `{{include:instructions/review.md}}`).

**Reads:** Diff since last review, spec files, CONSTITUTION.md, proof manifest, `REVIEW_LOG.md`, test output.

**Writes:** Review findings appended to `REVIEW_LOG.md`. Fix tasks via `aloop-agent todo add --from review --for build --priority ...`.

**Submit:** `aloop-agent submit --type review_result` with verdict (`approved | changes_requested | reject`), per-gate pass/fail, per-file findings with line locations (for change-set-level review in orchestrator context).

**Subagent delegation:** Review may delegate structural checks to `code-critic` (deep reasoning), visual review to `vision-reviewer`, security to `security-scanner`, accessibility to `accessibility-checker` (see Subagent catalog).

**May not:** Merge. Modify code. Override CONSTITUTION.md.

Under the shared refinement contract, review should reject changes that silently commit to one unresolved product or UX variant without making the decision explicit.

## `proof`

**Role:** Produce human-verifiable evidence that the cycle's work is real and working.

**Decides autonomously:** What to prove, how to prove it, what to skip. Not told via keyword matching.

**Reads:** Tasks completed this cycle (`aloop-agent todo list --status done --since-iter <last-proof>`), recent commits, spec, available tooling (Playwright, curl, etc.), previous baselines in `artifacts/baselines/`.

**Writes:** Artifacts under `<session>/artifacts/iter-<N>/` and `proof-manifest.json` describing them.

```json
{
  "iteration": 7,
  "phase": "proof",
  "provider": "copilot",
  "timestamp": "2026-04-18T12:00:00Z",
  "summary": "3 screenshots, 1 API capture. Dashboard layout verified against baseline.",
  "artifacts": [
    {
      "type": "screenshot",
      "path": "dashboard-main.png",
      "description": "Dashboard after layout refactor",
      "metadata": { "viewport": "1920x1080", "url": "http://localhost:3000" }
    },
    {
      "type": "visual_diff",
      "path": "dashboard-main-diff.png",
      "description": "12.3% change vs baseline, confined to log panel",
      "metadata": { "baseline": "baselines/dashboard-main.png", "diff_percentage": 12.3 }
    }
  ],
  "skipped": [
    { "task": "internal file-lock retry", "reason": "no observable external output" }
  ],
  "baselines_updated": ["dashboard-main.png"]
}
```

`type` is free-form; common kinds: `screenshot`, `visual_diff`, `api_response`, `cli_output`, `test_summary`, `accessibility_snapshot`, `video`. Agent picks what fits.

**Never treats as proof:** CI pass counts, lint summaries, type-check output, git diffs, commit summaries. Those are validation, not evidence.

**Subagents:** Delegates visual analysis to `vision-reviewer`, accessibility to `accessibility-checker`, perf to `perf-analyzer`. Proof agent itself can run on a non-vision model.

**Submit:** `aloop-agent submit --type proof_result` with the manifest body.

For exploratory or variant-driven work, proof artifacts should be comparison-friendly so `orch_conversation` can use them directly in human-facing clarification threads. See `refinement.md`.

**Baseline management:** On review approval, current screenshots replace `baselines/`. On rejection, baselines stay; next cycle compares against unchanged baselines.

**Skip protocol:** When nothing is provable (pure refactor, internal plumbing), writes a summary with empty `artifacts` and explanations under `skipped`. Review may agree (approve) or disagree and request actual proof.

## `spec-gap`

**Role:** Validate codebase consistency against the spec. Analysis only — produces tasks for other agents to fix.

**Reads:** Spec files, config files, prompt templates, cross-platform code (bash + PowerShell), `tasks.json`.

**Writes:** Findings as tasks via `aloop-agent todo add --from spec-gap --for build --priority ... --tag spec-gap`. Never modifies code, spec, or docs.

**Checks:**

1. Config completeness — config references vs runtime support
2. Spec vs code alignment — unimplemented acceptance criteria, hallucinated features, dead references
3. Prompt template consistency — invalid provider references, orphan templates
4. Cross-platform parity — logic present in one of bash/PowerShell but not the other
5. Task hygiene — stale tasks, completed but still open, references to removed code

**Cadence:** Project-configurable. Common patterns: every Nth cycle, and/or at the start of the finalizer. Configure in `pipeline.yml`; see `pipeline.md` §Event-driven dispatch.

**Submit:** `aloop-agent submit --type spec_gap_result` with finding counts by category and created task IDs. Empty results is a valid outcome and allows the finalizer to proceed.

## `docs`

**Role:** Keep project documentation honest about current implementation state.

**Reads:** README, CLI help strings, `VERSIONS.md`, doc comments, actual code.

**Writes:** Updates to README, CLI help, doc files. May add completeness markers: `Implemented`, `Partial (missing X)`, `Planned`, `Experimental`. Never modifies `SPEC.md` or code.

**Cadence:** Project-configurable.

**Submit:** `aloop-agent submit --type docs_result` with files modified and a summary of changes.

## `spec-review`

**Role:** Requirement coverage, not code quality. Asks one question: "Do the changes satisfy the acceptance criteria from the spec?"

**Reads:** Spec files, change set diff, proof artifacts.

**Writes:** Findings as tasks (same mechanism as `review`), flagged `spec-review`. No code changes.

**Submit:** `aloop-agent submit --type spec_review_result`.

## `final-review`, `final-qa`

**Role:** Same contract as `review` and `qa` respectively, but positioned in the finalizer chain and typically run at a higher reasoning effort. Share instructions with their cycle counterparts via `{{include:instructions/review.md}}` and `{{include:instructions/qa.md}}`.

The only difference from the cycle versions is *when* they run (finalizer), not *what* they check.

## Orchestrator-side agents

Orchestrator pipelines use a different catalog. Each still obeys the universal contract; the difference is what they read/write and which submit types they produce. See `orchestrator.md` for the pipeline and `work-tracker.md` for the generic submit schemas.

| Agent | Submit type | Purpose |
|---|---|---|
| `orch_product_analyst` | — (no tracker side effect) | Reads spec files; produces theme map + out-of-scope list as scratchpad |
| `orch_decompose` | `decompose_result` | Produces Epics |
| `orch_refine` | `refine_result` | Tightens scope of one Epic or Story |
| `orch_sub_decompose` | `sub_decompose_result` | Produces Stories under one Epic |
| `orch_estimate` | `estimate_result` | Complexity tier + dependency edits |
| `orch_dispatch` | `dispatch_result` | List of Stories to launch |
| `orch_review` | `review_result` | Change-set review, outputs verdict + inline comments |
| `orch_resolver` | — (queues merge_conflict into child) | Decides rebase / recreate / abandon for conflicted change sets |
| `orch_diagnose` | `diagnose_result` | Intelligent self-healing: observes anomaly events, returns a structured action for the daemon |
| `orch_conversation` | `conversation_result` | Handles human comments on Epics/Stories (reply, edit work item, re-decompose, pause, inject into child, file follow-up) |

`orch_refine`, `orch_conversation`, `setup_judge`, and `setup_questioner` share the ambiguity/decision-handling prompt discipline from `refinement.md`. The architecture stays the same; the prompts become more explicit about classification, option synthesis, recommendation, and evidence-backed human feedback.

## Setup-side agents

Setup uses the same underlying orchestration/session machinery, but with a different catalog focused on understanding, drafting, and readiness rather than implementation. See `setup.md` for the workflow boundary.

| Agent | Submit type | Purpose |
|---|---|---|
| `setup_discover` | `setup_discovery_result` | Whole-repo discovery, environment scan, and initial findings |
| `setup_research` | `setup_research_result` | Deeper analysis of unclear modules, domains, or external questions |
| `setup_judge` | `setup_readiness_verdict` | Emits the current readiness verdict and blocking ambiguities |
| `setup_questioner` | `setup_question_batch` | Selects the next staged user questions based on current findings |
| `setup_spec_writer` | `setup_chapter_update` | Drafts or revises spec chapters and supporting setup documents |
| `setup_constitution_drafter` | `setup_chapter_update` | Drafts project constitution rules from spec + codebase understanding |
| `setup_decompose` | `decompose_result` | Produces the initial Epic baseline for orchestrator-mode handoff |

## Subagent catalog

Subagents are within-turn delegations (not aloop sessions). Support depends on provider (opencode, claude, copilot, codex — all have some form; opencode is most mature). Aloop ships a shared catalog under `.opencode/agents/` installed by `aloop setup`; per-phase hints surface via `{{SUBAGENT_HINTS}}`.

| Subagent | Model class | Purpose | Typical callers |
|---|---|---|---|
| `vision-reviewer` | vision | screenshot layout / visual analysis | `proof`, `review` |
| `vision-comparator` | vision | baseline vs current comparison | `proof` |
| `code-critic` | high-reasoning | deep code review — subtle bugs, security | `review` |
| `test-writer` | fast-cheap | generate tests from spec | `build` (and specializations) |
| `error-analyst` | fast-cheap | parse stack traces, suggest fixes | `build` on failure |
| `spec-checker` | reasoning | verify implementation matches acceptance criteria | `review`, `spec-review` |
| `security-scanner` | reasoning | OWASP / secrets / deps audit | `review`, `guard` |
| `accessibility-checker` | vision | WCAG compliance | `proof`, `verify` |
| `perf-analyzer` | fast-cheap | bundle size, lighthouse, load metrics | `proof` |
| `docs-extractor` | fast-cheap | API docs, types, usage examples | `docs` |

Cost optimization: a reasoning model should not spend tokens parsing stack traces or generating boilerplate — delegate those to a fast-cheap model, reserve expensive tokens for decisions.

## Environment hygiene

The daemon (not the shim, not the agent) sanitizes the environment before invoking a provider CLI:

- Clears `CLAUDECODE` so nested `claude` calls don't refuse with "cannot launch inside another session."
- Hardens `PATH` to a known prefix.
- Strips secrets except those the provider explicitly requires.
- Injects `AUTH_HANDLE`, `ALOOP_SESSION_ID`, `ALOOP_PROJECT_PATH`, and the provider's own credentials.

Agents should assume they run in a clean, scoped environment. Any environment-related defense-in-depth (setting `CLAUDECODE=null` again in a script) is belt-and-suspenders for old invocation paths, not a requirement.
