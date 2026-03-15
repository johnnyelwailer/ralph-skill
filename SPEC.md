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

## Proof-of-Work Phase

### Concept

A new loop phase (`proof`) where a dedicated agent autonomously decides what evidence to generate for the work completed in the preceding build iterations. The proof agent is not told what to prove via keyword matching or hardcoded rules — it inspects the actual work (TODO.md, commits, changed files, SPEC) and uses its judgment to determine what proof is possible, appropriate, and valuable.

### Phase cycle

```
Previous:  plan → build × 3 → review
New:       plan → build × 3 → proof → review

5-step cycle becomes 6-step:
  0: plan
  1: build
  2: build
  3: build
  4: proof    ← new
  5: review
```

The proof phase runs exactly once per cycle, after builds and before review. It gets its own prompt template (`PROMPT_proof.md`) and its own iteration, just like plan/build/review/steer.

### Proof Agent Behavior

The proof agent has full autonomy over what to prove and how. It receives:

**Input (via prompt + worktree context):**
- `TODO.md` — what tasks were worked on this cycle
- Recent commits — what files changed and why
- `SPEC.md` — what acceptance criteria exist
- Available tooling — what's installed (Playwright, curl, node, etc.)
- Previous proof baselines — what the app looked like before (if any)

**The agent decides:**

1. **What needs proof** — inspects the work and determines which deliverables have provable, observable output. Could be UI screenshots, API responses, CLI output captures, test result summaries, build artifacts, accessibility reports — whatever is appropriate.

2. **What proof is possible** — considers what tooling is available. If Playwright is installed and there's a frontend, screenshots are possible. If it's a CLI tool, output captures. If it's a library, test output. If nothing is provable (pure refactoring, config changes), the agent says "nothing to prove" and the phase completes as a skip.

3. **How to generate it** — the agent runs the actual commands: launches servers, runs Playwright, captures screenshots, diffs against baselines, saves artifacts. It uses whatever tools make sense.

4. **What to skip** — not everything needs proof. The agent explicitly notes what it chose not to prove and why.

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

**Non-image artifacts**: API responses, CLI output, test summaries render as syntax-highlighted code blocks.

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
- Generate artifacts, save to `<session-dir>/artifacts/iter-<N>/`
- Write `proof-manifest.json`
- If nothing to prove, write manifest with empty artifacts and explanations in skipped

The prompt does NOT prescribe what types of proof to generate or what tools to use — that's the agent's judgment call.

### Acceptance Criteria

- [ ] Proof is a first-class phase in the loop cycle, with its own `PROMPT_proof.md` template
- [ ] Phase cycle in `plan-build-review` mode becomes: plan → build × 3 → proof → review (6-step)
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

## CLAUDECODE Environment Variable Sanitization

### Problem

When aloop is invoked from inside a Claude Code session (which is the normal case — user types `/aloop:start` in Claude Code), the `CLAUDECODE` env var is set. This causes the Claude CLI provider to refuse to start: "Claude Code cannot be launched inside another Claude Code session." Currently only the repo's `ralph/bin/loop.ps1` has a manual `$env:CLAUDECODE = $null` at line 50. The worktree's renamed `aloop/bin/loop.ps1`, `aloop/bin/loop.sh`, and the aloop CLI itself all lack this fix.

### Design

Unset `CLAUDECODE` in every process entry point that may launch provider CLIs:

| Location | Fix |
|----------|-----|
| `aloop/bin/loop.ps1` | `$env:CLAUDECODE = $null` at script top |
| `aloop/bin/loop.sh` | `unset CLAUDECODE` at script top |
| `aloop/cli/aloop.mjs` | `delete process.env.CLAUDECODE` at entry |
| `Invoke-Provider` (loop.ps1) | Also unset in the provider invocation block (defense-in-depth, in case something re-sets it) |
| `invoke_provider` (loop.sh) | Same — `unset CLAUDECODE` before each provider call |

### Acceptance Criteria

- [ ] `CLAUDECODE` is unset at the top of `aloop/bin/loop.ps1`
- [ ] `CLAUDECODE` is unset at the top of `aloop/bin/loop.sh`
- [ ] `CLAUDECODE` is deleted from `process.env` at `aloop/cli/aloop.mjs` entry
- [ ] `Invoke-Provider` in loop.ps1 unsets `CLAUDECODE` before each provider call (defense-in-depth)
- [ ] `invoke_provider` in loop.sh unsets `CLAUDECODE` before each provider call (defense-in-depth)
- [ ] Loop launched from inside a Claude Code session can successfully invoke the `claude` provider

---

## UX Improvements: Dashboard, Start Flow, Auto-Monitoring

### Problem

After global install, the end-to-end experience has significant UX gaps:

1. **No `/aloop:dashboard` command** — the dashboard exists as `aloop dashboard` CLI but agents can't discover or invoke it. No command file, no copilot prompt.
2. **Start flow is agent-orchestrated, not CLI-driven** — `/aloop:start` is a 7-step flow where the agent manually creates dirs, copies prompts, creates worktrees, and assembles a `loop.ps1` invocation with ~10 flags. There's no single `aloop start` CLI command.
3. **No auto-monitoring on loop start** — when a loop starts, nothing happens visually. No dashboard opens, no terminal pops up. The user has to manually run `/aloop:status` to check progress.
4. **Dashboard UI is rudimentary** — basic tabs per session, minimal content per view, no information density, underuses shadcn/ui component library.

### Design

#### 1. `aloop start` CLI subcommand

Move the entire start orchestration into the CLI so it's a single command:

```bash
aloop start [--mode plan-build-review] [--provider round-robin] [--max 30] [--in-place]
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

The agent command `/aloop:start` becomes a thin wrapper that calls `aloop start` with the right flags. No more 7-step orchestration.

#### 2. `aloop setup` CLI subcommand

Similarly, move the setup/scaffold flow into a single interactive CLI:

```bash
aloop setup [--spec SPEC.md] [--providers claude,codex] [--non-interactive]
```

Interactive mode:
1. Run `aloop discover`
2. Prompt user for spec file, providers, validation level
3. Run `aloop scaffold` with gathered options
4. Print confirmation

Non-interactive mode (for CI/automation):
- All options passed as flags, no prompts

#### 3. Auto-monitoring popup on loop start

When `aloop start` launches a loop, it should automatically open a monitoring window:

**Option A: Dashboard auto-launch (preferred)**
```
aloop start
  → spawns loop.ps1 in background
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
  → spawns loop.ps1 in background
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

#### 5. Multi-session switching (left sidebar)

The current dashboard has a sessions sidebar that renders session cards, but it's non-functional — no click handler, no session switching. The backend is also single-session (bound to one `--session-dir` at startup).

**Backend changes:**
- Dashboard server reads `~/.aloop/active.json` on startup to discover all sessions
- New API: `GET /api/state?session=<id>` — returns state for any session
- New SSE: `GET /events?session=<id>` — reconnects live stream to a different session
- Server watches `active.json` for new/removed sessions (auto-updates sidebar)
- Default: serves the session it was launched for, but can switch to any active session

**Frontend changes:**
- Session cards in sidebar get `onClick` → sets `selectedSessionId` state
- Selected session highlighted with ring/border
- Switching session: refetch `/api/state?session=<id>`, reconnect SSE to `/events?session=<id>`
- Session cards show: project name, iteration N/max, phase badge (color-coded), state badge, elapsed time
- Active sessions at top, recent/completed sessions below (dimmed)
- Running sessions show a pulsing indicator

**Layout with sidebar:**
```
┌──────────────┬──────────────────────────────────────────────┐
│  Sessions    │  Header: session name, iter, phase, progress │
│              ├──────────────────────────────────────────────┤
│  ● cal-v2    │                                              │
│    iter 7/30 │  Main content area                           │
│    build     │  (TODO + Log + Health + Commits)             │
│              │                                              │
│  ○ ralph-sk  │                                              │
│    completed │                                              │
│    115 iters │                                              │
│              │                                              │
│  ○ api-svc   │                                              │
│    iter 3/20 │                                              │
│    plan      ├──────────────────────────────────────────────┤
│              │  Steer: [                        ] Send      │
│              │  [ Stop ]                                    │
└──────────────┴──────────────────────────────────────────────┘
```

#### 6. Dashboard UI redesign

The current dashboard uses basic shadcn components with tabs per section. Redesign for information density:

**Layout: Single-page dense view (no tab switching for core info)**

```
┌─────────────────────────────────────────────────────────────┐
│  🔄 Session: cal-v2-20260302  │  iter 7/30  │  ■■■■□ 23%  │
│  Provider: codex (healthy)     │  Phase: build │  3m ago    │
├──────────────────────────┬──────────────────────────────────┤
│  TODO.md (live)          │  Log (live, auto-scroll)         │
│                          │                                  │
│  ✅ Setup base component │  19:53 plan   claude  ✗ exit 1  │
│  ✅ Add state management │  19:54 build  codex   ✓ 2fb5095 │
│  🔨 Wire API integration │  19:58 build  gemini  ✗ model   │
│  ☐ Add error handling    │  20:02 build  copilot ✓ a3f1bc2 │
│  ☐ Write tests           │  20:06 review codex   ✓ approve │
│  ☐ Update docs           │  20:10 build  claude  ✓ 8bc4d21 │
│                          │                                  │
├──────────────────────────┼──────────────────────────────────┤
│  Provider Health         │  Recent Commits                  │
│                          │                                  │
│  claude  ● healthy  2m   │  8bc4d21 feat: wire API calls    │
│  codex   ● healthy  1m   │  a3f1bc2 fix: null check on resp │
│  gemini  ◐ cooldown 8m   │  2fb5095 feat: add state mgmt   │
│  copilot ● healthy  4m   │  1a2b3c4 chore: initial plan    │
│                          │                                  │
├──────────────────────────┴──────────────────────────────────┤
│  Steer: [                                            ] Send │
│  [ Stop Session ]                                           │
└─────────────────────────────────────────────────────────────┘
```

**Key changes from current dashboard:**
- **No tab switching for core info** — TODO, log, health, commits all visible simultaneously
- **Live TODO.md** — rendered inline with checkboxes, current task highlighted
- **Compact log** — one line per iteration: timestamp, phase, provider, result (✓/✗), commit hash or error
- **Provider health badges** — inline colored dots, time since last success
- **Recent commits** — scrolling list with hash + subject
- **Steer input** — always visible at bottom, not hidden in a tab
- **Progress bar** — visual at top showing tasks completed percentage
- **Phase indicator** — color-coded (plan=purple, build=yellow, review=cyan)

**Advanced shadcn components to use:**
- `Sheet` / `Drawer` — for expanded log view or full commit diff
- `Collapsible` — for TODO sections (In Progress / Up Next / Completed)
- `Progress` — for task completion bar
- `HoverCard` — hover on commit hash to see diff summary
- `Tooltip` — hover on provider health for failure details
- `Command` (cmdk) — keyboard-driven steer/stop actions
- `Sonner` (toast) — notifications for phase transitions, stuck alerts
- `ResizablePanel` — user can resize the TODO vs Log panels
- `ScrollArea` — smooth scrolling for log and commits

**Real-time updates via SSE:**
- TODO.md changes → re-render task list
- New log entry → append to log panel, auto-scroll
- Provider health change → update badge
- New commit → prepend to commits list
- Phase transition → update header, flash indicator
- Stuck alert → toast notification

### Acceptance Criteria

- [ ] `aloop start` CLI command handles full session setup + loop launch in a single invocation
- [ ] `aloop setup` CLI command handles interactive config creation in a single invocation
- [ ] `aloop start` auto-launches dashboard and opens browser (configurable via `on_start` in config.yml)
- [ ] `/aloop:start` agent command delegates to `aloop start` CLI (thin wrapper)
- [ ] `/aloop:setup` agent command delegates to `aloop setup` CLI (thin wrapper)
- [ ] `/aloop:dashboard` command file exists in `claude/commands/aloop/`
- [ ] `aloop-dashboard.prompt.md` exists in `copilot/prompts/`
- [ ] Dashboard shows TODO, log, health, commits, steer in a single dense view (no tabs for core info)
- [ ] Dashboard updates in real-time via SSE for all state changes
- [ ] Dashboard uses advanced shadcn components (ResizablePanel, HoverCard, Collapsible, Command, Sonner)
- [ ] Steer input is always visible (not behind a tab)
- [ ] Progress bar and phase indicator visible in dashboard header
- [ ] `aloop status --watch` provides terminal-based live monitoring (auto-refresh)

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

### Orchestrator State — GitHub-Native (Projects V2)

**GitHub is the source of truth.** The orchestrator uses a Projects V2 board with a custom Status field as its state machine. Local state is minimal — just PID tracking.

#### Prerequisites

The `gh` CLI must have `project` scope. The setup skill detects and prompts:
```bash
gh auth status 2>&1 | grep -q 'project' || gh auth refresh -s project
```

#### Projects V2 Status Field (custom single-select)

| Status | Color | Orchestrator meaning |
|--------|-------|---------------------|
| Backlog | GRAY | Decomposed, not yet scheduled |
| Todo | GREEN | Scheduled in current wave |
| In Progress | YELLOW | Child loop actively working |
| Blocked | RED | Waiting on dependency or human |
| In Review | BLUE | PR created, under review |
| Done | PURPLE | PR merged |

Statuses are created/updated via GraphQL `updateProjectV2Field` mutation with `singleSelectOptions` array. Options matched by **name** (IDs regenerate on update — always re-read after mutation).

Available colors: `GRAY`, `BLUE`, `GREEN`, `YELLOW`, `ORANGE`, `RED`, `PINK`, `PURPLE`

#### Moving issues between statuses

```graphql
mutation {
  updateProjectV2ItemFieldValue(input: {
    projectId: "<project-node-id>"
    itemId: "<item-node-id>"
    fieldId: "<status-field-id>"
    value: { singleSelectOptionId: "<option-id>" }
  }) { projectV2Item { id } }
}
```

CLI: `gh project item-edit --project-id <id> --id <item-id> --field-id <field-id> --single-select-option-id <opt-id>`

#### Dependencies (native, GA)

- `addBlockedBy(input: {issueId, blockingIssueId})` / `removeBlockedBy` — GraphQL mutations
- Query: `issue { blockedBy(first:50) { nodes { number } } blocking(first:50) { nodes { number } } }`
- REST: `/repos/{o}/{r}/issues/{n}/issue-dependencies`
- Limit: 50 per relationship type per issue
- Search: `is:blocked`, `blocking:<n>`

#### Sub-issues (native, GA, all plans)

- 50 sub-issues/parent, 8 nesting levels
- GraphQL: `addSubIssue(input: {issueId, subIssueId})`, `removeSubIssue`, `reprioritizeSubIssue`
- Query: `issue { subIssues(first:50) { nodes { number state } } parent { number } }`

#### Minimal local state

Stored at `~/.aloop/sessions/<orchestrator-session-id>/sessions.json`:

```json
{
  "project_id": "PVT_kwHOAA0LoM4BRU99",
  "status_field_id": "PVTSSF_lAHOAA0LoM4BRU99zg_MBM8",
  "status_options": {"Backlog": "abc123", "Todo": "def456", "In Progress": "ghi789", "Blocked": "jkl012", "In Review": "mno345", "Done": "pqr678"},
  "issues": {
    "42": {"session_id": "ralph-skill-20260227-issue42", "pid": 12345, "item_id": "PVTI_abc"},
    "43": {"session_id": "ralph-skill-20260227-issue43", "pid": null, "item_id": "PVTI_def"}
  }
}
```

Everything else (issue state, status, labels, dependencies, PRs) is queried from GitHub on demand.

#### Efficient polling

- **ETag**: `GET /repos/{o}/{r}/issues` returns `Etag` header; `304 Not Modified` is free (no rate limit cost)
- **`since` param**: filter to issues updated after a timestamp
- **GraphQL**: single query for all project items + statuses + dependencies ≈ 172 points (budget: 5,000/hr)
- **Webhooks** (optional): `issues`, `sub_issues`, `projects_v2_item`, `pull_request` events

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
- [ ] Orchestrator state uses GitHub Projects V2 as source of truth with minimal local `sessions.json`
- [ ] `aloop status` shows orchestrator tree (orchestrator → children → issues → PRs)
- [ ] Final report includes: issues created/completed/failed, time, provider usage, cost estimates
- [ ] Provider health subsystem is shared across all child loops (file-lock safe)
- [ ] Session-level budget cap can pause dispatch when threshold is approached

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
6. Run loop (plan-build-review)
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
3. **Resume loop** — inject as STEERING.md, resume the loop on the PR branch
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
- Request files are archived after processing (moved to `.aloop/requests/processed/`)
- Unrecognized request types are rejected and logged

### Architecture: Keep loop scripts lean — GH/steering/requests are host-side plugins

**Critical design rule:** `loop.ps1` and `loop.sh` must NOT contain convention-file processing, GH logic, or any host-only operations directly. The loop scripts run inside containers and must stay minimal: iterate phases, invoke providers, write status/logs, detect stuck. That's it.

All host-side operations (GH requests, steering injection, dashboard, request processing) are handled by the **aloop host monitor** — a separate process that runs alongside the loop on the host:

```
┌─── Host ──────────────────────────────────────────────┐
│                                                        │
│  aloop start                                           │
│    ├── loop.ps1/sh (may run in container)              │
│    │     └── just: plan/build/review + provider invoke │
│    │                                                   │
│    └── aloop monitor (host-side, always on host)       │
│          ├── watches .aloop/requests/ → aloop gh       │
│          ├── watches STEERING.md → injects into loop   │
│          ├── serves dashboard                          │
│          ├── processes convention-file protocol         │
│          └── manages provider health (cross-session)   │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**What stays in loop.ps1/loop.sh:**
- Phase cycle (plan → build × 3 → proof → review)
- Provider invocation (direct — loop and providers run in the same environment)
- Stuck detection and iteration counting
- Status.json and log.jsonl writes
- TODO.md reading for phase prerequisites
- PATH hardening (defense in depth, even though container already isolates)

**Execution model:** The loop script and provider CLIs always run in the same environment. When containerized, `aloop start` on the host launches the loop **inside** the container via `devcontainer exec -- loop.sh ...`. From that point, the loop invokes providers directly (they're co-located). The loop never calls `devcontainer exec` itself — that's the host's job.

**What moves to aloop monitor (host-side):**
- Convention-file request processing (`.aloop/requests/` → `aloop gh` → `.aloop/responses/`)
- Steering file detection and injection
- Dashboard server
- Provider health file management (already cross-session)
- Session lifecycle (start, stop, cleanup)

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

### Triage State (in local sessions.json)

```json
{
  "issues": {
    "42": {
      "session_id": "ralph-skill-20260227-issue42",
      "pid": 12345,
      "item_id": "PVTI_abc",
      "last_comment_check": "2026-02-27T12:00:00Z",
      "blocked_on_human": false
    }
  }
}
```

Triage decisions are logged to `log.jsonl` (not duplicated in local state). The `blocked_on_human` flag maps to the `Blocked` status in the Projects V2 board and the `aloop/blocked-on-human` label on the issue.

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
- [ ] All triage decisions are logged in `log.jsonl` and optionally in `sessions.json` triage_log
- [ ] Triage agent uses `aloop gh` for all GH operations (subject to orchestrator policy)

---

## Devcontainer Support (Priority: P1)

### Goal

Enable aloop loops to run inside VS Code devcontainers for full isolation. Provide a skill (`/aloop:devcontainer`) that generates a project-tailored `.devcontainer/` config, verifies it builds and starts, and confirms all loop dependencies are available inside the container.

### Why P1

- Security boundary: devcontainer is the natural sandbox for Layer 2 (agent execution) — agents can't access host GH tokens, filesystem, or network beyond what's mounted
- Reproducibility: identical environment across machines, no "works on my machine" provider/tool version drift
- Required for convention-file protocol: the harness runs on host, the agent runs in container, `.aloop/requests/` and `.aloop/responses/` cross the boundary via bind mount

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
│    ├── processes .aloop/requests/ (convention-file)     │
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
- `.aloop/requests/` and `.aloop/responses/` are per-session — no cross-contamination

### `aloop start` with Devcontainer (automatic)

1. Harness detects `.devcontainer/devcontainer.json` in project root
2. If container not running → `devcontainer up --workspace-folder .`
3. Harness creates session, worktree (on host)
4. Harness runs loop iterations, wrapping each provider call in `devcontainer exec`
5. Host monitors `status.json` directly (host filesystem)
6. Host processes `.aloop/requests/*.json` (convention-file protocol)
7. Dashboard runs on host, reads session data from host filesystem

### Provider Auth in Container

**Principle: if you're authenticated on the host, it should just work in the container. Zero manual config.**

All providers support authentication via environment variables. The skill auto-detects the host's auth state for each activated provider and generates `remoteEnv` entries to forward credentials into the container. The user should never have to manually configure container auth.

**Auto-detection flow (runs during devcontainer setup/verification):**

For each activated provider, the skill checks the host for existing auth and sets up forwarding automatically:

1. **Check env vars first** — if the provider's env var is already set on the host (e.g., `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`), add it to `remoteEnv` with `${localEnv:...}`. Done.
2. **Check CLI auth state** — if no env var but the CLI is authenticated (e.g., `claude` has an active OAuth session), extract or generate a portable token automatically:
   - Claude Code: run `claude setup-token` to generate a 1-year headless token, save it to a host-side env var or `.env` file, and reference via `remoteEnv`
   - gh CLI: run `gh auth token` to extract the current token, set as `GH_TOKEN`
   - Other providers: check their respective auth status commands
3. **Prompt only as last resort** — if neither env var nor CLI auth exists, guide the user through the minimal setup (e.g., "Run `claude setup-token` and paste the result" or "Set OPENAI_API_KEY").

Only activated providers get forwarded — never expose unused credentials.

#### Per-Provider Auth

| Provider | Env var(s) | How to obtain | Notes |
|---|---|---|---|
| Claude Code | `CLAUDE_CODE_OAUTH_TOKEN` (preferred) or `ANTHROPIC_API_KEY` | `claude setup-token` (generates 1-year headless token from Pro/Max subscription) or [Anthropic Console](https://console.anthropic.com/) API Keys | See Claude-specific section below. `setup-token` uses existing subscription; `ANTHROPIC_API_KEY` switches to pay-as-you-go. |
| Codex (OpenAI) | `OPENAI_API_KEY` or `CODEX_API_KEY` | [OpenAI Dashboard](https://platform.openai.com/api-keys) | Can also pipe to `codex login --with-api-key` inside container |
| Gemini CLI | `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) | Also supports `.env` file in `~/.gemini/` but env var preferred |
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

#### What NOT to do

- **Do NOT bind-mount `~/.claude/` from host** — use env vars or Docker volume persistence instead
- **Do NOT copy credential files** between host and container — stale token risk, unnecessary duplication
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
- [ ] Provider auth forwarded via `remoteEnv`/`localEnv` only for activated providers (no secrets in config files)
- [ ] For Claude Code: prefers `CLAUDE_CODE_OAUTH_TOKEN` (via `claude setup-token`), falls back to `ANTHROPIC_API_KEY`, guides user if neither is set
- [ ] Verification confirms each activated provider can authenticate inside the container
- [ ] Skill warns if required auth env var is not set on host

**Automatic integration:**
- [ ] Harness auto-detects `.devcontainer/devcontainer.json` and routes provider invocations through `devcontainer exec` — no manual flag needed
- [ ] If container not running, harness starts it automatically via `devcontainer up`
- [ ] Harness itself (loop.ps1/loop.sh) always runs on host, only agent CLIs run inside container
- [ ] Dashboard runs on host and reads session data directly from host filesystem
- [ ] Host processes convention-file requests (`.aloop/requests/`) — agents in container write requests, harness on host fulfills them

**Shared container:**
- [ ] Multiple parallel loops reuse a single running container instance
- [ ] Each loop operates on its own worktree inside the shared container
- [ ] Container is started by first loop, reused by subsequent loops (detect via `devcontainer exec -- echo ok`)
- [ ] No per-loop container startup overhead after the first
- [ ] Session worktrees are accessible inside the container via bind mount of `~/.aloop/sessions/`

---

## Configurable Agent Pipeline (Priority: P2)

The current hardcoded `plan → build × 3 → review` cycle is replaced by a **configurable, runtime-mutable pipeline of agents**. The existing cycle becomes just the default configuration — zero breaking change.

### Core Concept: Agents as the Unit

An **agent** is a named unit with:
- **Prompt** — instructions for what the agent does (a `PROMPT_*.md` file or inline)
- **Provider/model preference** (optional) — which harness and model to use (falls back to session default)
- **Transition rules** — what happens on success, failure, and repeated failure

Agents are NOT hardcoded. `plan`, `build`, `review`, `steer` are just the default agents that ship with aloop. Users and the setup agent can define custom agents (e.g., `verify`, `debugger`, `security-audit`, `docs-generator`, `guard`).

### Pipeline Configuration

The pipeline is a sequence of agent references with transition rules:

```yaml
# Example: default plan-build-review (equivalent to current behavior)
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

### Runtime Mutation

The pipeline is **mutable at runtime** — phases can be added, removed, or reordered while the loop is running. Two control surfaces:

1. **User via steering** — drop a steering file that modifies the pipeline:
   ```markdown
   # STEERING.md
   Insert `security-audit` agent after `build` for remaining iterations.
   Remove `docs-generator` — not needed yet.
   ```
   The host-side monitor interprets steering instructions and updates the pipeline.

2. **Host-side monitor** — observes loop patterns and injects agents automatically:
   - 3 consecutive build failures → inject `debugger` agent before next build
   - Verification failing on environment issues → inject `env-fix` agent
   - Provider consistently timing out → swap to different provider for next agent

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

### Implementation Notes

- Pipeline config lives in `.aloop/pipeline.yml` (or inline in `config.yml`)
- Default pipeline (plan-build-review) is generated if no config exists — backward compatible
- Agent definitions live in `.aloop/agents/` — each is a YAML file with prompt reference, provider preference, transition rules
- The loop script becomes a generic agent runner: read pipeline, resolve next agent, invoke, check transition rules, repeat
- Runtime pipeline mutations are applied via the host-side monitor (same mechanism as steering)
- Pipeline state (current position, escalation counts, mutation history) is persisted in `status.json`
- The parallel orchestrator creates per-slice pipelines — each child loop runs its own pipeline independently

---

## Known Issues & Required Fixes (from field testing)

These issues were discovered when another agent attempted to set up and run aloop on a fresh Windows machine. They must be addressed before aloop can be considered reliably installable.

### 1. loop.ps1 — Fatal parse error on last line

`Write-Host "... ($iteration iterations) ..."` causes a cascading parse failure. PowerShell interprets `($iteration iterations)` as a sub-expression, chokes on `iterations` as an unexpected token, and then reports bogus "missing closing `}`" errors throughout the entire file. The file fails to load at all — no execution happens.

**Fix:** Use `$($iteration)` subexpression syntax to avoid the parentheses-inside-string ambiguity. Applied to repo source but **the installed runtime at `~/.aloop/bin/loop.ps1` may still have the old version** — `install.ps1` must re-copy on next install.

**Note:** This only affects Windows PowerShell 5.1. PowerShell 7 (pwsh) parses it differently but we must support both.

### 2. Claude Code Edit tool corrupts line endings

When Claude Code's Edit tool modifies `loop.ps1`, it writes edited lines with LF-only (`\n`) while the rest of the file uses CRLF (`\r\n`). Windows PowerShell cannot parse files with mixed line endings — it treats LF-only lines as continuation of the previous string, causing "missing string terminator" errors.

Worse: attempting to fix with `Set-Content` can collapse the file into a single line.

**Mitigations needed:**
- [ ] Add `.editorconfig` to repo enforcing `end_of_line = crlf` for `*.ps1` files
- [ ] Consider adding a line-ending self-check at the top of `loop.ps1` that detects and warns about mixed endings
- [ ] `install.ps1` should normalize line endings when copying loop scripts to `~/.aloop/bin/`
- [ ] Document in skill instructions that agents should use `Write` tool (full file) instead of `Edit` for `.ps1` files if line-ending corruption is detected

### 3. Path format mismatch — Git Bash `$HOME` vs PowerShell paths

When launching `loop.ps1` from Git Bash, `$HOME` resolves to `/c/Users/pj/` which PowerShell can't parse. Paths must be Windows-native (`C:\Users\pj\...`).

**Mitigations needed:**
- [ ] `aloop start` skill/CLI must detect the current shell and convert paths to the target script's expected format
- [ ] `loop.ps1` should normalize any POSIX-style paths it receives in its parameters
- [ ] Document that `loop.ps1` must always be invoked with Windows-native paths

### 4. CLAUDECODE env var not unset in loop.sh

When `aloop start` is invoked from within a Claude Code session, the `CLAUDECODE` env var is inherited by child processes. This causes `claude --print` (and potentially other provider CLIs) to fail with "Claude Code cannot be launched inside another Claude Code session."

**Fix:** `unset CLAUDECODE` at the top of `loop.sh` and `Remove-Item Env:CLAUDECODE` at the top of `loop.ps1`. Applied to repo source but **installed runtime may be stale** — must be re-installed.

**Defense in depth:** Also unset per-invocation in `Invoke-Provider` / `invoke_provider` blocks (already done in worktree versions).

### 5. No session locking — multiple loops race on same session files

**Severity: Critical**

Starting a new loop on the same session doesn't detect or kill a previous loop. Both processes write to `log.jsonl`, `status.json`, and `report.md` simultaneously, corrupting all session state. The stale loop consumed its 50 iterations writing garbage while the new loop was blocked on a real provider call.

**Mitigations needed:**
- [ ] On startup, write a PID lockfile (`session.lock`) in `SessionDir`
- [ ] Before starting, check if lockfile exists and if the PID is still alive — if so, either kill it or refuse to start with a clear error
- [ ] On exit (including Ctrl+C and errors), clean up the lockfile in the `finally`/`trap` block
- [ ] Both `loop.ps1` and `loop.sh` must implement this

### 6. Log file never cleared between runs

**Severity: Medium**

`log.jsonl` is append-only across runs. Iteration numbers from run N carry into run N+1, making it impossible to tell which run an entry belongs to.

**Mitigations needed (pick one):**
- [ ] Option A: Add a unique `run_id` field to every log entry (generated at session start, included in all `write_log_entry` calls)
- [ ] Option B: Rotate the log on `session_start` — rename existing `log.jsonl` to `log.jsonl.1` (or timestamped)
- [ ] Whichever approach is chosen, apply to both `loop.ps1` and `loop.sh`

### 7. Zombie child processes never cleaned up

**Severity: High**

When a provider call (`claude`/`codex`/`copilot`) hangs or errors, the child process is never killed. Over multiple iterations, dozens of zombie `claude.exe`, `codex.exe`, `pwsh.exe` processes accumulate, consuming memory and potentially holding file locks.

Current `Invoke-Provider` / `invoke_provider` uses synchronous pipe (`|`) with no timeout and no PID tracking.

**Mitigations needed:**
- [ ] Track the child PID when invoking a provider (use `Start-Process` with `-PassThru` in PS1, `$!` in bash)
- [ ] Implement per-iteration timeout (e.g., `ALOOP_PROVIDER_TIMEOUT` env var, default ~10 minutes) — kill child process tree on timeout
- [ ] On loop exit (`finally`/`trap`), kill all spawned child processes
- [ ] Consider the zombie dashboard process issue too (already partially mitigated by `ALOOP_NO_DASHBOARD` in tests, but production loops need cleanup)

### 8. Installed runtime staleness

The installed runtime at `~/.aloop/bin/` (or `~/.ralph/bin/` on older installs) is copied once during `install.ps1` and never auto-updated. When bugs are fixed in the repo, the installed copy stays broken until the user re-runs `install.ps1`.

**Mitigations needed:**
- [ ] `aloop` CLI should check if installed runtime is older than repo source and warn/offer to update
- [ ] Consider `aloop update` command that re-copies runtime files from repo
- [ ] `install.ps1` should print a version or timestamp so staleness is detectable
- [ ] Loop scripts should log their own version/timestamp at `session_start` for debugging

### 9. No distinction between start, restart, and resume

**Severity: Medium**

The loop always starts at iteration 1 (plan phase). There is no way to resume from where a previous run left off in the cycle. If stopped after `plan → build → review → plan` and restarted, it re-plans instead of continuing to build.

Three session launch modes are needed:

| Mode | Session | TODO/plan | Cycle position | Use case |
|---|---|---|---|---|
| **start** | New session | Fresh (no TODO) | Iteration 1 (plan) | New work from scratch |
| **restart** | Existing session | Keeps existing TODO | Iteration 1 (plan) | Re-plan with existing work (current behavior) |
| **resume** | Existing session | Keeps existing TODO | Continues from last position | Pick up where you left off |

**Mitigations needed:**
- [ ] Add `--mode start|restart|resume` flag (or equivalent) to loop scripts and `/aloop:start` skill
- [ ] **resume**: read `status.json` (already has `iteration` and `phase`), calculate next cycle position, start there
- [ ] **resume**: log the resume point: "Resuming from iteration N (phase: build)"
- [ ] **restart**: current behavior, no changes needed
- [ ] **start**: create new session directory, fresh state
- [ ] All other params (provider, model, max iterations, mode) remain independently overridable regardless of launch mode — e.g., `resume --max-iterations 200` or `restart --provider codex --mode plan-build`
- [ ] Both `loop.ps1` and `loop.sh` must implement this
- [ ] `/aloop:start` and `/aloop:resume` as separate skills, or `/aloop:start` asks which mode
