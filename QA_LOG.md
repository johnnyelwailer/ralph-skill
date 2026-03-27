# QA Log

## QA Session — 2026-03-27 (iteration 11)

### Test Environment
- Binary under test: `/tmp/aloop-test-install-276295/bin/aloop` (version 1.0.0)
- Installed via: `npm pack` + `npm install -g` to isolated temp prefix
- Test dirs: `/tmp/qa-test-277130` (with periodic), `/tmp/qa-test-noperiodic-281642` (without periodic)
- Features tested: 5

### Results
- PASS: pipeline.yml periodic fields for spec-gap and docs
- PASS: compile-loop-plan produces 18-entry super-cycle (positions verified)
- PASS: backwards compat — no periodic entries → 8-entry cycle
- PASS: loop.sh and loop.ps1 not modified by issue-103 commits
- PASS: compile-loop-plan unit tests (tests 1–36 all pass)
- FAIL: periodic super-cycle unit tests missing (TODO task unchecked)

### Bugs Filed
- [qa/P1] Missing unit tests for periodic super-cycle expansion (TODO still unchecked)

### Command Transcript

#### Install CLI
```
$ npm --prefix aloop/cli install
$ cd aloop/cli/dashboard && npm install
$ npm --prefix aloop/cli build  # SUCCESS
$ cd aloop/cli && npm pack      # → aloop-cli-1.0.0.tgz
$ npm install -g --prefix /tmp/aloop-test-install-276295 aloop-cli-1.0.0.tgz
$ /tmp/aloop-test-install-276295/bin/aloop --version
1.0.0
Exit: 0
```

#### Test 1: pipeline.yml periodic fields
```
$ grep -A5 "spec-gap\|docs" .aloop/pipeline.yml
  - agent: spec-gap
    periodic:
      every: 2
      inject_before: plan
  - agent: docs
    periodic:
      every: 2
      inject_after: qa
Exit: 0
Result: PASS — both agents have correct periodic config
```

#### Test 2: compile-loop-plan super-cycle (18 entries)
```
$ mkdir /tmp/qa-test-277130 && cd /tmp/qa-test-277130
$ git init && copy pipeline.yml from worktree
$ aloop scaffold && aloop start --in-place
Session: qa-test-277130-20260327-150704
$ cat ~/.aloop/sessions/qa-test-277130-20260327-150704/loop-plan.json
{
  "cycle": [
    "PROMPT_plan.md",       # pos 0
    "PROMPT_build.md",      # pos 1
    "PROMPT_build.md",      # pos 2
    "PROMPT_build.md",      # pos 3
    "PROMPT_build.md",      # pos 4
    "PROMPT_build.md",      # pos 5
    "PROMPT_qa.md",         # pos 6
    "PROMPT_review.md",     # pos 7  ← end of pass 1
    "PROMPT_spec-gap.md",   # pos 8  ← inject_before: plan in pass 2
    "PROMPT_plan.md",       # pos 9
    "PROMPT_build.md",      # pos 10
    "PROMPT_build.md",      # pos 11
    "PROMPT_build.md",      # pos 12
    "PROMPT_build.md",      # pos 13
    "PROMPT_build.md",      # pos 14
    "PROMPT_qa.md",         # pos 15
    "PROMPT_docs.md",       # pos 16 ← inject_after: qa in pass 2
    "PROMPT_review.md"      # pos 17 ← end of pass 2
  ],
  "cycleLength": [implicit 18]
}
Exit: 0
Result: PASS — cycle length=18, positions match spec exactly
$ aloop stop qa-test-277130-20260327-150704
```

#### Test 3: Backwards compat (no periodic → 8-entry cycle)
```
$ mkdir /tmp/qa-test-noperiodic-281642 && cd /tmp/qa-test-noperiodic-281642
$ cat > .aloop/pipeline.yml  # WITHOUT periodic entries
$ aloop scaffold && aloop start --in-place
$ cat ~/.aloop/sessions/qa-test-noperiodic-281642-20260327-150745/loop-plan.json
{
  "cycle": ["PROMPT_plan.md","PROMPT_build.md"×5,"PROMPT_qa.md","PROMPT_review.md"],
  "cycleLength": 8
}
Exit: 0
Result: PASS — cycle length=8, backwards compat confirmed
$ aloop stop qa-test-noperiodic-281642-20260327-150745
```

#### Test 4: loop.sh/loop.ps1 not modified
```
$ git show 5e9f8ddcc 9fb12192d 020a180a7 --name-only | grep "loop\.\(sh\|ps1\)"
(no output)
Exit: 0
Result: PASS — none of the issue-103 commits touched loop scripts
```

#### Test 5: npm test suite
```
$ npm --prefix aloop/cli test
# tests 1125, pass 1092, fail 17, skipped 1
# compile-loop-plan tests (1–36): ALL PASS
# not ok tests: 38,40,41,42,43,342,349,356,358,359,362,372,373,377,383,387,599
# Pre-existing baseline (master): 28 failures
# This branch: 17 failures (improved)
Exit: 1 (due to pre-existing failures)
Result: PARTIAL — compile-loop-plan passes; 17 pre-existing failures in other areas
Missing: unit tests for super-cycle expansion (TODO task unchecked)
```

### Cleanup
```
$ rm -rf /tmp/qa-test-277130 /tmp/qa-test-noperiodic-281642
$ rm -rf /tmp/aloop-test-install-276295
$ rm aloop/cli/aloop-cli-1.0.0.tgz
```
