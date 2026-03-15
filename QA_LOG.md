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

## QA Session — 2026-03-15 (iteration 51)

### Test Environment
- Temp dir: `/tmp/qa-iter51-1773600761`
- Dashboard URL: `http://localhost:4040` (from `meta.json`)
- Screenshot evidence: `/home/pj/.copilot/session-state/7147ca78-c213-460e-ad4c-71808c98d4e7/files/qa-iter51/dashboard-1920x1080.png`
- Layout metrics: `/home/pj/.copilot/session-state/7147ca78-c213-460e-ad4c-71808c98d4e7/files/qa-iter51/layout-check.json`
- Commit: `44dcff9`
- Features tested: 5 primary targets (+ supporting checks)

### Results
- PASS: `aloop status --watch` live refresh behavior
- PASS: `aloop gh status` table rendering
- FAIL: dashboard desktop layout verification @ 1920x1080
- FAIL: dashboard docs data population (`/api/state` docs are all empty)
- FAIL: `aloop steer` command availability
- FAIL: `aloop gh watch` error handling (raw stack trace)
- FAIL: `aloop orchestrate --spec NONEXISTENT.md --plan-only` validation
- FAIL: `aloop setup --non-interactive` in fresh HOME (missing template crash)

### Bugs Filed
- [qa/P1] [P0 severity] Dashboard layout mismatch at desktop breakpoint
- [qa/P1] Dashboard docs content empty due incorrect `workdir`
- [qa/P1] `aloop gh watch` crashes with raw stack trace on `gh` failure
- [qa/P1] `aloop orchestrate --spec NONEXISTENT.md --plan-only` exits 0 and initializes session
- [qa/P1] `aloop steer` command still missing
- [qa/P1] `aloop setup --non-interactive` crashes on fresh HOME with missing templates

### Command Transcript
```text
QA temp dir: /tmp/qa-iter51-1773600761
\n$ node /home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree/aloop/cli/dist/index.js --version
1.0.0
[exit_code] 0
\n$ curl -sS http://localhost:4040 | head -n 30
<!DOCTYPE html>
<html lang="en">
<head>
  <script type="module">import { injectIntoGlobalHook } from "/@react-refresh";
injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;</script>

  <script type="module" src="/@vite/client"></script>

  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aloop Dashboard</title>
  <script>
    // Detect system theme before first paint to avoid flash
    (function() {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      function apply(e) {
        document.documentElement.classList.toggle('dark', e.matches);
      }
      apply(mq);
      mq.addEventListener('change', apply);
    })();
  </script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
[exit_code] 0
\n$ cd '/tmp/qa-iter51-1773600761/project' && git init && git config user.email qa@example.com && git config user.name 'QA Bot' && printf '# QA Test Repo\n\n' > README.md && printf '# Spec\n\nTest spec.\n' > SPEC.md && git add . && git commit -m 'init qa repo'
Initialized empty Git repository in /tmp/qa-iter51-1773600761/project/.git/
[master (root-commit) 1228268] init qa repo
 2 files changed, 5 insertions(+)
 create mode 100644 README.md
 create mode 100644 SPEC.md
[stderr]
hint: Using 'master' as the name for the initial branch. This default branch name
hint: is subject to change. To configure the initial branch name to use in all
hint: of your new repositories, which will suppress this warning, call:
hint:
hint: 	git config --global init.defaultBranch <name>
hint:
hint: Names commonly chosen instead of 'master' are 'main', 'trunk' and
hint: 'development'. The just-created branch can be renamed via this command:
hint:
hint: 	git branch -m <name>
hint:
hint: Disable this message with "git config set advice.defaultBranchName false"
[exit_code] 0
\n$ cd '/tmp/qa-iter51-1773600761' && npm init -y >/dev/null
[exit_code] 0
\n$ cd '/tmp/qa-iter51-1773600761' && npm install playwright >/dev/null
[exit_code] 0
\n$ cd '/tmp/qa-iter51-1773600761' && npx playwright install chromium
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-arm64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-arm64.
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-arm64.
[exit_code] 0
\n$ cd '/tmp/qa-iter51-1773600761' && node layout-check.mjs '/home/pj/.copilot/session-state/7147ca78-c213-460e-ad4c-71808c98d4e7/files/qa-iter51/dashboard-1920x1080.png' '/home/pj/.copilot/session-state/7147ca78-c213-460e-ad4c-71808c98d4e7/files/qa-iter51/layout-check.json'
[stderr]
node:internal/modules/run_main:123
    triggerUncaughtException(
    ^

page.goto: Timeout 30000ms exceeded.
Call log:
[2m  - navigating to "http://localhost:4040/", waiting until "networkidle"[22m

    at /tmp/qa-iter51-1773600761/layout-check.mjs:8:12 {
  name: 'TimeoutError'
}

Node.js v22.22.1
[exit_code] 1
\n$ curl -sS http://localhost:4040/api/state | head -c 1200
{"sessionDir":"/home/pj/.aloop/sessions/ralph-skill-20260314-173930","workdir":"/home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree/aloop/cli","runtimeDir":"/home/pj/.aloop","updatedAt":"2026-03-15T18:53:13.862Z","status":{"iteration":35,"phase":"qa","provider":"copilot","stuck_count":0,"state":"running","updated_at":"2026-03-15T18:50:41Z","iteration_started_at":"2026-03-15T18:50:41Z"},"log":"{\"timestamp\":\"2026-03-14T17:39:31Z\",\"run_id\":\"8be01579-e6a2-4d0e-9526-d1df83ac618a\",\"event\":\"session_start\",\"mode\":\"plan-build-review\",\"provider\":\"round-robin\",\"work_dir\":\"/home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree\",\"launch_mode\":\"resume\",\"runtime_commit\":\"cf5557f\",\"runtime_installed_at\":\"2026-03-14T10:34:27Z\",\"devcontainer\":\"false\"}\n{\"timestamp\":\"2026-03-14T17:40:35Z\",\"run_id\":\"98d648e3-0a84-481d-8741-49f31d21a0fe\",\"event\":\"session_start\",\"mode\":\"plan-build-review\",\"provider\":\"round-robin\",\"work_dir\":\"/home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree\",\"launch_mode\":\"resume\",\"runtime_commit\":\"cf5557f\",\"runtime_installed_at\":\"2026-03-14T10:34:27Z\",\"devcontainer\":\"false\"}\n{\[stderr]
curl: (23) Failure writing output to destination, passed 16384 returned 182
[exit_code] 0
\n$ python - <<'PY'
import json,urllib.request
u='http://localhost:4040/api/state'
raw=urllib.request.urlopen(u,timeout=10).read().decode('utf-8')
data=json.loads(raw)
docs=data.get('docs',{}) if isinstance(data,dict) else {}
print('docs_keys=',sorted(docs.keys()))
for k in ['TODO.md','SPEC.md','RESEARCH.md','REVIEW_LOG.md','STEERING.md']:
    v=docs.get(k)
    print(k,'len',0 if v is None else len(v))
print('workdir=',data.get('session',{}).get('meta',{}).get('workdir') or data.get('session',{}).get('meta',{}).get('work_dir'))
PY
[stderr]
bash: line 1: python: command not found
[exit_code] 127
\n$ node /home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree/aloop/cli/dist/index.js steer --help
Usage: aloop [options] [command]

Aloop CLI for dashboard and project orchestration

Options:
  -V, --version                  output the version number
  -h, --help                     display help for command

Commands:
  resolve [options]              Resolve project workspace and configuration
  discover [options]             Discover workspace specs, files, and
                                 validation commands
  setup [options]                Interactive setup and scaffold for aloop
                                 project
  scaffold [options]             Scaffold project workdir and prompts
  start [options] [session-id]   Start an aloop session for the current project
  dashboard [options]            Launch real-time progress dashboard
  status [options]               Show all active sessions and provider health
  active [options]               List active sessions
  stop [options] <session-id>    Stop a session by session-id
  update [options]               Refresh ~/.aloop runtime assets from the
                                 current repo checkout
  devcontainer [options]         Generate or augment
                                 .devcontainer/devcontainer.json for isolated
                                 agent execution
  devcontainer-verify [options]  Verify devcontainer builds, starts, and passes
                                 all checks
  orchestrate [options]          Decompose spec into issues, dispatch child
                                 loops, and merge PRs
  gh                             Policy-enforced GitHub operations
  help [command]                 display help for command
[exit_code] 0
\n$ node /home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree/aloop/cli/dist/index.js gh watch --max-concurrent 1
[stderr]
node:internal/errors:983
  const err = new Error(message);
              ^

Error: Command failed: gh issue list --state open --json number,title,url --limit 100 --label aloop
gh: blocked by aloop PATH hardening

    at genericNodeError (node:internal/errors:983:15)
    at wrappedFn (node:internal/errors:537:14)
    at ChildProcess.exithandler (node:child_process:417:12)
    at ChildProcess.emit (node:events:519:28)
    at maybeClose (node:internal/child_process:1101:16)
    at Socket.<anonymous> (node:internal/child_process:456:11)
    at Socket.emit (node:events:519:28)
    at Pipe.<anonymous> (node:net:346:12) {
  code: 127,
  killed: false,
  signal: null,
  cmd: 'gh issue list --state open --json number,title,url --limit 100 --label aloop',
  stdout: '',
  stderr: 'gh: blocked by aloop PATH hardening\n'
}

Node.js v22.22.1
[exit_code] 1
\n$ node /home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree/aloop/cli/dist/index.js gh status
Issue  Branch                PR    Status      Iteration  Feedback
#7     agent/issue-7-improve-docs #99   completed   —         —
#42    agent/issue-42-fix-auth-flow —     running     —         —
[exit_code] 0
\n$ cd '/tmp/qa-iter51-1773600761/project' && HOME='/tmp/qa-iter51-1773600761/home' node /home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree/aloop/cli/dist/index.js setup --non-interactive --spec SPEC.md --providers claude
Running setup in non-interactive mode...
[stderr]
file:///home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree/aloop/cli/dist/index.js:3388
      throw new Error(`Template not found: ${path.join(templatesDir, file)}`);
            ^

Error: Template not found: /tmp/qa-iter51-1773600761/home/.aloop/templates/PROMPT_plan.md
    at Object.scaffoldWorkspace [as scaffold] (file:///home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree/aloop/cli/dist/index.js:3388:13)
    at async setupCommandWithDeps (file:///home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree/aloop/cli/dist/index.js:8030:21)
    at async _Command.setupCommand (file:///home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree/aloop/cli/dist/index.js:8102:5)

Node.js v22.22.1
[exit_code] 1
\n$ cd '/tmp/qa-iter51-1773600761/project' && HOME='/tmp/qa-iter51-1773600761/home' node /home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree/aloop/cli/dist/index.js orchestrate --spec NONEXISTENT.md --plan-only
Orchestrator session initialized.

  Session dir:  /tmp/qa-iter51-1773600761/home/.aloop/sessions/orchestrator-20260315-185317
  Prompts dir:  /tmp/qa-iter51-1773600761/home/.aloop/sessions/orchestrator-20260315-185317/prompts
  Queue dir:    /tmp/qa-iter51-1773600761/home/.aloop/sessions/orchestrator-20260315-185317/queue
  Requests dir: /tmp/qa-iter51-1773600761/home/.aloop/sessions/orchestrator-20260315-185317/requests
  Loop plan:    /tmp/qa-iter51-1773600761/home/.aloop/sessions/orchestrator-20260315-185317/loop-plan.json
  State file:   /tmp/qa-iter51-1773600761/home/.aloop/sessions/orchestrator-20260315-185317/orchestrator.json
  Spec:         NONEXISTENT.md
  Trunk:        agent/trunk
  Autonomy:     balanced
  Concurrency:  3
  Plan only:    true
[exit_code] 0
\n$ timeout 8s node /home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree/aloop/cli/dist/index.js status --watch
[2J[Haloop status  (refreshing every 2s — 7:53:17 PM)

Active Sessions:
  ralph-skill-20260314-173930  pid=1682112  running  iter 35, qa  (25h ago)
    workdir: /home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree

Provider Health:
  claude     healthy      (last success: 20m ago)
  codex      cooldown     (1 failure, resumes in 1747m)
  copilot    healthy      (last success: 26m ago)
  gemini     healthy      (last success: 2m ago)
  opencode   healthy      (last success: 16m ago)
[2J[Haloop status  (refreshing every 2s — 7:53:19 PM)

Active Sessions:
  ralph-skill-20260314-173930  pid=1682112  running  iter 35, qa  (25h ago)
    workdir: /home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree

Provider Health:
  claude     healthy      (last success: 20m ago)
  codex      cooldown     (1 failure, resumes in 1747m)
  copilot    healthy      (last success: 26m ago)
  gemini     healthy      (last success: 2m ago)
  opencode   healthy      (last success: 16m ago)
[2J[Haloop status  (refreshing every 2s — 7:53:21 PM)

Active Sessions:
  ralph-skill-20260314-173930  pid=1682112  running  iter 35, qa  (25h ago)
    workdir: /home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree

Provider Health:
  claude     healthy      (last success: 20m ago)
  codex      cooldown     (1 failure, resumes in 1747m)
  copilot    healthy      (last success: 26m ago)
  gemini     healthy      (last success: 2m ago)
  opencode   healthy      (last success: 16m ago)
[2J[Haloop status  (refreshing every 2s — 7:53:23 PM)

Active Sessions:
  ralph-skill-20260314-173930  pid=1682112  running  iter 35, qa  (25h ago)
    workdir: /home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree

Provider Health:
  claude     healthy      (last success: 20m ago)
  codex      cooldown     (1 failure, resumes in 1747m)
  copilot    healthy      (last success: 26m ago)
  gemini     healthy      (last success: 2m ago)
  opencode   healthy      (last success: 16m ago)
[exit_code] 124
\n$ cd '/tmp/qa-iter51-1773600761' && npx playwright screenshot --browser chromium --viewport-size=1920,1080 http://localhost:4040 '/home/pj/.copilot/session-state/7147ca78-c213-460e-ad4c-71808c98d4e7/files/qa-iter51/dashboard-1920x1080.png'
Navigating to http://localhost:4040
Capturing screenshot into /home/pj/.copilot/session-state/7147ca78-c213-460e-ad4c-71808c98d4e7/files/qa-iter51/dashboard-1920x1080.png
[exit_code] 0
\n$ cd '/tmp/qa-iter51-1773600761' && node layout-check2.mjs '/home/pj/.copilot/session-state/7147ca78-c213-460e-ad4c-71808c98d4e7/files/qa-iter51/dashboard-1920x1080.png' '/home/pj/.copilot/session-state/7147ca78-c213-460e-ad4c-71808c98d4e7/files/qa-iter51/layout-check.json'
{"asideVisible":false,"visiblePanels":6,"hasSessions":true,"hasDocs":false,"hasActivity":true,"bodyPreview":"\n  Sessions[data-radix-scroll-area-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-scroll-area-viewport]::-webkit-scrollbar{display:none}ralph-skill1ralph-skill-20260314-1739301d ago·qait"}
[exit_code] 0
\n$ node -e "fetch('http://localhost:4040/api/state').then(r=>r.json()).then(d=>{const docs=d.docs||{}; const keys=Object.keys(docs); console.log('docs_keys',keys.join(',')); ['TODO.md','SPEC.md','RESEARCH.md','REVIEW_LOG.md','STEERING.md'].forEach(k=>console.log(k,'len',docs[k]?docs[k].length:0)); console.log('workdir',d.workdir||'');}).catch(e=>{console.error(e); process.exit(1);});"
docs_keys TODO.md,SPEC.md,RESEARCH.md,REVIEW_LOG.md,STEERING.md
TODO.md len 0
SPEC.md len 0
RESEARCH.md len 0
REVIEW_LOG.md len 0
STEERING.md len 0
workdir /home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree/aloop/cli
[exit_code] 0
```

## QA Session — 2026-03-15 (iteration 52)

### Test Environment
- Temp dir: `/tmp/aloop-qa-iter52-1773600998` (cleaned up)
- Session dir: `/home/pj/.aloop/sessions/ralph-skill-20260314-173930`
- Commit: `295091c`
- Features tested: 5 (3 re-tests, 2 new)

### Results
- PASS: `aloop scaffold` (happy path), `aloop resolve` (happy path, json, text, non-git dir)
- FAIL: `aloop steer` CLI (7th consecutive FAIL), `aloop orchestrate --spec NONEXISTENT.md` (7th consecutive FAIL), provider health backoff (7th consecutive FAIL), `aloop scaffold` missing `PROMPT_qa.md`, `aloop scaffold --spec-files NONEXISTENT.md` (no validation), `aloop resolve --project-root /nonexistent` (stack trace)

### Bugs Filed
- [qa/P1] `aloop scaffold` missing `PROMPT_qa.md` — spec's 9-step pipeline requires it
- [qa/P2] `aloop scaffold --spec-files NONEXISTENT.md` no validation
- [qa/P2] `aloop resolve --project-root /nonexistent` leaks stack trace
- [qa/P1] `aloop steer` CLI still missing (7th FAIL)
- [qa/P1] `aloop orchestrate --spec NONEXISTENT.md` still exits 0 (7th FAIL)
- [qa/P1] Provider health backoff still violates spec (7th FAIL)

### Command Transcript

#### Test 1: aloop steer CLI (re-test)

```
$ node aloop/cli/dist/index.js steer --help
Usage: aloop [options] [command]
...
Commands:
  resolve, discover, setup, scaffold, start, dashboard, status, active, stop,
  update, devcontainer, devcontainer-verify, orchestrate, gh, help
(no 'steer' subcommand listed)
[exit_code] 0

$ node aloop/cli/dist/index.js steer 'QA test instruction from iter 52'
error: unknown command 'steer'
[exit_code] 1

$ node aloop/cli/dist/index.js --help | grep -i steer
(no output)
```
FAIL: `steer` command not registered in CLI. 7th consecutive FAIL since iter 26.

#### Test 2: aloop orchestrate --spec NONEXISTENT.md (re-test)

```
$ cd /tmp/aloop-qa-iter52-*/project && node aloop/cli/dist/index.js orchestrate --spec NONEXISTENT.md --plan-only
Orchestrator session initialized.
  Spec:         NONEXISTENT.md
  Plan only:    true
[exit_code] 0

$ node aloop/cli/dist/index.js orchestrate --spec /nonexistent/path/SPEC.md --plan-only
Orchestrator session initialized.
  Spec:         /nonexistent/path/SPEC.md
  Plan only:    true
[exit_code] 0
```
FAIL: Both relative and absolute nonexistent paths accepted. Exits 0 with session initialized. 7th consecutive FAIL.

#### Test 3: Provider health backoff (re-test)

```
$ cat ~/.aloop/health/codex.json
{"status":"cooldown","last_success":"2026-03-13T12:39:26Z","last_failure":"2026-03-13T12:54:46Z","failure_reason":"rate_limit","consecutive_failures":1,"cooldown_until":"2026-03-17T00:00:00Z"}

$ node aloop/cli/dist/index.js status
Provider Health:
  claude     healthy      (last success: 24m ago)
  codex      cooldown     (1 failure, resumes in 1744m)
  copilot    healthy      (last success: 1m ago)
  gemini     healthy      (last success: 6m ago)
  opencode   healthy      (last success: 19m ago)
[exit_code] 0
```
FAIL: codex shows 1744m (~29h) cooldown with only 1 failure. Spec says 1 failure = no cooldown, hard cap 60 min. 7th consecutive FAIL.

#### Test 4: aloop scaffold (new — never tested)

```
$ node aloop/cli/dist/index.js scaffold --help
Usage: aloop scaffold [options]
Options: --project-root, --language, --provider, --enabled-providers,
         --autonomy-level, --round-robin-order, --spec-files, --reference-files,
         --validation-commands, --safety-rules, --mode, --templates-dir, --output
[exit_code] 0
```
PASS: Help displays correctly.

```
$ cd /tmp/aloop-qa-iter52-*/project && node aloop/cli/dist/index.js scaffold
{"config_path":"/home/pj/.aloop/projects/e7ba10f7/config.yml","prompts_dir":"/home/pj/.aloop/projects/e7ba10f7/prompts","project_dir":"/home/pj/.aloop/projects/e7ba10f7","project_hash":"e7ba10f7"}
[exit_code] 0
```
PASS: Creates config and prompts.

```
$ ls /home/pj/.aloop/projects/e7ba10f7/prompts/
PROMPT_build.md  PROMPT_plan.md  PROMPT_proof.md  PROMPT_review.md  PROMPT_steer.md
```
FAIL: Only 5 prompts generated. Spec's default 9-step pipeline (plan → build × 5 → proof → qa → review) requires `PROMPT_qa.md` but it is missing.

```
$ node aloop/cli/dist/index.js scaffold --autonomy-level invalid
{"config_path":"...","prompts_dir":"..."}
[exit_code] 0
```
Note: Invalid autonomy level silently ignored (kept default `balanced`). Not necessarily a bug — scaffold may intentionally be permissive and delegate validation to `setup`.

```
$ node aloop/cli/dist/index.js scaffold --spec-files NONEXISTENT.md
[exit_code] 0
$ cat config.yml | grep spec
spec_files:
  - 'NONEXISTENT.md'
```
FAIL: Nonexistent spec file written to config without validation.

```
$ mkdir -p /tmp/aloop-qa-iter52-*/empty && cd /tmp/aloop-qa-iter52-*/empty
$ node aloop/cli/dist/index.js scaffold
[exit_code] 0
```
PASS: Scaffold works in non-git directory (acceptable behavior).

#### Test 5: aloop resolve (new — never tested)

```
$ cd /tmp/aloop-qa-iter52-*/project && node aloop/cli/dist/index.js resolve
{"project":{"root":"/tmp/.../project","name":"project","hash":"e7ba10f7","is_git_repo":true,"git_branch":"master"},"setup":{"project_dir":"...","config_path":"...","config_exists":true,"templates_dir":"..."}}
[exit_code] 0
```
PASS: JSON output works correctly.

```
$ node aloop/cli/dist/index.js resolve --output text
Project: project [e7ba10f7]
Root: /tmp/.../project
Project config: /home/pj/.aloop/projects/e7ba10f7/config.yml
[exit_code] 0
```
PASS: Text output works correctly.

```
$ cd /tmp/aloop-qa-iter52-*/empty && node aloop/cli/dist/index.js resolve
{"project":{"root":"...","name":"empty","hash":"39d6782a","is_git_repo":false,"git_branch":null},...}
[exit_code] 0
```
PASS: Works in non-git dir, reports `is_git_repo: false`.

```
$ node aloop/cli/dist/index.js resolve --project-root /nonexistent/path
Error: No Aloop configuration found for this project. Run `aloop setup` first.
    at assertProjectConfigured (file:///...aloop/cli/dist/index.js:3282:11)
    at _Command.resolveCommand (file:///...aloop/cli/dist/index.js:3459:3)
[exit_code] 1
```
FAIL: Leaks raw stack trace for nonexistent project root instead of clean user-facing error.

## QA Session — 2026-03-15 (iteration 52)

### Test Environment
- Temp dir: /tmp/qa-test-env
- Features tested: 6

### Results
- PASS: `aloop steer` CLI command
- FAIL: `aloop orchestrate --spec NONEXISTENT.md` exits 0
- FAIL: `aloop scaffold` missing `PROMPT_qa.md`
- FAIL: `aloop setup --non-interactive` fails for fresh HOME
- FAIL: Dashboard layout @1920x1080 (asideVisible=false)
- FAIL: `aloop orchestrate --autonomy-level foo` leaks stack trace

### Command Transcript
```bash
$ mkdir -p /tmp/qa-test-env && cd /tmp/qa-test-env && node $ALOOP_BIN steer --help
Usage: aloop steer [options] <instruction>
...
[exit_code] 0
PASS: Subcommand exists.

$ node $ALOOP_BIN orchestrate --spec NONEXISTENT.md
Orchestrator session initialized.
...
Spec:         NONEXISTENT.md
[exit_code] 0
FAIL: Still accepts nonexistent spec file and exits 0 instead of failing.

$ node $ALOOP_BIN scaffold
{ ... "prompts_dir": ".../prompts" }
$ ls -la .../prompts
PROMPT_build.md  PROMPT_plan.md  PROMPT_proof.md  PROMPT_review.md  PROMPT_steer.md
[exit_code] 0
FAIL: missing PROMPT_qa.md.

$ export HOME=/tmp/qa-fresh-home && node $ALOOP_BIN setup --non-interactive
Error: Template not found: /tmp/qa-fresh-home/.aloop/templates/PROMPT_plan.md
[exit_code] 1
FAIL: Still throws raw stack trace.

$ npx playwright test (Dashboard layout)
asideVisible=false
hasDocsPanel=true
[exit_code] 0
FAIL: asideVisible is false at 1920x1080 instead of true. Sidebar missing.

$ node $ALOOP_BIN orchestrate --spec SPEC.md --autonomy-level foo
Error: Invalid autonomy level: foo (must be cautious, balanced, or autonomous)
    at assertAutonomyLevel (...)
[exit_code] 1
FAIL: Leaks raw stack trace.
```
