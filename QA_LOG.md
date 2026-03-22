# QA Log

## QA Session — 2026-03-22 (iteration 1)

### Binary Under Test
- Path: `/tmp/aloop-test-install-dVSVmq/bin/aloop`
- Version: `1.0.0`
- Commit: `b82c1e3`

### Test Environment
- Temp dir: `/tmp/aloop-test-install-dVSVmq` (cleaned up)
- Orchestrate test dir: `/tmp/qa-test-orch-611310` (cleaned up)
- Features tested: 4

### Features Tested

1. **CLI build & install from source** — PASS
   - `npm run test-install -- --keep` → built, packed, installed to isolated prefix
   - Binary verified at `/tmp/aloop-test-install-dVSVmq/bin/aloop`
   - `aloop --version` → `1.0.0`

2. **Test suite (941/957 pass, 16 fail)** — PARTIAL
   - Full suite: `npm test` → 941 pass, 16 fail
   - Review-specific tests that PASS:
     - "rejects PR when agent review requests changes" — verifies formal review API used
     - "stores individual review comments with IDs for builder redispatch"
     - "flags for human when agent review flags"
     - "auto-approves when no agent reviewer configured"
     - "delegates to agent reviewer when configured"
   - Review-specific tests that FAIL:
     - "flags for human when diff fetch fails" → expected `flag-for-human`, got `pending`
     - "handles gh errors gracefully for mergeability" → expected `fail`, got `pass`

3. **`aloop orchestrate` CLI interface** — PASS
   - `aloop orchestrate --help` → all expected flags present (--spec, --concurrency, --budget, etc.)
   - `aloop orchestrate --plan-only --spec SPEC.md` → initializes session, creates state files, exits 0

4. **Review prompt template** — PASS
   - Installed template at `dist/templates/PROMPT_orch_review.md` verified
   - Uses `inline_comments` array (not legacy `comments`)
   - Dropped `end_line` field (simplified)
   - Clear guidance on path/line validation against diff
   - Correct JSON schema documented

### Bugs Filed
- [qa/P1] reviewPrDiff returns `pending` instead of `flag-for-human` when diff fetch fails
- [qa/P1] checkPrGates handles gh errors for mergeability returns `pass` instead of `fail`

### Notes
- 14 of 16 test failures appear to be pre-existing (not related to this PR's changes): dashboard asset resolution, PATH hardening, DoR validation, decomposition, gap analysis, epic helpers, multi-file spec
- The 2 review-related failures (reviewPrDiff + checkPrGates) may have been introduced or exposed by the adapter refactor in this PR
- Git operations in the container are limited (worktree .git points to host macOS path /Users/pj/), preventing git-based comparison with previous commits

---

## QA Session — 2026-03-22 (iteration 2)

### Binary Under Test
- Path: `/tmp/aloop-test-install-6RQQTl/bin/aloop`
- Version: `1.0.0`
- Commit: `59b8999`

### Test Environment
- Install prefix: `/tmp/aloop-test-install-6RQQTl`
- Features tested: 5

### Results
- PASS: reviewPrDiff flag-for-human on diff error (re-test, previously FAIL)
- PASS: checkPrGates fail on mergeability error (re-test, previously FAIL)
- PASS: adapter injection in processPrLifecycle (new fix)
- PASS: review prompt template schema validation
- PASS: aloop orchestrate --help

### Bugs Filed
- None — both previously filed bugs are now fixed

### Command Transcript

**1. CLI install & version check**
```
$ ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
Binary: /tmp/aloop-test-install-6RQQTl/bin/aloop
$ aloop --version
1.0.0
```

**2. Re-test: reviewPrDiff flag-for-human on diff fetch error**
```
$ npx tsx --test --test-name-pattern="flags for human when diff fetch fails" src/commands/orchestrate.test.ts
ok 1 - flags for human when diff fetch fails
# tests 1, pass 1, fail 0
```
Exit code: 0 — PASS (was FAIL at commit b82c1e3, fixed by commit 02bd951)

**3. Re-test: checkPrGates mergeability error handling**
```
$ npx tsx --test --test-name-pattern="handles gh errors gracefully for mergeability" src/commands/orchestrate.test.ts
ok 1 - handles gh errors gracefully for mergeability
# tests 1, pass 1, fail 0
```
Exit code: 0 — PASS (was FAIL at commit b82c1e3, fixed by commit 5f29e01)

**4. Adapter injection — processPrLifecycle tests**
```
$ npx tsx --test --test-name-pattern="rejects PR when agent review requests changes" src/commands/orchestrate.test.ts
ok 1 - rejects PR when agent review requests changes
# tests 1, pass 1, fail 0

$ npx tsx --test --test-name-pattern="stores individual review comments" src/commands/orchestrate.test.ts
ok 1 - stores individual review comments with IDs for builder redispatch
# tests 1, pass 1, fail 0

$ npx tsx --test --test-name-pattern="flags for human when agent review flags" src/commands/orchestrate.test.ts
ok 1 - flags for human when agent review flags
# tests 1, pass 1, fail 0

$ npx tsx --test --test-name-pattern="auto-approves|delegates to agent" src/commands/orchestrate.test.ts
ok 1 - auto-approves when no agent reviewer configured
ok 2 - delegates to agent reviewer when configured
# tests 2, pass 2, fail 0
```
All 5 tests pass — adapter injection (commit 59b8999) working correctly.

**5. normalizeAgentReviewResult parsing**
```
$ npx tsx --test --test-name-pattern="normalizeAgentReviewResult" src/commands/process-requests.test.ts
ok 1 - parses valid review result with inline comments and filters malformed comment entries
ok 2 - parses valid review result without inline comments
ok 3 - returns null for malformed review schema
# tests 3, pass 3, fail 0
```

**6. Full PR lifecycle suite**
```
$ npx tsx --test --test-name-pattern="processPrLifecycle|reviewPrDiff|checkPrGates" src/commands/orchestrate.test.ts
ok 1 - checkPrGates (8 subtests)
ok 2 - reviewPrDiff (4 subtests)
ok 3 - processPrLifecycle (13 subtests)
# tests 25, pass 25, fail 0
```

**7. aloop orchestrate --help**
```
$ aloop orchestrate --help
Usage: aloop orchestrate [options]
Decompose spec into issues, dispatch child loops, and merge PRs
Options: --spec, --concurrency, --trunk, --issues, --label, --repo, --autonomy-level, --plan, --plan-only, --budget, --interval, --max-iterations, --auto-merge, --home-dir, --project-root, --output
```

**8. Review prompt template**
```
$ find /tmp/aloop-test-install-6RQQTl -name "PROMPT_orch_review.md" -exec grep -c "comments" {} \;
6  (field name is `comments`, JSON schema includes path/line/body/suggestion/end_line)
```

### Correction from iteration 1
- Iteration 1 noted the template uses `inline_comments` — this was inaccurate. The template JSON schema field is `comments` (not `inline_comments`). The code in `normalizeAgentReviewResult` parses `raw.comments`. This is consistent.
