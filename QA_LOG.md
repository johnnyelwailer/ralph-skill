# QA Log

## QA Session — 2026-03-15 (iteration 26)

### Test Environment
- Session dir: /home/pj/.aloop/sessions/ralph-skill-20260314-173930
- Dashboard: http://localhost:4040
- Commit: b612aa4
- Features tested: 5

### Results
- PASS: aloop status (text, json, --watch), dashboard layout, dashboard activity log, dashboard steer input, dashboard stop controls, dashboard artifact serving, aloop orchestrate (--help, --plan-only), aloop discover (project + empty repo), aloop stop (invalid session)
- FAIL: dashboard docs tabs (empty content), dashboard health tab (missing codex), aloop steer CLI (missing command), provider health backoff (spec violation), orchestrate error handling (raw stack trace)

### Bugs Filed
- [qa/P1] Dashboard docs tabs empty — workdir mismatch
- [qa/P1] `aloop steer` CLI command missing
- [qa/P1] Provider health backoff violates spec
- [qa/P1] Dashboard health tab missing codex
- [qa/P2] `aloop orchestrate` leaks stack trace on missing spec

### Command Transcript

#### Feature 1: aloop status

```
$ node ~/.aloop/cli/aloop.mjs status
Active Sessions:
  ralph-skill-20260314-173930  pid=1682112  running  iter 26, qa  (24h ago)
    workdir: /home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree

Provider Health:
  claude     healthy      (last success: 14m ago)
  codex      cooldown     (1 failure, resumes in 1816m)
  copilot    healthy      (last success: 1m ago)
  gemini     healthy      (last success: 13m ago)
  opencode   healthy      (last success: 33m ago)
Exit code: 0
```

```
$ node ~/.aloop/cli/aloop.mjs status --output json
(JSON output with sessions array, health object, orchestrator_trees)
Exit code: 0
```

```
$ node ~/.aloop/cli/aloop.mjs status --watch
(Auto-refreshing output every 2s with ANSI clear codes)
Exit code: 0 (killed after 3s)
```

**Observation**: codex shows "resumes in 1816m" (~30h) with only 1 consecutive failure. Spec says:
- 1 failure: none (could be flaky)
- 2 failures: 2 min
- Hard cap: 60 min

Health file `~/.aloop/health/codex.json`:
```json
{"status":"cooldown","last_success":"2026-03-13T12:39:26Z","last_failure":"2026-03-13T12:54:46Z","failure_reason":"rate_limit","consecutive_failures":1,"cooldown_until":"2026-03-17T00:00:00Z"}
```

#### Feature 2: Dashboard

```
$ curl -s -o /dev/null -w "%{http_code}" http://localhost:4040
200
```

Screenshot: /tmp/qa-dashboard-layout.png (1920x1080)

Layout verification:
- Left sidebar: SESSIONS tree with project grouping — PASS
- Center: DOCUMENTS panel with Health tab — PARTIAL (docs tabs missing)
- Right: ACTIVITY log with 151 events — PASS
- Bottom: Steer input + Send + Stop buttons — PASS
- Top bar: Session name, iter 26/100, phase badge (qa), provider, state — PASS

```
$ curl -s http://localhost:4040/api/state | python3 -c "..."
docs keys: ['TODO.md', 'SPEC.md', 'RESEARCH.md', 'REVIEW_LOG.md', 'STEERING.md']
All docs content: 0 chars each (empty)
```

**Bug**: API `workdir` is `/home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree/aloop/cli` — the CLI source directory, not the project worktree root. Files exist at worktree root but not at aloop/cli/.

```
$ curl -s -o /dev/null -w "%{http_code}" http://localhost:4040/api/artifacts/25/proof-manifest.json
200
$ curl -s -o /dev/null -w "%{http_code}" http://localhost:4040/api/artifacts/25/dashboard-desktop-1920x1080.png
200
```

Dashboard health tab shows only 4 providers (claude, copilot, gemini, opencode). Codex is in cooldown but not displayed.

SSE endpoint: `/api/events` returns 404. `/sse` and `/events` return 200 but serve SPA HTML (Vite dev server catch-all). Real-time updates may use a different mechanism (WebSocket or polling).

#### Feature 3: aloop orchestrate

```
$ node ~/.aloop/cli/aloop.mjs orchestrate --help
Usage: aloop orchestrate [options]
(Full options listing including --spec, --concurrency, --trunk, --issues, --plan-only, --budget)
Exit code: 0
```

```
$ node ~/.aloop/cli/aloop.mjs orchestrate --spec SPEC.md --plan-only --output json
{"session_dir":"/home/pj/.aloop/sessions/orchestrator-20260315-174701","state_file":"...","state":{"spec_file":"...","issues":[],...}}
Exit code: 0
```

```
$ node ~/.aloop/cli/aloop.mjs orchestrate --spec /nonexistent/SPEC.md --plan-only
Error: Spec file not found: /nonexistent/SPEC.md
    at orchestrateCommandWithDeps (file:///home/pj/.aloop/cli/dist/index.js:8914:11)
    ...
Exit code: 1
```

**Bug**: Raw stack trace leaked to user instead of clean error message.

#### Feature 4: aloop discover

```
$ node ~/.aloop/cli/aloop.mjs discover --output json
Project root: /home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree
Spec candidates: ['SPEC.md', 'README.md']
Installed providers: ['claude', 'codex', 'gemini', 'copilot']
Exit code: 0
```

Empty repo test:
```
$ cd $(mktemp -d) && git init && node ~/.aloop/cli/aloop.mjs discover --output json
Spec candidates: []
Context files: all false
Exit code: 0
```

#### Feature 5: aloop steer

```
$ node ~/.aloop/cli/aloop.mjs steer "test instruction"
error: unknown command 'steer'
Exit code: 1
```

```
$ curl -s -X POST http://localhost:4040/api/steer -H "Content-Type: application/json" -d '{}'
{"error":"Field \"instruction\" is required and must be a non-empty string."}

$ curl -s -X POST http://localhost:4040/api/steer -o /dev/null -w "%{http_code}" -H "Content-Type: application/json" -d '{}'
400
```

Dashboard steer API exists and validates correctly, but CLI `aloop steer` command is not registered.

### Screenshots
- `/tmp/qa-dashboard-layout.png` — Desktop layout at 1920x1080, initial load
- `/tmp/qa-dashboard-loaded.png` — Desktop layout at 1920x1080, after 3s wait

---

## QA Session — 2026-03-15 (iteration 27)

### Test Environment
- Session dir: /home/pj/.aloop/sessions/ralph-skill-20260314-173930
- Dashboard: http://localhost:4040
- Commit: bfecfb5
- Features tested: 5 (re-tests + new coverage)

### Results
- PASS: VERSIONS.md (Gate 8 git entry), aloop update (46 files copied), aloop stop (no arg + invalid session), aloop stop --help
- FAIL: provider health backoff (still broken), dashboard docs tabs (still broken), dashboard health API (still broken), aloop steer CLI (still broken)

### Re-tests (all still FAIL — bugs unfixed)
- Provider health backoff: codex still shows consecutive_failures=1 with 30h cooldown (spec says no cooldown for 1 failure)
- Dashboard docs tabs: All docs still 0 chars, workdir still points to aloop/cli/ instead of worktree root
- Dashboard health API: Returns empty object `{}`
- aloop steer CLI: Still returns "unknown command 'steer'"

### Command Transcript

#### Feature 1: Provider health backoff (re-test)

```
$ node ~/.aloop/cli/aloop.mjs status
Provider Health:
  claude     healthy      (last success: 2m ago)
  codex      cooldown     (1 failure, resumes in 1808m)
  copilot    healthy      (last success: 9m ago)
  gemini     healthy      (last success: 21m ago)
  opencode   healthy      (last success: 41m ago)
Exit code: 0
```

```
$ cat ~/.aloop/health/codex.json
{"status":"cooldown","last_success":"2026-03-13T12:39:26Z","last_failure":"2026-03-13T12:54:46Z","failure_reason":"rate_limit","consecutive_failures":1,"cooldown_until":"2026-03-17T00:00:00Z"}
```

**Observation**: codex shows "resumes in 1808m" (~30h) with only 1 consecutive failure. Spec says:
- 1 failure: none (could be flaky)
- 2 failures: 2 min cooldown
- Hard cap: 60 min

Bug **still present**. Not fixed since last QA session.

#### Feature 2: Dashboard docs tabs (re-test)

```
$ curl -s http://localhost:4040/api/state | python3 -c "import json,sys; d=json.load(sys.stdin); print('Workdir:', d.get('workdir')); docs=d.get('docs',{}); [print(f'  {k}: {len(v)} chars') for k,v in docs.items()]"
Workdir: /home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree/aloop/cli
  TODO.md: 0 chars
  SPEC.md: 0 chars
  RESEARCH.md: 0 chars
  REVIEW_LOG.md: 0 chars
  STEERING.md: 0 chars
```

Dashboard health API:
```
$ curl -s http://localhost:4040/api/state | python3 -c "import json,sys; d=json.load(sys.stdin); print('Health providers:', list(d.get('health',{}).keys()))"
Health providers: []
```

**Observation**: Workdir points to `aloop/cli` subdirectory (where no project files exist). Should point to worktree root. Health API returns empty object.

Bug **still present**.

#### Feature 3: VERSIONS.md (Gate 8 fix verification)

```
$ cat VERSIONS.md | grep -A 5 "## Runtime"
## Runtime

| Component | Version |
|-----------|---------|
| Node.js   | 22.x    |
| Bash      | 5.x     |
| TypeScript| 5.x     |
| Git       | 2.x     |
```

PASS — Git 2.x now present in Runtime section. Gate 8 fix verified.

#### Feature 4: aloop update (new test)

```
$ node ~/.aloop/cli/aloop.mjs update
Updated ~/.aloop from /home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree
Version: bfecfb5 (2026-03-15T17:54:03Z)
Files updated: 46
Exit code: 0
```

PASS — Copies files from repo to ~/.aloop/, reports version hash, timestamp, and file count.

#### Feature 5: aloop stop edge cases (expanded coverage)

```
$ node ~/.aloop/cli/aloop.mjs stop
Error: session-id required for stop command.
Exit code: 1
```

```
$ node ~/.aloop/cli/aloop.mjs stop nonexistent-session
Error: Session not found: nonexistent-session
Exit code: 1
```

```
$ node ~/.aloop/cli/aloop.mjs stop --help
(shows main aloop help with stop listed under "Core Commands")
Exit code: 0
```

PASS — Clear error messages for missing arg and invalid session. Help shows stop in command list.

#### Feature 6: aloop steer CLI (re-test)

```
$ node ~/.aloop/cli/aloop.mjs steer "test"
error: unknown command 'steer'
Exit code: 1
```

FAIL — README lists `aloop steer` as a CLI command but it's not registered.

### Screenshots
- `/tmp/qa-dashboard-iter27.png` — Dashboard at 1920x1080, iter 27


---

## QA Session — 2026-03-15 (iteration 46)

### Test Environment
- Session dir: /home/pj/.aloop/sessions/ralph-skill-20260314-173930
- Commit: b7af2ec4
- Features tested: 4

### Results
- PASS: `aloop orchestrate` dependency injection fix, `aloop orchestrate --autonomy-level` (happy path), `aloop gh status`
- FAIL: `aloop orchestrate --autonomy-level foo` (stack trace), `aloop gh watch` (stack trace), `aloop start` missing config (stack trace)

### Bugs Filed
- [qa/P2] CLI error handling leaks stack traces for user errors

### Command Transcript

#### Feature 1: aloop orchestrate --autonomy-level

```
$ node aloop/cli/dist/index.js orchestrate --autonomy-level foo --plan-only
Error: Invalid autonomy level: foo (must be cautious, balanced, or autonomous)
    at assertAutonomyLevel (file:///home/pj/.aloop/sessions/.../index.js:8901:9)
    ...
Exit code: 1
```
FAIL: Leaked raw stack trace.

```
$ node aloop/cli/dist/index.js orchestrate --autonomy-level cautious --plan-only --spec does-not-exist.md
Orchestrator session initialized.
  ...
  Autonomy:     cautious
  Plan only:    true
Exit code: 0
```
PASS: `cautious` and `autonomous` are correctly recognized and configured in the orchestrator session.

#### Feature 2: orchestrateCommand dependency injection fix

```
$ node aloop/cli/dist/index.js orchestrate --spec does-not-exist.md --plan-only
Orchestrator session initialized.
Exit code: 0
```
PASS: The DI fix works; invoking the command no longer crashes with a Commander Command object type error.

#### Feature 3: aloop gh (GitHub integration commands)

```
$ node aloop/cli/dist/index.js gh status
Issue  Branch                PR    Status      Iteration  Feedback
#7     agent/issue-7-improve-docs #99   completed   —         —
#42    agent/issue-42-fix-auth-flow —     running     —         —
Exit code: 0
```
PASS: Status command successfully prints a formatted table.

```
$ node aloop/cli/dist/index.js gh watch
Error: Command failed: gh issue list --state open --json number,title,url --limit 100 --label aloop
gh: blocked by aloop PATH hardening
    at genericNodeError (node:internal/errors:983:15)
    ...
Exit code: 1
```
FAIL: Command fails and leaks a raw stack trace, instead of returning a clean error message.

#### Feature 4: aloop start error handling

```
$ node aloop/cli/dist/index.js start --provider nonexistent-provider
Error: No Aloop configuration found for this project. Run `aloop setup` first.
    at startCommandWithDeps (file:///home/pj/.aloop/sessions/.../index.js:6025:11)
    ...
Exit code: 1
```
FAIL: Leaks a raw stack trace instead of a clean error.

---

## QA Session — 2026-03-15 (iteration 46)

### Test Environment
- Temp dir: /tmp/aloop-qa-test-20260315
- Features tested: 8
- Binary: node aloop/cli/dist/index.js
- Commit: 1b998e4

### Results
- PASS: aloop orchestrate --autonomy-level (Happy Path)
- PASS: aloop gh status
- PASS: aloop status --watch
- PASS: aloop update
- PASS: aloop stop (basic checks)
- FAIL: aloop orchestrate --autonomy-level (Invalid Input leaks stack trace)
- FAIL: aloop steer (Command missing)
- FAIL: aloop start (Leaks stack trace when no config found)
- FAIL: aloop orchestrate --spec (Doesn't check file existence)
- FAIL: Dashboard layout (Panel detection failed in Playwright)
- FAIL: Provider health backoff (Still broken: 1 failure = 30h cooldown)

### Bugs Filed
- [qa/P1] `aloop orchestrate --spec` doesn't check for file existence
- [qa/P2] Dashboard layout panel detection failure
- [qa/P2] CLI error handling leaks stack traces for user errors (re-confirmed)
- [qa/P1] `aloop steer` command missing (re-confirmed)
- [qa/P1] Provider health backoff violates spec (re-confirmed via `aloop status --watch`)

### Command Transcript

#### aloop orchestrate --autonomy-level (Invalid Input)
```
$ node aloop/cli/dist/index.js orchestrate --spec SPEC.md --autonomy-level foo --plan-only
file:///home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree/aloop/cli/dist/index.js:460
  throw new Error(`Invalid autonomy level: ${value} (must be cautious, balanced, or autonomous)`);
        ^
Error: Invalid autonomy level: foo (must be cautious, balanced, or autonomous)
    at assertAutonomyLevel (file:///home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree/aloop/cli/dist/index.js:460:9)
```

#### aloop steer
```
$ node aloop/cli/dist/index.js steer
error: unknown command 'steer'
```

#### aloop start (No config)
```
$ node aloop/cli/dist/index.js start
Error: No Aloop configuration found for this project. Run `aloop setup` first.
    at startCommandWithDeps (file:///home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree/aloop/cli/dist/index.js:6025:11)
    at async _Command.startCommand (file:///home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree/aloop/cli/dist/index.js:6406:18)
```

#### aloop orchestrate --spec (Nonexistent)
```
$ node aloop/cli/dist/index.js orchestrate --spec NONEXISTENT.md --plan-only
Orchestrator session initialized.
...
  Spec:         NONEXISTENT.md
Exit code: 0
```
**Bug**: Should check for spec file existence and exit with error.

#### Playwright Dashboard Test
```
$ cd aloop/cli/dashboard && npx playwright test e2e/qa-layout.spec.ts
Layout panels found: 0
Generic panels found: 0
Activity rows: 0
Steer input visible: false
Stop button visible: true
Error: expect(received).toBeGreaterThan(expected)
Expected: > 0
Received:   0
```

#### aloop status --watch (Provider Health)
```
Provider Health:
  claude     healthy      (last success: 29m ago)
  codex      cooldown     (1 failure, resumes in 1781m)
```
**Bug**: codex shows 30h cooldown after 1 failure.

---

## QA Session — 2026-03-15 (iteration 47)

### Test Environment
- Temp dir: `/tmp/aloop-qa-20260315-192325`
- Temp dir cleaned: yes (artifacts copied to session-state files)
- Session dir: `/home/pj/.aloop/sessions/ralph-skill-20260314-173930`
- Dashboard: `http://localhost:4040` (from `meta.json`)
- Commit: `1b998e4`
- Features tested: 5

### Results
- PASS: `aloop discover --output json` (fresh temp git repo), `aloop orchestrate --spec SPEC.md --plan-only --output json`, `aloop --help`
- FAIL: dashboard desktop layout verification (spec wireframe mismatch at 1920x1080), dashboard docs tabs (empty content), `aloop steer` command missing, `aloop orchestrate --spec NONEXISTENT.md --plan-only` exits 0, provider health backoff spec mismatch

### Bugs Filed
- [qa/P1] [P0 severity] Dashboard desktop layout mismatch at required breakpoint
- [qa/P1] Dashboard docs tabs still empty (`/api/state` workdir points to `.../worktree/aloop/cli`)
- [qa/P1] `aloop steer` command still missing
- [qa/P1] `aloop orchestrate --spec NONEXISTENT.md` still does not validate file existence
- [qa/P1] Provider health backoff still violates first-failure/no-cooldown + 60m hard cap

### Layout Verification (mandatory)
- Screenshot captured: `/home/pj/.copilot/session-state/5d8f4244-333d-4aba-86fe-381e40a29c8f/files/qa-iter47/dashboard-desktop-1920x1080.png`
- Desktop breakpoint tested at 1920x1080
- Observed:
  - `aside: 0`, `main: 1`, `section: 1`, panel-like classes: 2
  - `stopButtons: 1`, `steerInputs: 1`
  - Expected persistent text markers not visible in body (`SESSIONS`, `DOCUMENTS`, `ACTIVITY` all false)
- Verdict: **FAIL** (layout mismatch at required breakpoint)

### Command Transcript

#### Setup + feature execution bundle
```bash
$ git init -q && git config user.email qa@example.com && git config user.name 'QA Bot' && printf '# QA Project\n' > README.md && printf '# SPEC\n\nSimple spec for QA temp project.\n' > SPEC.md && git add . && git commit -qm 'init test project'
[cwd] /tmp/aloop-qa-20260315-192325/project
[exit] 0
[stdout]
[stderr]

$ node /home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree/aloop/cli/dist/index.js --help
[cwd] /home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree
[exit] 0
[stdout]
Usage: aloop [options] [command]
...
Commands:
  resolve
  discover
  setup
  scaffold
  start
  dashboard
  status
  active
  stop
  update
  devcontainer
  devcontainer-verify
  orchestrate
  gh
[stderr]

$ node /home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree/aloop/cli/dist/index.js discover --output json
[cwd] /tmp/aloop-qa-20260315-192325/project
[exit] 0
[stdout]
{
  "project": { "is_git_repo": true, "git_branch": "master" },
  "context": { "spec_candidates": ["SPEC.md", "README.md"] },
  "providers": { "installed": ["claude", "codex", "gemini", "copilot"] }
}
[stderr]

$ node /home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree/aloop/cli/dist/index.js orchestrate --spec SPEC.md --plan-only --output json
[cwd] /tmp/aloop-qa-20260315-192325/project
[exit] 0
[stdout]
{
  "session_dir": "/home/pj/.aloop/sessions/orchestrator-20260315-182327",
  "state": { "spec_file": "SPEC.md", "plan_only": true, "autonomy_level": "balanced" }
}
[stderr]

$ node /home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree/aloop/cli/dist/index.js orchestrate --spec NONEXISTENT.md --plan-only
[cwd] /tmp/aloop-qa-20260315-192325/project
[exit] 0
[stdout]
Orchestrator session initialized.
...
  Spec:         NONEXISTENT.md
  Plan only:    true
[stderr]

$ node /home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree/aloop/cli/dist/index.js steer 'QA instruction from session test'
[cwd] /home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree
[exit] 1
[stdout]
[stderr]
error: unknown command 'steer'

$ node /home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree/aloop/cli/dist/index.js status
[cwd] /home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree
[exit] 0
[stdout]
Provider Health:
  claude     healthy
  codex      cooldown     (1 failure, resumes in 1777m)
  copilot    healthy
  gemini     healthy
  opencode   healthy
[stderr]
```

#### Dashboard layout + state checks
```bash
$ cd /home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree/aloop/cli/dashboard && node (playwright script)
[exit] 0
[stdout]
{
  "columns": { "aside": 0, "main": 1, "section": 1, "panelClass": 2, "columnClass": 0 },
  "hasSessions": false,
  "hasDocuments": false,
  "hasActivity": false,
  "stopButtons": 1,
  "steerInputs": 1
}
[stderr]

$ curl -s http://localhost:4040/api/state
[exit] 0
[stdout]
{"workdir":"/home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree/aloop/cli", ...}
[stderr]

$ cat ~/.aloop/health/codex.json
[exit] 0
[stdout]
{"status":"cooldown","last_success":"2026-03-13T12:39:26Z","last_failure":"2026-03-13T12:54:46Z","failure_reason":"rate_limit","consecutive_failures":1,"cooldown_until":"2026-03-17T00:00:00Z"}
[stderr]
```

### Artifacts
- Full raw transcript: `/home/pj/.copilot/session-state/5d8f4244-333d-4aba-86fe-381e40a29c8f/files/qa-iter47/command-transcript.txt`
- Dashboard screenshot: `/home/pj/.copilot/session-state/5d8f4244-333d-4aba-86fe-381e40a29c8f/files/qa-iter47/dashboard-desktop-1920x1080.png`
- API response snapshot: `/home/pj/.copilot/session-state/5d8f4244-333d-4aba-86fe-381e40a29c8f/files/qa-iter47/api-state.json`

---

## QA Session — 2026-03-15 (iteration 48)

### Test Environment
- Temp dir: `/tmp/aloop-qa-20260315-iter48` (cleaned up)
- Session dir: `/home/pj/.aloop/sessions/ralph-skill-20260314-173930`
- Commit: `bdf3d32`
- Features tested: 5 (3 re-tests, 2 new)

### Results
- PASS: `aloop active` (text, json, no-sessions), `aloop setup --non-interactive` (happy path), `aloop setup --help`
- FAIL: Provider health backoff (4th consecutive FAIL), `aloop steer` CLI (4th consecutive FAIL), `aloop orchestrate --spec NONEXISTENT.md` (4th consecutive FAIL), `aloop setup --spec NONEXISTENT.md` (no validation), `aloop setup --providers fakeprovider` (no validation), `aloop setup --autonomy-level invalid` (stack trace)

### Bugs Filed
- [qa/P2] `aloop setup --spec NONEXISTENT.md` accepts nonexistent spec without validation
- [qa/P2] `aloop setup --providers fakeprovider` accepts invalid provider name
- [qa/P2] `aloop setup --autonomy-level invalid` leaks raw stack trace

### Re-tests (all still FAIL — bugs unfixed since iter 26)
- Provider health backoff: codex `consecutive_failures=1` with `cooldown_until=2026-03-17T00:00:00Z` (~30h). Spec: 1 failure = no cooldown.
- `aloop steer` CLI: `error: unknown command 'steer'`. Dashboard API `/api/steer` works and queues correctly.
- `aloop orchestrate --spec NONEXISTENT.md`: exits 0, initializes session with bogus spec path. Both relative and absolute paths.

### Command Transcript

#### Test 1: Provider health backoff (re-test)

```
$ cat ~/.aloop/health/codex.json
{"status":"cooldown","last_success":"2026-03-13T12:39:26Z","last_failure":"2026-03-13T12:54:46Z","failure_reason":"rate_limit","consecutive_failures":1,"cooldown_until":"2026-03-17T00:00:00Z"}

$ node aloop/cli/dist/index.js status
Active Sessions:
  ralph-skill-20260314-173930  pid=1682112  running  iter 31, qa  (24h ago)
    workdir: /home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree

Provider Health:
  claude     healthy      (last success: 37m ago)
  codex      cooldown     (1 failure, resumes in 1772m)
  copilot    healthy      (last success: 1m ago)
  gemini     healthy      (last success: 6m ago)
  opencode   healthy      (last success: 22m ago)
Exit code: 0
```

FAIL: codex shows 1772m (~29.5h) cooldown with only 1 failure. Spec says 1 failure = no cooldown.

#### Test 2: aloop steer CLI (re-test)

```
$ node aloop/cli/dist/index.js steer "QA test instruction"
error: unknown command 'steer'
Exit code: 1

$ node aloop/cli/dist/index.js --help | grep steer
(no output — steer not in help)

$ curl -s -X POST http://localhost:4040/api/steer -H "Content-Type: application/json" -d '{"instruction": "QA test from iter 48"}'
{"queued":true,"path":"/home/pj/.aloop/sessions/ralph-skill-20260314-173930/queue/1773599313973-steering.md","steeringPath":"...STEERING.md"}
```

FAIL: CLI command not registered. Dashboard API works correctly.

#### Test 3: aloop orchestrate --spec nonexistent (re-test)

```
$ cd /tmp/aloop-qa-20260315-iter48/project && node aloop/cli/dist/index.js orchestrate --spec NONEXISTENT.md --plan-only
Orchestrator session initialized.
  Spec:         NONEXISTENT.md
  Plan only:    true
Exit code: 0

$ node aloop/cli/dist/index.js orchestrate --spec /nonexistent/path/SPEC.md --plan-only
Orchestrator session initialized.
  Spec:         /nonexistent/path/SPEC.md
  Plan only:    true
Exit code: 0
```

FAIL: Both relative and absolute nonexistent paths accepted. Exits 0 with session initialized.

#### Test 4: aloop setup (new — never tested)

```
$ node aloop/cli/dist/index.js setup --help
Usage: aloop setup [options]
Interactive setup and scaffold for aloop project
Options:
  --project-root <path>, --home-dir <path>, --spec <path>, --providers <providers>,
  --autonomy-level <level>, --non-interactive, -h --help
Exit code: 0
```
PASS: Help displays correctly.

```
$ cd /tmp/aloop-qa-20260315-iter48/project && node aloop/cli/dist/index.js setup --non-interactive --spec SPEC.md --providers claude
Running setup in non-interactive mode...
Setup complete. Config written to: /home/pj/.aloop/projects/3a09d2e0/config.yml
Exit code: 0
```
PASS: Config created with correct project_name, project_root, provider, spec_files.

```
$ node aloop/cli/dist/index.js setup --non-interactive --spec NONEXISTENT.md --providers claude
Running setup in non-interactive mode...
Setup complete. Config written to: /home/pj/.aloop/projects/3a09d2e0/config.yml
Exit code: 0
```
FAIL: Accepted nonexistent spec file without validation.

```
$ node aloop/cli/dist/index.js setup --non-interactive --providers fakeprovider
Running setup in non-interactive mode...
Setup complete. Config written to: /home/pj/.aloop/projects/3a09d2e0/config.yml
Exit code: 0
```
FAIL: Wrote `fakeprovider` to enabled_providers without validating against known providers.

```
$ node aloop/cli/dist/index.js setup --non-interactive --autonomy-level invalid
file:///...aloop/cli/dist/index.js:8014
  throw new Error(`Invalid autonomy level: invalid (must be cautious, balanced, or autonomous)`);
        ^
Error: Invalid autonomy level: invalid (must be cautious, balanced, or autonomous)
    at parseAutonomyLevel (file:///...aloop/cli/dist/index.js:8014:9)
    ...
Exit code: 1
```
FAIL: Leaks raw stack trace instead of clean error message.

#### Test 5: aloop active (new — never tested)

```
$ node aloop/cli/dist/index.js active
ralph-skill-20260314-173930  pid=1682112  running  /home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree  (24h ago)
Exit code: 0

$ node aloop/cli/dist/index.js active --output json
[{"session_id":"ralph-skill-20260314-173930","pid":1682112,"work_dir":"...","started_at":"2026-03-14T17:40:00Z","provider":"round-robin","mode":"plan-build-review","state":"running","phase":"qa","iteration":31,"stuck_count":0,"updated_at":"2026-03-15T18:26:56Z"}]
Exit code: 0

$ node aloop/cli/dist/index.js active --home-dir /tmp/aloop-qa-20260315-iter48
No active sessions.
Exit code: 0

$ node aloop/cli/dist/index.js active --home-dir /tmp/aloop-qa-20260315-iter48 --output json
[]
Exit code: 0
```

PASS: All paths work correctly — text/json output, with/without sessions.

## QA Session — 2026-03-15 (iteration 49)

### Test Environment
- Temp dir: /tmp/aloop-qa-test
- Binary: node aloop/cli/dist/index.js
- Commit: bdf3d32

### Results
- PASS: aloop discover (detected git + spec + readme)
- PASS: aloop orchestrate --plan-only (happy path)
- PASS: aloop status (showed running sessions)
- PASS: aloop active (text and json output)
- FAIL: aloop setup --non-interactive (no validation on --spec or --providers, stack trace on --autonomy-level)
- FAIL: aloop orchestrate --spec NONEXISTENT.md (exits 0 instead of error)
- FAIL: aloop start (leaks stack trace when no config found)
- FAIL: aloop devcontainer (crashes with TypeError: deps.discover is not a function)
- FAIL: aloop steer CLI (still missing)

### Bugs Filed
- [qa/P1] aloop orchestrate --spec NONEXISTENT.md initializes session and exits 0
- [qa/P2] aloop setup --non-interactive --spec NONEXISTENT.md accepts nonexistent file
- [qa/P2] aloop setup --non-interactive --providers fakeprovider accepts invalid provider
- [qa/P2] aloop devcontainer crashes with TypeError: deps.discover is not a function
- [qa/P2] CLI error handling leaks stack traces for user errors (aloop setup --autonomy-level, aloop start)

### Command Transcript

#### aloop setup --non-interactive --providers fakeprovider
```
$ node aloop/cli/dist/index.js setup --non-interactive --providers fakeprovider
Running setup in non-interactive mode...
Setup complete. Config written to: /home/pj/.aloop/projects/ba437e9a/config.yml
$ cat /home/pj/.aloop/projects/ba437e9a/config.yml | grep fakeprovider
  - 'fakeprovider'
```
**Bug**: Accepted invalid provider.

#### aloop orchestrate --spec NONEXISTENT.md --plan-only
```
$ node aloop/cli/dist/index.js orchestrate --spec NONEXISTENT.md --plan-only
Orchestrator session initialized.
...
  Spec:         NONEXISTENT.md
  Plan only:    true
$ echo $?
0
```
**Bug**: Should check for spec existence and fail.

#### aloop devcontainer
```
$ node aloop/cli/dist/index.js devcontainer
TypeError: deps.discover is not a function
    at devcontainerCommandWithDeps (...)
```
**Bug**: TypeError crash.

#### aloop start (No config)
```
$ node aloop/cli/dist/index.js start
Error: No Aloop configuration found for this project. Run `aloop setup` first.
    at startCommandWithDeps (...)
```
**Bug**: Leaks stack trace.

## QA Session — 2026-03-15 (iteration 50)

### Test Environment
- Temp dir: qa-test (with git init and SPEC.md)
- Home dir: qa-home (populated via aloop update)
- Features tested: aloop steer, aloop devcontainer, aloop setup, aloop orchestrate, aloop discover, aloop status, aloop update, aloop active

### Results
- PASS: aloop discover, aloop status, aloop update, aloop active
- FAIL: aloop steer (missing command)
- FAIL: aloop devcontainer (runtime crash)
- FAIL: aloop setup --spec (missing validation)
- FAIL: aloop setup --providers (missing validation)
- FAIL: aloop setup --autonomy-level (stack trace leak)
- FAIL: aloop orchestrate --spec (missing validation)

### Bugs Verified
- [qa/P1] aloop steer command missing
- [qa/P1] aloop orchestrate --spec NONEXISTENT.md exits 0
- [qa/P2] aloop devcontainer crashes with TypeError: deps.discover is not a function
- [qa/P2] aloop setup --spec NONEXISTENT.md accepts missing file
- [qa/P2] aloop setup --providers fakeprovider accepts invalid provider
- [qa/P2] aloop setup --autonomy-level invalid leaks stack trace
