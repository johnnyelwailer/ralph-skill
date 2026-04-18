# Loop Invariants

> **Reference document.** The state-machine invariants every session (standalone, orchestrator, child) must obey. Hard rules live in CONSTITUTION.md. Work items live in GitHub issues.
>
> Sources: SPEC.md §Mandatory Final Review Gate, §Phase Advancement Only on Success; SPEC-ADDENDUM.md §Orchestrate Mode: No Iteration Cap, §Scan Agent Self-Healing, §Loop Flag `--no-task-exit` (pre-decomposition, 2026-04-18).

## Table of contents

- The three concepts: cycle, finalizer, queue
- Final review gate (no mid-cycle exit)
- Completion state machine
- Edge cases
- Phase advancement only on success
- Phase prerequisites
- Retry exhaustion safety valve
- Iteration caps
- `--no-task-exit` (orchestrator mode)
- Invariant enforcement

---

## The three concepts: cycle, finalizer, queue

Every session's runtime behavior is expressible as three ordered inputs and one position pointer:

- **`cycle`** — the repeating pipeline sequence (e.g., `plan → build × 5 → qa → review`). Flat array of prompt filenames in `loop-plan.json`. Position is `cyclePosition % cycle.length`.
- **`finalizer`** — a separate array of prompts that run once `allTasksMarkedDone` holds at a cycle boundary (spec-gap, docs, review, QA, proof, cleanup). Position is `finalizerPosition`.
- **`queue`** — per-session `queue/NNN-*.md` files. Checked before every turn. If present, the first-sorted item runs and is deleted afterwards. Queue items do NOT advance `cyclePosition`.

This is the entire scheduling surface. Anything else is the daemon's upstream concern (watchdogs writing to queue, compile step rewriting the plan). The session runner itself just advances these pointers according to the invariants below.

## Final review gate (no mid-cycle exit)

In any pipeline that includes a `review` agent, the session MUST NOT exit on task completion during a build phase. The build agent can mark all tasks done, but only the finalizer's review can approve a clean exit.

1. **Build detects all tasks complete** → set `allTasksMarkedDone = true` in `loop-plan.json`, log `tasks_marked_complete`. **Do not exit.** Cycle continues through qa and review.
2. **Cycle boundary reached** (last agent in `cycle[]` finishes) → check `allTasksMarkedDone`. If true, switch to finalizer mode.
3. **Finalizer runs**:
   - All finalizer agents pass without adding tasks → last agent (typically `proof`) completes → session status becomes `completed`, session ends.
   - Any finalizer agent adds tasks → `allTasksMarkedDone` resets to false, `finalizerPosition` resets to 0, session returns to cycle mode.

This guarantees the finalizer (which includes the deepest review, QA, and proof passes) is the only path to clean completion. Build alone cannot finish the job.

## Completion state machine

```
┌────────────────┐    cycle complete AND all tasks done?
│   cycle mode   │─────────────────────── NO ──┐
└────────────────┘                              │
         │ YES                                  │
         ▼                                      ▼
┌────────────────┐    finalizer agent adds tasks?
│ finalizer mode │──── YES ──→ reset position 0, back to cycle
└────────────────┘
         │ NO (all finalizer agents passed)
         ▼
┌────────────────┐
│   completed    │  session status terminal
└────────────────┘
```

Key properties:

- The session **never exits mid-cycle**. Queue overrides can interrupt individual *turns*, but the cycle structure always runs to completion before the `allTasksMarkedDone` check.
- `allTasksMarkedDone` is checked **only at cycle boundaries**, never mid-cycle.
- Finalizer is aborted (not paused) when new tasks appear — all work has to be re-verified in order.

## Edge cases

- **Review-only pipeline** (no build phase): the invariant about waiting for finalizer doesn't apply; the pipeline runs once and exits.
- **Build-only pipeline** (no review phase): completion on `allTasksMarkedDone` is acceptable because there's no review to gate on. Finalizer still runs if configured.
- **Plan-build pipeline** (no review or qa agent): cycle ends after last build; if `allTasksMarkedDone`, finalizer (if configured) runs.
- **Steering mid-flight**: queue items interrupt the next turn, not the current one. If steering arrives while finalizer is running, it runs in the next turn, and the finalizer is aborted (position reset to 0, cycle resumes afterwards).
- **Finalizer agent adds tasks mid-run**: `allTasksMarkedDone` flips to false, `finalizerPosition` resets to 0, session returns to cycle mode. When the cycle again satisfies the boundary check, the full finalizer fires from the start.

## Phase advancement only on success

Failed turns do not advance `cyclePosition`. The scheduler's per-turn fallthrough (see `provider-contract.md`) handles provider retries within a single turn; `cyclePosition` only moves when a turn produces a successful outcome.

Rule:

```
On turn SUCCESS:  cyclePosition = (cyclePosition + 1) % cycle.length
On turn FAILURE:  cyclePosition stays
Queue turn:       cyclePosition stays (queue items are interrupts)
```

This means a failed plan retries as plan (with the chain's next provider and any fallthrough that hasn't been tried), a failed build retries as build, a failed review retries as review. The next attempt picks a different provider if the failure classification permits (rate-limit, timeout) and a fresh permit is granted.

Without this rule, the session wastes turns on downstream phases whose prerequisites were never produced (building without a plan, reviewing unplanned work).

## Phase prerequisites

Defense-in-depth, enforced by the session runner before the adapter is invoked:

| Phase | Prerequisite | If not met |
|---|---|---|
| `build` | At least one unchecked `- [ ]` in `TODO.md` | Force `plan` instead |
| `review` | At least one commit since the last `plan` turn | Force `build` instead |
| `qa` | Same as `review` | Force `build` instead |
| `plan` | None | — |
| `finalizer[*]` | Normal cycle completed with `allTasksMarkedDone` | — (gated by the state machine) |

When the session runner forces a different phase, it emits `phase_prerequisite_miss` with `{requested, actual, reason}`. `cyclePosition` is NOT advanced — the next turn retries the requested phase after the substitute phase runs.

## Retry exhaustion safety valve

To prevent infinite retry loops (same phase fails with every provider):

```
max_phase_retries = len(resolved_chain) * 2
```

After `max_phase_retries` consecutive failures on the same phase, the session:

1. Emits `phase_retry_exhausted` with all failure classifications.
2. Advances `cyclePosition` anyway.
3. Emits `phase_skipped` with the phase name.

The skip is visible to the orchestrator (if any) via events. Orchestrator diagnose workflow may decide to pause the session, swap providers, or escalate.

`max_phase_retries` is configurable per pipeline; default comes from `daemon.yml`.

## Iteration caps

| Session kind | `max_iterations` default | Rationale |
|---|---|---|
| `standalone` | Taken from project config; typically 50 | Safety net for unattended single-agent sessions |
| `orchestrator` | **None (unlimited)** | Completion is managed by the tracker: all issues merged/closed → orchestrator stops |
| `child` | **None (unlimited)** | Parent orchestrator owns completion; children end via `DELETE /v1/sessions/:id` from parent |

Implementation rules:

- The compile step MUST NOT inject `max_iterations` into `loop-plan.json` for orchestrator or child sessions.
- Session runner treats missing `max_iterations` as unlimited.
- Orchestrator stops children externally via the API, not via iteration cap.

**Budget controls for pay-per-use providers:** iteration caps are not a substitute for budget. For pay-per-use providers (OpenRouter via OpenCode), use scheduler burn-rate and budget gates (see `provider-contract.md` §Cost and usage capture, `daemon.md` §Scheduler authority). Subscription providers (Claude Max, Copilot, Codex, Gemini) have no per-request cost — budget caps do not apply, but concurrency and cooldown limits still do.

## `--no-task-exit` (orchestrator mode)

Orchestrator sessions must never auto-complete based on `TODO.md` task status — their completion criterion is tracker state (issues resolved, change sets merged or closed).

- Orchestrator sessions: session runner SKIPS the `allTasksMarkedDone` check entirely. Finalizer still runs when explicitly scheduled.
- Standalone and child sessions: normal `allTasksMarkedDone` semantics apply.

Implementation: a `mode: orchestrator | session` flag in `loop-plan.json` (written by the compile step based on session kind). Runners check the flag before the cycle-boundary check.

## Invariant enforcement

These invariants are enforced **by the session runner inside the daemon**, not by the shim. The shim only:

- Asks for the next prompt (`GET /v1/sessions/:id/next`).
- Runs it.
- Posts results.

All state-machine transitions — `cyclePosition` updates, `allTasksMarkedDone` flips, finalizer entry/exit, phase prerequisite substitution, retry counting, skip-on-exhaustion — happen daemon-side and are persisted to SQLite + JSONL before `GET /v1/sessions/:id/next` returns its next answer.

Tests cover each invariant:

- Cycle-boundary-only completion check (unit test: driven event stream, expected transitions).
- Queue item does not advance `cyclePosition` (property test).
- Failed turn does not advance `cyclePosition` (property test).
- Phase prerequisite substitution emits the correct event and does not advance.
- Retry exhaustion advances and emits the skip event.
- Orchestrator mode never fires `allTasksMarkedDone` (regression test on the flag path).

The invariants are the contract; the implementation is under test; the rebuild exists to restore them.
