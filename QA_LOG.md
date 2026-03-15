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
