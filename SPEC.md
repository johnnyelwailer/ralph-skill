# SPEC: Rename ralph → aloop + Node.js CLI

## Desired Outcome

Rebrand the entire project from "ralph" to "aloop" (agent loop), and replace the PowerShell `setup-discovery.ps1` with a Node.js CLI (`aloop`) for developer-machine tasks. Loop scripts (`loop.ps1`/`loop.sh`) stay as-is for portable runtime execution.

## Scope

### Phase 0: Rename ralph → aloop
- Rename all directories, files, commands, prompts, config references
- Use `git mv` to preserve file history
- `~/.ralph/` → `~/.aloop/` in all references
- Verify: `grep -ri "ralph"` returns 0 hits (excluding git history)
- Verify: `install.ps1` installs to `~/.aloop/` and smoke-tests correctly

### Phase 1: `aloop resolve` CLI
- Create `aloop/cli/aloop.mjs` entry point + `lib/project.mjs`, `lib/config.mjs`
- Minimal YAML parser (hand-rolled, only handles our config format)
- Replace duplicated runtime-root resolution in 7 prompt/command files with `aloop resolve`
- Update `install.ps1` to install CLI shims

### Phase 2: Port setup-discovery → `aloop discover` + `aloop scaffold`
- Create `lib/discover.mjs` and `lib/scaffold.mjs`
- Match existing PS1 JSON output schema
- Update setup prompts to call `aloop discover`/`aloop scaffold`
- Delete `setup-discovery.ps1`

### Phase 3: Convenience subcommands
- `aloop status` — read active.json + status.json, print table
- `aloop stop <session-id>` — kill PID, update state
- `aloop active` — list active sessions

## Non-Goals
- npm publish / package.json (additive later)
- Repo rename on GitHub (separate, GitHub handles redirects)
- Changing loop.ps1/loop.sh internal logic (they're path-agnostic)
- Backward compatibility with `~/.ralph/` (greenfield, no existing users)
- Migration tooling from ralph → aloop installs

## Constraints
- **Zero npm dependencies** — Node.js built-ins only (crypto, child_process, fs, path, os)
- **`.mjs` extension** — native ESM without package.json
- **No build step** — plain JS files
- **Config stays YAML** — shell-friendly for loop.sh/loop.ps1 parsing
- **Runtime state stays JSON** — active.json, status.json, session state
- **`git mv` for renames** — preserve file history through the rename
- **Clean break** — no migration from `~/.ralph/`, no backward compat shims

## Acceptance Criteria

### Phase 0
- [ ] `grep -ri "ralph" . --include="*.md" --include="*.ps1" --include="*.sh" --include="*.yml" --include="*.mjs"` → 0 hits
- [ ] `install.ps1` installs to `~/.aloop/` successfully
- [ ] Commands register as `/aloop:setup`, `/aloop:start`, etc.
- [ ] All file renames done via `git mv`

### Phase 1
- [ ] `aloop resolve` outputs correct JSON for configured project
- [ ] `aloop resolve` outputs correct JSON for project-local config
- [ ] `aloop resolve` gives clear error for unconfigured project
- [ ] 7 prompt/command files no longer contain duplicated resolution logic
- [ ] `install.ps1` creates platform shims (`aloop.cmd` / `aloop` shell wrapper)

### Phase 2
- [ ] `aloop discover --scope project` matches old PS1 JSON schema
- [ ] `aloop discover --scope full` includes provider/model info
- [ ] `aloop scaffold` writes config.yml + prompt templates
- [ ] Full `/aloop:setup` → `/aloop:start` flow works end-to-end
- [ ] `setup-discovery.ps1` is deleted

### Phase 3
- [ ] `aloop status` reads and displays session state
- [ ] `aloop stop` terminates session and updates state
- [ ] `aloop active` lists running sessions

## Risks

| Risk | Mitigation |
|------|------------|
| Phase 0 blast radius (every file changes) | grep verification + install.ps1 smoke test before proceeding |
| Minimal YAML parser edge cases | Parser only handles our controlled config format, not general YAML |
| CLI must be installed before prompts work (Phase 1+) | Prompts can fallback to `node ~/.aloop/cli/aloop.mjs` if not on PATH |
| Self-referential work (renaming the tool while using it) | Ralph state is in `~/.ralph/` (global), not in repo — rename is safe |

## Architecture

| Layer | Runs where | Tech | Deps |
|-------|-----------|------|------|
| `aloop` CLI (discover, scaffold, resolve) | Developer machine | Node.js `.mjs` | Node.js |
| Loop scripts (plan-build-review cycle) | Anywhere — containers, sandboxes, CI | `loop.ps1` / `loop.sh` | Shell + git + provider CLI |

---

## Global Provider Health & Rate-Limit Resilience

### Problem

Multiple loops can run concurrently against the same providers. When a provider hits rate limits, auth expiry, or outages, every active session independently burns iterations retrying the same dead provider. There is no cross-session awareness.

### Design

**One health file per provider** to minimize lock contention:

```
~/.aloop/health/
  claude.json
  codex.json
  gemini.json
  copilot.json
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

### Problem

In `plan-build-review` mode, the loop currently exits as soon as a **build** phase finds all TODO tasks marked `[x]`. This means a builder agent can mark everything done and the loop terminates without a review phase ever validating the work. The review is the gatekeeper — it must always have the final say.

**Current bug** (`loop.ps1` lines ~690-697):
```powershell
if ($iterationMode -eq 'build') {
    if (Check-AllTasksComplete) {
        # Exits immediately — review never runs
        exit 0
    }
}
```

### Design

**Invariant**: In any mode that includes `review` (i.e. `plan-build-review`), the loop MUST NOT exit on task completion during a build phase. Instead:

1. **Build detects all tasks complete** → set `$script:allTasksMarkedDone = $true`, log `tasks_marked_complete`, but **do not exit**
2. **Next iteration becomes a forced review** → override the normal cycle to schedule a review phase (similar to how `$script:forcePlanNext` works for steering)
3. **Review decides**:
   - If review approves → loop exits with `state: "completed"`
   - If review finds issues → review reopens tasks (marks them `[ ]` again or adds new ones), resets `$script:allTasksMarkedDone`, and the loop continues with a forced re-plan

This ensures the review phase is the **only** path to a clean exit when the mode includes review.

### State machine

```
build marks all [x] → set flag, DO NOT EXIT
    ↓
forced review runs
    ↓
review approves?
  YES → exit 0, state=completed
  NO  → review reopens/adds tasks → reset flag → force plan → continue loop
```

### Edge cases

- **Review-only mode** (`-Mode review`): No build phase exists, so this invariant doesn't apply. The single review runs and exits.
- **Build-only mode** (`-Mode build`): No review phase exists. Current behavior (exit on all tasks done) is correct for this mode.
- **Plan-build mode** (`-Mode plan-build`): No review phase. Current behavior is acceptable, but consider adding a final plan phase to verify completeness.
- **Steering mid-flight**: If steering arrives while `allTasksMarkedDone` is set, the steer phase takes priority, the flag resets, and the loop continues normally.
- **Builder re-marks after review reopen**: The flag can be set again after a review reopen. The same cycle repeats — forced review runs again.

### Implementation notes

- New script-scoped flag: `$script:allTasksMarkedDone = $false`
- New script-scoped flag: `$script:forceReviewNext = $false`
- In `Resolve-IterationMode`: if `$script:forceReviewNext` is set, return `'review'` and clear the flag
- In the build completion check: instead of `exit 0`, set both flags and `continue`
- The review prompt (`PROMPT_review.md`) must already instruct the reviewer to reopen tasks or add new ones if quality gates fail — verify this is the case
- Log events: `tasks_marked_complete` (build), `final_review_approved` (review exits), `final_review_rejected` (review reopens tasks)

### Acceptance Criteria

- [ ] In `plan-build-review` mode, loop NEVER exits during a build phase due to all tasks being marked complete
- [ ] When all tasks are marked done in build, the next iteration is a forced review
- [ ] Review approval is the only path to `state: "completed"` exit in `plan-build-review` mode
- [ ] Review can reopen/add tasks, causing the loop to continue with a forced re-plan
- [ ] In `build`-only mode, current early-exit behavior is preserved (no review exists)
- [ ] Steering takes priority over the `forceReviewNext` flag
- [ ] `tasks_marked_complete`, `final_review_approved`, and `final_review_rejected` events are logged

---

## Phase Advancement Only on Success (Retry-Same-Phase)

### Problem

The current loop advances the phase cycle on every iteration regardless of success or failure. In `plan-build-review` mode (cycle: plan → build × 3 → review), if iteration 1 (plan) fails, iteration 2 becomes build — but no plan/TODO.md exists. The build phase flies blind, produces unstructured work, and the loop wastes iterations.

**Current behavior (broken):**
```
iter 1: claude  plan   → FAIL (exit code 1)
iter 2: codex   build  → no TODO.md exists, builds blind
iter 3: gemini  build  → still no plan, random work
iter 4: copilot build  → still no plan
iter 5: claude  review → reviews unplanned work
```

**Correct behavior:**
```
iter 1: claude  plan   → FAIL
iter 2: codex   plan   → retry same phase, different provider
iter 3: gemini  plan   → SUCCESS, TODO.md created
iter 4: copilot build  → NOW advance (plan exists)
iter 5: claude  build  → continues building
```

### Design

#### Rule 1: Failed iterations do not advance the phase cycle

The cycle position (`($iteration - 1) % 5` in plan-build-review) must be tracked independently from the iteration counter. A new variable `$script:cyclePosition` tracks where we are in the phase cycle. It only increments on successful iterations.

```
$script:cyclePosition = 0   # starts at plan

Resolve-IterationMode:
  if forced flags (steer, review, plan) → return those, don't touch cyclePosition
  else → return phase from cycle[$script:cyclePosition % cycleLength]

On iteration SUCCESS:
  $script:cyclePosition++

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
        if (-not $script:hasBuildsToReview) {
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
| **Forced flags** (`forcePlanNext`, `forceReviewNext`) | Take priority over cycle position. When a forced flag fires, the phase overrides regardless of cycle position. Cycle position is NOT advanced. |
| **Steering** | Sets `forcePlanNext` after steer phase. Cycle position resets to 0 (plan) so the new plan reflects the steering. |
| **Stuck detection** | Stuck count tracks task-level stuck, not phase-level. A phase repeatedly failing with different providers is a different problem — after all providers fail the same phase, log `phase_all_providers_failed` and advance anyway (avoid infinite retry). |
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
- [ ] Forced flags (`forcePlanNext`, `forceReviewNext`, steering) override cycle position
- [ ] Steering resets cycle position to 0 (plan)
- [ ] After `MAX_PHASE_RETRIES` consecutive failures on same phase, advance anyway with `phase_retry_exhausted` log
- [ ] Both `loop.ps1` and `loop.sh` implement the same retry-same-phase semantics

---

## Parallel Orchestrator Mode (Fan-Out via GitHub Issues)

### Concept

A new meta-loop mode that decomposes a spec into GitHub issues, launches independent child loops per issue (each in its own worktree/branch), reviews the resulting PRs against hard proof criteria, and merges approved work into an agent-driven trunk branch. The human promotes agent/trunk to main when satisfied.

This turns the existing single-loop architecture into a **fan-out/fan-in** pattern:

```
                           SPEC.md
                              │
                      ┌───────┴───────┐
                      │  ORCHESTRATOR  │   meta-loop
                      │  plan + split  │
                      └───────┬───────┘
                              │
                creates GH issues from spec
                              │
              ┌───────┬───────┼───────┬───────┐
              ▼       ▼       ▼       ▼       ▼
           Issue#1  Issue#2  Issue#3  Issue#4  Issue#5
              │       │       │       │       │
           loop-1  loop-2  loop-3  loop-4  loop-5
          (worktree)(worktree) ...  (each plan-build-review)
              │       │       │       │       │
            PR#1    PR#2    PR#3    PR#4    PR#5
              │       │       │       │       │
              └───────┴───────┼───────┴───────┘
                              │
                      ┌───────┴───────┐
                      │  ORCHESTRATOR  │
                      │  review+merge  │
                      └───────┬───────┘
                              │
                       agent/trunk branch
                              │
                      (human promotes to main)
```

### Orchestrator Lifecycle

#### Phase 1: Plan + Split

The orchestrator reads the spec and decomposes it into GitHub issues.

1. Read `SPEC.md` (or a spec file specified in config)
2. Invoke an agent (plan prompt) to decompose the spec into discrete work units
3. Build a **dependency graph** — which issues can run in parallel vs which must be sequential
4. Assign **concurrency waves**:
   - Wave 1: independent issues (no file overlap, no logical dependency)
   - Wave 2: depends on wave 1 outputs
   - Wave N: depends on wave N-1
5. Create issues on GitHub via `gh issue create`:
   - Title: concise work unit description
   - Body: spec excerpt, acceptance criteria, scope boundaries, file ownership hints
   - Labels: `aloop/auto`, `aloop/wave-1`, priority label
   - Milestone: links to the spec version / session

```bash
gh issue create \
  --title "Implement provider health subsystem in loop.ps1" \
  --body "$(cat issue-body.md)" \
  --label "aloop/auto,aloop/wave-1,P1" \
  --milestone "v0.2"
```

#### Phase 2: Dispatch

The orchestrator picks up open issues and launches child loops.

1. Query: `gh issue list --label aloop/auto --state open --json number,title,labels`
2. Filter to current wave (only dispatch wave N when wave N-1 is fully merged)
3. For each issue (up to **concurrency cap**):
   - Create branch: `aloop/issue-<number>`
   - Create worktree: `~/.aloop/sessions/<session-id>/worktrees/issue-<number>/`
   - Seed the child's `TODO.md` from the issue body
   - Launch child loop (`loop.ps1` in `plan-build-review` mode)
   - Track child PID + session in orchestrator state
4. Remaining issues queue until a slot opens

**Concurrency cap**: Configurable, default 3. Prevents provider saturation. Works with the provider health subsystem — if providers are in cooldown, child loops naturally pause.

#### Phase 3: Monitor

The orchestrator polls child loop status continuously.

1. Read each child's `status.json` for state (running, completed, stuck, limit_reached)
2. Detect stuck children (stuck_count >= threshold) → options:
   - Reassign to different provider
   - Add steering instruction
   - Kill and reassign to a new loop
3. Detect completed children → child creates PR automatically:
   ```bash
   gh pr create \
     --base agent/trunk \
     --head aloop/issue-<number> \
     --title "Issue #<number>: <title>" \
     --body "Closes #<number>\n\n<auto-generated summary>"
   ```
4. Detect failed children → log, optionally retry with different provider mix
5. When a slot opens → dispatch next queued issue

#### Phase 4: Review + Merge

The orchestrator reviews each PR against hard proof criteria before merging.

**Automated gates (must all pass):**

| Gate | Method | Fail action |
|------|--------|-------------|
| CI pipeline | `gh pr checks <number> --watch` | Block merge |
| Test coverage | Parse coverage report from CI artifacts | Block if below threshold |
| No merge conflicts | `gh pr view <number> --json mergeable` | Send back to child loop for rebase |
| No spec regression | `grep`-based contract checks | Block merge |
| Screenshot diff (UI) | Playwright visual comparison before/after | Flag for human review if delta > threshold |
| Lint / type check | CI step | Block merge |

**Agent review gate:**
- Invoke an agent with the review prompt against the PR diff (`gh pr diff <number>`)
- Agent checks: code quality, spec compliance, no scope creep, test adequacy
- Agent outputs: approve, request-changes, or flag-for-human

**Merge strategy:**
- Squash merge into `agent/trunk`: `gh pr merge <number> --squash --delete-branch`
- If merge conflict: reopen the issue, child loop rebases and re-submits
- After merge: next wave issues may become unblocked

#### Phase 5: Complete

1. All issues closed, all PRs merged to `agent/trunk`
2. Generate orchestrator report:
   - Issues created / completed / failed
   - Total time, provider usage breakdown
   - Coverage delta (before/after)
   - File change summary
3. Notify human (or just leave `agent/trunk` ready for review)

### Issue Granularity

Issues are **feature-level**, not task-level:

| Level | Where | Example |
|-------|-------|---------|
| Spec | `SPEC.md` | "Implement provider health subsystem" |
| Issue | GitHub Issue | "Add per-provider health files with exponential backoff" |
| Task | Child's `TODO.md` | "Create `Update-ProviderHealth` function with file locking" |

The orchestrator creates issues. Each child loop creates its own `TODO.md` tasks within its issue scope.

### Dependency Graph + Wave Scheduling

The orchestrator's planner identifies dependencies between issues:

```yaml
issues:
  - id: 1
    title: "Rename ralph → aloop directory tree"
    wave: 1
    files: ["aloop/**", "install.ps1"]

  - id: 2
    title: "Implement aloop resolve CLI"
    wave: 2
    depends_on: [1]
    files: ["aloop/cli/**"]

  - id: 3
    title: "Add provider health to loop.ps1"
    wave: 1          # no dependency on rename
    files: ["aloop/bin/loop.ps1"]

  - id: 4
    title: "Dashboard E2E tests"
    wave: 1          # independent
    files: ["aloop/cli/dashboard/e2e/**"]
```

Wave scheduling rules:
- Issues in the same wave MAY run in parallel
- Wave N+1 issues only dispatch after ALL wave N issues are merged
- File ownership hints help the planner avoid overlapping scopes
- If two issues in the same wave touch the same files → move one to the next wave

### Agent/Trunk Branch

- Created at orchestrator start: `git checkout -b agent/trunk main`
- All child PRs target `agent/trunk` (never main)
- Human reviews `agent/trunk` periodically and promotes to main via PR or fast-forward
- Benefits:
  - Agent velocity isn't blocked by human review cadence
  - Main stays clean — no half-baked agent work
  - Human can cherry-pick from `agent/trunk` if needed
  - Easy rollback: just delete `agent/trunk` and recreate from main

### Orchestrator State

Stored at `~/.aloop/sessions/<orchestrator-session-id>/orchestrator.json`:

```json
{
  "spec_file": "SPEC.md",
  "trunk_branch": "agent/trunk",
  "concurrency_cap": 3,
  "current_wave": 1,
  "issues": [
    {
      "number": 42,
      "title": "Implement provider health subsystem",
      "wave": 1,
      "state": "merged",
      "child_session": "ralph-skill-20260227-issue42",
      "pr_number": 15,
      "depends_on": []
    },
    {
      "number": 43,
      "title": "Add aloop status CLI subcommand",
      "wave": 2,
      "state": "in_progress",
      "child_session": "ralph-skill-20260227-issue43",
      "pr_number": null,
      "depends_on": [42]
    }
  ],
  "completed_waves": [1],
  "created_at": "2026-02-27T12:00:00Z"
}
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
| `loop.ps1` | Child loop — unchanged, runs per-issue |
| Provider health subsystem | Shared across all child loops via `~/.aloop/health/` |
| Final review gate | Per-child — each child's loop has its own review gate |
| `PROMPT_{plan,build,review}.md` | Used by child loops as-is |
| `active.json` | Tracks all child sessions (orchestrator + children) |
| Steering (`STEERING.md`) | Can steer individual children or the orchestrator |
| `aloop status` | Shows orchestrator + children in a tree view |

### Acceptance Criteria

- [ ] Orchestrator can decompose a spec into GitHub issues with dependency graph and wave assignment
- [ ] Issues are created via `gh issue create` with `aloop/auto` label and wave labels
- [ ] Child loops are launched per-issue, each in its own worktree and branch
- [ ] Concurrency cap limits simultaneous child loops (default 3)
- [ ] Child loops create PRs targeting `agent/trunk` on completion
- [ ] Orchestrator reviews PRs against automated gates (CI, coverage, conflicts, lint)
- [ ] Orchestrator runs agent review on PR diffs
- [ ] Approved PRs are squash-merged into `agent/trunk`
- [ ] Rejected PRs reopen their issue with review comments for the child loop to address
- [ ] Merge conflicts trigger automatic rebase attempts (max 2 before human flag)
- [ ] Wave N+1 only dispatches after all wave N issues are merged
- [ ] `aloop orchestrate --plan-only` creates issues without launching loops
- [ ] Orchestrator state is persisted in `orchestrator.json`
- [ ] `aloop status` shows orchestrator tree (orchestrator → children → issues → PRs)
- [ ] Final report includes: issues created/completed/failed, time, provider usage, cost estimates
- [ ] Provider health subsystem is shared across all child loops (file-lock safe)
- [ ] Session-level budget cap can pause dispatch when threshold is approached

---

## Security Model: Trust Boundaries & GH Access Control

### Principle

Agents are untrusted. The aloop CLI is the single trust boundary. Agents never have direct access to GitHub APIs, network endpoints, or the `gh` CLI. All external operations flow through the harness, which delegates to `aloop gh` — a policy-enforced subcommand of the aloop CLI.

### Trust Layers

```
┌──────────────────────────────────────────────┐
│  LAYER 1: HOST (where harness runs)          │
│                                              │
│  loop.ps1 / orchestrator.ps1 (harness)       │
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
│    └─ .aloop/requests/ (write intent)        │
│       .aloop/responses/ (read results)       │
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

Agents communicate GH intent via filesystem — the only interface that crosses all sandbox boundaries (Docker volumes, bind mounts, NFS, etc.).

**Request files** (agent writes):
```
<worktree>/.aloop/requests/
  001-pr-create.json
  002-issue-comment.json
```

```json
{
  "type": "pr-create",
  "title": "Issue #42: Add provider health subsystem",
  "body": "Closes #42\n\nImplemented per-provider health files...",
  "labels": ["aloop/auto"]
}
```

**Response files** (harness writes):
```
<worktree>/.aloop/responses/
  001-pr-create.json
```

```json
{
  "status": "success",
  "pr_number": 15,
  "url": "https://github.com/owner/repo/pull/15"
}
```

**Protocol rules:**
- Sequential numbering (`001-`, `002-`) preserves ordering
- Harness reads requests at iteration boundaries (same timing as steering checks)
- Harness writes responses before next agent iteration starts
- Request files are archived after processing (moved to `.aloop/requests/processed/`)
- Unrecognized request types are rejected and logged

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
- [ ] Agents communicate GH intent exclusively via `.aloop/requests/` convention files
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

### Problem

The orchestrator assumes issues are fully specified at creation time. In reality, humans comment on issues mid-flight — asking questions, clarifying scope, requesting changes, or providing feedback on PRs. Without triage, the system either ignores these comments (bad) or a child loop tries to interpret vague feedback on its own (worse — risks misinterpretation and wasted iterations).

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
        │     → inject as steering into child loop (STEERING.md)
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
   - Injects steering into child loop's STEERING.md
   - Child loop resumes on next monitor cycle
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
