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

## QA Session — 2026-03-24 (iteration 2 — re-test after fixes)

### Test Environment
- Binary: /tmp/aloop-test-install-YCpzdT/bin/aloop (cleaned up)
- Version: 1.0.0
- Commits tested: a03fb518, 1c3ca1b8
- Features tested: 4

### Results
- PASS: orchestrate.test.ts — all 340 tests pass (was 25 failing)
- PASS: adapter.test.ts — all 56 tests pass (was 47; 9 new branch-coverage tests added)
- PASS: setup.test.ts — all 28 tests pass
- PASS: process-requests.test.ts — all 6 tests pass
- FAIL: Dead code in adapter.ts — Gate 4 still open (filed as new qa task)

### Bugs Filed
- [qa/P2] Dead code in adapter.ts: unused import + unreachable existsSync checks (Gate 4, pre-existing open task)

### Command Transcript

#### Install
```
$ npm run test-install -- --keep
/tmp/aloop-test-install-YCpzdT/bin/aloop
$ aloop --version
1.0.0
EXIT: 0
```

#### Test 1: orchestrate.test.ts re-test (was 25 FAIL)
```
$ npx tsx --test src/commands/orchestrate.test.ts
# tests 340
# pass 340
# fail 0
EXIT: 0  ← PASS (all 25 failures fixed by a03fb518)
```

#### Test 2: adapter.test.ts branch coverage (Gate 2/3 fix)
```
$ npx tsx --test src/lib/adapter.test.ts
# tests 56
# pass 56
# fail 0
EXIT: 0  ← PASS (9 new tests added by 1c3ca1b8)
```

#### Test 3: setup.test.ts + process-requests.test.ts
```
$ npx tsx --test src/commands/setup.test.ts src/commands/process-requests.test.ts
# tests 34
# pass 34
# fail 0
EXIT: 0  ← PASS
```

#### Test 4: Dead code inspection in adapter.ts (Gate 4)
```
$ grep -n "parseRepoSlug" src/lib/adapter.ts
14: import { parseRepoSlug, fetchBulkIssueState } from './github-monitor.js';
← parseRepoSlug imported but never used anywhere in the file

$ sed -n '359,365p' src/lib/adapter.ts
private async ensureDirs(): Promise<void> {
  await mkdir(this.issuesDir, { recursive: true });
  await mkdir(this.prsDir, { recursive: true });
}

$ sed -n '393,396p' src/lib/adapter.ts
await this.ensureDirs();
if (!existsSync(this.issuesDir)) return 1;  ← UNREACHABLE: ensureDirs() creates the dir
← Same pattern at line 404 for prsDir
EXIT: n/a — static analysis  ← FAIL (Gate 4 still open)
```

#### Cleanup
```
$ rm -rf /tmp/aloop-test-install-YCpzdT
```
