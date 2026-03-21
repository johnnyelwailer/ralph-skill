# QA Log

## QA Session — 2026-03-21 (iteration 20)

### Binary Under Test
- Path: /tmp/aloop-test-install-XZk4UZ/bin/aloop
- Version: 1.0.0
- Commit: 49c613b

### Test Environment
- Temp project dir: /tmp/qa-test-1774111959 (git repo with SPEC.md)
- Install prefix: /tmp/aloop-test-install-XZk4UZ
- Features tested: 5 (CLI basics, start lifecycle, dashboard, discover, build/install)

### Results
- PASS: aloop --version, --help, status, start, stop, steer, scaffold, dashboard, update, resolve, gh --help, orchestrate --help
- FAIL: aloop discover (exits 0 on non-existent path), npm run build (vite not found), test-install (requires manual dashboard deps)

### Bugs Filed
- [qa/P2] `aloop discover` exits 0 for non-existent `--project-root` paths
- [qa/P2] `npm run build` fails when dashboard dependencies not installed

### Command Transcript

#### 1. test-install
```
$ npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1
(empty — failed because build fails without dashboard deps)
```

#### 2. Dashboard deps + rebuild
```
$ cd aloop/cli/dashboard && npm install
(success)
$ cd aloop/cli && npm install && npm run build
> esbuild src/index.ts ... --outfile=dist/index.js
  dist/index.js  546.7kb
(build:dashboard failed with "vite: not found" but build:server succeeded after retry with deps installed)
```

#### 3. test-install (after deps installed)
```
$ node scripts/test-install.mjs --keep
✓ test-install passed (prefix kept at /tmp/aloop-test-install-XZk4UZ)
/tmp/aloop-test-install-XZk4UZ/bin/aloop
EXIT: 0
```

#### 4. aloop --version
```
$ aloop --version
1.0.0
EXIT: 0
```

#### 5. aloop --help
```
$ aloop --help
Usage: aloop [options] [command]
Commands: resolve, discover, setup, scaffold, start, dashboard, status, active, stop, update, devcontainer, devcontainer-verify, orchestrate, steer, process-requests, gh, help
EXIT: 0
```

#### 6. aloop status
```
$ aloop status
Active Sessions:
  orchestrator-20260321-155413  pid=1627091  running  iter 38, queue  (58m ago)
  orchestrator-20260321-155413-issue-124-20260321-161253  pid=1749243  running  iter 20, qa  (39m ago)
  orchestrator-20260321-155413-issue-146-20260321-163402  pid=1816994  running  iter 14, build  (18m ago)
Provider Health:
  claude healthy, codex healthy, copilot healthy, gemini cooldown (220 failures), opencode healthy
EXIT: 0
```

#### 7. aloop scaffold (in temp project)
```
$ aloop scaffold --project-root /tmp/qa-test-1774111959 --output text
Wrote config: /home/pj/.aloop/projects/d3ac4114/config.yml
Wrote prompts: /home/pj/.aloop/projects/d3ac4114/prompts
EXIT: 0
```

#### 8. aloop start (in temp project)
```
$ aloop start --project-root /tmp/qa-test-1774111959 --provider claude --max-iterations 1 --in-place --output text
Session: qa-test-1774111959-20260321-165301
Mode: plan-build-review
Provider: claude
PID: 1882886
Dashboard: http://localhost:34513
EXIT: 0
```

#### 9. aloop status (verify session appeared)
```
$ aloop status | grep qa-test
  qa-test-1774111959-20260321-165301  pid=1882886  running  iter 1, plan  (3s ago)
```

#### 10. aloop stop
```
$ aloop stop qa-test-1774111959-20260321-165301
Session qa-test-1774111959-20260321-165301 stopped.
EXIT: 0
```

#### 11. aloop stop (non-existent session)
```
$ aloop stop nonexistent-session
Session not found: nonexistent-session
EXIT: 1
```

#### 12. aloop steer (multiple sessions, no --session)
```
$ aloop steer "test instruction"
Multiple active sessions. Specify one with --session: orchestrator-20260321-155413, ...
EXIT: 1
```

#### 13. aloop dashboard
```
$ aloop dashboard --port 14047 --session-dir <session> --workdir <worktree>
GET / -> HTTP 200 (HTML)
GET /events -> HTTP 200 (SSE stream with state event containing session data)
GET /api/* -> HTTP 404 (correct)
```

#### 14. aloop discover (valid path)
```
$ aloop discover --project-root /tmp/qa-test-1774111959 --output text
Project: qa-test-1774111959 [d3ac4114]
Detected language: other (low)
Providers installed: claude, opencode, codex, gemini, copilot
Spec candidates: SPEC.md
EXIT: 0
```

#### 15. aloop discover (non-existent path — BUG)
```
$ aloop discover --project-root /tmp/nonexistent
{"project":{"root":"/tmp/nonexistent","name":"nonexistent","hash":"cc7dd880","is_git_repo":false,...}}
EXIT: 0
(Expected EXIT: 1 with error message)
```

#### 16. aloop update
```
$ aloop update --output text
Updated ~/.aloop from <worktree>
Version: 49c613b (2026-03-21T16:55:55Z)
Files updated: 100
EXIT: 0
```

#### 17. aloop resolve (no config)
```
$ aloop resolve
Error: No Aloop configuration found for this project. Run `aloop setup` first.
EXIT: 1
```

### Cleanup
- Deleted /tmp/qa-test-1774111959
- Deleted /tmp/aloop-test-install-XZk4UZ
- Deleted /home/pj/.aloop/projects/d3ac4114
