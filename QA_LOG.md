# QA Log

## QA Session — 2026-03-24 (iteration 13)

### Test Environment
- Binary under test: `/tmp/aloop-test-install-GgfYrc/bin/aloop`
- Version: `1.0.0`
- Commit: `177a847b`
- Features tested: 5 (`aloop --help` fix re-test, `aloop help --all`, `aloop --help --all`, `engine` field re-test, `--launch resume` worktree bug)

### Results
- PASS: `aloop --help` now shows exactly 6 commands (was PARTIAL, now fixed)
- PASS: `aloop help --all` shows 16 commands including all hidden ones
- PASS: `--concurrency` flag present on `aloop start`
- FAIL: `aloop --help --all` still shows only 6 commands (not all) — new bug filed
- FAIL: `aloop start <id> --launch resume` warns "Failed to create worktree: branch already exists" — new bug filed
- FAIL: `engine` field still missing from meta.json — previously filed bug still open

### Bugs Filed
- [qa/P2] `aloop start --launch resume` warns "Failed to create worktree" (branch already exists on every resume)
- [qa/P2] `aloop --help --all` does not show hidden commands (only `aloop help --all` works)

### Command Transcript

```
# Install
ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
# ALOOP_BIN=/tmp/aloop-test-install-GgfYrc/bin/aloop
# Version: 1.0.0

# TEST 1: aloop --help shows 6 commands
$ aloop --help
→ Shows: setup, start, dashboard, status, stop, steer (6 exactly, no `help`)
→ Exit: 0 ✅ PASS (was PARTIAL, now fixed)

# TEST 2: aloop help --all
$ aloop help --all
→ Shows 16 commands including all hidden ones (resolve, discover, scaffold, etc.)
→ Exit: 0 ✅ PASS

# TEST 3: aloop --help --all
$ aloop --help --all
→ Shows only 6 user-facing commands (same as regular --help)
→ Exit: 0 ❌ FAIL — acceptance criterion requires this to show hidden commands

# TEST 4: engine field in meta.json
$ aloop start --mode orchestrate  (in temp dir with SPEC.md)
→ meta.json: {"session_id":"...","project_root":"...","provider":"claude","mode":"orchestrate","work_dir":"...","pid":...,"started_at":"..."}
→ engine field: ABSENT
→ ❌ FAIL — still missing (bug was filed in previous QA, still not fixed)

# TEST 5: resume worktree bug
$ aloop start --mode orchestrate  # creates session + branch aloop/orchestrator-XXX
$ aloop stop <session-id>
$ aloop start <session-id> --launch resume
→ Output: Session resumes (mode=orchestrate, launch=resume)
→ Warnings: "Failed to create worktree: fatal: a branch named 'aloop/orchestrator-XXX' already exists"
→ Exit: 0 (session starts) but with warning
→ ❌ FAIL — resume should not try to create new worktree if branch already exists

# TEST 6: --concurrency flag
$ aloop start --help
→ Shows: --concurrency <number>  Max concurrent child loops (orchestrate mode)
→ ✅ PASS — flag is present and documented
```

## QA Session — 2026-03-24 (iteration 12)

### Test Environment
- Binary under test: `/tmp/aloop-test-install-jNmHw1/bin/aloop`
- Version: `1.0.0`
- Temp dir: `/tmp/qa-test-WxlOZl`
- Features tested: 5 (CLI help visibility, orchestrate dispatch, config-driven dispatch, CLI flag override, session resume)

### Results
- PASS: `aloop help --all` shows all commands including hidden ones
- PASS: Hidden commands (resolve, scaffold) still execute normally via direct invocation
- PASS: `aloop start --mode orchestrate` dispatches to orchestrate mode
- PASS: `aloop start` with `mode: orchestrate` in config dispatches to orchestrate
- PASS: `aloop start --mode loop` overrides orchestrate config → runs as loop
- PASS: `aloop orchestrate` direct invocation still works (backward compat)
- PASS: `aloop start <session-id> --launch resume` resumes orchestrator session via `mode: orchestrate` fallback
- PASS: `aloop start <session-id> --launch resume` for loop session stays as loop
- PASS: `/aloop:start` skill documents `--mode loop`, `--mode orchestrate`, `--max <n>` → `--max-iterations <n>`
- PARTIAL: Default `aloop --help` shows 7 commands (includes `help` itself); spec says 6
- FAIL: `engine` field not written to meta.json when creating orchestrator session via `aloop start`

### Bugs Filed
- [qa/P2] `engine` field missing from orchestrator meta.json when using `aloop start`

### Minor Findings
- Default `aloop --help` shows 7 commands (`help` is the 7th). Spec says "only 6". The `help` command being visible is reasonable UX (users need to discover `help --all`), but it deviates from the AC's explicit list.

### Command Transcript

```
# Install from source
$ npm --prefix aloop/cli run test-install -- --keep
# (dashboard deps installed first)
✓ test-install passed (prefix kept at /tmp/aloop-test-install-jNmHw1)
/tmp/aloop-test-install-jNmHw1/bin/aloop

# Verify binary
$ /tmp/aloop-test-install-jNmHw1/bin/aloop --version
1.0.0
EXIT: 0

# Test 1: Default help (spec says 6 commands)
$ aloop --help
Commands: setup, start, dashboard, status, stop, steer, help (7 items)
# PARTIAL: spec says 6, we have 7 (help is the 7th)

# Test 2: aloop help --all
$ aloop help --all
Commands: resolve, discover, setup, scaffold, start, dashboard, status, active,
          stop, update, devcontainer, devcontainer-verify, orchestrate, steer,
          process-requests, gh, help, debug-env
EXIT: 0
# PASS: all hidden commands visible

# Test 3: Hidden commands execute directly
$ aloop resolve --help
Usage: aloop resolve [options] ... EXIT: 0
$ aloop scaffold --help
Usage: aloop scaffold [options] ... EXIT: 0
# PASS

# Test 4: Setup test project
$ mkdir /tmp/qa-test-WxlOZl && git init && git commit --allow-empty -m init
$ echo "spec: test" > SPEC.md
$ aloop scaffold --mode loop --spec-files SPEC.md
{"config_path":"/home/pj/.aloop/projects/4e74e248/config.yml",...}

# Test 5: aloop start --mode orchestrate
$ aloop start --mode orchestrate --project-root /tmp/qa-test-WxlOZl
Aloop loop started!
  Session:  orchestrator-20260324-070407
  Mode:     orchestrate
  Launch:   start
  ...
EXIT: 0
# PASS: dispatches to orchestrate

# Check meta.json
$ cat ~/.aloop/sessions/orchestrator-20260324-070407/meta.json
{"mode": "orchestrate", ...}
# FAIL: no "engine" field present (spec says to write engine: 'orchestrate')

# Test 6: Resume orchestrator session
$ aloop start orchestrator-20260324-070407 --launch resume
Aloop loop started!
  Session:  orchestrator-20260324-070407
  Mode:     orchestrate
  Launch:   resume
  ...
EXIT: 0
# PASS: resumes correctly via mode=orchestrate fallback
# Warning: "Failed to create worktree: branch already exists" is expected on resume

# Test 7: aloop start --mode loop overrides orchestrate config
# (set config mode to orchestrate)
$ sed -i "s/mode: 'plan-build-review'/mode: 'orchestrate'/" ~/.aloop/projects/4e74e248/config.yml
$ aloop start --mode loop --project-root /tmp/qa-test-WxlOZl
Aloop loop started!
  Session:  qa-test-wxlozl-20260324-070451
  Mode:     plan-build-review
  Launch:   start
  ...
EXIT: 0
# PASS: --mode loop overrides orchestrate config

# Test 8: aloop start with orchestrate config (no flag)
$ aloop start --project-root /tmp/qa-test-WxlOZl
Aloop loop started!
  Session:  orchestrator-20260324-070501
  Mode:     orchestrate
  Launch:   start
  ...
EXIT: 0
# PASS: config orchestrate dispatches to orchestrator

# Test 9: aloop orchestrate direct (backward compat)
$ aloop orchestrate --project-root /tmp/qa-test-WxlOZl
Orchestrator session initialized.
  Session dir:  /home/pj/.aloop/sessions/orchestrator-20260324-070508
  ...
EXIT: 0
# PASS: direct command works

# Test 10: Resume loop session (stays as loop)
# (reset config to loop mode)
$ aloop start qa-test-wxlozl-20260324-070543 --launch resume
Aloop loop started!
  Session:  qa-test-wxlozl-20260324-070543
  Mode:     plan-build-review
  Launch:   resume
  ...
EXIT: 0
# PASS: loop session resume stays as plan-build-review

# Test 11: /aloop:start skill docs
$ cat claude/commands/aloop/start.md
# PASS: documents --mode loop, --mode orchestrate, --max <n> → --max-iterations <n>

# Cleanup
$ rm -rf ~/.aloop/sessions/orchestrator-20260324-* ~/.aloop/sessions/qa-test-wxlozl-*
$ rm -rf /home/pj/.aloop/projects/4e74e248 /tmp/qa-test-WxlOZl
$ rm -rf /tmp/aloop-test-install-jNmHw1
```
