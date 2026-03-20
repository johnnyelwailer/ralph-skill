# SPEC: Aloop — Autonomous Multi-Provider Coding Agent

## Desired Outcome

Aloop is an autonomous coding agent orchestrator that runs configurable agent pipelines with multi-provider support (Claude, Codex, Gemini, Copilot, OpenCode), a real-time dashboard, GitHub integration, and a parallel orchestrator for complex multi-issue projects. It operates in two modes: **loop** (single-track iterative development) and **orchestrator** (fan-out via GitHub issues with wave scheduling and concurrent child loops). The default pipeline is `plan → build × 5 → proof → qa → review`, but pipelines are fully configurable via agent YAML definitions (see Configurable Agent Pipeline).

## Constraints
- **TypeScript / Bun** — CLI source is TypeScript, built with Bun into a bundled `dist/index.js`
- **Config stays YAML** — shell-friendly for loop.sh/loop.ps1 parsing
- **Runtime state stays JSON** — active.json, status.json, session state, loop-plan.json

## Architecture

| Layer | Runs where | Tech | Deps |
|-------|-----------|------|------|
| `aloop` CLI (discover, scaffold, resolve) | Developer machine | TypeScript / Bun (bundled `dist/index.js`) | Bun |
| Loop scripts (execute compiled pipeline from `loop-plan.json`) | Anywhere — containers, sandboxes, CI | `loop.ps1` / `loop.sh` | Shell + git + provider CLI |

### Cross-Platform Compatibility

- PowerShell 5.1 requires careful string interpolation — avoid `($var text)` pattern (causes parse failures); use `$($var)` subexpression syntax instead
- `.editorconfig` must enforce `end_of_line = crlf` for `*.ps1` files
- `install.ps1` must normalize line endings when copying loop scripts to `~/.aloop/bin/`
- Agents should use Write tool (full file) instead of Edit for `.ps1` files if line-ending corruption is detected
- Path format must match target script expectations: POSIX paths for bash, Windows-native paths for PowerShell
- `aloop start` must detect the current shell and convert paths to the target script's expected format

---

## Inner Loop vs Runtime (Boundary Contract)

The inner loop (`loop.sh` / `loop.ps1`) and the aloop runtime (`aloop` CLI, TS/Bun) are **separate programs** with a strict boundary. The inner loop may run inside a container where the aloop CLI is not available.

### Inner Loop Responsibilities (loop.sh / loop.ps1)

The loop has exactly **three concepts**: cycle, finalizer, and queue.

- **Queue** — check `queue/` folder for override prompts before anything else (queue always takes priority)
- **Cycle** — read `loop-plan.json`, pick prompt at `cyclePosition % cycle.length`. Repeats while tasks remain.
- **Finalizer** — when all TODO.md tasks are done at cycle boundary, switch to `finalizer[]` array in `loop-plan.json`. Process sequentially with its own `finalizerPosition`. If any finalizer agent creates new TODOs → abort finalizer, reset `finalizerPosition` to 0, resume cycle. If finalizer completes with no new TODOs → set `state: completed`, exit.
- Parse frontmatter from prompt files (provider, model, agent, reasoning, trigger) — same parser for cycle, finalizer, and queue prompts. **`trigger:` is parsed and logged but never acted upon by the loop.**
- Invoke provider CLIs directly (claude, opencode, codex, gemini, copilot)
- Write `status.json` and `log.jsonl` after each iteration
- Update `cyclePosition`/`finalizerPosition` and `iteration` in `loop-plan.json`
- Delete consumed queue files after agent completes
- Wait for pending `requests/*.json` to be processed by runtime before next iteration (with timeout)
- Iteration counting and status tracking
- Read `TODO.md` to detect `allTasksMarkedDone` (mechanical checkbox count, not agent-emitted)
- Hot-reload provider list from `meta.json` each iteration (for round-robin fallback when frontmatter provider is unavailable)
- Track and kill child processes (provider timeout, cleanup on exit)
- Sanitize environment (`CLAUDECODE`, `PATH` hardening)

### Inner Loop Does NOT
- Parse pipeline YAML config
- Evaluate transition rules (`onFailure`, escalation ladders)
- Resolve triggers (loop parses `trigger:` but never acts on it — that's the runtime's job)
- Talk to GitHub API or any external service
- Know about other child loops or the orchestrator
- Run the dashboard or any HTTP server
- Process requests (it writes them; the runtime processes them)
- Decide what work to do next (cycle/finalizer order and queue contents are controlled externally)

### Aloop Runtime (shared base — `aloop/cli/src/lib/runtime.ts`)

The runtime is a **shared library** used by both the dashboard and the orchestrator. It is NOT the dashboard — the dashboard imports it. The runtime handles all intelligence that the loop script cannot:

- Compile pipeline YAML into `loop-plan.json` (cycle + finalizer arrays of prompt filenames)
- Generate prompt files with frontmatter from pipeline config
- Rewrite `loop-plan.json` on permanent mutations (cycle changes, position adjustments)
- **Trigger resolution** — scan prompt catalog for `trigger:` frontmatter, resolve chains, write matching prompts to `queue/`
- **Steering** — detect STEERING.md, queue steer + follow-up plan
- **Stuck detection** — detect N consecutive failures, queue debug agent
- Process `requests/*.json` from agents — execute side effects (GitHub API, child dispatch, PR ops)
- Queue follow-up prompts into `queue/` after processing requests (response baked into prompt)
- Manage sessions (create, resume, stop, cleanup, lockfiles)
- Monitor provider health (cross-session)
- GitHub operations (`aloop gh` subcommands)

### Dashboard (uses runtime + adds UI)

- Imports and calls `runtime.monitorSessionState()` on file changes
- Serves HTTP API + WebSocket for dashboard UI
- Pure observability + user steering interface
- **NOT essential** — loop works without it. Runtime features (trigger resolution, steering) work through other entry points too.

### Orchestrator (uses runtime + adds issue management)

- Imports runtime for trigger resolution, queue management, session lifecycle
- Adds: spec decomposition, issue tracking, wave scheduling, child loop dispatch, PR gating, replan
- Runs as `aloop orchestrate` — separate process from dashboard

### Communication Contract
- **Runtime → Inner Loop**: `loop-plan.json` (cycle + finalizer), `meta.json` (providers), `queue/*.md` (overrides with frontmatter)
- **Inner Loop → Runtime**: `status.json` (current state), `log.jsonl` (history), `requests/*.json` (side-effect requests)
- **Prompt files** (shared): frontmatter carries agent config (provider, model, reasoning, trigger); body is the prompt. Same format for cycle, finalizer, and queue prompts.

---

## Global Provider Health & Rate-Limit Resilience

All sessions share a cross-session provider health system so that when a provider hits rate limits, auth expiry, or outages, all loops skip it immediately instead of burning iterations retrying independently.

**One health file per provider** to minimize lock contention:

```
~/.aloop/health/
  claude.json
  codex.json
  gemini.json
  copilot.json
  opencode.json
```

Each file tracks:

```json
{
  "status": "healthy | cooldown | degraded",
  "last_success": "<iso-timestamp>",
  "last_failure": "<iso-timestamp | null>",
  "failure_reason": "<rate_limit | auth | timeout | unknown>",
  "consecutive_failures": 0,
  "cooldown_until": "<iso-timestamp | null>"
}
```

**Status definitions:**
- `healthy` — provider available, no recent failures
- `cooldown` — transient failures (rate limit, timeout), auto-recovers after backoff
- `degraded` — persistent failure (auth expired, quota exhausted), requires user action

### Exponential Backoff (hard-capped)

| Consecutive failures | Cooldown |
|---------------------|----------|
| 1 | none (could be flaky) |
| 2 | 2 min |
| 3 | 5 min |
| 4 | 15 min |
| 5 | 30 min |
| 6+ | 60 min (hard cap) |

Any successful call from ANY session resets `consecutive_failures` to 0 and status to `healthy`.

### Failure Classification

| Signal | Classification | Action |
|--------|---------------|--------|
| HTTP 429 / rate limit pattern in stderr | `rate_limit` | cooldown |
| Connection timeout / network error | `timeout` | cooldown |
| Auth error (expired token, invalid key) | `auth` | degraded (no auto-recover) |
| "Cannot launch inside another session" | `concurrent_cap` | cooldown (short — 2 min) |
| Unknown non-zero exit | `unknown` | cooldown |

### Concurrency / File Locking

- **Writes**: Exclusive file lock via `[System.IO.File]::Open()` with `FileShare.None`
- **Reads**: Shared lock via `FileShare.Read` (multiple loops can read simultaneously)
- **Lock retry**: 5 attempts with progressive backoff (50ms, 100ms, 150ms, 200ms, 250ms)
- **Graceful degradation**: If lock acquisition fails after all retries, skip health update and log `health_lock_failed` — loop continues normally, just without updating health that iteration
- **One file per provider**: Two loops hitting different providers = zero contention

### Round-Robin Integration

Before selecting the next provider, check its health file:
- `healthy` → use it
- `cooldown` with `cooldown_until` in the future → skip, try next in rotation
- `degraded` → skip, try next in rotation

If ALL providers are in cooldown/degraded: sleep until the earliest cooldown expires, then retry. Log `all_providers_unavailable` event.

### Observability

- Every health state change logged to `log.jsonl` (`provider_cooldown`, `provider_recovered`, `provider_degraded`)
- `/aloop:status` (and `aloop status` CLI) displays provider health table:
  ```
  Provider Health:
    claude   healthy     (last success: 2m ago)
    codex    cooldown    (3 failures, resumes in 12m)
    gemini   healthy     (last success: 5m ago)
    copilot  degraded    (auth error — run `gh auth login`)
    opencode healthy     (last success: 3m ago)
  ```
- Dashboard SSE includes provider health in session status events

### Acceptance Criteria

- [ ] Each provider gets its own health file at `~/.aloop/health/<provider>.json`
- [ ] Successful provider call resets that provider's health to `healthy` (even from a different session)
- [ ] 2 consecutive failures trigger cooldown with exponential backoff
- [ ] Auth failures mark provider as `degraded` (no auto-recover)
- [ ] Round-robin skips providers in cooldown/degraded state
- [ ] All providers in cooldown → loop sleeps until earliest cooldown expires
- [ ] File locking prevents corruption from concurrent writes
- [ ] Lock failure degrades gracefully (skip update, log warning, continue loop)
- [ ] Health state changes are logged to `log.jsonl`
- [ ] `/aloop:status` shows provider health summary

---

## Mandatory Final Review Gate (Loop Exit Invariant)

In any pipeline that includes a `review` agent, the loop MUST NOT exit on task completion during a build phase. The build agent can mark all tasks done, but only the review agent can approve a clean exit. Instead:

1. **Build detects all tasks complete** → set `allTasksMarkedDone` flag in `loop-plan.json`, log `tasks_marked_complete`, but **do not exit** — cycle continues normally through qa and review
2. **Cycle completes** → at the cycle boundary, the loop checks `allTasksMarkedDone`. If true, switches to the `finalizer[]` array.
3. **Finalizer decides**:
   - If all finalizer agents pass (no new TODOs) → proof completes → loop exits with `state: "completed"`
   - If any finalizer agent finds issues → new TODOs created, `allTasksMarkedDone` resets, `finalizerPosition` resets to 0, cycle resumes

This ensures the finalizer (which includes review, QA, and proof) is the **only** path to a clean exit when a finalizer is configured.

### State machine

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

### Edge cases

- **Review-only pipeline**: No build phase exists, so this invariant doesn't apply. The single review runs and exits.
- **Build-only pipeline**: No review phase exists. Current behavior (exit on all tasks done) is correct for this pipeline, but finalizer still runs if configured.
- **Plan-build pipeline** (no review agent configured): No review phase. Cycle ends after last build. Finalizer entry check happens there.
- **Steering mid-flight**: If steering arrives while the finalizer is running, the steer phase takes priority, the finalizer is aborted (position reset to 0), and the loop resumes the normal cycle after steering.
- **Finalizer agent adds TODOs**: `allTasksMarkedDone` flips back to false, `finalizerPosition` resets to 0. Loop resumes normal cycle. When all tasks are done again, the full finalizer fires from the beginning.

### Implementation notes

- `loop-plan.json` fields: `"allTasksMarkedDone": false`, `"finalizerPosition": 0`, `"finalizer": [...]`
- The loop checks `allTasksMarkedDone` **only at the cycle boundary** (after the last agent in the cycle completes)
- If true: switch to finalizer mode — pick prompt from `finalizer[finalizerPosition]`, advance `finalizerPosition`
- After each finalizer agent: re-check TODO.md — if new open items exist, reset `finalizerPosition` to 0, set `allTasksMarkedDone` to false, resume cycle
- If `finalizerPosition` reaches end of `finalizer[]` with no new TODOs: set `state: completed`, exit
- No trigger resolution, no runtime dependency — the loop handles this mechanically with two arrays
- Log events: `finalizer_entered` (all tasks done at cycle boundary), `finalizer_aborted` (new TODOs mid-finalizer), `finalizer_completed` (last agent done, no new TODOs)

### Acceptance Criteria

- [ ] Loop NEVER exits (completes) mid-cycle — completion can only happen via finalizer. Queue interruptions (steering, merge) can still preempt cycle/finalizer agents.
- [ ] `allTasksMarkedDone` is only checked at the cycle boundary (after last cycle agent)
- [ ] When all tasks done at cycle boundary, loop switches to `finalizer[]` array
- [ ] `finalizer[]` is a compiled array in `loop-plan.json` — no trigger resolution needed
- [ ] After each finalizer agent, TODO state is re-checked — new TODOs abort finalizer (`finalizerPosition` resets to 0) and resume cycle
- [ ] Only the last finalizer agent completing with zero new TODOs sets `state: "completed"`
- [ ] Steering takes priority over finalizer (queue always drains first)
- [ ] `finalizer_entered`, `finalizer_aborted`, and `finalizer_completed` events are logged
- [ ] In pipelines without `finalizer` config, loop exits when all tasks done at cycle boundary (current behavior)

---

## Phase Advancement Only on Success (Retry-Same-Phase)

Failed iterations retry the same pipeline phase with the next round-robin provider instead of blindly advancing. This prevents wasted iterations (e.g., building without a plan, reviewing unplanned work).

```
iter 1: claude  plan   → FAIL
iter 2: codex   plan   → retry same phase, different provider
iter 3: gemini  plan   → SUCCESS, TODO.md created
iter 4: copilot build  → NOW advance (plan exists)
iter 5: claude  build  → continues building
```

#### Rule 1: Failed iterations do not advance the phase cycle

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

#### Rule 2: Phase prerequisites (defense-in-depth)

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
        # Check if any commits exist since last plan
        # (implementation: compare HEAD against stored last-plan-commit)
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

#### Rule 3: Provider failure capture

Currently failures show only "claude exited with code 1" — no stderr, no classification. Capture stderr separately for failure diagnosis:

```powershell
# In Invoke-Provider, capture stderr separately
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

### Interaction with Existing Features

| Feature | Interaction |
|---------|-------------|
| **Queue overrides** | Queue entries take priority over cycle position. When a queued prompt is consumed, cycle position is NOT advanced. Replaces the old `forcePlanNext`/`forceReviewNext` flags. |
| **Steering** | Injects steer prompt into queue. After steer phase, cycle position resets to 0 (plan) so the new plan reflects the steering. |
| **Phase retry** | A phase repeatedly failing with different providers is handled by `MAX_PHASE_RETRIES` — after all providers fail the same phase, log `phase_all_providers_failed` and advance anyway (avoid infinite retry). |
| **Provider health** | Failed iterations feed into provider health. If claude fails plan, its health degrades. Next retry tries codex (healthy). Provider health + retry-same-phase work together naturally. |
| **Round-robin** | Round-robin still rotates on every iteration. So retry-same-phase with round-robin = same phase, different provider. This is the desired behavior. |

### Safety valve: max retries per phase

To prevent infinite retry loops (all providers fail the same phase forever):

```
MAX_PHASE_RETRIES = len(round_robin_providers) * 2
```

If the same phase fails `MAX_PHASE_RETRIES` times consecutively:
- Log `phase_retry_exhausted` with all failure reasons
- Advance cycle position anyway (skip to next phase)
- This prevents the loop from getting stuck retrying a fundamentally broken phase

### Acceptance Criteria

- [ ] Failed iterations do not advance the phase cycle position
- [ ] Retry-same-phase uses the next round-robin provider (different provider each retry)
- [ ] Build phase requires TODO.md with unchecked tasks; missing → forces plan
- [ ] Review phase requires commits since last plan; missing → forces build
- [ ] Phase prerequisite overrides are logged as `phase_prerequisite_miss`
- [ ] Provider stderr is captured and included in failure log entries
- [ ] Queue overrides take priority over cycle position (replaces old forced flags)
- [ ] Steering resets cycle position to 0 (plan)
- [ ] After `MAX_PHASE_RETRIES` consecutive failures on same phase, advance anyway with `phase_retry_exhausted` log
- [ ] Both `loop.ps1` and `loop.sh` implement the same retry-same-phase semantics

---

## Proof-of-Work Phase

### Concept

A new loop phase (`proof`) where a dedicated agent autonomously decides what evidence to generate for the work completed in the preceding build iterations. The proof agent is not told what to prove via keyword matching or hardcoded rules — it inspects the actual work (TODO.md, commits, changed files, SPEC) and uses its judgment to determine what proof is possible, appropriate, and valuable.

### Default pipeline update

```
Previous default:  plan → build × 5 → review  (5-step)
Current default:   plan → build × 5 → qa → review  (8-step continuous cycle)
```

**The continuous cycle** repeats until all tasks are done: `plan → build × 5 → qa → review`. QA and review run every cycle to catch bugs and code quality issues early. Proof does NOT run in the cycle — it's expensive and only meaningful as final evidence.

**Proof runs only at the end** — it's the last step of the finalizer (see below).

### Completion Finalizer (second array in loop-plan.json)

The loop script has two prompt arrays: `cycle[]` (repeating work) and `finalizer[]` (one-shot completion validation). Both are compiled from `pipeline.yml` into `loop-plan.json` at session start.

When all TODO.md tasks are marked done at a **cycle boundary** (after the last cycle agent completes), the loop switches from the cycle array to the finalizer array. If any finalizer agent creates new TODOs, the finalizer aborts and the cycle resumes. This is entirely self-contained in the loop script — no runtime, no trigger resolution, no external process needed.

**Important:** The finalizer agents are **separate prompt files** from the cycle agents, even when they reuse the same instructions (via `{{include:}}`). This prevents the cycle's `qa` or `review` from accidentally appearing in the finalizer.

```
Continuous cycle:  plan → build × 5 → qa → review  (repeats until all tasks done)
                                                      ↓ (all tasks done at cycle boundary)
Finalizer:         spec-gap → docs → spec-review → final-review → final-qa → proof
                      ↓ (any agent adds TODOs)
                   abort finalizer → reset finalizerPosition → resume cycle
```

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

**Only when proof completes with no new TODOs** does the loop set `status.json` state=completed and exit (or enter watch mode if orchestrated).

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

**`pipeline.yml` configuration:**
```yaml
pipeline:
  - agent: plan
  - agent: build
    repeat: 5
    onFailure: retry
  - agent: qa
  - agent: review
    onFailure: goto build

finalizer:
  - PROMPT_spec-gap.md
  - PROMPT_docs.md
  - PROMPT_spec-review.md
  - PROMPT_final-review.md
  - PROMPT_final-qa.md
  - PROMPT_proof.md
```
agent: proof
---
```

### Orchestrator Review Layer

After a child loop signals completion, the orchestrator performs its own review before creating/merging a PR:

1. **Spec compliance review** — does the child's work match the original issue/sub-spec? The orchestrator has the global picture and checks for scope drift, missing requirements, and cross-issue consistency.
2. **Proof validation** — are the proof artifacts meaningful? Do they actually demonstrate the feature works? Test output and file listings are NOT proof. The orchestrator rejects empty or filler proof.
3. **Integration check** — will this PR conflict with other child loops' work? Does it break the overall architecture?

Only after the orchestrator is satisfied does it create the PR and run automated gates (CI, coverage, merge conflicts).

### Proof Agent Behavior

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

**Subagent delegation**: The proof agent does not need to be a vision model itself. It captures screenshots and delegates visual analysis to a `vision-reviewer` subagent (running on a vision-capable model like Gemini Flash Lite or Seed-2.0-Lite). Similarly, it can delegate accessibility checks to an `accessibility-checker` subagent or performance analysis to a `perf-analyzer`. The proof agent orchestrates; subagents analyze. See [Subagent Delegation](#subagent-delegation-model-per-task).

**Output:**

The agent writes artifacts to the session directory and produces a manifest:

```
~/.aloop/sessions/<session-id>/
  artifacts/
    iter-<N>/
      proof-manifest.json
      <agent-chosen artifact files>
```

### Proof Manifest

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

### Baseline Management

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

### Dashboard Integration

Proof artifacts display inline in the dashboard log view:

```
Log:
  20:06 build  codex   ✓ 8bc4d21  feat: dense layout
  20:10 proof  copilot ✓ 3 artifacts                  ← expandable
       ┌──────────────────────────────────────────┐
       │ 📷 dashboard-main.png    1920×1080       │
       │ 📷 steer-panel.png       800×600         │
       │ 📊 health-endpoint.json  200 OK          │
       │                                          │
       │ "Dashboard shows TODO panel with 6 tasks,│
       │  log panel auto-scrolling, health badges" │
       └──────────────────────────────────────────┘
  20:14 review claude  ✓ approved (with proof)
```

**Image rendering**: Dashboard serves artifact images via `/api/artifacts/<iteration>/<filename>`. Screenshots display inline as thumbnails, expandable to full size.

**Before/after comparison view**: When a screenshot has a corresponding baseline, the dashboard renders a comparison widget with three modes:

```
┌─ dashboard-main.png ──────────────────────────────────────────┐
│  [Side by Side]  [Slider]  [Diff Overlay]     diff: 12.3%    │
├────────────────────────┬──────────────────────────────────────┤
│  Baseline (iter 4)     │  Current (iter 7)                    │
│                        │                                      │
│  ┌──────────────────┐  │  ┌──────────────────┐               │
│  │ old layout       │  │  │ new dense layout  │               │
│  │ with tabs        │  │  │ panels side by    │               │
│  │                  │  │  │ side              │               │
│  └──────────────────┘  │  └──────────────────┘               │
│                        │                                      │
└────────────────────────┴──────────────────────────────────────┘
```

Two comparison modes (toggle via buttons):
- **Side by side** — baseline left, current right, synchronized scroll
- **Slider** — single image with a draggable vertical divider (left = baseline, right = current). User drags to reveal differences.

The comparison widget uses the baseline from the proof manifest's `metadata.baseline` field. If no baseline exists (first proof run), the widget shows only the current screenshot with a "No baseline — first capture" label.

**History scrubbing**: If proof has been generated across multiple iterations, the comparison dropdown lets the user pick any previous iteration's screenshot as the baseline:

```
Compare against: [iter 4 (baseline)] ▼
                  iter 4 (baseline)
                  iter 2 (initial)
```

This lets the reviewer see how the UI evolved across the entire session, not just against the latest approved baseline.

**shadcn components**:
- `Tabs` for the three comparison modes
- `Slider` (radix) for the draggable divider
- `Select` for history scrubbing dropdown
- `Dialog` for full-screen expanded view
- `Badge` showing diff percentage (green <5%, yellow 5-20%, red >20%)

**Non-image artifacts**: API responses and CLI output captures render as syntax-highlighted code blocks.

### Review Integration

The reviewer receives the proof manifest alongside the code diff. This strengthens the review:

- Reviewer can verify that screenshots match the spec's visual expectations
- Reviewer can flag: "proof shows a blank page — build is broken, reject"
- Reviewer can flag: "no proof was generated but this was a UI task — reject, force proof re-run"
- Reviewer can flag: "visual diff is extremely large — flag for human review"

If the proof agent decided "nothing to prove" but the reviewer disagrees, the reviewer rejects with a note explaining what proof was expected. The loop re-enters build → proof with the reviewer's feedback.

### Proof Skip Protocol

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

### Prompt Template

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

### Acceptance Criteria

- [ ] Proof is a first-class phase in the loop cycle, with its own `PROMPT_proof.md` template
- [ ] Default pipeline becomes: plan → build × 5 → proof → qa → review (9-step)
- [ ] Proof agent autonomously decides what to prove, how, and whether to skip
- [ ] Artifacts are saved to `~/.aloop/sessions/<session-id>/artifacts/iter-<N>/`
- [ ] `proof-manifest.json` is written with structured artifact metadata and skip reasons
- [ ] Baselines are stored per-session and updated after review approval
- [ ] Dashboard renders proof artifacts inline in the log view (images as thumbnails, expandable)
- [ ] Dashboard serves artifacts via `/api/artifacts/<iteration>/<filename>`
- [ ] Reviewer receives proof manifest alongside code diff
- [ ] Reviewer can reject if proof is missing for work that should have been proven
- [ ] Proof skip is a valid outcome (empty artifacts, documented skip reasons)
- [ ] Both `loop.ps1` and `loop.sh` support the proof phase in their cycle resolution

---

## QA Agent — Black-Box User Testing (Priority: P1)

A dedicated QA agent that tests features as a real user would — running commands, clicking through the dashboard, testing error paths — without ever reading source code. It runs after proof and before review in the default pipeline.

### QA Agent Behavior

The QA agent is a **black-box tester**. It:
- Reads the SPEC to understand expected behavior (source of truth)
- Reads TODO.md for recently completed tasks (test candidates)
- Reads QA_COVERAGE.md for features never tested or previously failed
- Tests 3-5 features per iteration through their public interface
- Files bugs as `[qa/P1]` tasks in TODO.md with reproduction steps
- Maintains QA_COVERAGE.md (feature × result matrix) and QA_LOG.md (session transcript)
- Commits its own artifacts (QA_COVERAGE.md, QA_LOG.md, TODO.md updates)

**The QA agent NEVER reads source code.** It tests exclusively through CLI commands, HTTP endpoints, and browser interaction (via Playwright).

### Test Scope Per Iteration

- **3-5 features** per QA session — focused and thorough, not broad and shallow
- **Happy path + error paths + edge cases** for each feature
- **Layout verification** (mandatory for dashboard/UI changes) — screenshot at desktop viewport, verify panel count and element visibility match spec
- **GitHub integration E2E** (when GH features are claimed complete) — creates throwaway test repo, runs lifecycle, cleans up. Must use `--max-iterations 3` or similar to keep test runs short. Must clean up even on failure.
- **Re-test previously failed features** from QA_COVERAGE.md

### QA Artifacts

- `QA_COVERAGE.md` — feature coverage matrix: feature name, last tested date, commit, PASS/FAIL, notes
- `QA_LOG.md` — append-only session log with full command transcripts, stdout/stderr, exit codes, screenshots
- `[qa/P1]` tasks in TODO.md — bugs with format: `what you did → what happened → what spec says should happen`

### Prompt Template

`PROMPT_qa.md` instructs the agent:
- Study the spec for expected behavior
- Select test targets from recently completed tasks and coverage gaps
- Set up realistic test environments (temp dirs, real git repos, real dependencies)
- Test through public interfaces only (CLI, HTTP, browser)
- Log every command with exact output
- File bugs, update coverage, write session log, commit

### Acceptance Criteria

- [ ] QA is a first-class phase in the loop cycle, with its own `PROMPT_qa.md` template
- [ ] Default pipeline includes QA: plan → build × 5 → proof → qa → review (9-step)
- [ ] QA agent never reads source code — tests only through public interfaces
- [ ] Bugs filed as `[qa/P1]` tasks with reproduction steps
- [ ] QA_COVERAGE.md tracks per-feature test history
- [ ] QA_LOG.md contains full command transcripts as evidence
- [ ] Both `loop.ps1` and `loop.sh` support the qa phase in their cycle resolution
- [ ] If PowerShell test infrastructure creates fake provider binaries, each fake binary has both a Windows shim (`*.cmd`) and a POSIX shim (no extension) so `Get-Command` resolves fakes correctly on Linux/macOS and Windows

---

## Spec-Gap Analysis Agent (Continuous Spec Enforcement)

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

### Acceptance Criteria

- [ ] `PROMPT_spec-gap.md` exists with periodic scheduling (every 2nd cycle)
- [ ] Spec-gap is the first element of the `finalizer[]` array in `pipeline.yml` / `loop-plan.json`
- [ ] Spec-gap runs before every 2nd plan phase during normal loop execution
- [ ] Spec-gap runs as first finalizer agent when all tasks are done
- [ ] If spec-gap finds issues, they become TODO items, finalizer aborts, cycle resumes
- [ ] Loop can only complete when spec-gap produces zero findings
- [ ] Findings are written to TODO.md with `[spec-gap]` tag, file paths, and suggested fix direction
- [ ] Agent does not modify code or SPEC.md — analysis only
- [ ] Both `loop.sh` and `loop.ps1` support finalizer mode with `finalizerPosition` tracking

---

## Documentation Sync Agent (Honest Docs)

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

### Acceptance Criteria

- [ ] `PROMPT_docs.md` exists with periodic scheduling (every 2nd cycle)
- [ ] Docs is the second element of the `finalizer[]` array (runs after spec-gap in finalizer)
- [ ] Documentation reflects actual implementation status, not aspirational spec
- [ ] Completeness markers are used for partial/planned features
- [ ] Agent does not modify SPEC.md or implementation code

---

## CLAUDECODE Environment Variable Sanitization

When aloop is invoked from inside a Claude Code session (the normal case — user types `/aloop:start`), the `CLAUDECODE` env var is inherited. All entry points that launch provider CLIs must unset it to prevent "cannot launch inside another session" errors:

| Location | Fix |
|----------|-----|
| `aloop/bin/loop.ps1` | `$env:CLAUDECODE = $null` at script top |
| `aloop/bin/loop.sh` | `unset CLAUDECODE` at script top |
| `aloop/cli/src/index.ts` | `delete process.env.CLAUDECODE` at entry |
| `Invoke-Provider` (loop.ps1) | Also unset in the provider invocation block (defense-in-depth, in case something re-sets it) |
| `invoke_provider` (loop.sh) | Same — `unset CLAUDECODE` before each provider call |

### Acceptance Criteria

- [ ] `CLAUDECODE` is unset at the top of `aloop/bin/loop.ps1`
- [ ] `CLAUDECODE` is unset at the top of `aloop/bin/loop.sh`
- [ ] `CLAUDECODE` is deleted from `process.env` at `aloop/cli/src/index.ts` entry
- [ ] `Invoke-Provider` in loop.ps1 unsets `CLAUDECODE` before each provider call (defense-in-depth)
- [ ] `invoke_provider` in loop.sh unsets `CLAUDECODE` before each provider call (defense-in-depth)
- [ ] Loop launched from inside a Claude Code session can successfully invoke the `claude` provider

---

## UX: Dashboard, Start Flow, Auto-Monitoring

#### `aloop start` CLI subcommand

Move the entire start orchestration into the CLI so it's a single command:

```bash
aloop start [--pipeline default] [--provider round-robin] [--max 30] [--in-place]
aloop start <session-id> --launch resume
```

What it does internally:
1. `aloop resolve` — find project, check config
2. Generate session ID
3. Create session dir + copy prompts
4. Create git worktree (unless `--in-place`)
5. Write `meta.json` + register in `active.json`
6. Launch `loop.ps1`/`loop.sh` as a background process
7. Auto-launch dashboard (see below)
8. Print session summary + dashboard URL

**Resume behavior (`--launch resume`):**
- Should find the existing session directory and worktree
- If the worktree still exists and is valid, reuse it (just re-launch loop.sh)
- If the worktree was removed but the branch exists, recreate the worktree on that branch
- Never create a new branch when resuming — the whole point is to continue where it left off

The agent command `/aloop:start` becomes a thin wrapper that calls `aloop start` with the right flags. No more multi-step orchestration.

**Runtime versioning:**
- Installed CLI is self-contained — it does NOT reference or compare against a source repo checkout
- `version.json` in the install directory tracks the installed version
- `aloop update` pulls the latest release (not from a local git clone)
- Loop scripts must log their own version/timestamp at `session_start` for debugging

#### 2. `aloop setup` CLI subcommand

Similarly, move the setup/scaffold flow into a single interactive CLI:

```bash
aloop setup [--spec SPEC.md] [--providers claude,codex] [--non-interactive]
```

**Dual-mode support**: setup must support configuring both loop mode and orchestrator mode. Based on the scope and complexity of the task the user describes, setup should recommend the appropriate mode:

- **Loop mode** (default for simple/single-track work): one spec, one loop, configurable agent pipeline. Best for: single feature, bug fix, focused refactor, small-to-medium scope.
- **Orchestrator mode** (recommended for complex/multi-track work): spec decomposition into parallel issues, wave scheduling, concurrent child loops. Best for: large migrations, multi-component features, greenfield projects with many independent workstreams.

Setup should analyze the spec file (if provided) or the user's description to gauge complexity — number of independent workstreams, estimated issue count, whether parallelism would help — and recommend one mode. The user can override the recommendation.

Interactive mode:
1. Run `aloop discover`
2. Prompt user for spec file, providers, validation level
3. **Auto-detect if the target repo has `.github/workflows/` and what CI is configured**
4. **Ask the user if quality gate workflows should be set up (test, lint, type-check, coverage)**
5. **Check if the GitHub repo supports Actions (public vs private, org policy, etc.)**
6. **Analyze scope and recommend loop vs orchestrator mode**
7. **Ask about data privacy**: internal/private project vs public/open-source? How sensitive is the code/data? This determines ZDR configuration (see [Zero Data Retention](#zero-data-retention-zdr) section below)
8. **If devcontainer is enabled: propose a provider-auth strategy and let the user override it.** Default is `mount-first` (auth file bind-mounts first), with alternatives `env-first` and `env-only`.
9. If orchestrator: prompt for concurrency cap and budget limits
10. Run `aloop scaffold` with gathered options
11. Print confirmation summary with all chosen settings (including auto-suggested trunk branch name, e.g., `agent/trunk`, ZDR mode if enabled, and proposed per-provider devcontainer auth methods) — user confirms or adjusts

#### Zero Data Retention (ZDR)

When the user selects `data_privacy: private` during setup, the scaffold generates provider-specific ZDR configuration. ZDR is not a single flag — each provider handles it differently.

**Provider ZDR summary:**

| Provider | ZDR Level | Per-Request? | What Setup Does |
|---|---|---|---|
| **OpenRouter** (via opencode) | Account + Request | **Yes** | Generate `opencode.json` with `provider.zdr: true` in `extraBody` |
| **Anthropic/Claude** | Organization | No | Warn: "ZDR requires an org agreement with Anthropic. Verify your org has it." |
| **Google Gemini** | GCP Project | No | Warn: "ZDR requires project-level approval from Google." |
| **OpenAI** | Organization | No | Warn: "ZDR requires a sales agreement with OpenAI. Note: images are excluded from ZDR." |
| **GitHub Copilot** | Plan tier | No | Warn: "ZDR requires Business or Enterprise plan." |

**What `aloop scaffold` does when `zdr_enabled: true`:**

1. **OpenRouter via opencode** — writes the ZDR flag into `opencode.json` (or `.opencode/config.json`):
   ```json
   {
     "provider": {
       "openrouter": {
         "options": {
           "extraBody": {
             "provider": {
               "zdr": true
             }
           }
         }
       }
     }
   }
   ```
   This causes every OpenRouter request to route only to ZDR-eligible endpoints.

2. **All other providers** — prints a warning during setup confirmation listing which providers require org/project-level agreements, with links to the relevant docs.

3. **Config file** — records `zdr_enabled: true` and `data_classification: private` so the dashboard and monitoring can display the ZDR status. No runtime behavior change — the config is informational for providers that handle ZDR at the org level.

**What setup does NOT do:**
- Does not exclude providers from round-robin based on ZDR. The user chose their providers; setup warns but doesn't override.
- Does not change model defaults. ZDR affects routing, not model availability.
- Does not verify org-level ZDR is actually enabled. There's no API to check this.

Non-interactive mode (for CI/automation):
- All options passed as flags, no prompts
- `--mode loop|orchestrate` to select explicitly

#### 3. Auto-monitoring popup on loop start

When `aloop start` launches a loop, it should automatically open a monitoring window:

**Option A: Dashboard auto-launch (preferred)**
```
aloop start
  → spawns loop script in background
  → spawns dashboard server on random available port
  → opens browser to http://localhost:<port>
  → prints "Dashboard: http://localhost:<port>"
```

Browser auto-open:
- Windows: `Start-Process "http://localhost:$port"`
- macOS: `open "http://localhost:$port"`
- Linux: `xdg-open "http://localhost:$port"`

**Option B: Terminal popup (fallback if no browser)**
```
aloop start
  → spawns loop script in background
  → opens new terminal window with live `aloop status --watch` (auto-refreshing)
```

Terminal spawn:
- Windows: `Start-Process pwsh -ArgumentList "-NoExit -Command aloop status --watch"`
- macOS: `osascript -e 'tell app "Terminal" to do script "aloop status --watch"'`
- Linux: `x-terminal-emulator -e "aloop status --watch"`

**Configuration:** `config.yml` option to control behavior:
```yaml
on_start:
  monitor: dashboard   # dashboard | terminal | none
  auto_open: true      # open browser/terminal automatically
```

#### 4. `/aloop:dashboard` command + copilot prompt

Add the missing command files:

**`claude/commands/aloop/dashboard.md`:**
- Invokes `aloop dashboard --session <active-session-id>`
- If multiple sessions, asks which one
- Opens browser to dashboard URL

**`copilot/prompts/aloop-dashboard.prompt.md`:**
- Same behavior for Copilot

#### 5. Session sidebar (left panel — tree view)

Collapsible sidebar (Ctrl+B) showing all sessions in a tree grouped by project.

**Backend:**
- Reads `~/.aloop/active.json` (object keyed by session ID) and `~/.aloop/history.json` (array) on startup
- Watches both files for changes → pushes SSE updates to all clients
- `GET /api/state?session=<id>` — returns state for any session
- `GET /events?session=<id>` — reconnects live stream to a different session
- PID liveness: checks `active.json` PID first, falls back to `meta.json`, uses `kill -0` to detect dead processes
- Includes `branch` from `meta.json` in session data

**Tree structure:**
```
▾ ralph-skill                          ← project group (from project_name)
  ● ralph-skill-20260314-173930        ← active session, green pulsing dot
    ⌥ aloop/ralph-skill-20260314-...     branch
    build · iter 16 · 16h ago            phase badge, iter, last activity

▸ Older (12)                           ← collapsed group for sessions
  ○ ralph-skill-20260310-091729            ended_at > 24h ago
  ○ ralph-skill-20260309-...
```

**Session card details:**
- **Dot color**: green=running (pulsing), gray=stopped/exited, red=unhealthy (dead PID), orange=stopping/cooldown
- **Fields**: project name, session ID (truncated), branch name, phase badge (color-coded), iteration count, last activity (relative time), elapsed duration
- **Tooltip** on hover: full session ID, PID, provider config, started_at, ended_at, work_dir, state
- Active sessions sorted to top; sessions with no activity >24h auto-collapse into "Older" group
- Click to switch; selected session highlighted with accent background
- URL persistence: `?session=<id>` query param, updated on switch via `history.replaceState`

**Collapsed state:** 40px icon-only bar with status dots stacked vertically, tooltip on hover with session name and status.

#### 6. Dashboard UI

**Icon library:** `lucide-react` — all icons use Lucide components, no inline SVGs or pseudo-icons.

**Layout:** Two-column with sidebar, header, and footer.
```
┌──────────┬─────────────────────────────────────────────────┐
│ Sidebar  │  Header: session · iter · progress · phase ·    │
│ (tree)   │          provider · status · connection · Ctrl+K │
│          ├────────────────────┬────────────────────────────┤
│ ▾ proj   │  Docs (tabbed)     │  Activity Log              │
│   ● sess │  TODO | SPEC | ... │  (grouped by date,         │
│     info │  [Health] [⋯]      │   newest first)            │
│          │                    │                            │
│ ▸ Older  │  Rendered markdown │  09:40 ● build gemini ✗    │
│   ○ old1 │  with live updates │  09:30 ● build opencode ✓  │
│   ○ old2 │                    │  09:14 ● review gemini ✓   │
│          ├────────────────────┴────────────────────────────┤
│          │  Steer: [                          ] Send       │
│          │  [Stop (SIGTERM)]  [Force (SIGKILL)]            │
└──────────┴────────────────────────────────────────────────┘
```

**Header bar:**
- Session name (clickable → expands sidebar), running dot (pulsing if active)
- Iteration counter with hover card showing phase, status, provider, task progress
- Progress bar (color matches phase: plan=purple, build=yellow, proof=amber, qa=orange, review=cyan)
- Phase badge, provider/model, state text (colored)
- Connection indicator (Live/Connecting/Disconnected)
- Ctrl+K hint button → opens command palette
- Last updated timestamp

**Docs panel (left column):**
- Tabbed: TODO.md, SPEC.md, RESEARCH.md, REVIEW_LOG.md, STEERING.md
- Only tabs with non-empty content shown
- When >5 tabs: first 4 visible + `⋯` overflow dropdown (DropdownMenu) for the rest
- **"Health" tab**: per-provider status derived from log events
  - Provider name, status dot (green=healthy, orange=cooldown, red=failed), last event time
  - Tooltip: failure reason, cooldown duration, consecutive failures
  - Derived from `provider_cooldown` / `provider_recovered` log events
- Live markdown rendering via `marked`, custom `.prose-dashboard` styles
- ScrollArea per tab content

**Activity log (right column):**

Log entries from JSONL, parsed and filtered. Skip noise events (`frontmatter_applied`, duplicate `session_start`). Show only meaningful events: `iteration_complete`, `iteration_error`, `provider_cooldown`, `provider_recovered`, first `session_start`.

Grouped by date (sticky headers with backdrop blur), **newest first** within each group and across groups.

**Compact entry format** (monospace, single line):
```
HH:MM  ●  phase  provider·model  ✓ result   duration  ▸
```

- **Timestamp**: HH:MM (locale-aware)
- **Status dot**: centered vertically, colored by phase, subtle opacity pulse (`animate-pulse-dot`: opacity 1→0.5→1, 2s cycle) if currently active iteration
- **Phase**: label (plan, build, proof, qa, review)
- **Provider·model**: e.g. `claude·sonnet-4.6`, truncated to max 140px. Model sourced from: (1) `LAST_PROVIDER_MODEL` in log entry, (2) parsed from per-iteration `output.txt` header (e.g. opencode `> build · openrouter/hunter-alpha`). For opencode, `LAST_PROVIDER_MODEL` is `opencode-default` since the actual model is resolved by opencode; dashboard extracts the real model from the output header
- **Result icon**: CheckCircle (green) for success, XCircle (red) for error — with tooltip showing full detail
- **Result detail**: 7-char commit hash (blue, monospace) or error reason
- **Duration**: right-aligned; computed as `$(date +%s) - ITERATION_START` and logged in `iteration_complete`/`iteration_error` events; live counting up with ElapsedTimer if currently active iteration. `status.json` includes `iteration_started_at` (ISO timestamp) so the timer survives page refresh
- **Expand chevron**: ChevronRight → ChevronDown (lucide) if entry has expandable content

**Expanded entry detail** (indented, border-left accent):

1. **Commit section** (if iteration produced a commit):
   ```
   Commit: a3f1bc2 — feat: add request processing
   ├─ M  aloop/cli/src/commands/dashboard.ts    +31 -8
   ├─ A  aloop/cli/src/lib/requests.ts          +142
   └─ M  TODO.md                                +2 -1
   ```
   - File type badge: `A` (green), `M` (yellow), `D` (red), `R` (blue)
   - Diffstat: green `+N`, red `-N`
   - File paths truncated with tooltip for full path

2. **Artifacts section** (if iteration has proof artifacts):
   ```
   Artifacts (3):
   📷 dashboard-main.png  1920×1080
   📄 health-check.json   200 OK
   ```
   - Image artifacts: clickable → lightbox overlay (ESC to close)
   - Diff badge if `diff_percentage` present: green <5%, yellow <20%, red >=20%

3. **Provider output + usage/cost** (for `iteration_complete`/`iteration_error` entries):
   - Rendered inline when entry is expanded (no extra toggle — shown alongside commits and artifacts)
   - Auto-loaded from `/api/artifacts/{iteration}/output.txt` on expand
   - Scrollable `<pre>` block (max 300px height), monospace, word-wrap
   - Dashboard parses output header for model info (e.g. opencode `> build · openrouter/model-name`)
   - Dashboard extracts token/cost metrics when available and renders a compact usage row (`input`, `output`, `total`, `usd_estimate`)
   - If token/cost is unavailable for that iteration, no usage row is shown

4. **Raw JSON fallback** (if no commit/artifacts/output, show parsed event data)

**Footer (always visible):**
- Steer textarea with Send button
- Stop button (destructive, tooltip: "Gracefully stop after current iteration — SIGTERM")
- Force button (outline, tooltip: "Kill immediately without cleanup — SIGKILL")

**Keyboard shortcuts:**
- `Ctrl+B` / `Cmd+B` — toggle sidebar
- `Ctrl+K` / `Cmd+K` — command palette (fuzzy search: stop, force stop, switch session)
- `Escape` — close lightbox / command palette
- `Enter` in steer input — submit; `Shift+Enter` — newline

**Theme:** System theme adaptation via `prefers-color-scheme`. Light vars in `:root`, dark vars in `.dark` class. Inline `<script>` in `index.html` detects system preference and toggles `.dark` class before first paint. Standard shadcn/Tailwind/Radix theming pattern.

**shadcn components:** Tooltip, HoverCard, Collapsible, Progress, ScrollArea, Tabs, Command (cmdk), Sonner (toast), Card, Button, Textarea, DropdownMenu.

**Real-time updates via SSE:**
- State changes → full state push to all connected clients
- Each client gets state for its own session context
- Heartbeat every 5s to detect disconnects
- Auto-reconnect with exponential backoff (1s → 30s max)
- Phase transitions → toast notification
- Dead PID detection → auto-correct state from running to exited

### Acceptance Criteria

- [ ] `aloop start` CLI command handles full session setup + loop launch in a single invocation
- [ ] `aloop setup` CLI command handles interactive config creation in a single invocation
- [ ] `aloop start` auto-launches dashboard and opens browser (configurable via `on_start` in config.yml)
- [ ] `/aloop:start` agent command delegates to `aloop start` CLI (thin wrapper)
- [ ] `/aloop:setup` agent command delegates to `aloop setup` CLI (thin wrapper)
- [ ] `/aloop:dashboard` command file exists in `claude/commands/aloop/`
- [ ] `aloop-dashboard.prompt.md` exists in `copilot/prompts/`
- [ ] Dashboard sidebar shows sessions in tree view grouped by project, with Active/Older sections
- [ ] Session cards show dot status (pulsing green=running, gray=stopped, red=unhealthy), branch, phase badge, iteration count, relative last activity
- [ ] Tooltips on all interactive elements (session cards, status dots, buttons, provider health)
- [ ] Activity log filters noise events, shows compact one-liner per iteration with expand/collapse
- [ ] Expanded log entries show commit diffstat with file type badges and artifact thumbnails
- [ ] `lucide-react` icons throughout — no inline SVGs or pseudo-icons
- [ ] Dashboard updates in real-time via SSE for all state changes
- [ ] Dashboard uses advanced shadcn components (Tooltip, HoverCard, Collapsible, Command, Sonner, ScrollArea, Tabs, DropdownMenu)
- [ ] Steer input is always visible (not behind a tab)
- [ ] Progress bar and phase indicator visible in dashboard header
- [ ] Docs tab bar renders only docs with non-empty content; overflow extras into `⋯` dropdown
- [ ] Provider health shown as a tab in docs panel, derived from log events
- [ ] Loop exit writes `status.json` as `stopped`/`exited`, dashboard detects dead PID automatically
- [ ] Dead PID detection visible in dashboard status/details
- [ ] System theme adaptation via `.dark` class + `prefers-color-scheme` detection
- [ ] `aloop status --watch` provides terminal-based live monitoring (auto-refresh)

**Priority note:** The loop engine and orchestrator are the highest priority. Dashboard work (UX polish, test coverage) comes **after** loop and orchestrator core features are complete.

---

## Parallel Orchestrator Mode (Fan-Out via GitHub Issues)

### Concept

A meta-loop mode that decomposes a spec into **vertical slices** as GitHub issues with sub-issue hierarchy, launches independent child loops per sub-issue (each in its own worktree/branch), reviews the resulting PRs against hard proof criteria, and merges approved work into an agent-driven trunk branch. The human promotes agent/trunk to main when satisfied.

```
               SPEC.md (or specs/*.md)
                        │
                ┌───────┴───────┐
                │  ORCHESTRATOR  │  ← TS/Bun program (aloop/cli/)
                │   decompose    │     the brain
                └───────┬───────┘
                        │
             creates vertical slices
             as parent + sub-issues
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
    Parent #10     Parent #20     Parent #30
   "User signup"  "Create posts" "Admin panel"
     │  │  │        │  │            │  │
    #11 #12 #13   #21 #22        #31 #32
     │   │   │     │   │          │   │
   loop loop loop loop loop    loop loop  ← loop scripts (inner loop)
     │   │   │     │   │          │   │     dumb workers
   PR#1 PR#2 ...  PR#4 PR#5    PR#6 PR#7
     └───┴───┴─────┴───┴────────┴───┘
                    │
            ┌───────┴───────┐
            │  ORCHESTRATOR  │
            │  gate + merge  │
            └───────┬───────┘
                    │
             agent/trunk branch
                    │
            (human promotes to main)
```

### Shared Loop Mechanism

The orchestrator and child implementation loops use the **same `loop.sh`/`loop.ps1`** — same `loop-plan.json`, same `queue/` folder, same frontmatter prompts. The difference is what prompts are in the cycle and queue.

**Orchestrator loop** — a `loop.sh` instance with orchestrator prompts:
- Cycle: single scan prompt as heartbeat (`PROMPT_orch_scan.md`)
- Primarily **queue-driven** — reactive, not cyclical. The scan checks state; the runtime generates per-item work prompts into `queue/`.
- Agents write `requests/*.json` for side effects (GitHub API calls, child loop launches). Runtime processes requests and queues follow-up prompts.
- Manages the full refinement pipeline: spec gap analysis → epic decomposition → epic refinement → sub-issue decomposition → sub-issue refinement → dispatch

**Child implementation loop** — a `loop.sh` instance with build prompts:
- Cycle: fixed rotation (plan → build → build → proof → qa → review)
- Primarily **cycle-driven** — proactive, predictable. Queue used only for steering/overrides.
- Reads its sub-spec from the issue body (seeded into its worktree), NOT the repo's SPEC.md
- Knows nothing about GitHub, other children, orchestration, or the full spec

**Aloop runtime** (TS/Bun, `aloop/cli/`) — the host-side process:
- Processes `requests/*.json` from both orchestrator and child loops
- Executes side effects: GitHub API, child loop spawning, PR operations
- Queues follow-up prompts into the requesting loop's `queue/` folder
- Monitors provider health, manages concurrency cap, budget
- Watches spec files for changes (git diff on spec glob)

```
Aloop Runtime (TS/Bun) ← host process, always running
  │
  ├── Orchestrator loop.sh instance
  │     ├── cycle: [PROMPT_orch_scan.md]  (heartbeat)
  │     ├── queue/: per-item work prompts  (reactive)
  │     ├── requests/: side effect requests → runtime
  │     └── scans GitHub state, refines issues, decides dispatch
  │
  ├── Child loop.sh (issue #11)
  │     ├── cycle: [plan, build×5, proof, qa, review]
  │     ├── queue/: steering overrides only
  │     └── reads sub-issue body as its spec
  │
  ├── Child loop.sh (issue #12)  ... same
  └── Child loop.sh (issue #13)  ... same
```

### Child Loop Sub-Spec

Each child loop does NOT read the repo's SPEC.md. The orchestrator extracts a **self-contained sub-spec** from the parent spec during decomposition and writes it into the sub-issue body. The child loop's plan agent reads this as its entire world:

```
Orchestrator reads:  specs/auth.md (full vertical slice spec)
                          │
                    decomposes into
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
         Issue #11    Issue #12    Issue #13
      "Registration"  "Login"    "Password reset"
      (sub-spec in    (sub-spec   (sub-spec in
       issue body)    in body)     issue body)
              │           │           │
         child loop   child loop  child loop
         reads #11    reads #12   reads #13
         as its spec  as its spec as its spec
```

The sub-spec in the issue body contains:
- Scope description — what this work unit delivers
- Acceptance criteria — how to know it's done
- Context — relevant architecture decisions from the parent spec
- Boundaries — what NOT to touch (other slices' territory)

This scoping is critical — the child loop shouldn't make system-wide decisions. It delivers its slice and nothing more.

### UI Variant Exploration (Competitive Designs)

When the orchestrator decomposes work that includes user-facing UI features, and the session is configured with **high parallelism** or **autonomous** autonomy level, the decompose agent should plan **multiple distinct UI variants** for the same feature — each built by a separate child loop with different design direction in its sub-spec instructions.

**Why:** AI-generated UIs are cheap to produce but hard to evaluate from a spec alone. Instead of committing to one approach and iterating toward "good enough," build 2-3 competing implementations simultaneously. The user picks the direction they prefer. This is faster than serial iteration on a single design and produces better outcomes because the user sees concrete alternatives instead of describing what they want in the abstract.

**How it works:**

1. **Decompose agent** identifies sub-issues that involve UI work (components, pages, layouts, interactions)
2. For qualifying features, creates 2-3 sibling sub-issues instead of one, each with a different design focus:
   - Variant A: "minimal / data-dense / power-user focused"
   - Variant B: "visual / spacious / guided UX"
   - Variant C: "progressive disclosure / mobile-first" (if 3 variants)
3. Each variant sub-issue gets a distinct sub-spec that emphasizes different trade-offs
4. All variants are **togglable via runtime feature flags** — a simple env var or config toggle, not compile-time branching. All variants ship in the same build.
5. The parent issue tracks which variants were produced and links to their PRs
6. User reviews the variants (side-by-side if dashboard supports it) and picks one — or combines elements from multiple

**Feature flag convention:**
```
FEATURE_<epic>_VARIANT=A|B|C   (env var)
```
Or in a shared config file the app reads at startup. The flag defaults to variant A. All variants share the same data layer / API — only the presentation differs.

**When this activates:**
- `autonomy_level: autonomous` AND the feature involves UI components, OR
- `max_parallel_loops >= 3` AND the feature involves UI components
- The decompose agent decides how many variants (2-3) based on available parallelism budget

**When this does NOT activate:**
- `autonomy_level: cautious` — user is hands-on, prefers to direct design themselves
- Backend-only features, API-only, infrastructure, data pipelines
- Low parallelism budget (variants would serialize, defeating the purpose)

**Setup integration:** During `aloop setup`, when the user configures autonomy level and parallelism, the summary should include a line like:

```
UI variant exploration:  enabled (2 variants per UI feature, togglable via feature flags)
```

or `disabled` if conditions aren't met. This is part of the summary — not a separate question. The user can override it in the summary review step if they want.

### Multi-File Specs

Single `SPEC.md` breaks down at scale. The orchestrator supports multiple spec files:

```
specs/
  SPEC.md              ← master spec (architecture, constraints, non-goals)
  auth.md              ← vertical slice group
  posts.md             ← vertical slice group
  admin.md             ← vertical slice group
```

The master spec defines the system — architecture, constraints, non-goals. Each additional spec file defines a group of related vertical slices. The orchestrator reads all spec files and produces the full issue set.

Single `SPEC.md` still works — multi-file is optional for larger projects.

### Vertical Slice Decomposition

The orchestrator decomposes the spec into **vertical slices** — independently shippable, end-to-end user-facing features that cut through the full stack.

**Correct decomposition** (vertical):
```
Parent #10: "User can sign up and log in"
  Sub-issue #11: "Registration form + API endpoint + DB schema + validation"
  Sub-issue #12: "Login flow + JWT issuance + session cookie"
  Sub-issue #13: "Password reset email flow end-to-end"
```

**Wrong decomposition** (horizontal layers):
```
❌ Parent: "Database models"           ← all models, no user-facing outcome
❌ Parent: "API endpoints"             ← all APIs, no shippable feature
❌ Parent: "Frontend components"       ← all UI, can't run independently
```

Sub-issues should also be vertical where possible — each one delivers a runnable piece of the parent feature. Sometimes horizontal groundwork is unavoidable (e.g., "Set up database schema and ORM config" before any feature can use it). These are explicitly marked as **foundation** issues with dependencies.

### Three-Level Hierarchy

| Level | GitHub entity | What it represents | Who creates it |
|-------|-------|---------|---|
| Spec | `SPEC.md` / `specs/*.md` | Intent — what & why | Human |
| Slice | Parent issue | Vertical slice — independently shippable feature | Orchestrator (decompose agent) |
| Work unit | Sub-issue | Scoped piece of a slice — gets its own child loop | Orchestrator (decompose agent) |
| Task | Child's `TODO.md` | Implementation steps within a work unit | Child loop's plan agent |

The spec is the authoritative intent. Parent issues are vertical slices derived from the spec. Sub-issues are scoped work units within each slice. Tasks are ephemeral implementation steps that live and die within a child loop.

### GitHub Sub-Issues

Sub-issues are GA (since March 2025), available on all GitHub plans. Limits: 100 sub-issues per parent, 8 levels deep, cross-repo within org.

**Creation via `gh api`** (no native `gh issue create --parent` yet):

```bash
# Create parent (vertical slice)
PARENT=$(gh api --method POST /repos/OWNER/REPO/issues \
  -f title="User can sign up and log in" \
  -f body="$(cat slice-body.md)" \
  --jq '.number')

# Create sub-issue (work unit)
CHILD_RESULT=$(gh api --method POST /repos/OWNER/REPO/issues \
  -f title="Registration form + API + DB schema" \
  -f body="$(cat workunit-body.md)")
CHILD_ID=$(echo "$CHILD_RESULT" | jq -r '.id')

# Link as sub-issue (uses parent NUMBER but child internal ID)
gh api --method POST /repos/OWNER/REPO/issues/$PARENT/sub_issues \
  -f sub_issue_id="$CHILD_ID"
```

**Gotchas**: The `sub_issue_id` requires the internal numeric `id` (not the `#number`). Occasional 500s on the sub-issues endpoint — retry logic needed. No atomic create-with-children — must create then link.

### GitHub as Source of Truth

**GitHub is the authoritative state for the orchestrator.** There is no local `orchestrator.json` that duplicates issue state. The orchestrator queries GitHub for the plan, and all changes — human or automated — are visible immediately.

Local state is minimal: `sessions.json` maps `{issue_number → child_session_id + PID}`. Everything else — issue status, dependencies, wave assignments, PR state — lives in GitHub.

Benefits:
- Human edits an issue (close, reopen, relabel) → orchestrator sees it next poll
- Orchestrator crashes and restarts → reads everything from GitHub, local mapping reconnects running children
- Multiple people can interact with the issues → single source of truth
- `--plan-only` just creates issues, done

### Dependency Tracking

Dependencies use **GitHub's native issue dependency tracking** (`blocked_by` / `blocking` relationships), not custom metadata. The orchestrator creates dependencies via the API, and GitHub surfaces them natively in the issue UI.

**Issue body format:**
```markdown
## Scope
Registration form with email/password, API endpoint for account creation,
database schema for users table. Includes input validation and error handling.

## Acceptance Criteria
- [ ] User can fill out registration form and submit
- [ ] API validates input and creates user record
- [ ] Duplicate email returns clear error
- [ ] Success redirects to login page

## Aloop Metadata
- Wave: 2
- Files: `src/pages/register/*`, `src/api/auth/*`, `prisma/schema.prisma`
- Type: vertical-slice
```

Dependencies are managed via GitHub's native feature, not embedded in the issue body. Wave assignment and file ownership hints live in the issue body as human-readable metadata. Labels (`aloop/wave-2`, `aloop/auto`, `aloop/foundation`) provide machine-queryable categorization.

### Efficient GitHub Monitoring

The orchestrator avoids expensive polling by combining ETag-guarded REST checks with targeted GraphQL queries.

**Strategy:**

1. **Change detection** (every 30-60s): REST call with `since` parameter and ETag caching
   ```bash
   gh api '/repos/OWNER/REPO/issues?sort=updated&since=LAST_CHECK&per_page=1' \
     -H 'If-None-Match: PREVIOUS_ETAG'
   ```
   Returns `304 Not Modified` when nothing changed — does NOT count against rate limit.

2. **Full state fetch** (only when changes detected): Single GraphQL query fetching all open issues + sub-issues + linked PRs + labels + dependency status
   ```graphql
   query {
     repository(owner: "OWNER", name: "REPO") {
       issues(first: 50, states: OPEN, labels: ["aloop/auto"], orderBy: {field: UPDATED_AT, direction: DESC}) {
         nodes {
           number, title, state, updatedAt
           labels(first: 10) { nodes { name } }
           subIssues(first: 20) {
             nodes { number, title, state, labels(first: 5) { nodes { name } } }
           }
           timelineItems(first: 5, itemTypes: [CROSS_REFERENCED_EVENT]) {
             nodes { ... on CrossReferencedEvent { source { ... on PullRequest { number, state, url } } } }
           }
         }
       }
     }
   }
   ```
   Cost: **~7 rate-limit points** per query. At 5,000/hr, this can run 714 times/hour.

3. **Optional: webhook push** (for instant event notification during active sessions):
   ```bash
   gh webhook forward --repo=OWNER/REPO --events=issues,pull_request --url=http://localhost:PORT/webhook
   ```
   Uses GitHub's own CLI extension (`gh extension install cli/gh-webhook`). No public server needed. Falls back to polling when not running.

**Rate limit budget** (60s polling interval, 50 issues):
- REST change-detection with ETag: ~5-10 counted requests/hr (most are free 304s)
- GraphQL full fetch (only on change): ~5-20 queries/hr = 35-140 points/hr
- **Total: well under 1% of rate limit**

### Request/Response Protocol

Agents inside `loop.sh` cannot call external APIs directly (inner loop boundary). When an agent needs a side effect (create GitHub issue, launch child loop, merge PR), it writes a **request file** with a predefined structured contract. The runtime processes it and queues follow-up prompts.

**Direction:**
- `$SESSION_DIR/requests/*.json` — agent → runtime (structured side-effect requests)
- `$SESSION_DIR/queue/*.md` — runtime → loop (follow-up prompts with results baked in)

**Request file contract:**

Every request file follows the same envelope:
```json
{
  "id": "req-<monotonic-counter>",
  "type": "<request_type>",
  "payload": { ... }
}
```

**Defined request types:**

All markdown content (issue bodies, PR descriptions, comments, sub-specs) is passed as **file path references** to `.md` files in the session directory — never inline in the JSON. The agent writes the markdown file, then references its path in the request payload.

| Type | Payload | Runtime action | Queues |
|------|---------|----------------|--------|
| `create_issues` | `{issues: [{title, body_file, labels, parent?}]}` | Creates GitHub issues (reads body from file), links sub-issues to parent | Per-issue refinement prompts |
| `update_issue` | `{number, body_file?, labels_add?, labels_remove?, state?}` | Updates issue on GitHub (reads body from file if provided) | None (or re-analysis prompt if body changed) |
| `close_issue` | `{number, reason}` | Closes issue with comment | None |
| `create_pr` | `{head, base, title, body_file, issue_number}` | Creates PR via `gh pr create` (reads description from file), links to issue | Gate/review prompt |
| `merge_pr` | `{number, strategy: "squash"\|"merge"\|"rebase"}` | Merges PR via `gh pr merge` | Downstream dispatch prompts |
| `dispatch_child` | `{issue_number, branch, pipeline, sub_spec_file}` | Creates worktree, compiles child `loop-plan.json`, seeds sub-spec from file, launches child `loop.sh` | Monitor prompt |
| `steer_child` | `{issue_number, prompt_file}` | Copies prompt file to child's `queue/` | None |
| `stop_child` | `{issue_number, reason}` | Sends SIGTERM to child loop PID | Cleanup prompt |
| `post_comment` | `{issue_number, body_file}` | Posts comment on GitHub issue/PR (reads from file) | None |
| `query_issues` | `{labels?, state?, since?}` | Queries GitHub issues, writes result to queue as context | Analysis prompt with results |
| `spec_backfill` | `{file, section, content_file}` | Reads content from file, writes into spec file at section, commits | None |

**Payload validation:** The runtime validates each request against the contract before processing. Malformed requests are moved to `$SESSION_DIR/requests/failed/` with an error annotation. The loop picks up the failure on next scan.

**Idempotency:** Every request type is designed to be safe to re-execute. `create_issues` checks for existing issues by title+label match. `merge_pr` checks if already merged. `dispatch_child` checks if session already exists. This ensures resumability after crashes.

**Request file naming:** `req-<NNN>-<type>.json` (e.g., `req-001-create_issues.json`). Counter is monotonic per session. Runtime processes in order.

**Loop script addition** — wait for pending requests before next iteration:
```bash
REQUESTS_DIR="$SESSION_DIR/requests"
if ls "$REQUESTS_DIR"/*.json 2>/dev/null | grep -q .; then
    write_log_entry "waiting_for_requests" "count" "$(ls "$REQUESTS_DIR"/*.json | wc -l)"
    WAIT_START=$(date +%s)
    TIMEOUT=${REQUEST_TIMEOUT:-300}
    while ls "$REQUESTS_DIR"/*.json 2>/dev/null | grep -q .; do
        sleep 2
        ELAPSED=$(( $(date +%s) - WAIT_START ))
        if [ "$ELAPSED" -gt "$TIMEOUT" ]; then
            write_log_entry "request_timeout" "elapsed" "$ELAPSED"
            break
        fi
    done
fi
```

Request files are deleted by the runtime after processing. The loop waits for the directory to empty, then picks up whatever the runtime queued.

**Example flow — epic decomposition:**
```
1. Orchestrator agent (PROMPT_orch_decompose.md) analyzes spec
2. Writes markdown files:
   - requests/bodies/epic-auth.md  (issue body for auth epic)
   - requests/bodies/epic-cms.md   (issue body for CMS epic)
3. Writes: requests/req-007-create_issues.json
   {
     "id": "req-007",
     "type": "create_issues",
     "payload": {
       "issues": [
         {"title": "Epic: User Authentication", "body_file": "requests/bodies/epic-auth.md", "labels": ["aloop/epic", "aloop/needs-refine"]},
         {"title": "Epic: Content Management", "body_file": "requests/bodies/epic-cms.md", "labels": ["aloop/epic", "aloop/needs-refine"]}
       ]
     }
   }
4. loop.sh waits for requests/ to empty
5. Runtime picks up request, reads body markdown files, creates issues #42 and #43 on GitHub
6. Runtime deletes request file (and body files)
7. Runtime queues:
   - queue/008-refine-epic-42.md (product analyst prompt with epic #42 context)
   - queue/009-refine-epic-43.md (product analyst prompt with epic #43 context)
8. loop.sh sees requests/ empty, picks up queue/008-refine-epic-42.md
```

### Autonomy Levels

Gap resolution behavior is configurable per session, set during `aloop setup`:

| Level | Behavior | When to use |
|-------|----------|-------------|
| `cautious` | All questions block, wait for user to answer | High-stakes, unfamiliar domain, vague spec |
| `balanced` | Low-risk questions auto-resolved, high-risk block for user | Default — good spec with some gaps |
| `autonomous` | All questions auto-resolved, only true contradictions block | High-quality spec, trusted agent judgment |

**Two-agent model:** Gap analysis always creates `aloop/spec-question` issues — regardless of autonomy level. This ensures every gap is recorded. A separate **resolver agent** (`PROMPT_orch_resolver.md`) then runs and, based on the autonomy level, either:
- **Waits** — leaves the issue open and blocking (cautious mode, or high-risk in balanced mode)
- **Resolves** — comments on the issue with its reasoning and chosen approach, updates the spec with the decision, closes the issue to unblock downstream work

This means:
1. Every question is visible on GitHub — the user always sees what was asked
2. Every autonomous decision has a documented rationale in the issue comments
3. The user can reopen any auto-resolved issue to override the decision
4. The same issue thread serves as the conversation — whether human or agent answered
5. `aloop/spec-question` label means "unresolved"; closing means "resolved" (by human or agent)

**Resolver agent behavior by autonomy level:**

| Autonomy | Low-risk gap | Medium-risk gap | High-risk gap |
|----------|-------------|-----------------|---------------|
| `cautious` | Wait for user | Wait for user | Wait for user |
| `balanced` | Auto-resolve + comment | Wait for user | Wait for user |
| `autonomous` | Auto-resolve + comment | Auto-resolve + comment | Auto-resolve + comment |

Risk classification:
- **Low-risk**: naming conventions, error message wording, UI spacing, log levels, file organization
- **Medium-risk**: API contract details, data model choices, auth flow specifics, error handling strategy
- **High-risk**: architectural boundaries, security model, data privacy, billing logic, breaking changes

### Orchestrator State Machine

The orchestrator is **reactive and queue-driven**. Instead of numbered phases, each issue progresses through a **GitHub-native state model** (issue state + Project status field), with labels used only when no native signal can represent the state. The orchestrator scan agent checks state each iteration and the runtime queues work for items ready for their next step.

```
┌──────────────────────────────────────────────────────────────────┐
│                    ISSUE STATE MACHINE                            │
│                                                                  │
│  Spec file(s)                                                    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────┐     ┌──────────────────┐                    │
│  │  GLOBAL SPEC     │────▶│  EPIC DECOMPOSE   │                   │
│  │  GAP ANALYSIS    │     │                  │                    │
│  │  (product +      │     │  Spec → vertical │                    │
│  │   architecture)  │     │  slice epics     │                    │
│  └─────────────────┘     └────────┬─────────┘                    │
│          ▲ re-trigger              │                              │
│          │ on spec change          │ per epic:                    │
│          │                         ▼                              │
│  ┌───────┴──────┐        ┌──────────────────┐                    │
│  │ SPEC CHANGED  │        │  EPIC REFINEMENT  │                   │
│  │ (git diff     │        │                  │                    │
│  │  watcher)     │        │  Product analyst │                    │
│  └──────────────┘        │  Arch analyst    │                    │
│                           │  Cross-epic deps │                    │
│                           └────────┬─────────┘                    │
│                                    │                              │
│                                    ▼                              │
│                           ┌──────────────────┐                    │
│                           │  SUB-ISSUE        │                   │
│                           │  DECOMPOSITION    │                   │
│                           │                  │                    │
│                           │  Epic → scoped   │                    │
│                           │  work units      │                    │
│                           └────────┬─────────┘                    │
│                                    │                              │
│                                    │ per sub-issue:               │
│                                    ▼                              │
│                           ┌──────────────────┐                    │
│                           │  SUB-ISSUE        │                   │
│                           │  REFINEMENT       │                   │
│                           │                  │                    │
│                           │  Specialist plan │                    │
│                           │  (FE/BE/infra)   │                    │
│                           │  Estimation      │                    │
│                           │  DoR check       │                    │
│                           └────────┬─────────┘                    │
│                                    │                              │
│                                    │ Definition of Ready passes   │
│                                    ▼                              │
│                           ┌──────────────────┐                    │
│                           │  READY            │──── dispatch ────▶│
│                           └──────────────────┘    child loop.sh  │
│                                                        │         │
│                                                        ▼         │
│                           ┌──────────────────┐  ┌────────────┐   │
│                           │  INTEGRATION      │◀─│ CHILD DONE │   │
│                           │  Gate + Merge     │  └────────────┘   │
│                           └────────┬─────────┘                    │
│                                    │                              │
│                                    ▼                              │
│                              agent/trunk                          │
└──────────────────────────────────────────────────────────────────┘
```

**GitHub-native state transitions (status-first):**

| GitHub signal | Meaning | What happens next |
|--------------|---------|-------------------|
| Label `aloop` + Project status `Needs analysis` | Spec or epic needs gap analysis | Product + arch analyst agents run |
| Label `aloop/spec-question` | Blocking question for user | Waits for user response (or auto-resolves based on autonomy level) |
| Label `aloop/auto-resolved` | Spec question resolved by agent (not human) | User can reopen to override |
| Label `aloop` + Project status `Needs decomposition` | Ready for decomposition into sub-items | Decompose agent runs |
| Label `aloop` + Project status `Needs refinement` | Needs specialist planning | Specialist planner + estimation agents run |
| Label `aloop` + Project status `Ready` | Definition of Ready passed | Eligible for dispatch to child loop |
| Label `aloop` + Project status `In progress` | Child loop running | Monitor watches status |
| Label `aloop` + Project status `In review` | PR created, gates running | Gate + merge process |
| Label `aloop` + Project status `Done` or issue `state=closed` | Merged to agent/trunk | Complete |
| Label `aloop` + Project status `Blocked` | Waiting on dependency or question | Unblocks when dependency merges or question resolves |

The orchestrator MUST prefer native GitHub status signals over workflow labels for progression. If a repository has no compatible Project status field, it MAY use legacy `aloop/*` progression labels as a fallback compatibility mode.

#### Global Spec Analysis

Before any decomposition, specialist agents review the spec for issues that would waste build iterations downstream. Two perspectives run in sequence:

**Product Analyst Agent** (`PROMPT_orch_product_analyst.md`):
- Missing user stories / personas
- Unclear acceptance criteria — "should handle errors gracefully" (how?)
- Scope gaps — features referenced but never defined
- Conflicting requirements between sections

**Architecture Analyst Agent** (`PROMPT_orch_arch_analyst.md`):
- Infeasible constraints — requirements that conflict with stated constraints
- Unstated technical dependencies — "uses the database" (which one?)
- Missing system boundaries and integration points
- Scale/performance assumptions that need quantifying

Each gap becomes a focused `aloop/spec-question` issue — interview style, one question per issue, with context on why it matters and suggested resolution options. Blocking behavior depends on the configured [autonomy level](#autonomy-levels).

**Re-triggering:** When the spec watcher detects changes (git diff on spec glob), analysis re-runs on changed sections only. New questions block affected items, not the entire pipeline.

#### Epic Decomposition

The decompose agent reads the spec(s) and current codebase, then produces the top-level issue hierarchy.

1. Read all spec files and codebase state
2. Produce **vertical slices** as parent (epic) issues — each independently shippable, end-to-end
3. High-level scope + acceptance criteria per epic
4. Dependency hints between epics
5. **Include "Set up GitHub Actions CI" as an early foundation task when no CI exists. Build agents should be able to create/modify `.github/workflows/*.yml` files. The GH Actions setup should be treated as a technical build task, not a manual prerequisite.**
6. Write `requests/create-epics.json` → runtime creates GitHub issues
7. Runtime queues per-epic refinement prompts into `queue/`

Labels: `aloop/epic`, `aloop/needs-refine`, `aloop/wave-N`

#### Epic Refinement (per epic)

Each epic gets two specialist passes before being decomposed further:

**Product Analyst** (per epic):
- Edge cases and error flows
- User journey completeness
- Acceptance criteria sharpening — each criterion must be objectively testable

**Architecture Analyst** (per epic):
- API contracts and data models
- Integration points with other epics
- Shared infrastructure needs
- Migration / backwards-compatibility concerns

**Cross-Epic Dependency Analyst:**
- Interfaces between epics — where two epics assume conflicting designs
- Shared types, DB schema, API contracts that must be agreed before either builds
- Flags conflicting assumptions as `aloop/spec-question`

Creates `aloop/spec-question` issues if gaps found (blocks THIS epic only). Updates epic issue body with refined requirements. Labels epic `aloop/needs-decompose` when done.

#### Sub-Issue Decomposition (per epic)

The decompose agent breaks each refined epic into scoped work units:

1. Each sub-issue sized for ~1-3 hours of human work equivalent (~5-15 build iterations)
2. Scoped: clear input → clear output
3. File ownership hints (prevents parallel edit conflicts)
4. Dependency ordering within and across epics
5. Write `requests/create-sub-issues.json` → runtime creates and links to parent
6. Runtime queues per-sub-issue refinement prompts

Labels: `aloop/sub-issue`, `aloop/needs-refine`

#### Sub-Issue Refinement (per sub-issue)

Each sub-issue gets specialist planning based on its type:

**Specialist Planner** (one of, based on sub-issue content):
- `PROMPT_orch_planner_frontend.md` — component structure, state management, UI flow, routing
- `PROMPT_orch_planner_backend.md` — API endpoints, data access, business logic, validation
- `PROMPT_orch_planner_infra.md` — deployment, configuration, migrations, CI/CD
- `PROMPT_orch_planner_fullstack.md` — when sub-issue spans both layers

**Estimation Agent** (`PROMPT_orch_estimate.md`):
- Complexity score (S / M / L / XL)
- Estimated iteration count for child loop
- Risk flags (novel tech, unclear requirements, high coupling)

**Definition of Ready (DoR) Check:**

| Criterion | Description |
|-----------|-------------|
| Acceptance criteria | Specific and objectively testable — not vague |
| No open questions | No unresolved `aloop/spec-question` linked to this sub-issue |
| Dependencies resolved | All dependencies either merged or scheduled in an earlier wave |
| Implementation approach | Specialist planner has outlined the approach |
| Estimation complete | Complexity scored and iteration count estimated |
| Interface contracts | Inputs consumed and outputs produced are specified |

If DoR fails → creates `aloop/spec-question` issues for the gaps, blocks THIS sub-issue only.
If DoR passes → sets Project status to `Ready` (and keeps the single tracking label `aloop`).

**Re-estimation:** The estimation agent runs again after specialist planning, since complexity often changes once the approach is defined.

**Refinement budget cap:** Max N analysis iterations per item (configurable, default 5) before forcing a decision. Prevents infinite question loops — after the cap, remaining ambiguities are resolved at the configured autonomy level regardless.

#### Dispatch

The orchestrator scan agent identifies `Ready` sub-issues (Project status) and writes dispatch requests.

1. Query sub-issues with Project status `Ready` whose dependencies are all merged
2. Respect **concurrency cap** (configurable, default 3) and **wave scheduling**:
   - Sub-issues in the same wave MAY run in parallel
   - Wave N+1 sub-issues dispatch only after their specific dependencies merge (not all of wave N)
   - File ownership hints prevent parallel edits to the same files
3. Write `requests/dispatch.json` → runtime:
   - Creates branch: `aloop/issue-<number>`
   - Creates worktree
   - Seeds child's working directory with sub-spec from issue body
   - Compiles child's `loop-plan.json` with implementation cycle (plan-build-proof-qa-review)
   - Launches child `loop.sh` instance
   - Sets Project status to `In progress`
4. Remaining issues queue until a slot opens or dependencies merge

#### Monitor + Gate + Merge

The orchestrator scan agent checks child loop statuses and PR states each iteration:

**Child monitoring:**
- Read each child's `status.json` for state (running, completed, failed, limit_reached)
- Failed or stalled children → write steering to child's `queue/`, reassign provider, or kill and retry
- Completed children → write `requests/create-pr.json` → runtime creates PR targeting `agent/trunk`
- Failed children → log, optionally retry with different provider mix or re-decompose

**PR gates (automated, must all pass):**

| Gate | Method | Fail action |
|------|--------|-------------|
| GitHub Actions CI | `gh pr checks --watch` | Block merge, extract failure logs via `gh run view --log-failed` |
| Test coverage | Parse coverage from CI artifacts or GH Actions output | Block if below threshold |
| No merge conflicts | `gh pr view --json mergeable` | Send rebase steering to child's `queue/` |
| No spec regression | Contract checks against spec | Block merge |
| Screenshot diff (UI) | Playwright visual comparison (CI step or local) | Flag for human if delta > threshold |
| Lint / type check | CI step (prefer GH Actions if available) | Block merge |

**GitHub Actions integration:**

The orchestrator leverages existing GitHub Actions workflows when available, rather than running quality checks locally:

1. **Discovery**: On orchestrator start, check for workflow files via `ls .github/workflows/*.yml` or `gh api repos/OWNER/REPO/actions/workflows`. Record which quality gates are covered by CI.
2. **Prefer CI over local**: If the repo has a test workflow, don't run tests locally — wait for CI results via `gh pr checks`. This avoids duplicating work and respects the project's actual CI configuration (matrix builds, specific node versions, env vars, secrets).
3. **CI failure feedback loop**: When a check fails:
   - `gh pr checks <number>` → identify which check failed
   - `gh run view <run-id> --log-failed` → extract actionable error context (last 200 lines)
   - Write failure context as steering to child's `queue/` → child loop fixes and pushes → CI re-runs automatically
   - Max N re-iterations per CI failure (default 3). Same error persisting after N attempts → flag for human.
4. **Required status checks**: If the repo has branch protection with required checks on `agent/trunk`, the orchestrator respects them — it cannot merge until all required checks pass. This is enforced by GitHub, not the orchestrator.
5. **No CI available**: If the repo has no GitHub Actions workflows, the orchestrator falls back to local validation — running tests, lint, and type-check commands discovered during `aloop setup` or configured in `.aloop/config.yml`.
6. **Custom quality gates**: Projects can define additional GH Actions workflows specifically for aloop (e.g., `.github/workflows/aloop-gate.yml`) that run spec-regression checks, coverage threshold enforcement, or screenshot comparisons. The orchestrator treats these like any other required check.

**Agent review gate:**
- Review agent runs against PR diff
- Checks: code quality, spec compliance, no scope creep, test adequacy
- Outputs: approve, request-changes, or flag-for-human
- On request-changes: writes feedback to child's `queue/` as a steering prompt
- Agent review is complementary to CI — CI checks correctness (tests pass), agent checks quality (code is good)

**Merge:**
- Squash merge into `agent/trunk`: runtime executes `gh pr merge --squash --delete-branch`
- Merge conflict: steering to child's `queue/` for rebase (max 2 attempts before human flag)
- After merge: downstream sub-issues may become unblocked → next scan dispatches them
- Label issue `aloop/done`

#### Replan (Event-Driven)

The runtime watches for conditions that trigger replanning. When detected, it queues the appropriate prompt into the orchestrator's `queue/`.

**Trigger: Spec file changed**
1. Runtime detects new commits touching spec glob pattern
2. Extracts diff: `git diff <prev>..<new> -- specs/*.md`
3. Queues `PROMPT_orch_replan.md` with the diff as context
4. Replan agent outputs structured actions:
   - `create_issue(parent, title, body, deps)` — new feature added
   - `update_issue(number, new_body)` — scope changed
   - `close_issue(number, reason)` — feature removed
   - `steer_child(number, instruction)` — in-flight child needs course correction
   - `reprioritize(number, new_wave)` — dependencies shifted
5. Re-triggers spec gap analysis on changed sections

The replan agent reads the spec but does NOT modify it — the spec is human-owned.

**Trigger: Wave completion** — when all sub-issues in a wave merge, queues schedule re-evaluation.

**Trigger: External issue** — human creates issue with `aloop/auto` label → orchestrator absorbs it into plan.

**Trigger: Persistent failures** — child fails repeatedly → replan agent may split the sub-issue, adjust approach, or merge coupled issues.

**Spec backfill:** When gap analysis resolves a question (whether by user answer or autonomous decision), the resolution is written back into `SPEC.md` so the spec stays authoritative.

**Spec consistency agent** (`PROMPT_orch_spec_consistency.md`): Runs after any spec change (backfill, steering, user edit) to reorganize and verify the spec:
- Check cross-references between sections (does section A still agree with section B after the change?)
- Remove contradictions introduced by the change
- Verify acceptance criteria are still testable and consistent with updated requirements
- Ensure clean structure (no orphaned sections, no duplicated concepts, no stale references)
- This is housekeeping — the agent does not add requirements or change intent, only reorganizes and fixes inconsistencies

Triggered by: spec backfill, replan agent spec edits, detected spec file commits. Queued as a follow-up after any spec-modifying operation.

**Infinite loop guard:** Protected by the general [Infinite Loop Prevention](#infinite-loop-prevention) mechanism — provenance tagging ensures the consistency agent's own commits don't re-trigger the spec change pipeline.

**Spec files are the authoritative intent. Issues are the live execution plan.** They can temporarily diverge (user adds an ad-hoc issue, agent discovers unexpected work) but replan reconciles them.

#### Phase 7: Complete

1. All sub-issues closed, all PRs merged to `agent/trunk`
2. Close parent issues (all sub-issues done)
3. Generate orchestrator report:
   - Slices created / completed / failed
   - Total time, provider usage breakdown, cost estimates
   - Coverage delta (before/after)
   - File change summary
4. Notify human (or leave `agent/trunk` ready for review)

### Agent/Trunk Branch

- Created at orchestrator start: `git checkout -b agent/trunk main`
- All child PRs target `agent/trunk` (never main)
- Human reviews `agent/trunk` periodically and promotes to main via PR or fast-forward
- Benefits:
  - Agent velocity isn't blocked by human review cadence
  - Main stays clean — no half-baked agent work
  - Human can cherry-pick from `agent/trunk` if needed
  - Easy rollback: just delete `agent/trunk` and recreate from main

### Orchestrator Local State

The orchestrator stores only session-mapping data locally. Issue state, dependencies, waves, and PR status are all read from GitHub.

Stored at `~/.aloop/sessions/<orchestrator-session-id>/sessions.json`:

```json
{
  "spec_files": ["SPEC.md"],
  "trunk_branch": "agent/trunk",
  "concurrency_cap": 3,
  "repo": "owner/repo",
  "children": {
    "11": {
      "session_id": "myapp-20260315-issue11",
      "pid": 12345,
      "worktree": "~/.aloop/sessions/myapp-20260315-issue11/worktree"
    },
    "12": {
      "session_id": "myapp-20260315-issue12",
      "pid": 12346,
      "worktree": "~/.aloop/sessions/myapp-20260315-issue12/worktree"
    }
  },
  "created_at": "2026-03-15T12:00:00Z",
  "last_poll_etag": "W/\"07ad6948c94b...\""
}
```

Everything else — which issues exist, their state, dependencies, wave labels, linked PRs — comes from GitHub via the GraphQL query described above.
```

### Conflict Resolution

When a child PR has merge conflicts with `agent/trunk`:

1. Orchestrator detects via `gh pr view --json mergeable`
2. Reopens the issue with comment: "Merge conflict with agent/trunk — rebase needed"
3. Child loop picks up the issue, rebases its branch, re-pushes
4. PR auto-updates, orchestrator re-reviews

If conflicts persist after 2 rebase attempts → flag for human resolution.

### Provider Budget Awareness

With N parallel loops, provider costs scale linearly. The orchestrator should:
- Track cumulative token/cost estimates per child (from `log.jsonl`)
- Enforce a session-level budget cap (configurable)
- Pause dispatch when budget threshold is approached
- Report cost breakdown in the final report

### Basic Token/Price Tracking (OpenCode/OpenRouter)

Token/price tracking is in-scope and required at a basic level for OpenCode/OpenRouter.

- Parse usage/cost fields from per-iteration provider output when OpenCode/OpenRouter emits them.
- Persist parsed metrics in iteration events so dashboard and orchestrator reporting use the same data source.
- Show token/cost only when available; do not fabricate values when providers omit usage payloads.
- Prefer real parsed usage/cost for budget calculations; fall back to estimates only for iterations/providers with no usage data.

**Data sources for OpenCode/OpenRouter:**

OpenRouter includes a `usage` object in every API response (streaming and non-streaming):
```json
{
  "usage": {
    "prompt_tokens": 1940,
    "completion_tokens": 512,
    "total_tokens": 2452,
    "cost": 0.0034
  }
}
```

OpenCode persists this per-message in its internal storage, with fields: `cost` (float), `tokens.input`, `tokens.output`, `tokens.reasoning`, `tokens.cache.read`, `tokens.cache.write`.

**Extraction approach:** After each opencode iteration, use the opencode CLI to extract usage data — do NOT query the internal SQLite DB directly (internal schema is subject to change):

```bash
# Get the latest session ID
session_id=$(opencode session list --format json | jq -r '.[0].id')
# Export and sum token/cost across assistant messages
opencode export "$session_id" | jq '{
  tokens_input: [.messages[] | select(.role=="assistant") | .tokens.input] | add,
  tokens_output: [.messages[] | select(.role=="assistant") | .tokens.output] | add,
  tokens_cache_read: [.messages[] | select(.role=="assistant") | .tokens.cache.read] | add,
  cost: [.messages[] | select(.role=="assistant") | .cost] | add
}'
```

Alternative: `opencode stats --days 1 --project ''` for aggregate stats (less precise but simpler).

Note: `opencode run` does NOT output usage data to stdout/stderr. The export API is the only supported way to retrieve per-run token/cost data.

**Container awareness:** When opencode runs inside a devcontainer, its session data lives inside the container. The extraction commands must run in the same environment as the provider — use `${DC_EXEC[@]}` (which expands to `devcontainer exec --workspace-folder "$WORK_DIR" --` when containerized, or empty when running on host). This is the same prefix already used for provider invocation, so no new mechanism is needed.

**Log schema extension** — add optional fields to `iteration_complete` events:
```json
{
  "event": "iteration_complete",
  "iteration": "42",
  "mode": "build",
  "provider": "opencode",
  "model": "openrouter/hunter-alpha",
  "duration": "180s",
  "tokens_input": 15200,
  "tokens_output": 3400,
  "tokens_cache_read": 48000,
  "cost_usd": 0.0034
}
```

Fields are omitted (not zero) when unavailable. Dashboard and orchestrator check for field presence before rendering/accounting.

**Acceptance criteria:**
- [ ] OpenCode/OpenRouter iterations with usage payloads record token/cost fields in iteration event data
- [ ] Dashboard displays token/cost row only when usage data exists for that iteration
- [ ] Orchestrator final report and budget accounting consume recorded usage/cost data when available
- [ ] Token extraction uses `opencode export <sessionID>` CLI, not internal SQLite DB

### CLI / Invocation

```bash
# From spec to parallel execution
aloop orchestrate --spec SPEC.md --concurrency 3 --trunk agent/trunk

# Filter to specific issues
aloop orchestrate --issues 42,43,44

# Pick up existing open issues
aloop orchestrate --label aloop/auto --repo owner/repo

# Dry run — create issues but don't launch loops
aloop orchestrate --spec SPEC.md --plan-only
```

### Relationship to Existing Components

| Existing Component | Role in Orchestrator |
|-------------------|---------------------|
| `loop.ps1` / `loop.sh` | Runs BOTH orchestrator loop AND child loops — same script, different prompts |
| `loop-plan.json` | Orchestrator: single scan prompt cycle. Children: plan-build-proof-qa-review cycle |
| `queue/` folder | Orchestrator: primary work driver (reactive). Children: steering overrides only |
| `requests/` folder | Orchestrator agents write side-effect requests → runtime processes |
| Frontmatter prompts | Orchestrator has `PROMPT_orch_*.md`, children have `PROMPT_plan/build/review.md` |
| Provider health subsystem | Shared across all loops via `~/.aloop/health/` |
| `active.json` | Tracks all sessions (orchestrator + children) |
| `aloop status` | Shows orchestrator + children in a tree view |

### Resumability

The orchestrator MUST be resumable. If the process is killed (SIGTERM, crash, OOM, user Ctrl-C) and restarted, it picks up exactly where it left off:

1. **GitHub is the source of truth.** On restart, the orchestrator queries GitHub for all `aloop/auto` issues, their states, dependencies, and linked PRs. The full plan is reconstructed from GitHub, not from local files.
2. **Local `sessions.json`** maps issue numbers to child session IDs and PIDs. On restart, the orchestrator checks which children are still alive (`kill -0 PID`), reconnects to live ones, and detects children that completed/failed while the orchestrator was down (via their `status.json`).
3. **Idempotency**: every orchestrator operation must be safe to re-execute. Creating an issue checks if one already exists (by title/label match). Dispatching checks if a child session already exists. Merging checks if PR is already merged.
4. **No work lost**: in-flight child loops continue running independently. They write their own `status.json` and commits. The orchestrator is a coordinator, not a parent process — children are orphan-safe.

### Per-Task Environment Requirements

Not all tasks can run in a container. Each task in the decomposition plan may declare environment requirements that the dispatch engine uses to decide execution context:

```yaml
issues:
  - id: 1
    title: "Screenshot all legacy app views"
    wave: 1
    requires: [windows]    # must run on host Windows OS, no container
    sandbox: none

  - id: 2
    title: "Migrate legacy views to React"
    wave: 2
    depends_on: [1]
    requires: []           # default — can run in devcontainer
    sandbox: container
```

**Dispatch rules:**
- `sandbox: container` (default) — child loop runs inside a devcontainer if one is configured
- `sandbox: none` — child loop runs directly on the host OS, no devcontainer isolation
- `requires: [<label>, ...]` — declarative environment labels. The dispatcher checks that the current host satisfies all labels before dispatching. If unsatisfied, the task is queued with a reason.
- Common labels: `windows`, `macos`, `linux`, `gpu`, `docker`, `network-access`
- Tasks with `sandbox: none` skip devcontainer setup entirely and run in a host worktree
- This is analogous to CI runner labels — tasks declare what they need, the dispatcher routes accordingly

**Use case**: migrating a legacy Windows-only application. Phase 0 (`requires: [windows]`, `sandbox: none`) runs the app natively to capture screenshots of every view. Phase 1+ (`sandbox: container`) uses those screenshots as baseline references and can run containerized.

### GitHub Enterprise Support

All GitHub operations MUST support GitHub Enterprise instances, not just `github.com`:

- The `gh` CLI already handles GHE via `gh auth login --hostname ghes.company.com` — aloop must not hardcode `github.com` anywhere
- Repository URLs, issue URLs, PR URLs, and commit URLs must be derived from the repo's actual remote origin, not constructed with a hardcoded `github.com` prefix
- The convention-file response format (`url` fields in `queue/`) must use the actual GHE hostname
- `aloop orchestrate`, `aloop gh`, and the dashboard's contextual links must all work with any GH-compatible hostname
- No validation or parsing should assume `github.com` as the only valid GitHub host

### Acceptance Criteria

**Shared loop mechanism:**
- [ ] Orchestrator runs as a `loop.sh`/`loop.ps1` instance with orchestrator prompts
- [ ] Same `loop-plan.json` + `queue/` + frontmatter mechanism as child loops
- [ ] Orchestrator is queue-driven (reactive); child loops are cycle-driven (proactive)
- [ ] Request/response protocol: agents write `requests/*.json`, runtime processes, queues follow-up prompts
- [ ] Loop script waits for pending requests before next iteration (with timeout)

**Refinement pipeline:**
- [ ] Global spec gap analysis runs before decomposition (product + architecture analysts)
- [ ] Configurable autonomy levels (cautious/balanced/autonomous) control block vs auto-resolve
- [ ] Epic decomposition produces vertical slice parent issues
- [ ] Per-epic refinement: product analyst + architecture analyst + cross-epic dependency check
- [ ] Sub-issue decomposition produces scoped work units per epic
- [ ] Per-sub-issue refinement: specialist planner (FE/BE/infra/fullstack) + estimation agent
- [ ] Definition of Ready gate before dispatch (acceptance criteria, no open questions, approach defined, estimated)
- [ ] Refinement budget cap prevents infinite question loops
- [ ] Spec gap analysis re-triggers on spec file changes, blocking only affected items
- [ ] Auto-resolved questions documented with reasoning in issue comments, labeled `aloop/auto-resolved`

**GitHub-native state machine:**
- [ ] Issues progress through Project status values: `Needs analysis` → `Needs decomposition` → `Needs refinement` → `Ready` → `In progress` → `In review` → `Done` (with label `aloop` as tracker)
- [ ] Each status transition triggers appropriate agent work via queue

**Dispatch + execution:**
- [ ] Sub-issues with Project status `Ready` dispatched as child `loop.sh` instances
- [ ] Concurrency cap limits simultaneous child loops (default 3)
- [ ] Wave scheduling: sub-issues dispatch when specific dependencies merge
- [ ] File ownership hints prevent parallel edits to same files

**Integration:**
- [ ] Child loops create PRs targeting `agent/trunk` on completion
- [ ] Automated gates: CI, coverage, conflicts, lint, spec regression, screenshot diff
- [ ] Agent review on PR diffs: approve, request-changes, or flag-for-human
- [ ] Squash-merge approved PRs into `agent/trunk`
- [ ] Rejected PRs: feedback written to child's `queue/` for re-iteration
- [ ] Merge conflicts: rebase steering to child's `queue/` (max 2 attempts)

**Infrastructure:**
- [ ] GitHub is source of truth — local state is only session-to-issue mapping
- [ ] Efficient monitoring: ETag-guarded REST + GraphQL on change
- [ ] Orchestrator resumable: reads plan from GitHub, reconnects live children
- [ ] Session-level budget cap pauses dispatch when threshold approached
- [ ] Multi-file specs supported (`specs/*.md` or single `SPEC.md`)
- [ ] Per-task `sandbox`/`requires` for environment routing
- [ ] All GitHub operations work with GitHub Enterprise (no hardcoded `github.com`)
- [ ] Replan triggered by spec changes, wave completion, user-created issues, persistent failures
- [ ] Spec backfill: resolved questions written back to SPEC.md

---

## `aloop gh` — GitHub-Integrated Commands (Priority: P2)

### Overview

`aloop gh` is the CLI namespace for all GitHub-integrated loop modes. It connects the loop lifecycle to GH issues, PRs, and the agent trunk. While the core `aloop start` is local-only (no GH awareness), `aloop gh` adds issue tracking, PR creation, feedback response, and event-driven automation.

### Commands

#### `aloop gh start --issue <number> [options]`

Start a loop targeting a specific GitHub issue. The issue provides the requirements/context.

```bash
aloop gh start --issue 42                    # use issue as full spec
aloop gh start --issue 42 --spec SPEC.md     # issue is a slice, SPEC.md provides broader context
aloop gh start --issue 42 --provider codex --max 30
```

**Flow:**
1. Fetch issue title, body, labels, and comments via `gh issue view`
2. If `--spec` provided, load the spec file as additional context
3. Create branch: `agent/issue-42-<slug>`
4. Create session + worktree (same as `aloop start`)
5. Inject issue content into the plan prompt as the requirement
6. Compile pipeline config into `loop-plan.json`, run loop
7. On completion → create PR against `agent/main` (or `main` if no agent trunk exists)
8. Link PR to issue (`Closes #42`)
9. Post a summary comment on the issue with results

**If the issue has no spec and no `--spec` flag:** the issue body IS the spec. The planner decomposes it into TODO tasks directly.

#### `aloop gh watch [options]`

Event-driven daemon that monitors a repo and auto-spawns loops for matching issues.

```bash
aloop gh watch                                # default: issues labeled 'aloop'
aloop gh watch --label automated --label p1   # custom label filter
aloop gh watch --assignee @me                 # only issues assigned to me
aloop gh watch --milestone v2.0               # only issues in milestone
aloop gh watch --max-concurrent 3             # limit parallel loops
aloop gh watch --repo owner/repo              # explicit repo (default: current)
```

**Daemon behavior:**
1. Poll for new/updated issues matching filters (configurable interval, default 60s)
2. For each matching issue not already being worked on → `aloop gh start --issue <number>`
3. Respect `--max-concurrent` — queue excess issues
4. Track issue→session mapping in `~/.aloop/watch.json`
5. On loop completion → create PR, post summary (same as `aloop gh start`)
6. Keep watching — new issues trigger new loops
7. Stop with `aloop gh stop-watch` or Ctrl+C

**Filter precedence:** labels > assignee > milestone. All filters are AND-combined.

**Re-trigger:** If a loop finished but the issue gets reopened or new comments are added, the watch daemon can re-spawn a loop (configurable: `--re-trigger-on reopen,comment` or `--no-re-trigger`).

#### `aloop gh status`

Show all GH-linked loops, their issues, PRs, and feedback status.

```bash
aloop gh status
```

```
Issue  Branch                PR    Status      Iteration  Feedback
#42    agent/issue-42-auth   #51   building    12/50      —
#43    agent/issue-43-api    #52   pr-review   done       2 comments (unresolved)
#44    agent/issue-44-ui     —     planning    3/50       —
#45    (queued)              —     waiting     —          —
```

#### `aloop gh stop [--issue <number> | --all]`

Stop a GH-linked loop.

```bash
aloop gh stop --issue 42     # stop loop for specific issue
aloop gh stop --all          # stop all GH-linked loops
```

### PR Feedback Loop

When a loop creates a PR, it doesn't just fire-and-forget. The loop (or watch daemon) monitors the PR for feedback and re-iterates.

**What triggers re-iteration:**
- New review comments on the PR
- Review requesting changes
- CI check failure (build, test, lint, etc.)
- Manual comment with `@aloop` mention (e.g., `@aloop please fix the error handling`)

**Flow:**
1. Watch daemon (or background poller) detects new PR activity via `gh pr view --comments` and check status via `gh pr checks`
2. Collect unresolved review comments and CI status
3. Resume the loop on the same branch/worktree with feedback injected as a steering instruction
4. Loop fixes issues, pushes new commits to the PR branch
5. PR auto-updates, reviewers are notified
6. CI re-runs on new commits → if it fails again, loop gets the new failure (self-healing cycle)
7. Repeat until approved and CI green, or max feedback iterations reached (configurable, default 5)

**What the loop sees:** feedback is formatted as a steering prompt — the build agent gets the review comments as its next task, not the original TODO.

#### CI Failure Handling (detailed)

When the watch daemon detects a failed CI check on a PR:

1. **Fetch failure details** — `gh pr checks <number>` to identify which check failed, then `gh run view <run-id> --log-failed` to get the actual error logs
2. **Build steering prompt** — format the CI failure as actionable context:
   ```
   CI check "build-and-test" failed on PR #51. Fix the following errors:

   Check: build-and-test (run 12345678)
   Failed step: "Run tests"
   Error log:
   <truncated CI log output — last 200 lines>
   ```
3. **Resume loop** — inject as queue entry (`queue/NNN-ci-fix.md`), resume the loop on the PR branch
4. **Loop fixes** → pushes new commits → CI re-runs automatically
5. **Watch daemon re-checks** — if CI fails again with a *different* error, repeat. If same error persists after N attempts (default 3), flag for human review and stop re-iterating on CI for this PR.

**Deduplication:** the daemon tracks which CI run IDs it has already responded to, so it doesn't re-trigger on the same failure twice. It only re-triggers when a *new* CI run fails after the loop pushed a fix.

### Agent Trunk Integration

PRs from `aloop gh` target `agent/main` by default (the agent trunk from the Parallel Orchestrator spec):

- Individual issue loops create PRs against `agent/main`
- Auto-merge into `agent/main` when CI passes (configurable — can require human approval)
- Human promotes `agent/main` → `main` when satisfied
- PR from `agent/main` → `main` is human-only by default (configurable)

If no agent trunk exists yet, the first `aloop gh start` creates it: `git checkout -b agent/main main`.

### Acceptance Criteria

- [ ] `aloop gh start --issue <N>` fetches issue, creates branch/session/worktree, runs loop, creates PR on completion
- [ ] `aloop gh start --issue <N> --spec SPEC.md` uses both issue and spec as context
- [ ] PR is linked to issue (`Closes #N`) and summary comment posted on issue
- [ ] `aloop gh watch` polls for matching issues and auto-spawns loops
- [ ] Watch respects `--label`, `--assignee`, `--milestone`, `--max-concurrent` filters
- [ ] Watch daemon is stoppable and resumable
- [ ] PR feedback loop detects review comments and CI failures, re-iterates automatically
- [ ] Feedback is injected as steering (not appended to original TODO)
- [ ] Max feedback iterations configurable with sensible default
- [ ] `aloop gh status` shows issue→loop→PR mapping with feedback status
- [ ] `aloop gh stop` cleanly stops GH-linked loops
- [ ] PRs target `agent/main` by default, auto-merge configurable
- [ ] All GH operations go through `gh` CLI (no direct API calls) — respects existing auth

---

## Security Model: Trust Boundaries & GH Access Control

### Principle

Agents are untrusted. The aloop CLI is the single trust boundary. Agents never have direct access to GitHub APIs, network endpoints, or the `gh` CLI. All external operations flow through the harness, which delegates to `aloop gh` — a policy-enforced subcommand of the aloop CLI.

### Trust Layers

```
┌──────────────────────────────────────────────┐
│  LAYER 1: HOST (where harness runs)          │
│                                              │
│  loop.ps1 / loop.sh (harness)                │
│    ├─ aloop CLI (single trust boundary)      │
│    │    ├─ aloop gh      (GH operations)     │
│    │    ├─ aloop resolve (project config)    │
│    │    ├─ aloop orchestrate (fan-out)       │
│    │    └─ aloop status  (monitoring)        │
│    │                                         │
│    └─ launches provider CLI ─────────────────┼──┐
│                                              │  │
│  worktree ◄──────────────────────────────────┼──┼── shared volume
│                                              │  │
├──────────────────────────────────────────────┤  │
│  LAYER 2: SANDBOX (where agent runs)         │  │
│                                              │  │
│  agent (provider CLI) ◄──────────────────────┼──┘
│    ├─ git (commit, push to own branch only)  │
│    ├─ file read/write (worktree only)        │
│    ├─ test runner                            │
│    └─ requests/ (write side-effect requests)  │
│                                              │
│  ✗ no `gh` CLI (stripped from PATH)          │
│  ✗ no `aloop` CLI                            │
│  ✗ no direct network to api.github.com       │
└──────────────────────────────────────────────┘
```

### Deployment Scenarios

The trust boundary works regardless of where things run:

| Scenario | Host (Layer 1) | Sandbox (Layer 2) | aloop CLI location |
|----------|----------------|--------------------|--------------------|
| Local dev | Your machine | Provider sandboxes (Codex sandbox, etc.) | Installed on machine |
| Cloud orchestrator | Cloud VM / CI runner | Nested containers | In orchestrator container |
| GitHub Actions | GH Actions runner | Spawned containers | Installed in action setup |
| Docker-in-Docker | Outer container | Inner containers | In outer container |

In every case: **aloop CLI lives where the harness lives**. The agent never needs it.

### Convention-File Protocol

Agents communicate intent via filesystem — the only interface that crosses all sandbox boundaries (Docker volumes, bind mounts, NFS, etc.).

This is the same [Request/Response Protocol](#requestresponse-protocol) described in the orchestrator section — `requests/*.json` for side effects, `queue/*.md` for follow-up prompts. Markdown content is always passed as file path references (`body_file`), never inline in the JSON.

**Request files** (agent writes to `$SESSION_DIR/requests/`):
```json
{
  "id": "req-001",
  "type": "create_pr",
  "payload": {
    "head": "aloop/issue-42",
    "base": "agent/trunk",
    "title": "Issue #42: Add provider health subsystem",
    "body_file": "requests/bodies/pr-42.md",
    "issue_number": 42
  }
}
```

**Follow-up prompts** (runtime writes to `$SESSION_DIR/queue/`): response data is baked into the next prompt's body. No separate response files — the queue IS the response channel.

**Protocol rules:**
- Request files: `req-<NNN>-<type>.json`, monotonic counter, processed in order
- Markdown content: always file path references (`body_file`, `sub_spec_file`, `prompt_file`, `content_file`)
- Request files deleted by runtime after processing
- Malformed requests moved to `requests/failed/` with error annotation

### Architecture: Keep loop scripts lean — GH/steering/requests are host-side plugins

**Critical design rule:** `loop.ps1` and `loop.sh` must NOT contain convention-file processing, GH logic, or any host-only operations directly. The loop scripts run inside containers and must stay minimal: iterate phases, invoke providers, write status/logs. That's it. Remote backup setup (repo creation via `gh`) belongs in `aloop start`, not in the loop scripts.

All host-side operations (GH requests, steering injection, dashboard, request processing) are handled by the **aloop host monitor** — a separate process that runs alongside the loop on the host:

```
┌─── Host ──────────────────────────────────────────────┐
│                                                        │
│  aloop start                                           │
│    ├── loop.ps1/sh (may run in container)              │
│    │     └── just: read loop-plan.json + provider invoke│
│    │                                                   │
│    └── aloop monitor (host-side, always on host)       │
│          ├── watches requests/ → executes side effects  │
│          ├── writes to queue/ → loop picks up next iter  │
│          ├── serves dashboard                          │
│          ├── processes convention-file protocol         │
│          └── manages provider health (cross-session)   │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**What stays in loop.ps1/loop.sh:**
- Read `loop-plan.json` each iteration, pick agent at `$cyclePosition`
- Provider invocation (direct — loop and providers run in the same environment)
  - Must track child PIDs when invoking providers
  - Per-iteration timeout (default 3 hours / 10800 seconds) with precedence: prompt frontmatter `timeout` -> `ALOOP_PROVIDER_TIMEOUT` -> default. The built-in default must be identical in `loop.sh` and `loop.ps1` for cross-runtime parity. Timeout remains a catastrophic safety net only; not a behavioral limit on agent runtime
  - On loop exit (`finally`/`trap`), kill all spawned child processes
- Iteration counting
- Status.json and log.jsonl writes
  - Each session run must include a unique `run_id` in all log entries, or rotate logs on session start
- TODO.md reading for phase prerequisites
- PATH hardening (defense in depth, even though container already isolates)

**Execution model:** The loop script and provider CLIs always run in the same environment. When containerized, `aloop start` on the host launches the loop **inside** the container via `devcontainer exec -- loop.sh` (or `loop.ps1`). From that point, the loop invokes providers directly (they're co-located). The loop never calls `devcontainer exec` itself — that's the host's job.

**What moves to aloop monitor (host-side):**
- Convention-file request processing (`requests/` → `aloop gh` → `queue/`)
- Steering file detection and injection
- Dashboard server
- Provider health file management (already cross-session)
- Session lifecycle (start, stop, cleanup, lockfile management)
  - Session must use a PID lockfile (`session.lock`) in the session directory
  - On start, check if lockfile exists and PID is alive — refuse to start or kill stale process
  - On exit (including Ctrl+C and errors), clean up lockfile in `finally`/`trap` block
  - Both `loop.ps1` and `loop.sh` must implement lockfile handling

The monitor is a long-running process started by `aloop start` that watches the session directory via filesystem polling. It reads `status.json` to know the current iteration and processes requests/steering between iterations. This cleanly separates container-safe loop logic from host-privileged operations.

**If convention-file processing was already added to loop.ps1:** It must be extracted out. The loop script should not import or call `aloop gh`. Any such code is a spec violation — the loop may run in a container where `aloop` is not available.

### `aloop gh` Subcommand

The aloop CLI exposes policy-enforced GH operations:

```bash
aloop gh pr-create   --session <id> --request <file>
aloop gh pr-comment  --session <id> --request <file>
aloop gh issue-comment --session <id> --request <file>
aloop gh issue-create  --session <id> --request <file>   # orchestrator only
aloop gh issue-close   --session <id> --request <file>   # orchestrator only
aloop gh pr-merge      --session <id> --request <file>   # orchestrator only
```

### Hardcoded Policy (not configurable — prevents tampering)

**Child loop (per-issue agent):**

| Operation | Allowed | Enforced constraints |
|-----------|---------|---------------------|
| `pr-create` | Yes | `--base` forced to `agent/trunk`, `--repo` forced from session config |
| `issue-comment` | Yes | Only on the issue assigned to this child session |
| `pr-comment` | Yes | Only on PRs created by this child session |
| `pr-merge` | **No** | Rejected — only orchestrator can merge |
| `issue-create` | **No** | Rejected — only orchestrator can create issues |
| `issue-close` | **No** | Rejected — only orchestrator can close issues |
| `branch-delete` | **No** | Rejected unconditionally |
| Raw `gh api` | **No** | Rejected unconditionally |

**Orchestrator:**

| Operation | Allowed | Enforced constraints |
|-----------|---------|---------------------|
| `issue-create` | Yes | Must include `aloop/auto` label |
| `issue-close` | Yes | Only issues with `aloop/auto` label |
| `pr-create` | Yes | `--base` forced to `agent/trunk` |
| `pr-merge` | Yes | Only to `agent/trunk`, only squash merge |
| `pr-comment` | Yes | Only on PRs with `aloop/auto` label |
| `issue-comment` | Yes | Only on issues with `aloop/auto` label |
| Anything targeting `main` | **No** | Rejected — human promotes to main |
| `branch-delete` | **No** | Rejected — cleanup is manual |
| Raw `gh api` | **No** | Rejected unconditionally |

Policy is **hardcoded in the aloop CLI source**, not in a config file. This prevents an agent from modifying policy even if it somehow accessed the host filesystem.

### PATH Sanitization (defense-in-depth)

The harness strips `gh` from the agent's PATH before launching the provider:

```powershell
# In loop.ps1, before Invoke-Provider
$originalPath = $env:PATH
$env:PATH = ($env:PATH -split [IO.Path]::PathSeparator | Where-Object {
    -not (Test-Path (Join-Path $_ 'gh.exe') -ErrorAction SilentlyContinue) -and
    -not (Test-Path (Join-Path $_ 'gh') -ErrorAction SilentlyContinue)
}) -join [IO.Path]::PathSeparator

try {
    $providerOutput = Invoke-Provider -ProviderName $iterationProvider -PromptContent $promptContent
} finally {
    $env:PATH = $originalPath  # restore for harness use
}
```

This is defense-in-depth. Even without it, agents can't do GH operations (they use the convention-file protocol). But stripping `gh` from PATH ensures an agent can't accidentally or intentionally bypass the protocol.

### Audit Log

Every `aloop gh` invocation is logged to the session's `log.jsonl`:

```json
{
  "timestamp": "2026-02-27T12:00:00Z",
  "event": "gh_operation",
  "type": "pr-create",
  "session": "ralph-skill-20260227-issue42",
  "role": "child-loop",
  "request_file": "001-pr-create.json",
  "result": "success",
  "pr_number": 15,
  "enforced": { "base": "agent/trunk", "repo": "owner/repo" }
}
```

Failed policy checks are logged as `gh_operation_denied`:

```json
{
  "timestamp": "2026-02-27T12:01:00Z",
  "event": "gh_operation_denied",
  "type": "pr-merge",
  "session": "ralph-skill-20260227-issue42",
  "role": "child-loop",
  "reason": "pr-merge not allowed for child-loop role"
}
```

### Acceptance Criteria

- [ ] Agents have no access to `gh` CLI (stripped from PATH before provider invocation)
- [ ] Agents communicate GH intent exclusively via `requests/` convention files
- [ ] Harness reads request files at iteration boundaries and delegates to `aloop gh`
- [ ] `aloop gh` enforces hardcoded policy per role (child-loop vs orchestrator)
- [ ] Child loops cannot merge PRs, create/close issues, delete branches, or use raw API
- [ ] Orchestrator cannot target `main` branch, delete branches, or use raw API
- [ ] All `aloop gh` operations force `--repo` from session config (no cross-repo access)
- [ ] All PR operations force `--base agent/trunk` (no direct-to-main)
- [ ] Every `aloop gh` call is logged to `log.jsonl` with full context
- [ ] Policy-denied operations are logged as `gh_operation_denied`
- [ ] Convention-file protocol works across Docker volumes, bind mounts, and remote filesystems
- [ ] Request files are archived after processing
- [ ] PATH sanitization restores original PATH after agent execution completes

---

## User Feedback Triage Agent

The orchestrator triages human comments on issues and PRs mid-flight — classifying them, routing actionable feedback to child loops via steering, and escalating ambiguous requests back to humans. Without this, comments are either ignored or misinterpreted by child loops.

### Where It Fits

The triage agent runs as a step in the orchestrator's monitor loop:

```
Orchestrator monitor loop (continuous):
  1. Check child loop status           ← existing
  2. Check provider health             ← existing
  3. Triage new user comments          ← NEW
  4. Process completed PRs             ← existing
```

It is NOT a long-running loop itself — it's a single agent invocation per batch of new comments, called by the orchestrator at each monitor cycle.

### Triage Classification

```
New comment on issue/PR
        │
   ┌────┴────┐
   │ TRIAGE  │  (single agent invocation)
   │  AGENT  │
   └────┬────┘
        │
        ├─► ACTIONABLE — clear instruction, no ambiguity
        │     → write steering prompt to child's queue/ folder
        │     → or append to child's TODO.md directly
        │     → child loop picks up on next iteration
        │
        ├─► NEEDS CLARIFICATION — vague, ambiguous, or contradictory
        │     → post follow-up question on the issue/PR
        │     → add label: aloop/blocked-on-human
        │     → pause child loop (harness skips iterations while blocked)
        │     → resume automatically when human responds
        │
        ├─► QUESTION — user is asking, not instructing
        │     → agent drafts answer based on current code/state
        │     → posts answer as comment (flagged as agent-generated)
        │     → does NOT change implementation
        │     → does NOT pause child loop
        │
        └─► OUT OF SCOPE — unrelated to issue, meta-discussion, or noise
              → ignore silently
              → log as triaged-no-action
```

### Blocked-on-Human Flow

The critical flow for preventing misinterpretation:

```
1. User comments: "hmm, should this use websockets instead?"

2. Triage agent classifies: NEEDS CLARIFICATION (confidence 0.6)
   Reasoning: "User is posing a question about tech choice, not giving
   a direct instruction. Implementing this without confirmation risks
   wasted work if they meant it rhetorically."

3. Orchestrator posts reply via aloop gh:
   "To clarify — should I switch from SSE to WebSockets for the
    dashboard live updates? This would affect:
    - dashboard.ts server (replace SSE endpoint with ws upgrade)
    - App.tsx client (replace EventSource with WebSocket)
    - E2E tests (mock WebSocket instead of SSE)
    Current implementation uses SSE per the spec. Want me to switch?"

4. Orchestrator adds label: aloop/blocked-on-human

5. Child loop pauses:
   - Harness checks for aloop/blocked-on-human label before each iteration
   - While blocked: skip iteration, log "blocked_on_human", sleep
   - No iterations are wasted

6. User responds: "yes switch to ws"

7. Next triage cycle picks up the response → classifies as ACTIONABLE

8. Orchestrator:
   - Removes aloop/blocked-on-human label
   - Writes steering prompt to child loop's queue/ folder
   - Child loop picks it up on next iteration
```

### Triage Agent Input / Output

**Input** (provided by orchestrator):

```json
{
  "comments": [
    {
      "id": 456,
      "author": "pj",
      "body": "hmm, should this use websockets instead?",
      "created_at": "2026-02-27T12:00:00Z",
      "context": "issue"
    }
  ],
  "issue": {
    "number": 42,
    "title": "Implement dashboard live updates",
    "body": "...(original issue body with acceptance criteria)..."
  },
  "current_todo": "...(child's TODO.md content)...",
  "recent_diff": "...(last 3 commits diff summary)..."
}
```

**Output** (structured JSON):

```json
{
  "comment_id": 456,
  "classification": "needs_clarification",
  "confidence": 0.6,
  "reasoning": "User is posing a question about tech choice, not giving a direct instruction. Implementing without confirmation risks wasted work.",
  "action": {
    "type": "post_reply_and_block",
    "reply": "To clarify — should I switch from SSE to WebSockets...",
    "label_add": "aloop/blocked-on-human",
    "pause_child": true
  }
}
```

### Confidence Threshold

| Confidence | Behavior |
|-----------|----------|
| >= 0.8 | Trust classification, execute action |
| 0.7 – 0.8 | Trust classification, but add disclaimer to any posted comment ("I interpreted this as X — let me know if I misunderstood") |
| < 0.7 | Force `needs_clarification` regardless of classification — ask rather than assume |

Low confidence always results in asking the human. Better to pause and clarify than to misinterpret and burn iterations.

### Comment Polling

The orchestrator checks for new comments at each monitor cycle:

```bash
aloop gh issue-comments --session <id> --since <last-check-timestamp>
aloop gh pr-comments    --session <id> --since <last-check-timestamp>
```

Only comments since the last check are triaged. Processed comment IDs are tracked in orchestrator state to prevent re-triage.

### Comment Authorship Filtering

Not all comments need triage:

| Author | Action |
|--------|--------|
| Human (repo collaborator) | Triage |
| aloop bot / agent-generated | Skip (don't triage own replies) |
| External / unknown | Skip, log as `untriaged_external_comment` |

Agent-generated comments are identified by a footer marker:

```markdown
---
*This comment was generated by aloop triage agent.
Session: ralph-skill-20260227-issue42*
```

### Orchestrator State Addition

```json
{
  "issues": [{
    "number": 42,
    "last_comment_check": "2026-02-27T12:00:00Z",
    "blocked_on_human": false,
    "triage_log": [
      {
        "comment_id": 456,
        "author": "pj",
        "classification": "needs_clarification",
        "confidence": 0.6,
        "action_taken": "post_reply_and_block",
        "reply_comment_id": 457,
        "timestamp": "2026-02-27T12:05:00Z"
      },
      {
        "comment_id": 458,
        "author": "pj",
        "classification": "actionable",
        "confidence": 0.95,
        "action_taken": "steering_injected",
        "timestamp": "2026-02-27T12:30:00Z"
      }
    ]
  }]
}
```

### Integration with Security Model

The triage agent runs inside the orchestrator (Layer 1 — trusted). It uses `aloop gh` to post comments and manage labels, subject to the orchestrator's hardcoded policy:

- Can comment on issues with `aloop/auto` label — enforced
- Can add/remove `aloop/blocked-on-human` label — allowed via `aloop gh issue-label`
- Cannot close issues, merge PRs, or access raw API — denied by policy
- All triage actions logged to `log.jsonl`

### Acceptance Criteria

- [ ] Orchestrator monitor loop includes a comment triage step at each cycle
- [ ] Triage agent classifies comments as: actionable, needs_clarification, question, or out_of_scope
- [ ] Actionable comments are injected as steering into the child loop
- [ ] Needs-clarification comments trigger a follow-up reply and `aloop/blocked-on-human` label
- [ ] Child loops pause (skip iterations) while their issue has `aloop/blocked-on-human` label
- [ ] Human response to a blocked issue is auto-triaged and unblocks the child loop
- [ ] Question comments get an agent-drafted answer without pausing the child loop
- [ ] Out-of-scope comments are ignored and logged
- [ ] Confidence below 0.7 forces `needs_clarification` classification regardless of agent output
- [ ] Agent-generated comments are marked with a footer and skipped during triage
- [ ] Processed comment IDs are tracked to prevent re-triage
- [ ] All triage decisions are logged in `orchestrator.json` triage_log
- [ ] Triage agent uses `aloop gh` for all GH operations (subject to orchestrator policy)

---

## Branch Sync & Auto-Merge (Priority: P1)

Aloop operates on a branch hierarchy that must be kept in sync continuously. Without automatic merging, worktree branches drift from upstream, leading to painful conflicts at PR time and wasted iterations building on stale code.

### Branch Hierarchy

```
main / develop  (upstream base — configurable per project)
  └── aloop/<session>  (trunk — created at session start from base)
        ├── aloop/<session>/task-1  (feature branch — orchestrator only)
        ├── aloop/<session>/task-2
        └── ...
```

- **Base branch** (`main`, `develop`, or custom) — the upstream branch the project merges into. Configured at setup time, stored in `meta.json` as `base_branch`.
- **Trunk branch** (`aloop/<session>`) — created from base at session start. All single-loop work happens here. For orchestrator mode, this is the integration branch.
- **Feature branches** (`aloop/<session>/task-N`) — orchestrator only. Each child loop gets its own branch off trunk. PRs merge feature → trunk, then trunk → base.

### Pre-Iteration Base Merge

Before every iteration, the loop script performs a base branch sync:

```
1. git fetch origin <base_branch>
2. git merge origin/<base_branch> --no-edit
   → Clean merge? Continue to iteration.
   → Conflict? Write conflict state to $SESSION_DIR/events/merge_conflict
              Queue PROMPT_merge.md → merge agent resolves conflicts
              After merge agent completes, iteration proceeds normally.
   → Already up to date? Continue (no-op).
```

This is the **one piece of git awareness** the loop script has. It's mechanical — fetch, merge, detect conflict, queue prompt if needed. The loop script does NOT resolve conflicts itself.

**Why before every iteration:** The base branch can advance at any time (other developers pushing, other aloop sessions merging). Syncing every iteration keeps drift minimal. A 50-iteration loop that never syncs will have 50 iterations of divergence to resolve at PR time.

### Merge Agent (`PROMPT_merge.md`)

A specialized agent prompt for conflict resolution:

```yaml
---
agent: merge
trigger: merge_conflict
provider: claude
reasoning: high
color: red
---
```

**What it does:**
1. Reads `git diff --name-only --diff-filter=U` to find conflicted files
2. For each conflict, understands both sides: what upstream changed vs what the loop changed
3. Resolves conflicts preserving the loop's intent while incorporating upstream changes
4. Runs any affected tests to verify the merge doesn't break anything
5. Commits the merge resolution
6. If it can't resolve a conflict confidently (e.g., both sides modified the same logic substantially), it flags it for user review via a steering event

**Rules:**
- Prefer the loop's changes when both sides modify the same feature (the loop is building new work)
- Prefer upstream's changes for infrastructure/config that the loop didn't intentionally modify
- Never silently drop upstream changes — if upstream added something, keep it
- Run tests after resolution to verify nothing broke

### Upstream Change Detection

Beyond pre-iteration sync, the runtime should detect when the base branch advances:

1. **Periodic fetch** — every N iterations (configurable, default: every 5), run `git fetch origin <base_branch>` and compare `origin/<base_branch>` against the last merged commit
2. **If new commits detected** — emit `upstream_changed` event. The event dispatcher can queue a merge immediately or wait for the next pre-iteration sync (configurable)
3. **Webhook-triggered** (future/orchestrator) — GitHub webhook notifies the orchestrator of pushes to base branch, triggering immediate sync across all active child loops

### Orchestrator Branch Sync

In orchestrator mode, the hierarchy has an extra level:

```
main → trunk → feature-1
                feature-2
                feature-3
```

**Trunk ← base sync:** Same as single-loop — pre-iteration fetch + merge.

**Feature ← trunk sync:** When trunk advances (e.g., another feature branch was merged into trunk), all active feature branches need to sync:

1. After a feature branch PR is merged into trunk, emit `trunk_advanced` event
2. Event dispatcher queues merge prompts for all active feature branch sessions
3. Each child loop's next iteration starts with the trunk merge

**Conflict between feature branches:** If two feature branches modify the same files, the second to merge will conflict with trunk. The merge agent handles this. If the conflict is too complex, the orchestrator can pause one branch until the other completes.

### Configuration

```yaml
# In meta.json (per-session)
{
  "base_branch": "main",           # upstream base
  "auto_merge": true,              # enable pre-iteration sync (default: true)
  "merge_fetch_interval": 5,       # fetch every N iterations (default: 5)
  "merge_on_upstream_change": true  # immediate merge when upstream advances
}
```

### Acceptance Criteria

- [ ] `base_branch` is configurable at setup time and stored in `meta.json`
- [ ] Pre-iteration base merge runs before every iteration in both `loop.sh` and `loop.ps1`
- [ ] Clean merges proceed silently (only logged)
- [ ] Merge conflicts emit `merge_conflict` event and queue `PROMPT_merge.md`
- [ ] Merge agent resolves conflicts, runs affected tests, commits resolution
- [ ] Merge agent flags unresolvable conflicts for user review (steering event)
- [ ] Periodic fetch detects upstream changes between iterations
- [ ] Orchestrator syncs trunk ← base and feature ← trunk
- [ ] Feature branch conflicts from trunk advancement are handled by merge agent
- [ ] Both `loop.sh` and `loop.ps1` implement pre-iteration merge logic
- [ ] Session can be configured to disable auto-merge (`auto_merge: false`) if needed

---

## Devcontainer Support (Priority: P1)

### Goal

Enable aloop loops to run inside VS Code devcontainers for full isolation. Provide a skill (`/aloop:devcontainer`) that generates a project-tailored `.devcontainer/` config, verifies it builds and starts, and confirms all loop dependencies are available inside the container.

### Why P1

- Security boundary: devcontainer is the natural sandbox for Layer 2 (agent execution) — agents can't access host GH tokens, filesystem, or network beyond what's mounted
- Reproducibility: identical environment across machines, no "works on my machine" provider/tool version drift
- Required for convention-file protocol: the harness runs on host, the agent runs in container, `requests/` and `queue/` cross the boundary via bind mount

### Prerequisite: Devcontainer Spec Research (MUST DO FIRST)

Before implementing any devcontainer generation, the agent MUST research the current devcontainer specification by reading the official documentation at https://code.visualstudio.com/docs/devcontainers and the spec at https://containers.dev/implementors/spec/. This is non-negotiable — do not assume config format, available properties, feature syntax, lifecycle hooks, mount syntax, or `remoteEnv`/`containerEnv` semantics from training data alone. The spec evolves and training data may be stale.

**What to research:**
- `devcontainer.json` full property reference (image vs build, features, mounts, lifecycle hooks)
- Lifecycle hook ordering: `initializeCommand` → `onCreateCommand` → `updateContentCommand` → `postCreateCommand` → `postStartCommand` → `postAttachCommand`
- Feature specification and available features (`ghcr.io/devcontainers/features/`)
- Mount syntax (bind mounts, volume mounts, tmpfs)
- `remoteEnv` / `containerEnv` / `localEnv` semantics and variable substitution (`${localEnv:VAR}`, `${containerWorkspaceFolder}`, etc.)
- `devcontainer` CLI commands: `build`, `up`, `exec`, `read-configuration`
- Multi-workspace and worktree mounting patterns
- Docker Compose integration (for projects needing databases/services)

**The examples in this spec section below are illustrative, not authoritative.** The implementation must use the researched spec as the source of truth.

### Devcontainer Generation (`/aloop:devcontainer` skill)

The skill analyzes the project and generates a tailored devcontainer config:

**Step 1 — Project Analysis**
- Detect language/runtime (package.json → Node, *.csproj → .NET, pyproject.toml → Python, go.mod → Go, etc.)
- Detect required tools (database services, build tools, system deps)
- Read existing `SPEC.md`, `CLAUDE.md`, `README.md` for dependency hints
- Check for existing `.devcontainer/` — offer to augment or replace

**Step 2 — Config Generation**
Generate `.devcontainer/devcontainer.json` (and `Dockerfile` if needed):

```jsonc
{
  "name": "${project-name}-aloop",
  "image": "mcr.microsoft.com/devcontainers/${base-image}",
  // OR "build": { "dockerfile": "Dockerfile" } for complex setups
  "features": {
    // auto-selected based on project analysis
    "ghcr.io/devcontainers/features/node:1": {},
    "ghcr.io/devcontainers/features/git:1": {}
  },
  "postCreateCommand": "${install-command}",  // npm install, dotnet restore, etc.
  "mounts": [
    // Bind mount for convention-file protocol (host harness <-> container agent)
    "source=${localWorkspaceFolder}/.aloop,target=/workspace/.aloop,type=bind"
  ],
  "containerEnv": {
    "ALOOP_NO_DASHBOARD": "1",  // dashboard runs on host, not in container
    "ALOOP_CONTAINER": "1"      // signals to loop that it's inside a container
  },
  "customizations": {
    "vscode": {
      "extensions": [
        // provider extensions auto-detected
      ]
    }
  }
}
```

**Step 3 — Provider Installation**
Generate a `postCreateCommand` or `onCreateCommand` script that installs the enabled providers inside the container:
- `claude`: npm install -g @anthropic-ai/claude-code
- `codex`: npm install -g @openai/codex
- `gemini`: npm install -g @google/gemini-cli (or equivalent)
- `opencode`: npm install -g opencode (or equivalent)
- `copilot`: installed via VS Code extension, not CLI inside container

Only install providers listed in the project's `config.yml` `enabled_providers`.

**Step 4 — Verification (mandatory, not optional)**

After generating the config, the skill MUST verify it works:

1. `devcontainer build --workspace-folder .` — container image builds successfully
2. `devcontainer up --workspace-folder .` — container starts
3. Inside the running container, verify:
   - Project deps installed (`node_modules/`, `bin/`, etc. exist)
   - Each enabled provider CLI is available (`which claude`, `which codex`, etc.)
   - Git is functional (`git status`)
   - `.aloop/` bind mount is accessible
   - Build/test commands from `config.yml` `validation_commands` pass
4. `devcontainer exec --workspace-folder . -- aloop status` — aloop CLI reachable (if installed globally)
5. Report results: pass/fail per check with actionable fix suggestions

If any check fails, the skill iterates: fix the config, rebuild, re-verify. Do not mark setup complete until all checks pass.

**Step 5 — Loop Integration**

Once a devcontainer is set up for a project, the loop **automatically** uses it — no `--devcontainer` flag needed. The harness (loop.ps1/loop.sh) detects `.devcontainer/` in the project and routes all provider invocations through `devcontainer exec`. The harness itself always runs on the host.

**Architecture: harness on host, agents in container**

```
┌─── Host ──────────────────────────────────────────────┐
│  loop.ps1 / loop.sh  (harness)                        │
│    ├── reads TODO.md, SPEC.md, status.json             │
│    ├── decides phase, provider, iteration              │
│    ├── dashboard server (node)                         │
│    ├── runtime processes requests/ (convention-file)    │
│    └── invokes provider via:                           │
│         devcontainer exec -- claude --print ...        │
│                                                        │
│  ┌─── Devcontainer ─────────────────────────────────┐  │
│  │  Provider CLIs (claude, codex, gemini)            │  │
│  │  Project deps (node_modules, .NET SDK, etc.)      │  │
│  │  Git (operates on bind-mounted worktree)          │  │
│  │  NO gh CLI, NO host network access beyond API     │  │
│  │  .aloop/ bind mount for convention-file protocol  │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

**Container is the default — opt-out requires explicit danger flag:**

Once `.devcontainer/devcontainer.json` exists in the project, the harness ALWAYS uses it. There is no flag to "prefer" host execution. To bypass the container, the user must pass `--dangerously-skip-container`, which:
- Prints a visible warning: `⚠️  DANGER: Running agents directly on host without container isolation. Agents have full access to your filesystem, network, and credentials.`
- Logs a `container_bypass` event to `log.jsonl`
- Is never set by default or by any skill/command

**Auto-detection logic in harness:**
1. Check if `.devcontainer/devcontainer.json` exists in the work directory
2. If yes and `--dangerously-skip-container` NOT set:
   a. Check if container is already running (`devcontainer exec -- echo ok`)
   b. If not running, `devcontainer up --workspace-folder .`
   c. All `Invoke-Provider` / `invoke_provider` calls wrap the CLI command in `devcontainer exec --workspace-folder <workdir> -- <provider-command>`
3. If `.devcontainer/` does not exist, providers run directly on host (current behavior) — but `aloop start` prints a suggestion: `No devcontainer found. Run /aloop:devcontainer to set up isolated agent execution.`

This means: after `/aloop:devcontainer` sets up the container once, every subsequent `aloop start` automatically sandboxes agents inside it. The container is opt-out, not opt-in.

### Shared Container for Parallel Loops

When running multiple loops in parallel (orchestrator mode or manual), do NOT start a separate container per loop. All loops share one running container instance, each operating on its own worktree:

**Why shared:**
- Container startup is slow (10-30s) — unacceptable per-iteration or per-loop
- Provider CLIs are installed once in the container image — no need to duplicate
- Memory/CPU overhead of N containers vs 1 is significant
- Worktree isolation already provides filesystem separation

**How it works:**
1. First loop to start calls `devcontainer up` — container starts
2. Subsequent loops detect the container is already running (via `devcontainer exec -- echo ok`) and reuse it
3. Each loop passes its own `--workspace-folder` / `--work-dir` pointing to its worktree
4. The harness uses `devcontainer exec --workspace-folder <worktree-path> -- <command>` so the agent's `$PWD` is the correct worktree
5. Container stays running until explicitly stopped or last loop finishes

**Worktree mount strategy:**
- The project root is already mounted at `/workspace` by devcontainer default
- Git worktrees created by `aloop start` live under `~/.aloop/sessions/<id>/worktree/` on the host
- These must be bind-mounted into the container — the harness adds them dynamically:
  `devcontainer exec --remote-env WORK_DIR=<path> --workspace-folder <path> -- <command>`
- Alternatively, mount `~/.aloop/sessions/` as a volume in `devcontainer.json` so all worktrees are accessible

**Concurrency safety:**
- Provider CLIs are stateless per-invocation — safe to run N in parallel
- Each worktree has its own `.git` lock — no git conflicts between loops
- `requests/` and `queue/` are per-session — no cross-contamination

### `aloop start` with Devcontainer (automatic)

1. Harness detects `.devcontainer/devcontainer.json` in project root
2. If container not running → `devcontainer up --workspace-folder .`
3. Harness creates session, worktree (on host)
4. Harness runs loop iterations, wrapping each provider call in `devcontainer exec`
5. Host monitors `status.json` directly (host filesystem)
6. Runtime processes `requests/*.json` (convention-file protocol)
7. Dashboard runs on host, reads session data from host filesystem

### Provider Auth in Container

**Principle: if you're authenticated on the host, it should just work in the container. Zero manual config, with user-controlled strategy.**

The setup skill must let the user choose how devcontainer auth is resolved. Default is `mount-first` (auth file bind-mounts first), with `env-first` and `env-only` as alternatives. The confirmation summary must show the proposed method per activated provider before files are written.

**Auto-detection flow (runs during devcontainer setup/verification):**

For each activated provider, the skill checks the host for existing auth and resolves it using the selected strategy:

1. Gather both available signals (env vars and auth files) per provider.
2. Apply the selected strategy:
   - `mount-first` (default): auth file bind-mount → env var forwarding → warn/prompt
   - `env-first`: env var forwarding → auth file bind-mount → warn/prompt
   - `env-only`: env var forwarding → warn/prompt
3. Show a pre-write summary (`provider -> method`) and allow user override before scaffold/devcontainer generation.

Only activated providers get forwarded — never expose unused credentials.

#### Per-Provider Auth

| Provider | Env var(s) | How to obtain | Notes |
|---|---|---|---|
| Claude Code | `CLAUDE_CODE_OAUTH_TOKEN` (preferred) or `ANTHROPIC_API_KEY` | `claude setup-token` (generates 1-year headless token from Pro/Max subscription) or [Anthropic Console](https://console.anthropic.com/) API Keys | See Claude-specific section below. `setup-token` uses existing subscription; `ANTHROPIC_API_KEY` switches to pay-as-you-go. |
| Codex (OpenAI) | `OPENAI_API_KEY` or `CODEX_API_KEY` | [OpenAI Dashboard](https://platform.openai.com/api-keys) | Can also pipe to `codex login --with-api-key` inside container |
| Gemini CLI | `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) | Also supports `.env` file in `~/.gemini/` but env var preferred |
| OpenCode | `OPENCODE_API_KEY` or provider-specific keys | Varies by configured backend provider | OpenCode proxies to various providers; auth depends on which backend models are configured |
| Copilot CLI | `GITHUB_TOKEN` or `GH_TOKEN` or `COPILOT_GITHUB_TOKEN` | GitHub Settings → Fine-grained PATs → enable "Copilot Requests" permission | Newer Copilot CLI supports PAT via env var; older `gh copilot` extension requires separate OAuth (not supported in unattended container) |
| GitHub CLI (gh) | `GH_TOKEN` or `GITHUB_TOKEN` | GitHub Settings → PATs | For convention-file GH request processing on host-side monitor (not typically needed inside container) |

#### Claude Code Container Auth (detailed)

Claude Code is the most nuanced provider for container auth. Three legitimate approaches exist:

1. **`CLAUDE_CODE_OAUTH_TOKEN` env var (recommended for aloop)** — Run `claude setup-token` on a machine with a browser. This generates a 1-year OAuth token designed for headless/container use. Requires Claude Pro or Max subscription. Forward via `remoteEnv`:
   ```json
   "remoteEnv": { "CLAUDE_CODE_OAUTH_TOKEN": "${localEnv:CLAUDE_CODE_OAUTH_TOKEN}" }
   ```
   This is ToS-compliant: it's still Claude Code consuming its own token, just in a headless environment. Anthropic built this command specifically for this use case.

2. **`ANTHROPIC_API_KEY` env var** — Uses API pay-as-you-go billing (separate from subscription). No OAuth involved. Simplest option if user has API access:
   ```json
   "remoteEnv": { "ANTHROPIC_API_KEY": "${localEnv:ANTHROPIC_API_KEY}" }
   ```

3. **Docker volume persistence** — Anthropic's own reference devcontainer uses a named volume to persist `~/.claude/` across container rebuilds. User authenticates once interactively inside the container, credentials persist in the volume:
   ```json
   "mounts": [ "source=claude-code-config-${devcontainerId},target=/home/node/.claude,type=volume" ]
   ```
   This is official Anthropic practice (from their [reference devcontainer](https://github.com/anthropics/claude-code/tree/main/.devcontainer)). Not ideal for aloop's unattended use — requires one-time interactive auth after first container creation.

**Preference order for aloop:** `CLAUDE_CODE_OAUTH_TOKEN` > `ANTHROPIC_API_KEY` > volume persistence (fallback).

**ToS clarification:** Anthropic's ToS prohibits third-party tools from extracting and reusing OAuth tokens. Running the actual `claude` CLI binary inside a container (which is what aloop does — `claude -p`) is NOT a ToS violation — it's Claude Code itself running in a different environment. The `setup-token` command was built explicitly for this. Do NOT bind-mount `~/.claude/` from the host — use env vars or volume persistence instead.

#### devcontainer.json Configuration

Only forward env vars for providers **activated in the project's aloop config**.

Since multiple loops with different providers may share one container, the devcontainer must forward auth for **all providers the project has configured** — not just the ones a single loop uses. For example, if the project config lists `claude`, `codex`, and `gemini` as available providers, all three get `remoteEnv` entries even if a given loop only uses `claude`. This ensures any loop launched inside the shared container can use any configured provider without rebuilding.

```json
{
  "remoteEnv": {
    "CLAUDE_CODE_OAUTH_TOKEN": "${localEnv:CLAUDE_CODE_OAUTH_TOKEN}",
    "OPENAI_API_KEY": "${localEnv:OPENAI_API_KEY}",
    "GEMINI_API_KEY": "${localEnv:GEMINI_API_KEY}"
  }
}
```

The skill's devcontainer generator MUST:
- Read the project's provider config to determine which providers are activated
- Only add `remoteEnv` entries for activated providers — never forward unused credentials
- Warn the user if a required env var is not set on the host
- For Claude Code: check `CLAUDE_CODE_OAUTH_TOKEN` first, fall back to `ANTHROPIC_API_KEY`, then suggest `claude setup-token` if neither is set
- Verification step MUST confirm each activated provider can authenticate inside the container

#### Fallback: Auth File Bind-Mounts

Most users authenticate providers via browser OAuth and never set env vars. The default `mount-first` strategy should work for this path by bind-mounting individual auth credential files. **Mount only the specific auth file, never the whole config directory** (provider config dirs contain SQLite DBs, lock files, and other state that conflicts with concurrent host access).

| Provider | Auth File Path | XDG? | Token Refresh Writes? |
|----------|---------------|------|----------------------|
| Claude Code | `~/.claude/.credentials.json` | No | Rare (macOS prefers keychain) |
| OpenCode | `${XDG_DATA_HOME:-~/.local/share}/opencode/auth.json` | Yes | No (API keys, not OAuth) |
| Codex | `${CODEX_HOME:-~/.codex}/auth.json` | No | Yes (refresh token rotation) |
| Copilot | `~/.copilot/config.json` | No | Yes (token refresh) |
| Gemini | `~/.gemini/oauth_creds.json` + `~/.gemini/google_accounts.json` | No | Yes (access token expiry) |

**Mount rules:**
- Mount read-write (not read-only) — OAuth providers need to write back refreshed tokens
- Only mount for activated providers whose auth files exist on host
- Skip mount gracefully if auth file doesn't exist (user hasn't authenticated that provider)
- Container user home must match mount target path — use `remoteUser` from devcontainer config to determine target
- For Claude Code on macOS: the file may not exist if auth is keychain-only — fall back to `claude setup-token` guidance

**Auth resolution order (per provider):**
- `mount-first` (default): auth file exists on host -> bind-mount; else env var set on host -> `remoteEnv`; else warn user
- `env-first`: env var set on host -> `remoteEnv`; else auth file exists on host -> bind-mount; else warn user
- `env-only`: env var set on host -> `remoteEnv`; else warn user

```jsonc
{
  "mounts": [
    // Only for providers where auth file exists but no env var is set
    "source=${localEnv:HOME}/.codex/auth.json,target=/home/dev/.codex/auth.json,type=bind",
    "source=${localEnv:HOME}/.gemini/oauth_creds.json,target=/home/dev/.gemini/oauth_creds.json,type=bind",
    "source=${localEnv:HOME}/.gemini/google_accounts.json,target=/home/dev/.gemini/google_accounts.json,type=bind"
  ]
}
```

#### What NOT to do

- **Do NOT bind-mount entire provider config directories** (e.g. `~/.codex/`, `~/.gemini/`) — they contain SQLite DBs, lock files, and caches that conflict with concurrent host access. Mount only the auth file.
- **Do NOT extract OS keychain tokens** — brittle, platform-specific
- **Do NOT store API keys or tokens in devcontainer.json** — use `${localEnv:...}` references, never plaintext

### Acceptance Criteria

**Skill / Setup:**
- [ ] `/aloop:devcontainer` skill exists for both Claude and Copilot command surfaces
- [ ] Skill detects project language, runtime, and dependencies automatically
- [ ] Generated devcontainer config includes all project-specific deps and build tools
- [ ] Enabled providers are installed inside the container via postCreateCommand
- [ ] `.aloop/` directory (and session worktree root) is bind-mounted for convention-file protocol and worktree access
- [ ] Verification step builds container, starts it, and checks all deps/providers/git/mount
- [ ] Verification iterates on failure — fixes config and re-verifies until green
- [ ] Existing projects with `.devcontainer/` get augmented (aloop mounts/env added) rather than overwritten
- [ ] Setup offers devcontainer auth strategy choice (`mount-first` default, `env-first`, `env-only`) and allows override before writing files
- [ ] Setup confirmation summary includes proposed auth method per activated provider
- [ ] Provider auth forwarding uses selected strategy for activated providers only (no secrets in config files)
- [ ] For Claude Code: prefers `CLAUDE_CODE_OAUTH_TOKEN` (via `claude setup-token`), falls back to `ANTHROPIC_API_KEY`, then auth file mount, guides user if none available
- [ ] Auth file bind-mount fallback: for providers authenticated via browser OAuth (no env var set), mount the individual auth credential file (not the whole config dir) read-write into the container
- [ ] Auth file mounts are conditional — only added when the file exists on host and no env var is set
- [ ] Verification confirms each activated provider can authenticate inside the container
- [ ] Skill warns if no auth method (env var or auth file) is available for an activated provider

**Automatic integration:**
- [ ] Harness auto-detects `.devcontainer/devcontainer.json` and routes provider invocations through `devcontainer exec` — no manual flag needed
- [ ] If container not running, harness starts it automatically via `devcontainer up`
- [ ] Harness itself (loop.ps1/loop.sh) always runs on host, only agent CLIs run inside container
- [ ] Dashboard runs on host and reads session data directly from host filesystem
- [ ] Host processes convention-file requests (`requests/`) — agents in container write requests, harness on host fulfills them

**Shared container:**
- [ ] Multiple parallel loops reuse a single running container instance
- [ ] Each loop operates on its own worktree inside the shared container
- [ ] Container is started by first loop, reused by subsequent loops (detect via `devcontainer exec -- echo ok`)
- [ ] No per-loop container startup overhead after the first
- [ ] Session worktrees are accessible inside the container via bind mount of `~/.aloop/sessions/`

---

## Domain Skill Discovery — Agent Skills / tessl (Priority: P2)

Agent skills ([agentskills.io](https://agentskills.io), [skills.sh](https://skills.sh), [tessl.io](https://tessl.io)) are an open standard for domain-specific agent instructions. A skill is a `SKILL.md` file with YAML frontmatter and markdown instructions — framework patterns, pitfalls, best practices, conventions.

**Two-track approach:**

1. **External/community skills (via tessl)** — managed by tessl's own toolchain. `tessl install` puts skills in `.tessl/tiles/`, providers discover them via tessl's MCP server. tessl handles versioning, updates, quality scores, and security checks. No auth required for public tiles.
2. **Internal/aloop skills** — our own `SKILL.md` files (project-specific agents, prompts, conventions) installed directly into provider-native skill directories. Version-controlled in the repo, no external dependency.

### How tessl Works (verified)

```
tessl init                          # creates tessl.json + MCP configs for all detected providers
tessl search --type skills "next"   # search registry (no auth needed for public)
tessl install <workspace/tile>      # installs to .tessl/tiles/<workspace>/<tile>/SKILL.md
tessl list                          # shows installed tiles with sync status
```

**Discovery mechanism:** tessl registers itself as an MCP server in each provider's config (`.mcp.json` for Claude, `.codex/config.toml` for Codex, `.gemini/settings.json` for Gemini, `.vscode/mcp.json` for Copilot). Providers call the tessl MCP tool to discover and load skills on demand.

**Supported providers:** Claude Code, Cursor, Gemini CLI, Codex CLI, Copilot CLI, Copilot VS Code. **OpenCode is NOT supported** by tessl — no MCP config is generated for it.

**OpenCode workaround:** After `tessl install`, copy/symlink `SKILL.md` files from `.tessl/tiles/<workspace>/<tile>/SKILL.md` into `.agents/skills/<tile>/SKILL.md`. OpenCode natively scans `.agents/skills/` so it picks them up via filesystem discovery — no MCP needed.

**Files tessl creates:**
- `tessl.json` — manifest with dependencies and versions
- `.tessl/tiles/` — installed skill content (SKILL.md + references/)
- MCP client configs per detected provider (not OpenCode)

**No auth required** for public tiles (search + install). `tessl login` only needed for private/workspace tiles.

### Provider Skill Directories

| Provider | `.agents/skills/`? | Project-level search paths | Global search paths |
|----------|:--:|---------------------------|---------------------|
| Claude Code | **No** | `.claude/skills/` | `~/.claude/skills/` |
| OpenCode | Yes | `.opencode/skills/`, `.claude/skills/`, `.agents/skills/` | `~/.config/opencode/skills/`, `~/.claude/skills/`, `~/.agents/skills/` |
| Codex CLI | Yes (primary) | `.agents/skills/` | `~/.agents/skills/` |
| Copilot CLI | Yes | `.github/skills/`, `.agents/skills/`, `.claude/skills/` | `~/.copilot/skills/`, `~/.claude/skills/` |
| Gemini CLI | Yes (alias) | `.gemini/skills/`, `.agents/skills/` | `~/.gemini/skills/`, `~/.agents/skills/` |

**Internal skill install strategy:** `.agents/skills/` covers OpenCode, Codex, Copilot, and Gemini — but **not Claude Code**. When Claude Code is active, also install into `.claude/skills/`. Two targets max.

### Phase 1: Setup-Time Discovery (project-wide)

During `aloop setup`, after project analysis:

1. Run `tessl init --project-dependencies` to auto-detect stack, create MCP configs for all active providers
2. tessl auto-suggests skills based on detected dependencies
3. Install suggested skills via `tessl install` (goes into `.tessl/tiles/`, exposed via MCP)
4. **List all installed skills in the setup summary** — the user reviews the complete list at the end, not one-by-one
5. If the user doesn't like a skill, they can request removal or swap — no per-skill approval dialog
6. **Inform the user:** "The orchestrator may install additional domain skills per-task during planning. You can review/remove skills at any time."

This gives every agent iteration domain context from the start — a Next.js project's build agent knows Next.js conventions, the review agent knows Next.js anti-patterns.

### Phase 2: Orchestrator Skill Scout Agent (per-task, autonomous)

A dedicated **skill scout** agent (`PROMPT_orch_skill_scout.md`) runs after task decomposition but before child loop dispatch. It evaluates each task and discovers domain-specific skills autonomously.

**When it runs:** After `PROMPT_orch_decompose.md` produces issues, before dispatch. One pass per planning cycle — not per-iteration.

**What it does:**
1. Read all decomposed task issues
2. For each task, extract domain keywords (technology, framework, library, pattern)
3. Search for matching skills: `tessl search --type skills "<keywords>"`
4. Evaluate relevance — does this skill actually help with this specific task?
5. Install relevant skills via `tessl install` into the child loop's worktree
6. Log which skills were installed for which tasks (for traceability)

**What it does NOT do:**
- Modify agent prompts (skills are loaded via MCP or native discovery, not prompt injection)
- Install skills globally (only into the child loop's worktree)
- Run during loop iterations (one-shot at planning time)
- Override user-rejected skills from setup

**Example flow:**
```
Task: "Implement OAuth2 PKCE flow with NextAuth.js"
  → Keywords: oauth2, pkce, nextauth, next.js, authentication
  → tessl search: finds "nextauth-patterns", "oauth2-security", "next-app-router"
  → tessl install in child worktree → .tessl/tiles/ + MCP config
  → Child loop's build agent discovers skills via MCP tool
```

### Prompt Hint (not content injection)

Agent prompts (build, review, qa) include a lightweight hint via `{{PROVIDER_HINTS}}`:

```markdown
Domain skills are installed for this project's tech stack. Check your skills
directory and MCP-provided skills before implementing — they contain
framework-specific patterns, conventions, and known pitfalls.
```

This is a static one-liner — it doesn't change per skill, per task, or per iteration. It just reminds the agent to look. The provider's native skill loading and tessl MCP handle the rest.

### Acceptance Criteria

- [ ] Setup runs `tessl init --project-dependencies` to detect stack and configure MCP for all active providers
- [ ] External skills installed via `tessl install` (into `.tessl/tiles/`, exposed via MCP)
- [ ] Internal/aloop skills installed into `.agents/skills/` (+ `.claude/skills/` when Claude Code is active)
- [ ] Discovered skills are listed in setup summary — no per-skill approval dialog
- [ ] Setup informs user that orchestrator may install additional skills per-task
- [ ] `PROMPT_orch_skill_scout.md` agent prompt exists for orchestrator per-task skill discovery
- [ ] Skill scout runs after decomposition, before dispatch — one pass per planning cycle
- [ ] Installed skills are recorded in config/state for traceability
- [ ] Agent prompts contain a one-line hint to check skills — never skill content injection
- [ ] Skills in child loop worktrees are isolated — different tasks can have different skills

---

## Configurable Agent Pipeline (Priority: P2)

The default `plan → build × 5 → proof → qa → review` cycle is a **configurable, runtime-mutable pipeline of agents**. This cycle is the default configuration, compiled into `loop-plan.json` at session start. Pipelines are fully customizable via agent YAML definitions.

### Core Concept: Agents as the Unit

An **agent** is a named unit with:
- **Prompt** — instructions for what the agent does (a `PROMPT_*.md` file or inline)
- **Provider/model preference** (optional) — which harness and model to use (falls back to session default)
- **Reasoning effort** (optional) — controls reasoning depth for models that support it (see Reasoning Effort section below)
- **Transition rules** — what happens on success, failure, and repeated failure

Agents are NOT hardcoded. `plan`, `build`, `proof`, `qa`, `review`, `steer` are just the default agents that ship with aloop. Users and the setup agent can define custom agents (e.g., `verify`, `debugger`, `security-audit`, `docs-generator`, `guard`).

### Subagent Delegation (model-per-task)

A core principle: **agents delegate specialized work to subagents running best-fit models**. The primary agent orchestrates, while subagents execute tasks that require different capabilities (vision, deep reasoning, fast cheap analysis, domain-specific models). This is powered by opencode's native `task` tool, which spawns child sessions with independent model selection.

**How it works in opencode:**

1. Agents are defined in `.opencode/agents/` as markdown files with YAML frontmatter
2. Any agent can invoke the built-in `task` tool targeting another agent by name
3. Each agent declares its own `model` — the child session runs on that model regardless of the parent's model
4. Results flow back to the parent agent's context

**Agent definition format** (`.opencode/agents/<name>.md`):
```yaml
---
description: When to use this agent (required — opencode uses this to suggest delegation)
mode: subagent              # "primary", "subagent", or "all"
model: openrouter/google/gemini-3.1-flash-lite-preview
tools:
  write: false              # restrict tools per agent
  edit: false
  bash: true
temperature: 0.2
maxSteps: 10
---
System prompt for the agent goes here.
Supports {file:path/to/context.md} for file inclusion.
```

Equivalent JSON config in `opencode.json`:
```json
{
  "agent": {
    "vision-reviewer": {
      "description": "Analyzes screenshots for layout and visual issues",
      "mode": "subagent",
      "model": "openrouter/google/gemini-3.1-flash-lite-preview",
      "tools": { "write": false, "edit": false },
      "prompt": "You are a vision-based UI reviewer..."
    }
  }
}
```

**Subagent permission control** — restrict which subagents an agent can invoke:
```json
{
  "agent": {
    "build": {
      "permission": {
        "task": { "*": "deny", "vision-reviewer": "allow", "test-runner": "allow" }
      }
    }
  }
}
```

**Default subagent catalog** — agents that ship with aloop:

| Subagent | Model Selection | Purpose | Used By |
|---|---|---|---|
| `vision-reviewer` | Vision model (Gemini Flash Lite, Seed-2.0-Lite) | Screenshot analysis — layout, whitespace, visual regressions | proof, review |
| `vision-comparator` | Vision model | Baseline vs current screenshot comparison | proof |
| `code-critic` | High-reasoning model (xhigh effort) | Deep code review — subtle bugs, security, edge cases | review |
| `test-writer` | Fast cheap model (medium effort) | Generate test cases from spec/code | build, verify |
| `error-analyst` | Fast cheap model | Parse error logs, stack traces, suggest fixes | build (on failure) |
| `spec-checker` | Reasoning model (high effort) | Verify implementation matches spec acceptance criteria | review |
| `docs-extractor` | Fast cheap model | Extract API docs, type signatures, usage examples from code | docs-generator |
| `security-scanner` | Reasoning model | OWASP top-10 analysis, dependency audit, secret detection | review, guard |
| `accessibility-checker` | Vision model | WCAG compliance check on screenshots | proof, verify |
| `perf-analyzer` | Fast cheap model | Analyze bundle sizes, lighthouse scores, load times | proof |

**Example: review agent delegating to subagents**

The review agent (running on e.g. Claude) encounters a frontend PR. Instead of trying to review everything itself, it delegates:

1. **Structural review** — the review agent itself checks code quality, architecture, spec compliance
2. **Visual review** → delegates to `vision-reviewer` (Gemini Flash Lite) with screenshots
3. **Security scan** → delegates to `security-scanner` (reasoning model with xhigh effort)
4. **Accessibility** → delegates to `accessibility-checker` (vision model) with screenshots
5. **Aggregates results** — the review agent combines all subagent findings into a unified review verdict

Each subagent runs on the optimal model for its task. The review agent only pays for expensive reasoning on the parts that need it.

**Example: build agent with error recovery**

The build agent hits a compile error. Instead of burning expensive tokens trying to understand a long stack trace:

1. **Delegates** to `error-analyst` (cheap fast model) with the error output
2. Gets back a structured diagnosis: root cause, affected files, suggested fix
3. Applies the fix using its own (potentially more capable) model

**Cost optimization**: Subagent delegation is also a cost strategy. A $2/M output reasoning model should not spend tokens parsing stack traces or generating boilerplate — delegate those to a $0.15/M model and reserve the expensive model for decisions that matter.

**Alternative invocation methods** (besides the `task` tool):

- **Commands with `subtask: true`** — e.g., `/vision-review` runs as a child session with its own model
- **Bash tool** — agent calls `opencode run --agent vision-reviewer -f screenshot.png -- "prompt"` as a nested process
- **Plugin tools** — custom tools that programmatically create sessions via the opencode SDK with per-message model override

### Subagent Integration into Aloop

Subagent delegation is supported natively by most providers (opencode, claude, copilot, codex) in similar ways. For now, only opencode is implemented — other providers are out of scope but the architecture accommodates them. The integration must be lightweight and conditional.

**Agent files**: A small set of ready-to-use opencode agent definitions ships with aloop at `aloop/agents/opencode/`:

```
aloop/agents/opencode/
  vision-reviewer.md
  error-analyst.md
  code-critic.md
```

These are static markdown files with hardcoded model references — no templating, no catalog, no compiler. Users can edit models, delete agents they don't want, or add their own.

**Installation**: `aloop setup` copies them into the worktree's `.opencode/agents/` directory when the user has opencode configured as a provider. They get committed in the worktree alongside the code — same as `.vscode/` or `.editorconfig`. The directory is inert for non-opencode providers.

**Conditional prompt injection via `{{SUBAGENT_HINTS}}`**: Loop prompt templates already use provider-specific variables (`{{PROVIDER_HINTS}}`). A new `{{SUBAGENT_HINTS}}` variable is populated only when the current provider supports delegation:

- **opencode** → `SUBAGENT_HINTS` populated with available agents and delegation instructions
- **claude / copilot / codex** → `SUBAGENT_HINTS` set to empty string for now (support planned, out of scope)

Resolution in `loop.sh`:
```bash
if [[ "$PROVIDER" == "opencode" ]] && [[ -d "$WORKTREE/.opencode/agents" ]]; then
  SUBAGENT_HINTS=$(cat ~/.aloop/templates/subagent-hints-${PHASE}.md)
else
  SUBAGENT_HINTS=""
fi
```

Per-phase hint files list only the subagents relevant to that phase:

```markdown
<!-- subagent-hints-proof.md -->
## Available Subagents
You can delegate specialized tasks using the task tool:
- **vision-reviewer** — analyzes screenshots for layout/visual issues (vision model)
- **accessibility-checker** — WCAG compliance checks on screenshots (vision model)
```

```markdown
<!-- subagent-hints-review.md -->
## Available Subagents
You can delegate specialized tasks using the task tool:
- **code-critic** — deep code review for subtle bugs and security issues (reasoning model)
- **vision-reviewer** — visual review of UI changes (vision model)
```

```markdown
<!-- subagent-hints-build.md -->
## Available Subagents
You can delegate specialized tasks using the task tool:
- **error-analyst** — parse error logs and stack traces, suggest fixes (fast cheap model)
```

This approach is:
- **Zero config for users** — setup copies agents, loop injects hints, it just works
- **Provider-agnostic in the prompts** — non-opencode providers see no subagent instructions
- **Extensible later** — when agent-forge is ready, it replaces the static agent files with discovered/compiled ones
- **No templating engine** — just file copies and string substitution already used by the loop scripts

### Pipeline Configuration

The pipeline is a sequence of agent references with transition rules:

```yaml
# Example: minimal plan-build-review pipeline (no proof phase)
pipeline:
  - agent: plan
  - agent: build
    repeat: 3
    onFailure: retry       # retry same agent
  - agent: review
    onFailure: goto build   # review fails → back to build

# Example: vertical slice with verification
pipeline:
  - agent: plan
  - agent: build
    repeat: 2
  - agent: verify           # run tests, capture screenshots/video
    onFailure: goto build
    escalation:
      maxRetries: 3
      ladder:
        1: { restrict: code-only }      # first failure: agent can only fix code
        2: { restrict: code-and-tests, requireJustification: true }
        3: { escalateTo: review }        # third failure: second opinion
        4: { flag: human-review }        # give up, flag for human
  - agent: guard             # verify the build agent didn't touch protected files
    onFailure: revert-and-goto build
  - agent: review
  - agent: docs-generator
```

### Loop Plan Compilation (Runtime → Shell Bridge)

The pipeline YAML config is **not parsed by the shell script**. Instead, the aloop runtime (TS/Bun) compiles it into a simple `loop-plan.json` that the loop scripts can read with zero complexity.

**`loop-plan.json` format:**
```json
{
  "cycle": [
    "PROMPT_plan.md",
    "PROMPT_build.md",
    "PROMPT_build_opencode.md",
    "PROMPT_build_codex.md",
    "PROMPT_build_gemini.md",
    "PROMPT_proof.md",
    "PROMPT_review.md"
  ],
  "cyclePosition": 0,
  "iteration": 1,
  "version": 1
}
```

The cycle is just a list of **prompt filenames**. All agent configuration lives in the prompt file's frontmatter — not in the JSON. This means cycle prompts and queue overrides use the exact same format and the loop parses them identically.

**Prompt file format (frontmatter + prompt body):**

Every prompt file — whether in the cycle or the override queue — is a markdown file with YAML frontmatter:

```markdown
---
agent: build
provider: opencode
model: openrouter/openai/gpt-5.1
reasoning: medium
---

# Build Mode

You are Aloop, an autonomous build agent...
```

Frontmatter fields:
- `agent` — agent type identifier (plan, build, review, proof, qa, steer, debug, guard, or any custom name)
- `provider` — which CLI to invoke (claude, opencode, codex, gemini, copilot)
- `model` — model ID, provider-specific (e.g., `claude-opus-4-6`, `openrouter/openai/gpt-5.1`, `codex-mini-latest`)
- `reasoning` — reasoning effort level (low, medium, high, xhigh)
- `color` — terminal color for this phase (magenta, yellow, cyan, blue, green, red, white). Default: white
- `trigger` — condition that causes the runtime to queue this agent (e.g., `merge_conflict`, `stuck_detected`). Resolved by the runtime, NOT the loop script. The loop parses and logs this field but never acts on it. Finalizer ordering comes from the compiled `finalizer[]` array, not from trigger chaining.
- `timeout` — per-prompt provider timeout override (duration string like `30m`, `2h`, or integer seconds)
- `max_retries` — per-prompt retry cap before declaring iteration failure (overrides global default for that prompt only)
- `retry_backoff` — per-prompt retry backoff policy (`none`, `linear`, `exponential`)

All fields are optional — defaults apply if omitted (`provider: claude`, `model: claude-opus-4-6`, `agent: build`, `reasoning: medium`).

### Runtime-Mutable Prompt Settings

Prompt frontmatter is re-read on every iteration, so edits to these settings take effect the next time that prompt is selected (cycle or queue):

- `provider`
- `model`
- `reasoning`
- `timeout`
- `max_retries`
- `retry_backoff`
- `color`

Precedence for execution settings is:

1. Prompt frontmatter value (highest)
2. Session/env setting (for example `ALOOP_PROVIDER_TIMEOUT`)
3. Built-in default (lowest)

This applies to both loop mode and orchestrator child loops because both use the same prompt/frontmatter execution path.

### Shared Instructions via `{{include:path}}`

Prompt templates support `{{include:path}}` to inline shared instruction files. This avoids duplicating instructions between cycle agents and their finalizer counterparts (e.g., `review` and `final-review` share the same 9-gate instructions).

**How it works:** During template expansion (at session start or queue injection), `{{include:path}}` is replaced with the contents of the referenced file. Paths are relative to `aloop/templates/`.

**Directory structure:**
```
aloop/templates/
  instructions/              # shared instruction blocks
    review.md                # 9 gates, rejection/approval flow, rules
    qa.md                    # test process, isolation rules, cleanup
  PROMPT_plan.md             # cycle agent
  PROMPT_build.md            # cycle agent
  PROMPT_review.md           # cycle agent: frontmatter + {{include:instructions/review.md}}
  PROMPT_qa.md               # cycle agent: frontmatter + {{include:instructions/qa.md}}
  PROMPT_spec-gap.md         # finalizer agent: spec enforcement
  PROMPT_docs.md             # finalizer agent: doc sync
  PROMPT_spec-review.md      # finalizer agent: own instructions
  PROMPT_final-review.md     # finalizer agent: frontmatter + {{include:instructions/review.md}}
  PROMPT_final-qa.md         # finalizer agent: frontmatter + {{include:instructions/qa.md}}
  PROMPT_proof.md            # finalizer agent: own instructions (last step)
  PROMPT_merge.md            # runtime-triggered: conflict resolution (trigger: merge_conflict)
  PROMPT_steer.md            # runtime-triggered: steering
```

**Example — `PROMPT_final-review.md`:**
```yaml
---
agent: final-review
trigger: spec-review
provider: claude
reasoning: high
---

{{include:instructions/review.md}}
```

**Example — `PROMPT_review.md` (cycle version, same instructions, no trigger):**
```yaml
---
agent: review
provider: claude
reasoning: high
---

{{include:instructions/review.md}}
```

The `{{include:path}}` directive is expanded alongside other template variables (`{{SPEC_FILES}}`, `{{REFERENCE_FILES}}`, etc.) during the same expansion pass. Includes can themselves contain template variables — they are expanded after inlining.

### Template Variable Reference

All template variables used in prompt templates. Variables are expanded at two stages:

**Setup-time** (expanded by `project.mjs` when copying templates to session `prompts/`):

| Variable | Value | Example |
|----------|-------|---------|
| `{{SPEC_FILES}}` | Comma-joined spec file paths from config | `SPEC.md, specs/auth.md` |
| `{{REFERENCE_FILES}}` | Comma-joined reference file paths (RESEARCH.md, VERSIONS.md, etc.) | `RESEARCH.md, VERSIONS.md` |
| `{{VALIDATION_COMMANDS}}` | Bulleted list of backpressure validation commands | `- cd aloop/cli && npm test` |
| `{{SAFETY_RULES}}` | Bulleted list of project-specific safety rules | `- Never modify production database` |
| `{{PROVIDER_HINTS}}` | Provider-specific guidance (e.g., subagent usage for Claude) | `- Claude hint: Use parallel subagents...` |
| `{{include:path}}` | Inlined file contents, relative to `aloop/templates/` | `{{include:instructions/review.md}}` |

**Runtime** (expanded by `loop.sh`/`loop.ps1` before each provider invocation):

| Variable | Value | Example |
|----------|-------|---------|
| `{{ITERATION}}` | Current iteration number | `42` |
| `{{ARTIFACTS_DIR}}` | Session artifacts directory path | `/home/user/.aloop/sessions/abc123/artifacts` |
| `iter-<N>` | Also replaced with current iteration (legacy pattern) | `iter-42` |

**Planned but not yet implemented:**

| Variable | Value | Status |
|----------|-------|--------|
| `{{SUBAGENT_HINTS}}` | Per-phase subagent delegation hints (opencode only) | Spec'd, not yet in expansion code |

### Event-Driven Agent Dispatch (runtime responsibility)

**Principle:** The loop engine is a dumb cycle+finalizer+queue runner. It has ZERO knowledge of what any specific agent does. All it does is:
1. Check the queue — if there's a file, run it, delete it
2. Check if in finalizer mode — if yes, pick next from `finalizer[]`
3. Otherwise pick the next prompt from `cycle[]`
4. Parse frontmatter for provider/model/reasoning config
5. Invoke the provider
6. Advance position (cycle or finalizer)

**The loop handles `allTasksMarkedDone` mechanically** (TODO.md checkbox count) and switches between cycle and finalizer. That's its only "intelligence." Everything else — trigger resolution, steering, stuck detection, custom events — is the **runtime's** job.

**How runtime-driven queue injection works:**

The runtime (shared base library used by dashboard and orchestrator) watches `status.json` and `log.jsonl` to detect conditions, then writes prompt files to `queue/`. The loop picks them up. The runtime handles:

| Condition | Detected By Runtime Via | Action |
|-----------|------------------------|--------|
| Steering requested | STEERING.md file appears | Queue steer prompt + follow-up plan |
| Stuck detected | N consecutive failures in log.jsonl | Queue debug agent via `trigger: stuck_detected` scan |
| Merge conflict | Pre-iteration merge event in log.jsonl | Queue merge agent via `trigger: merge_conflict` scan |
| PR feedback | Orchestrator polls GH PR comments | Queue steer prompt into child's queue |
| Custom events | Agent writes to `requests/*.json` | Runtime processes request, queues follow-up |

**Trigger resolution is the runtime's mechanism** for deciding which prompt to queue for a given condition. The runtime scans prompt catalog for matching `trigger:` frontmatter values. This is useful for extensibility — custom agents can declare `trigger: my_custom_event` and the runtime will queue them when that event occurs.

**The finalizer chain does NOT use triggers.** It's a compiled array in `loop-plan.json` — the loop processes it mechanically. Triggers are only for runtime-driven queue injection (steering, stuck, merge, custom events).

**Examples:**
- Cycle ends, all TODOs done → loop switches to finalizer (no runtime involved) → spec-gap runs, adds 2 TODOs → loop aborts finalizer, resumes cycle
- Cycle ends, all TODOs done → finalizer runs cleanly → proof completes → loop sets `state: completed`
- User runs `aloop steer "focus on tests"` → CLI writes steer prompt directly to queue
- Runtime detects 3 consecutive failures → scans for `trigger: stuck_detected` → queues matching prompt
- Pre-iteration merge conflicts → runtime scans for `trigger: merge_conflict` → queues merge agent

The frontmatter parser extracts agent config from any prompt file, whether from the cycle or the queue. The loop engine itself has no knowledge of what any specific agent does.

**Override queue (`$SESSION_DIR/queue/`):**

Queue files use the same frontmatter format as cycle prompts. The loop checks the queue folder before the cycle each iteration — if files exist, it picks the first (sorted), runs it, deletes it.

Files are sorted lexicographically and consumed in order. Naming convention: `NNN-description.md` (e.g., `001-steer.md`, `002-force-review.md`).

**Who writes to the queue:**
- **User** — drops a prompt markdown into `queue/` and it gets picked up next iteration. Works without any runtime.
- **CLI (`aloop steer`)** — writes the user's instruction into a queue file with appropriate frontmatter.
- **Runtime** — injects steering, debugger, merge agent, and other triggered prompts as queue files when it detects conditions via `status.json`/`log.jsonl` polling. Uses `trigger:` frontmatter to find matching prompts.

**Key properties:**
- The `cycle` array is a **short repeating pattern** of prompt filenames (typically 5-7 entries), NOT an unrolled list of all iterations. The loop script wraps around with `% length`.
- `cyclePosition` and `iteration` live in the plan file — the runtime and shell share state through this single file. The shell updates position after each iteration; the runtime reads it when deciding mutations.
- The runtime compiles this file once at session start from the pipeline YAML config, then **rewrites it** whenever the pipeline mutates (failure recovery, agent injection). It preserves `cyclePosition` and `iteration` (or adjusts them if the mutation requires it, e.g., `goto build` resets `cyclePosition`).
- The loop script re-reads the file every iteration, so mutations take effect on the next turn.
- The `version` field increments on each runtime rewrite — the loop script logs when it detects a plan change.
- To change an agent's provider/model/reasoning/timeout/retry behavior, edit its prompt file's frontmatter — no plan recompilation needed. Changes take effect on the next iteration that uses that prompt.
- Transition rules (`onFailure: goto build`, escalation ladders) are **resolved by the runtime**, not the shell. When the runtime observes a failure via `status.json`, it rewrites the plan accordingly.
- This keeps all complex logic in TS/Bun and all shell logic trivial: read JSON for cycle index, parse frontmatter for config, check queue folder, invoke, update index.

**When the runtime modifies the plan:**
- Agent failure detected (via `status.json` polling) → apply `onFailure` transition rules (write queue entry or adjust `cyclePosition`)
- Escalation threshold reached → write recovery agent to queue, or inject into `cycle` if permanent
- Host monitor detects repeated failures → swap provider in prompt frontmatter or write debugger to queue

### Runtime Mutation

The pipeline is **mutable at runtime** via two mechanisms:

**Override queue** (`$SESSION_DIR/queue/`):
- User drops steering prompt → loop picks it up next iteration, runs it, deletes it
- Runtime detects all tasks done → writes `queue/NNN-review.md` with review agent frontmatter
- Repeated build failures → writes `queue/NNN-debug.md` with debugger agent frontmatter
- Queue items do NOT modify the `cycle` array — they interrupt it without advancing `cyclePosition`
- The loop handles this autonomously — no runtime required for basic steering

**Permanent pipeline changes** (via rewriting `loop-plan.json` and/or prompt files):
- User steering says "add `security-audit` after every `build`" → runtime adds the prompt file and inserts its filename into the `cycle` array
- User steering says "remove `docs-generator`" → runtime removes it from the `cycle` array
- Provider consistently timing out → runtime edits that prompt file's frontmatter to swap providers
- To change model/reasoning/timeout/max_retries/retry_backoff for an agent -> edit the prompt file's frontmatter (no plan rewrite needed)

Agents do **not** modify the pipeline themselves — control stays with the user and host-side monitor (avoids perverse incentives like agents removing their own reviewers).

### Agent-Based Guarding

Instead of structural file-permission enforcement, a **guard agent** reviews what the previous agent changed and rejects unauthorized modifications:

- Runs after the build agent (or any agent that needs policing)
- Checks `git diff` for the agent's iteration
- Reverts changes to protected files (e.g., test expectations, config, spec) and sends the build agent back with a rejection message
- The guard agent's own prompt defines what's protected — configurable per project
- Guard agent is itself guarded by being unable to modify code (it can only revert and reject)

This is preferable to hardcoded file-permission enforcement because:
- The guard can make judgment calls (e.g., "this test change is legitimate because the API contract changed")
- Protection rules are configurable per project, not baked into loop machinery
- It follows the same agent model — no special-case infrastructure

### Infinite Loop Prevention

With a flexible agent pipeline where agents can modify files that trigger other agents, infinite loops are easy to create accidentally. Two mechanisms prevent this:

**1. Provenance tagging**

Every agent commit includes a provenance trailer:
```
Aloop-Agent: spec-consistency
Aloop-Iteration: 14
Aloop-Session: ralph-skill-20260314-173930
```

The runtime's file-change watcher reads provenance before triggering follow-up agents:
- Housekeeping agents (spec-consistency, spec-backfill, guard) never re-trigger themselves
- An agent's output does not re-trigger the same agent type unless explicitly configured
- Only commits without aloop provenance (human edits) or from substantive agents (build, plan) trigger the full reactive pipeline

**2. Loop health supervisor agent**

A lightweight supervisor agent (`PROMPT_loop_health.md`) runs every N iterations (configurable, default: every 5) as part of the normal cycle. It reads `log.jsonl` and detects unhealthy patterns:

- **Repetitive agent cycling** — same agent type running repeatedly without progress (e.g., spec-consistency triggered 4 times in 6 iterations)
- **Queue thrashing** — queue depth growing instead of draining, or same prompts being re-queued
- **Stuck cascades** — agent A triggers B triggers A triggers B with no net progress
- **Wasted iterations** — agents running but producing no meaningful commits or changes
- **Resource burn** — disproportionate token/iteration spend on non-build agents

When the supervisor detects an unhealthy pattern, it can:
- **Trip a circuit breaker** — suspend the offending agent type by removing it from the cycle or blocking its queue entries, with a log entry explaining why
- **Alert the user** — create an `aloop/health-alert` issue or post a comment describing the pattern
- **Adjust the pipeline** — write a request to reduce trigger sensitivity or increase cooldowns

The supervisor is itself provenance-tagged and excluded from re-triggering — it cannot cause the loops it's designed to prevent.

### Vertical Slice Verification (built on the pipeline)

For greenfield projects, the orchestrator decomposes the spec into **vertical slices** (each a GH issue/PR). Each slice is an independently runnable end-to-end path, not a horizontal layer.

**Slice definition of done** (enforced by the pipeline):
- Code is complete (build agent)
- Builds and runs independently (verify agent)
- Happy path works end-to-end with Playwright (verify agent — screenshots + video capture)
- Tested with both fake/mock data and real/E2E data where applicable (verify agent)
- No dead UI or stubs — the slice feels complete for what it covers (review agent)
- Dependencies on other slices are explicit (plan agent)
- Setup is bootstrapped — seed data, docker-compose, env vars included (build agent)
- Getting-started docs generated (docs-generator agent)

**Self-healing verification loop:**
The verify agent runs Playwright tests, captures screenshots and video. On failure, it feeds the evidence (failure screenshot, error log, video of broken flow) back to the build agent. The escalation ladder controls what the build agent is allowed to fix:

| Attempt | Agent may change | Requirement |
|---|---|---|
| 1st failure | Code only | Tests are treated as the spec |
| 2nd failure | Code + tests | Must justify why the test was wrong |
| 3rd failure | Escalated to review agent | Independent assessment: code vs test bug |
| 4th failure | Flagged for human | Loop stops on this slice, continues others |

Test expectations ideally originate from the **plan agent** (derived from the slice spec), not the build agent — so the build agent is implementing to a contract it didn't write.

The verify agent itself delegates visual comparison to subagents — it captures screenshots via Playwright, then delegates to `vision-comparator` (vision model) for baseline diffing and to `accessibility-checker` for WCAG compliance. This means the verify agent can run on a cheap text model while getting vision-quality analysis via delegation.

### Reasoning Effort Configuration

Reasoning models (OpenAI GPT-5 series, Grok, and via proxy Anthropic/Gemini) support configurable reasoning depth. Different agents benefit from different reasoning effort levels — a review agent should think harder than a build agent.

**OpenAI reasoning effort levels** (from the Responses API):

| Level | Token allocation | Use case |
|-------|-----------------|----------|
| `none` | Disabled | Non-reasoning tasks |
| `minimal` | ~10% of max_tokens | Trivial operations |
| `low` | ~20% | Simple tasks |
| `medium` | ~50% (default) | Balanced speed/quality |
| `high` | ~80% | Complex analysis |
| `xhigh` | ~95% | Maximum reasoning depth |

- `xhigh` is supported on models after `gpt-5.1-codex-max`
- `gpt-5.1` defaults to `none`; models before `gpt-5.1` default to `medium`
- `gpt-5-pro` defaults to and only supports `high`
- Source: https://developers.openai.com/api/reference/resources/responses/methods/create

**Agent-level configuration** in pipeline YAML:

```yaml
# .aloop/agents/plan.yml
agent: plan
prompt: PROMPT_plan.md
reasoning:
  effort: high          # deep gap analysis needs thorough reasoning

# .aloop/agents/build.yml
agent: build
prompt: PROMPT_build.md
reasoning:
  effort: medium        # speed matters for implementation

# .aloop/agents/review.yml
agent: review
prompt: PROMPT_review.md
reasoning:
  effort: xhigh         # thorough quality gate, catch subtle bugs

# .aloop/agents/proof.yml
agent: proof
prompt: PROMPT_proof.md
reasoning:
  effort: medium        # artifact generation, not heavy reasoning
```

**Recommended defaults** (when no per-agent config exists):

| Agent | Default effort | Rationale |
|-------|---------------|-----------|
| plan | `high` | Gap analysis, spec comparison |
| build | `medium` | Implementation speed |
| review | `xhigh` | Catch subtle quality issues |
| proof | `medium` | Artifact generation |
| steer | `medium` | Spec/TODO updates |

**OpenRouter as unified proxy**: OpenRouter normalizes reasoning config across providers via its `reasoning` parameter. `effort` works natively for OpenAI/Grok models; for Anthropic/Gemini models it maps to `max_tokens`. This means the same agent config works regardless of which provider the round-robin selects — the loop passes `reasoning.effort` and OpenRouter translates.

```json
// OpenRouter reasoning parameter (in API request body)
{
  "reasoning": {
    "effort": "xhigh",       // OpenAI-style (string enum)
    "max_tokens": 32000,     // Anthropic-style (token count) — alternative to effort
    "exclude": false          // whether to exclude reasoning tokens from response
  }
}
```

Source: https://openrouter.ai/docs/guides/best-practices/reasoning-tokens

**Provider-specific pass-through**: When using opencode CLI, reasoning effort maps to the `--variant` flag. When using providers directly (via OpenRouter or native APIs), the reasoning config is passed in the request body.

### Vision Model Configuration

The proof and review phases can use vision-capable models for automated UI review — analyzing screenshots for layout issues, whitespace problems, spatial relationships, and visual regressions. This requires models that accept image input.

**Configuring vision models in opencode**: Models not in opencode's built-in registry need their modalities declared in `opencode.json` so opencode knows to send images as vision payloads:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "openrouter": {
      "models": {
        "bytedance-seed/seed-2.0-lite": {
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        },
        "bytedance-seed/seed-2.0-mini": {
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        },
        "qwen/qwen3.5-9b": {
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        }
      }
    }
  }
}
```

Without the `modalities` declaration, opencode defaults to `"image": false` for custom-registered models, and image attachments are passed as tool-call file reads instead of vision payloads — resulting in "this model does not support image input" errors even when the model does support vision via its provider API.

Models already in opencode's built-in registry (e.g., `google/gemini-3.1-flash-lite-preview`) have capabilities auto-populated from the [models.dev](https://models.dev) catalog and need no extra config.

**Headless image attachment**: In non-interactive `opencode run` mode, images are attached via the `-f` flag:
```bash
opencode run -m openrouter/google/gemini-3.1-flash-lite-preview \
  -f screenshot.png -- "Analyze this UI screenshot..."
```

**Vision model comparison** (tested on 1920x1080 dashboard screenshot, spatial analysis prompt):

| Model | Cost (input) | Spatial Quality | Notes |
|---|---|---|---|
| Seed-2.0-Lite | $0.25/M | Excellent — precise %, identified whitespace severity | Best structured output, no hallucinations |
| Seed-2.0-Mini | $0.10/M | Very good — per-element padding estimates | Minor math error in one coordinate |
| Gemini 3.1 Flash Lite | $0.25/M | Good — clean table format, correct proportions | Has ZDR via Google Vertex AI |
| Qwen3.5-9B | $0.05/M | Good — correct structure, reasonable estimates | Cheapest option |
| gpt-5-nano | free | Decent — correct proportions, less granular | Good baseline |
| nemotron-nano-vl | free | Moderate | Hallucinated non-existent UI elements |

**Important caveats**:
- Pixel size estimates **drift significantly** across models — no model produces reliable absolute pixel measurements. Treat estimates as directional (relative proportions and "too much/too little whitespace") rather than precise pixel values.
- "Stealth" or test models (e.g., models from unknown providers marked as free/testing) may collect all input data. Do not use them for production workloads with sensitive UI content.

**ZDR (Zero Data Retention) for vision**: See [Zero Data Retention (ZDR)](#zero-data-retention-zdr) for full provider details. Key caveat for vision: **OpenAI's ZDR explicitly excludes image inputs.** For production visual review with sensitive content, use Anthropic Claude (direct API with org ZDR), AWS Bedrock (default no-retention), or Gemini via Vertex AI (project-level ZDR).

### Implementation Notes

- Pipeline config lives in `.aloop/pipeline.yml` (or inline in `config.yml`) — this is the **source of truth**
- `loop-plan.json` is a **compiled artifact** — never hand-edit it, always regenerate from config
- The relationship is like TypeScript → JavaScript: you edit the source, the compiler produces the runtime artifact
- Default pipeline (plan → build × 5 → proof → qa → review) is generated if no config exists — backward compatible
- Agent definitions live in `.aloop/agents/` — each is a YAML file with prompt reference, provider preference, reasoning effort, and transition rules
- The loop script becomes a generic agent runner: read `loop-plan.json`, resolve next agent, invoke, repeat
- Runtime pipeline mutations are applied via the host-side monitor rewriting `loop-plan.json`
- Pipeline state (`cyclePosition`, `iteration`, `version`, escalation counts, mutation history) lives in `loop-plan.json` itself
- The parallel orchestrator creates per-slice pipelines — each child loop runs its own `loop-plan.json` independently
