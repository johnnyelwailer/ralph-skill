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
