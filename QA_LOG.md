# QA Log

## QA Session — 2026-03-22 (iteration 5)

### Binary Under Test
```
Binary: /tmp/aloop-test-install-0Xc5sz/bin/aloop
Version: 1.0.0
```

### Target Selection
- QA coverage parsing (loop.sh): selected because UNTESTED — new feature in this PR
- QA coverage gate in finalizer (loop.sh): selected because UNTESTED — new feature in this PR
- QA coverage parsing (loop.ps1): selected because UNTESTED — new feature in this PR
- Finalizer prompt compilation: selected because UNTESTED — related to finalizer pipeline
- iteration_mode spec-gap/docs: selected because UNTESTED — new feature in this PR

### Test Environment
- Temp dirs: /tmp/qa-test-issue104-*, /tmp/qa-test-cov-*, /tmp/qa-test-modes-*
- Features tested: 5 feature areas
- Provider: claude (for loop invocation)
- Approach: Created isolated test projects with different QA_COVERAGE.md states

### Results
- PASS: Finalizer prompt templates (all 6 exist with correct frontmatter)
- PASS: Finalizer array in loop-plan.json (populated correctly when pipeline.yml present)
- FAIL: QA coverage gate — blocked by finalizer-skip bug
- FAIL: iteration_mode spec-gap/docs — blocked by finalizer-skip bug
- FAIL: Finalizer prompts not copied to session prompts directory

### Bugs Filed
- [qa/P0] Finalizer skipped when allTasksMarkedDone=true at session start — loop exits immediately
- [qa/P1] Finalizer prompt files not copied to session prompts directory
- [qa/P1] Default scaffold missing pipeline.yml — finalizer array empty without explicit config

### Command Transcript

#### Test 1: Install CLI
```
$ npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1
/tmp/aloop-test-install-0Xc5sz/bin/aloop

$ /tmp/aloop-test-install-0Xc5sz/bin/aloop --version
1.0.0
```
Exit code: 0

#### Test 2: Deploy latest loop scripts
```
$ grep -c "qa.*coverage\|QA.*coverage\|coverage.*gate\|check_qa_coverage" ~/.aloop/bin/loop.sh
0  # Changes NOT deployed yet!

$ aloop update
Updated ~/.aloop from <worktree>
Version: 3753539b (2026-03-22T16:58:55Z)
Files updated: 108

$ grep -c "qa.*coverage\|QA.*coverage\|coverage.*gate\|check_qa_coverage" ~/.aloop/bin/loop.sh
12  # Now deployed
```

#### Test 3: Scaffold without pipeline.yml
```
$ mkdir /tmp/qa-test-issue104-*; cd /tmp/qa-test-issue104-*; git init; ...
$ aloop scaffold
$ aloop start --provider claude --max-iterations 1

# Inspected loop-plan.json:
"finalizer": []   # EMPTY — no pipeline.yml means no finalizer agents

# After adding .aloop/pipeline.yml with finalizer config:
"finalizer": ["PROMPT_spec-gap.md","PROMPT_docs.md","PROMPT_spec-review.md","PROMPT_final-review.md","PROMPT_final-qa.md","PROMPT_proof.md"]
# Correctly populated
```

#### Test 4: Session prompts directory
```
$ ls ~/.aloop/sessions/qa-test-issue104-*/prompts/
PROMPT_build.md  PROMPT_plan.md  PROMPT_proof.md  PROMPT_qa.md  PROMPT_review.md  PROMPT_steer.md
# MISSING: PROMPT_spec-gap.md, PROMPT_docs.md, PROMPT_spec-review.md, PROMPT_final-review.md, PROMPT_final-qa.md
```
The finalizer prompts are listed in loop-plan.json but never copied to the session's prompts directory.

#### Test 5: Finalizer skip bug (allTasksMarkedDone=true)
```
# TODO.md with all tasks checked:
- [x] Create hello.txt with Hello World

# QA_COVERAGE.md with FAIL entry:
| Feature A | core | 2026-03-22 | abc1234 | FAIL | 1/3 | broken |

$ aloop start --provider claude --max-iterations 3

# After ~1 second:
# status.json: {"state":"completed","phase":"plan","iteration":1}
# log.jsonl: only session_start and frontmatter_applied events
# No finalizer_entered, no coverage_check, no finalizer_aborted events
```
The loop detected allTasksMarkedDone=true and immediately set state=completed, completely bypassing the finalizer chain.
The QA coverage gate in the finalizer NEVER executed because the finalizer was never entered.

#### Test 6: Comparison with unchecked TODOs
```
# TODO.md with unchecked tasks:
- [ ] Do something

$ aloop start --provider claude --max-iterations 2

# status.json: {"state":"running","phase":"plan"}
# Loop correctly stays running and invokes the plan agent
```
This confirms the bug: allTasksMarkedDone=true at start causes immediate completion.

#### Test 7: Finalizer template verification
```
$ head -10 ~/.aloop/templates/PROMPT_spec-gap.md
---
agent: spec-gap
trigger: all_tasks_done
provider: claude
reasoning: high
---

$ head -10 ~/.aloop/templates/PROMPT_docs.md
---
agent: docs
trigger: spec-gap
provider: claude
reasoning: medium
---
```
All 6 finalizer templates exist with correct frontmatter. Trigger chain:
all_tasks_done → spec-gap → docs → spec-review → final-review → final-qa → proof ✓

### Cleanup
All test directories, sessions, and processes cleaned up.
