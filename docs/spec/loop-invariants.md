# Loop Invariants

> **Reference document.** Invariants and contracts consumed by agents at runtime. Work items live in GitHub issues; hard rules live in CONSTITUTION.md.
>
> Sources: SPEC.md §Mandatory Final Review Gate, §Phase Advancement Only on Success (lines ~205-397), SPEC-ADDENDUM.md §Orchestrate Mode: No Iteration Cap, §Scan Agent Self-Healing, §Loop Flag `--no-task-exit` (pre-decomposition, 2026-04-18).

## Table of contents

- Mandatory final review gate (loop exit invariant)
- Completion state machine
- Edge cases
- Implementation notes
- Phase advancement only on success (retry-same-phase)
- Phase prerequisites (defense-in-depth)
- Provider failure capture
- Interaction with existing features
- Safety valve: max retries per phase
- Orchestrate mode: no iteration cap
- Loop flag: `--no-task-exit`

---

## Mandatory final review gate (loop exit invariant)

In any pipeline that includes a `review` agent, the loop MUST NOT exit on task completion during a build phase. The build agent can mark all tasks done, but only the review agent can approve a clean exit. Instead:

1. **Build detects all tasks complete** → set `allTasksMarkedDone` flag in `loop-plan.json`, log `tasks_marked_complete`, but **do not exit** — cycle continues normally through qa and review
2. **Cycle completes** → at the cycle boundary, the loop checks `allTasksMarkedDone`. If true, switches to the `finalizer[]` array.
3. **Finalizer decides**:
   - If all finalizer agents pass (no new TODOs) → proof completes → loop exits with `state: "completed"`
   - If any finalizer agent finds issues → new TODOs created, `allTasksMarkedDone` resets, `finalizerPosition` resets to 0, cycle resumes

This ensures the finalizer (which includes review, QA, and proof) is the **only** path to a clean exit when a finalizer is configured.

## Completion state machine

```
build works on tasks → cycle continues normally (plan → build × 5 → qa → review)
    ↓
cycle ends (review completes) → loop checks: all TODOs done?
  NO  → start next cycle
  YES → switch to finalizer[] array
    ↓
any finalizer agent adds new TODOs?
  YES → back to normal cycle (plan → build × 5 → qa → review)
  NO  → proof completes → state=completed, loop exits
```

The loop does NOT exit mid-cycle. The cycle always runs to completion (though queue entries like steering can interrupt individual agents). Only at the cycle boundary does the loop check `allTasksMarkedDone` and decide: next cycle or switch to finalizer.

## Edge cases

- **Review-only pipeline**: No build phase exists, so this invariant doesn't apply. The single review runs and exits.
- **Build-only pipeline**: No review phase exists. Current behavior (exit on all tasks done) is correct for this pipeline, but finalizer still runs if configured.
- **Plan-build pipeline** (no review agent configured): No review phase. Cycle ends after last build. Finalizer entry check happens there.
- **Steering mid-flight**: If steering arrives while the finalizer is running, the steer phase takes priority, the finalizer is aborted (position reset to 0), and the loop resumes the normal cycle after steering.
- **Finalizer agent adds TODOs**: `allTasksMarkedDone` flips back to false, `finalizerPosition` resets to 0. Loop resumes normal cycle. When all tasks are done again, the full finalizer fires from the beginning.

## Implementation notes

- `loop-plan.json` fields: `"allTasksMarkedDone": false`, `"finalizerPosition": 0`, `"finalizer": [...]`
- The loop checks `allTasksMarkedDone` **only at the cycle boundary** (after the last agent in the cycle completes)
- If true: switch to finalizer mode — pick prompt from `finalizer[finalizerPosition]`, advance `finalizerPosition`
- After each finalizer agent: re-check TODO.md — if new open items exist, reset `finalizerPosition` to 0, set `allTasksMarkedDone` to false, resume cycle
- If `finalizerPosition` reaches end of `finalizer[]` with no new TODOs: set `state: completed`, exit
- No trigger resolution, no runtime dependency — the loop handles this mechanically with two arrays
- Log events: `finalizer_entered` (all tasks done at cycle boundary), `finalizer_aborted` (new TODOs mid-finalizer), `finalizer_completed` (last agent done, no new TODOs)

---

## Phase advancement only on success (retry-same-phase)

Failed iterations retry the same pipeline phase with the next round-robin provider instead of blindly advancing. This prevents wasted iterations (e.g., building without a plan, reviewing unplanned work).

```
iter 1: claude  plan   → FAIL
iter 2: codex   plan   → retry same phase, different provider
iter 3: gemini  plan   → SUCCESS, TODO.md created
iter 4: copilot build  → NOW advance (plan exists)
iter 5: claude  build  → continues building
```

### Rule 1: Failed iterations do not advance the phase cycle

The cycle position (index into the compiled loop plan in `loop-plan.json`) must be tracked independently from the iteration counter. The `cyclePosition` field in `loop-plan.json` tracks where we are in the pipeline. It only increments on successful iterations.

```
cyclePosition = 0   # starts at plan (persisted in loop-plan.json)

Resolve next agent:
  if forced flags (steer, review, plan) → return those, don't touch cyclePosition
  else → return agent from cycle[cyclePosition % cycleLength]

On iteration SUCCESS:
  cyclePosition++   (written back to loop-plan.json)

On iteration FAILURE:
  cyclePosition stays the same
  next iteration retries the same phase with the next round-robin provider
```

This means a failed plan retries as plan, a failed build retries as build, a failed review retries as review. The round-robin still rotates providers, so each retry uses a different provider — giving the best chance of success.

### Rule 2: Phase prerequisites (defense-in-depth)

Even with Rule 1, add explicit guards so phases can't run without their prerequisites:

| Phase | Prerequisite | If not met |
|-------|-------------|------------|
| `build` | TODO.md exists with at least one `- [ ]` task | Force plan instead |
| `review` | At least one commit since last plan iteration | Force build instead |
| `plan` | None (always allowed) | — |

```powershell
function Check-PhasePrerequisites {
    param([string]$Phase)

    if ($Phase -eq 'build') {
        $lines = Get-PlanLines
        $unchecked = ($lines | Where-Object { $_ -match '^\s*-\s+\[ \]' }).Count
        if ($unchecked -eq 0) {
            Write-Warning "No unchecked tasks in TODO.md — forcing plan phase"
            Write-LogEntry -Event "phase_prerequisite_miss" -Data @{
                requested = "build"; actual = "plan"; reason = "no_tasks"
            }
            return 'plan'
        }
    }

    if ($Phase -eq 'review') {
        if (-not (Get-HasBuildsToReview)) {
            Write-Warning "No builds since last plan — forcing build phase"
            Write-LogEntry -Event "phase_prerequisite_miss" -Data @{
                requested = "review"; actual = "build"; reason = "no_builds"
            }
            return 'build'
        }
    }

    return $Phase
}
```

### Rule 3: Provider failure capture

Capture stderr separately for failure diagnosis:

```powershell
$output = $null
$errorOutput = $null
$PromptContent | & claude ... 2>&1 | Tee-Object -Variable rawOutput
$output = $rawOutput | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] }
$errorOutput = $rawOutput | Where-Object { $_ -is [System.Management.Automation.ErrorRecord] }

if ($LASTEXITCODE -ne 0) {
    $errorText = ($errorOutput | Out-String).Trim()
    throw "claude exited with code $LASTEXITCODE`nStderr: $errorText"
}
```

This feeds into the provider health failure classification system, which can distinguish rate_limit vs auth vs timeout from the actual error text.

## Interaction with existing features

| Feature | Interaction |
|---------|-------------|
| **Queue overrides** | Queue entries take priority over cycle position. When a queued prompt is consumed, cycle position is NOT advanced. Replaces the old `forcePlanNext`/`forceReviewNext` flags. |
| **Steering** | Injects steer prompt into queue. After steer phase, cycle position resets to 0 (plan) so the new plan reflects the steering. |
| **Phase retry** | A phase repeatedly failing with different providers is handled by `MAX_PHASE_RETRIES` — after all providers fail the same phase, log `phase_all_providers_failed` and advance anyway (avoid infinite retry). |
| **Provider health** | Failed iterations feed into provider health. If claude fails plan, its health degrades. Next retry tries codex (healthy). Provider health + retry-same-phase work together naturally. |
| **Round-robin** | Round-robin still rotates on every iteration. So retry-same-phase with round-robin = same phase, different provider. This is the desired behavior. |

## Safety valve: max retries per phase

To prevent infinite retry loops (all providers fail the same phase forever):

```
MAX_PHASE_RETRIES = len(round_robin_providers) * 2
```

If the same phase fails `MAX_PHASE_RETRIES` times consecutively:
- Log `phase_retry_exhausted` with all failure reasons
- Advance cycle position anyway (skip to next phase)
- This prevents the loop from getting stuck retrying a fundamentally broken phase

---

## Orchestrate mode: no iteration cap

In orchestrate mode, child loops must not have a default `max_iterations` limit. The orchestrator manages completion through task state — when all issues are resolved and PRs merged, the orchestrator is done. An arbitrary iteration cap causes child loops to stop mid-task.

| Mode | `max_iterations` default | Rationale |
|------|--------------------------|-----------|
| `loop` | `50` (from `config.yml`) | Safety net for unattended single-agent loops |
| `orchestrate` | **None (unlimited)** | Orchestrator owns completion criteria via issue/PR state |

**Implementation:**
- `compile-loop-plan` must **not** inject `max_iterations` into `loop-plan.json` when the session mode is `orchestrate`
- `aloop setup` must **not** prompt for max iterations when orchestrate mode is selected
- `loop.sh` / `loop.ps1` must treat missing `max_iterations` in `loop-plan.json` as "no limit"
- The orchestrator can still stop child loops externally via `stop_child` requests when tasks are complete

**Budget controls for pay-per-use providers:** Iteration caps are not a substitute for budget controls. For pay-per-use providers (OpenRouter via OpenCode), use `budget_cap_usd` in `meta.json` instead. Subscription providers (Claude Code, Copilot, Codex, Gemini) have no per-request cost — budget caps do not apply to them.

---

## Loop flag: `--no-task-exit`

The orchestrator scan loop must never auto-complete based on TODO.md task status. The `--no-task-exit` flag on `loop.sh`/`loop.ps1` disables the `check_all_tasks_complete` check entirely.

- **Child loops**: do NOT use this flag — they complete when all tasks are done (normal behavior)
- **Orchestrator loop**: ALWAYS uses this flag — completion is managed by `process-requests` (all issues merged/failed)

**Implementation:**
- `loop.sh`: `NO_TASK_EXIT=false` default, `--no-task-exit` sets it to true
- `check_all_tasks_complete()`: returns 1 immediately if `NO_TASK_EXIT=true`
- `orchestrate.ts`: passes `--no-task-exit` in loop.sh args
