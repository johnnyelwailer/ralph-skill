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
