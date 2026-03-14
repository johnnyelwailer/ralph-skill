# SPEC: Aloop — Autonomous Multi-Provider Coding Agent

## Desired Outcome

Aloop is an autonomous coding agent orchestrator that runs configurable agent pipelines with multi-provider support (Claude, Codex, Gemini, Copilot, OpenCode), a real-time dashboard, GitHub integration, and a parallel orchestrator for complex multi-issue projects. It operates in two modes: **loop** (single-track iterative development) and **orchestrator** (fan-out via GitHub issues with wave scheduling and concurrent child loops). The default pipeline is `plan → build × 3 → proof → review`, but pipelines are fully configurable via agent YAML definitions (see Configurable Agent Pipeline).

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
| Loop scripts (execute compiled pipeline) | Anywhere — containers, sandboxes, CI | `loop.ps1` / `loop.sh` | Shell + git + provider CLI |

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

When the pipeline includes a `review` agent, the loop currently exits as soon as a **build** phase finds all TODO tasks marked `[x]`. This means a builder agent can mark everything done and the loop terminates without a review phase ever validating the work. The review is the gatekeeper — it must always have the final say.

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

**Invariant**: In any pipeline that includes a `review` agent, the loop MUST NOT exit on task completion during a build phase. Instead:

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

- [ ] In any pipeline with a `review` agent, loop NEVER exits during a build phase due to all tasks being marked complete
- [ ] When all tasks are marked done in build, the next iteration is a forced review
- [ ] Review approval is the only path to `state: "completed"` exit in pipelines with a `review` agent
- [ ] Review can reopen/add tasks, causing the loop to continue with a forced re-plan
- [ ] In `build`-only mode, current early-exit behavior is preserved (no review exists)
- [ ] Steering takes priority over the `forceReviewNext` flag
- [ ] `tasks_marked_complete`, `final_review_approved`, and `final_review_rejected` events are logged

---

## Phase Advancement Only on Success (Retry-Same-Phase)

### Problem

The current loop advances the phase cycle on every iteration regardless of success or failure. In the default pipeline (cycle: plan → build × 3 → review), if iteration 1 (plan) fails, iteration 2 becomes build — but no plan/TODO.md exists. The build phase flies blind, produces unstructured work, and the loop wastes iterations.

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

The cycle position (index into the compiled loop plan) must be tracked independently from the iteration counter. A new variable `$script:cyclePosition` tracks where we are in the pipeline. It only increments on successful iterations.

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

### Default pipeline update

```
Previous default:  plan → build × 3 → review  (5-step)
New default:       plan → build × 3 → proof → review  (6-step)
```

The proof agent is added to the default pipeline compiled into `loop-plan.json`. It runs exactly once per cycle, after builds and before review. It gets its own prompt template (`PROMPT_proof.md`) and its own entry in the pipeline config, just like any other agent.

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
- [ ] Default pipeline becomes: plan → build × 3 → proof → review (6-step)
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
aloop start [--pipeline default] [--provider round-robin] [--max 30] [--in-place]
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

**Dual-mode support**: setup must support configuring both loop mode and orchestrator mode. Based on the scope and complexity of the task the user describes, setup should recommend the appropriate mode:

- **Loop mode** (default for simple/single-track work): one spec, one loop, configurable agent pipeline. Best for: single feature, bug fix, focused refactor, small-to-medium scope.
- **Orchestrator mode** (recommended for complex/multi-track work): spec decomposition into parallel issues, wave scheduling, concurrent child loops. Best for: large migrations, multi-component features, greenfield projects with many independent workstreams.

Setup should analyze the spec file (if provided) or the user's description to gauge complexity — number of independent workstreams, estimated issue count, whether parallelism would help — and recommend one mode. The user can override the recommendation.

Interactive mode:
1. Run `aloop discover`
2. Prompt user for spec file, providers, validation level
3. **Analyze scope and recommend loop vs orchestrator mode**
4. If orchestrator: prompt for concurrency cap, trunk branch name, budget limits
5. Run `aloop scaffold` with gathered options
6. Print confirmation

Non-interactive mode (for CI/automation):
- All options passed as flags, no prompts
- `--mode loop|orchestrate` to select explicitly

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
   loop loop loop loop loop    loop loop  ← loop.sh (inner loop)
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

### Two Distinct Loops

The orchestrator and child loops are **completely different programs** with different responsibilities:

**Orchestrator** (TS/Bun, `aloop/cli/`):
- A proper application in the aloop Node/Bun TypeScript codebase
- Manages the full fan-out lifecycle: decompose, schedule, dispatch, monitor, gate, replan
- Talks to GitHub API (issues, PRs, dependencies, sub-issues)
- Watches spec files for changes, triggers replan agents
- Manages concurrency, budget, wave advancement
- Spawns and supervises child loops

**Inner loop** (`loop.sh`):
- Dumb shell script. Reads a **compiled loop plan** (a simple ordered list of agents) and executes them sequentially by index
- The aloop runtime compiles the pipeline YAML config into `loop-plan.json` — a flat array of fully-resolved entries (`agent`, `prompt`, `provider`, `model`, `reasoning`)
- `loop.sh` reads the plan file each iteration, picks entry at `$cyclePosition`, invokes that agent — no YAML parsing, no transition logic in shell
- The runtime can regenerate `loop-plan.json` at any time (steering, mutation, failure recovery) — loop.sh re-reads it every turn
- Invokes providers via round-robin, writes `status.json`
- Reads its sub-spec from the issue body (seeded into its worktree), NOT the repo's SPEC.md
- Knows nothing about GitHub, other children, orchestration, or the full spec
- Purely a worker — the orchestrator tells it what to work on, it executes

```
Orchestrator (TS/Bun)
  ├── watches repo for spec changes (git diff on spec glob)
  ├── polls GitHub for issue/PR state changes
  ├── runs agent-powered decompose/schedule/replan
  ├── spawns child inner loops:
  │     ├── loop.sh (issue #11) ← reads issue body as its spec
  │     ├── loop.sh (issue #12) ← reads issue body as its spec
  │     └── loop.sh (issue #13) ← reads issue body as its spec
  ├── gates completed PRs (automated checks + agent review)
  └── manages concurrency cap, budget, wave advancement
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

### Orchestrator Phases

The orchestrator itself is agent-powered at every phase — no deterministic decomposition or scheduling, since the dependency graph is semantic (no code exists yet to analyze structurally).

#### Phase 1: Decompose

The decompose agent reads the spec(s) and the current repo state, then produces the full issue hierarchy.

1. Read all spec files (`SPEC.md` or `specs/*.md`)
2. Read the codebase to understand what already exists
3. Read existing GitHub issues (if resuming or extending)
4. Produce vertical slices as parent issues, each with sub-issues
5. For each issue: title, body with scope + acceptance criteria, dependency metadata, file ownership hints, wave assignment
6. Create issues on GitHub via `gh api` with sub-issue linking
7. Labels: `aloop/auto`, `aloop/wave-N`, `aloop/slice`

The decompose agent reasons about:
- **Vertical slicing** — each parent is an independently shippable user-facing feature
- **Sub-issue granularity** — sized for 1-3 hours of human work equivalent (~5-15 build iterations per child loop)
- **Dependencies** — semantic analysis: "auth must exist before protected routes"
- **Parallelism** — which sub-issues touch completely separate files/modules
- **Foundation work** — necessary horizontal groundwork explicitly marked and scheduled early

#### Phase 2: Schedule

The schedule agent builds the dependency graph and assigns waves. This is agent-powered because dependencies are semantic — with no code yet, only an agent can reason about "JWT validation must exist before session middleware can use it."

1. Read all created issues and their dependency metadata
2. Build a dependency graph (topological sort with semantic validation)
3. Assign waves:
   - Wave 1: foundation work + independent slices
   - Wave 2+: slices that depend on wave 1 outputs
4. Detect file ownership conflicts — two sub-issues in the same wave touching the same files → move one to next wave
5. Update issue labels with wave assignments
6. Write the schedule to `orchestrator.json`

Wave scheduling rules:
- Sub-issues in the same wave MAY run in parallel
- Wave N+1 sub-issues only dispatch after their specific dependencies are merged (not necessarily ALL of wave N)
- File ownership hints prevent parallel edits to the same files

#### Phase 3: Dispatch

The orchestrator picks up open sub-issues and launches child loops.

1. Query sub-issues whose dependencies are all merged
2. For each dispatchable sub-issue (up to **concurrency cap**):
   - Create branch: `aloop/issue-<number>`
   - Create worktree: `~/.aloop/sessions/<session-id>/worktrees/issue-<number>/`
   - Seed the child's `TODO.md` from the issue body
   - Launch child loop with the configured pipeline (compiled into `loop-plan.json`)
   - Track child PID + session in orchestrator state
3. Remaining issues queue until a slot opens or dependencies are met

**Concurrency cap**: Configurable, default 3. Prevents provider saturation.

#### Phase 4: Monitor

The orchestrator polls child loop status continuously.

1. Read each child's `status.json` for state (running, completed, stuck, limit_reached)
2. Detect stuck children (stuck_count >= threshold) → steer, reassign provider, or kill and retry
3. Detect completed children → child creates PR:
   ```bash
   gh pr create \
     --base agent/trunk \
     --head aloop/issue-<number> \
     --title "Issue #<number>: <title>" \
     --body "Closes #<number>\n\n<auto-generated summary>"
   ```
4. Detect failed children → log, optionally retry with different provider mix
5. When a slot opens → dispatch next eligible sub-issue

#### Phase 5: Gate + Merge

The orchestrator reviews each PR against hard criteria before merging.

**Automated gates (must all pass):**

| Gate | Method | Fail action |
|------|--------|-------------|
| CI pipeline | `gh pr checks <number> --watch` | Block merge |
| Test coverage | Parse coverage report from CI artifacts | Block if below threshold |
| No merge conflicts | `gh pr view <number> --json mergeable` | Send back for rebase |
| No spec regression | Contract checks against spec | Block merge |
| Screenshot diff (UI) | Playwright visual comparison | Flag for human if delta > threshold |
| Lint / type check | CI step | Block merge |

**Agent review gate:**
- Invoke review agent against the PR diff (`gh pr diff <number>`)
- Checks: code quality, spec compliance, no scope creep, test adequacy
- Outputs: approve, request-changes, or flag-for-human

**Merge strategy:**
- Squash merge into `agent/trunk`: `gh pr merge <number> --squash --delete-branch`
- If merge conflict: child loop rebases and re-submits (max 2 attempts before human flag)
- After merge: downstream sub-issues may become unblocked → dispatch them

#### Phase 6: Replan

The orchestrator continuously watches for conditions that require replanning. This is part of the orchestrator's main event loop (TS/Bun), not the inner loop.

**Trigger: Spec file changed**

The orchestrator tracks recent git commits on the repo. Each poll cycle, it checks `git log` for new commits and diffs changed files against the configured spec glob pattern (`SPEC.md`, `specs/*.md`, or custom). When a spec file is modified:

1. Orchestrator extracts the specific diff: `git diff <prev>..<new> -- specs/auth.md`
2. Passes to the **replan agent** with context:
   - The diff itself (what changed in the spec)
   - The commit message (human intent behind the change)
   - Current issue state from GitHub (what's in-flight, done, queued)
3. Replan agent reasons about the delta and outputs structured actions:
   - `create_issue(parent, title, body, deps)` — new feature added to spec
   - `update_issue(number, new_body)` — scope/criteria changed for existing slice
   - `close_issue(number, reason)` — feature removed from spec
   - `steer_child(number, instruction)` — in-flight child needs course correction
   - `reprioritize(number, new_wave)` — dependencies shifted

The replan agent reads the spec but does NOT modify it — the spec is human-owned. The agent translates spec changes into issue-tracker mutations.

**Trigger: Wave completion**

When all sub-issues in a wave are merged, the schedule agent re-evaluates remaining issues and adjusts waves based on what was learned during execution.

**Trigger: External issue created**

When a human creates an issue with the `aloop/auto` label, the orchestrator absorbs it into the current plan — assigns wave, links dependencies, and queues for dispatch.

**Trigger: Persistent failures**

When a child loop fails repeatedly, the replan agent may split the failing sub-issue into smaller pieces, adjust the approach in the issue body, or merge multiple small issues that turned out to be coupled.

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
| Agent prompt templates (`PROMPT_*.md`) | Used by child loops as configured in the pipeline |
| `active.json` | Tracks all child sessions (orchestrator + children) |
| Steering (`STEERING.md`) | Can steer individual children or the orchestrator |
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
- The convention-file response format (`url` fields in `.aloop/responses/`) must use the actual GHE hostname
- `aloop orchestrate`, `aloop gh`, and the dashboard's contextual links must all work with any GH-compatible hostname
- No validation or parsing should assume `github.com` as the only valid GitHub host

### Acceptance Criteria

- [ ] Orchestrator decomposes spec(s) into vertical slices as parent issues with sub-issues
- [ ] Sub-issues created via `gh api` with sub-issue linking to parent
- [ ] Decomposition is vertical-slice-first — each parent is an independently shippable feature
- [ ] Dependencies use GitHub's native issue dependency tracking (blocked_by/blocking)
- [ ] GitHub is the source of truth — local state is only session-to-issue mapping
- [ ] Efficient monitoring: ETag-guarded REST polling + single GraphQL query on change
- [ ] Foundation (horizontal groundwork) issues explicitly marked and scheduled in early waves
- [ ] Agent-powered scheduling builds dependency graph and assigns waves
- [ ] Sub-issues dispatch when their specific dependencies are merged (not entire wave)
- [ ] Child loops launched per sub-issue, each in its own worktree and branch
- [ ] Concurrency cap limits simultaneous child loops (default 3)
- [ ] Child loops create PRs targeting `agent/trunk` on completion
- [ ] Orchestrator reviews PRs against automated gates (CI, coverage, conflicts, lint)
- [ ] Orchestrator runs agent review on PR diffs
- [ ] Approved PRs are squash-merged into `agent/trunk`
- [ ] Rejected PRs reopen their issue with review comments for the child loop to address
- [ ] Merge conflicts trigger automatic rebase attempts (max 2 before human flag)
- [ ] `aloop orchestrate --plan-only` creates issues without launching loops
- [ ] Local `sessions.json` maps issue numbers to child sessions/PIDs (minimal local state)
- [ ] `aloop status` shows orchestrator tree (orchestrator → slices → sub-issues → PRs)
- [ ] Final report includes: slices created/completed/failed, time, provider usage, cost estimates
- [ ] Provider health subsystem is shared across all child loops (file-lock safe)
- [ ] Session-level budget cap can pause dispatch when threshold is approached
- [ ] Orchestrator is resumable: restart reads plan from GitHub, reconnects to live children, no duplicates
- [ ] Replan triggered by spec changes, wave completion, or user-created issues
- [ ] User-created `aloop/auto` issues absorbed into the live plan
- [ ] Multi-file specs supported (`specs/*.md` or single `SPEC.md`)
- [ ] Per-task `sandbox` field controls whether child runs in devcontainer or on host
- [ ] Per-task `requires` labels declare environment needs; dispatcher checks before dispatch
- [ ] All GitHub operations work with GitHub Enterprise instances (no hardcoded `github.com`)

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
│    │     └── just: read loop-plan.json + provider invoke│
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
- Read `loop-plan.json` each iteration, pick agent at `$cyclePosition`
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
- **Reasoning effort** (optional) — controls reasoning depth for models that support it (see Reasoning Effort section below)
- **Transition rules** — what happens on success, failure, and repeated failure

Agents are NOT hardcoded. `plan`, `build`, `review`, `steer` are just the default agents that ship with aloop. Users and the setup agent can define custom agents (e.g., `verify`, `debugger`, `security-audit`, `docs-generator`, `guard`).

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
- **No templating engine** — just file copies and string substitution already used by `loop.sh`

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

### Loop Plan Compilation (Runtime → Shell Bridge)

The pipeline YAML config is **not parsed by the shell script**. Instead, the aloop runtime (TS/Bun) compiles it into a simple `loop-plan.json` that `loop.sh` can read with zero complexity.

**`loop-plan.json` format:**
```json
{
  "cycle": [
    {"agent": "plan",   "prompt": "PROMPT_plan.md",   "provider": "claude",  "model": "opus-4",           "reasoning": "high"},
    {"agent": "build",  "prompt": "PROMPT_build.md",  "provider": "opencode","model": "gpt-5.1",          "reasoning": "medium"},
    {"agent": "build",  "prompt": "PROMPT_build.md",  "provider": "codex",   "model": "codex-mini-latest", "reasoning": "medium"},
    {"agent": "build",  "prompt": "PROMPT_build.md",  "provider": "gemini",  "model": "gemini-3-pro",     "reasoning": "medium"},
    {"agent": "proof",  "prompt": "PROMPT_proof.md",  "provider": "opencode","model": "gpt-5.1",          "reasoning": "medium"},
    {"agent": "review", "prompt": "PROMPT_review.md", "provider": "claude",  "model": "opus-4",           "reasoning": "xhigh"}
  ],
  "cyclePosition": 0,
  "iteration": 1,
  "version": 1
}
```

Each entry is a **complete instruction** — `loop.sh` doesn't need to look anywhere else. The runtime resolves round-robin provider selection, per-agent model preferences, and reasoning config at compile time and bakes the result into each entry.

**How `loop.sh` uses it:**
```bash
# Read the plan (re-read every iteration to pick up mutations)
PLAN=$(cat "$SESSION_DIR/loop-plan.json")
CYCLE_LENGTH=$(echo "$PLAN" | jq '.cycle | length')
CYCLE_POS=$(echo "$PLAN" | jq '.cyclePosition')

# Pick current agent — everything needed is in the entry
ENTRY=$(echo "$PLAN" | jq ".cycle[$((CYCLE_POS % CYCLE_LENGTH))]")
AGENT=$(echo "$ENTRY" | jq -r '.agent')
PROMPT=$(echo "$ENTRY" | jq -r '.prompt')
PROVIDER=$(echo "$ENTRY" | jq -r '.provider')
MODEL=$(echo "$ENTRY" | jq -r '.model')
REASONING=$(echo "$ENTRY" | jq -r '.reasoning')

# After iteration completes: update position and iteration in the plan file
jq ".cyclePosition = $((CYCLE_POS + 1)) | .iteration = $ITERATION" \
  "$SESSION_DIR/loop-plan.json" > "$SESSION_DIR/loop-plan.json.tmp" \
  && mv "$SESSION_DIR/loop-plan.json.tmp" "$SESSION_DIR/loop-plan.json"
```

**Key properties:**
- The `cycle` array is a **short repeating pattern** (typically 5-7 entries), NOT an unrolled list of all iterations. `loop.sh` wraps around with `% length`.
- `cyclePosition` and `iteration` live in the plan file — the runtime and shell share state through this single file. The shell updates position after each iteration; the runtime reads it when deciding mutations.
- The runtime writes this file once at session start, then **rewrites it** whenever the pipeline mutates (steering, failure recovery, agent injection). It preserves `cyclePosition` and `iteration` (or adjusts them if the mutation requires it, e.g., `goto build` resets `cyclePosition`).
- `loop.sh` re-reads the file every iteration, so mutations take effect on the next turn.
- The `version` field increments on each runtime rewrite — loop.sh logs when it detects a plan change.
- Transition rules (`onFailure: goto build`, escalation ladders) are **resolved by the runtime**, not the shell. When the runtime observes a failure via `status.json`, it rewrites the plan accordingly (e.g., inserting a `debugger` agent, or adjusting `cyclePosition` to point back to build).
- This keeps all complex logic in TS/Bun and all shell logic trivial: read JSON, index into array, invoke, update index.

**When the runtime rewrites the plan:**
- Steering instruction received → recompile pipeline with modifications
- Agent failure detected (via `status.json` polling) → apply `onFailure` transition rules, rewrite plan
- Escalation threshold reached → inject recovery agents into the cycle
- Host monitor detects stuck pattern → swap providers or inject debugger agent

### Runtime Mutation

The pipeline is **mutable at runtime** — phases can be added, removed, or reordered while the loop is running. Two control surfaces:

1. **User via steering** — drop a steering file that modifies the pipeline:
   ```markdown
   # STEERING.md
   Insert `security-audit` agent after `build` for remaining iterations.
   Remove `docs-generator` — not needed yet.
   ```
   The host-side monitor interprets steering instructions, recompiles the pipeline, and rewrites `loop-plan.json`. The loop picks up the change on its next iteration.

2. **Host-side monitor** — observes loop patterns and injects agents automatically:
   - 3 consecutive build failures → inject `debugger` agent before next build
   - Verification failing on environment issues → inject `env-fix` agent
   - Provider consistently timing out → swap to different provider for next agent

All mutations flow through the same mechanism: recompile pipeline → rewrite `loop-plan.json` → loop picks up change. Agents do **not** modify the pipeline themselves — control stays with the user and host-side monitor (avoids perverse incentives like agents removing their own reviewers).

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

**ZDR (Zero Data Retention) for vision**:

| Provider | ZDR covers images? | How to enable |
|---|---|---|
| **Anthropic (direct API)** | Yes — all inputs including images | Enterprise agreement with Anthropic |
| **AWS Bedrock** | Yes — architectural default | No opt-in needed |
| **Google Vertex AI / Gemini** | Yes — with config (disable caching, avoid File API) | ZDR opt-out form + invoiced billing |
| **OpenRouter** | Depends on downstream provider | `zdr: true` per-request flag, routes to ZDR endpoints |
| **OpenAI (direct + Azure)** | **No** — images explicitly excluded from ZDR | N/A |
| **Mistral** | Likely but unconfirmed | Contact sales |
| **ByteDance (Seed models)** | Unknown | Investigate before production use |

For production visual review with data sensitivity requirements, use **Anthropic Claude** (direct API with ZDR), **AWS Bedrock** (default no-retention), or **Gemini via Vertex AI** (ZDR with config). OpenAI's ZDR explicitly carves out image inputs.

### Implementation Notes

- Pipeline config lives in `.aloop/pipeline.yml` (or inline in `config.yml`)
- Default pipeline (plan-build-review) is generated if no config exists — backward compatible
- Agent definitions live in `.aloop/agents/` — each is a YAML file with prompt reference, provider preference, reasoning effort, and transition rules
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
