# QA Log

## QA Session — 2026-03-24 (issue-176 adapter migration)

### Test Environment
- Binary under test: `/tmp/aloop-test-install-E6ookg/bin/aloop`
- Version: `1.0.0`
- Temp dir: `/tmp/qa-test-gpPI6j`
- Features tested: 4
- Branch: `aloop/issue-176` @ `28f0d0f9`

### Results
- PASS: `aloop setup` adapter propagation (non-interactive → config.yml)
- PASS: adapter propagation config.yml → meta.json (both `github` and `local`)
- PASS: `adapter.test.ts` (47/47)
- PASS: `setup.test.ts` (24/24), `process-requests.test.ts` (10/10)
- FAIL: `orchestrate.test.ts` (315/340, 25 failing) — bug filed

### Bugs Filed
- [qa/P1] 25 orchestrate.test.ts failures after adapter migration

---

### Command Transcript

#### Install
```
$ npm run test-install -- --keep
...
✓ test-install passed (prefix kept at /tmp/aloop-test-install-E6ookg)
/tmp/aloop-test-install-E6ookg/bin/aloop
$ aloop --version
1.0.0
```

#### Test 1: aloop setup (non-interactive, adapter default)
```
$ HOME=$TESTHOME aloop setup --mode orchestrate --non-interactive
Running setup in non-interactive mode...
Setup complete. Config written to: /tmp/qa-home-xxx/.aloop/projects/d56b1768/config.yml
EXIT: 0
$ grep adapter config.yml
adapter: 'github'   ← PASS: adapter field written with default 'github'
```

#### Test 2: Adapter propagation to meta.json
```
$ HOME=$TESTHOME aloop start --max-iterations 1 &
Aloop loop started! Session: qa-test-gppi6j-20260324-124311
$ grep '"adapter"' meta.json
"adapter": "github"   ← PASS

# After manually setting adapter: 'local' in config.yml:
$ HOME=$TESTHOME2 aloop start --max-iterations 1 &
$ grep '"adapter"' meta.json
"adapter": "local"   ← PASS
```

#### Test 3: adapter.test.ts unit tests
```
$ npx tsx --test src/lib/adapter.test.ts
# tests 47
# pass 47
# fail 0   ← PASS (all 47 tests pass)
```

#### Test 4: orchestrate.test.ts after migration
```
$ npx tsx --test src/commands/orchestrate.test.ts
# tests 340
# pass 315
# fail 25   ← FAIL

Failing tests include:
  not ok - "merges PR when all gates pass and review approves"
    actual: 'flagged_for_human'
    expected: 'merged'
  not ok - "returns pending when CI checks are still running"
    actual: true, expected: false
  not ok - "creates worktree with correct branch name"
    actual: git call does not include '-b'
  not ok - "auto-approves when no agent reviewer configured"
    actual: 'flag-for-human'
  not ok - "fails when acceptance criteria are missing"
    actual: true, expected: false
```

#### Interactive setup adapter prompt (informational)
```
$ printf "SPEC.md\nclaude\n...\ngithub\n...\n" | aloop setup
--- Aloop Interactive Setup ---
...
Issue/PR backend (github|local) [github]:   ← CONFIRMED: adapter prompt exists
Autonomy Level (cautious|balanced|autonomous) [balanced]:
Warning: Detected unsettled top-level await ...   ← crashes when stdin is piped
EXIT: 13
```
Note: Interactive setup crashes when stdin is piped (pre-existing issue, unrelated to adapter changes — setup.test.ts interactive tests pass).
