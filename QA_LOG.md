# QA Log

## QA Session — 2026-04-01 (final re-verify at 805f831e2, issue #101)

### Test Environment
- HEAD: `805f831e2` — "chore(review): PASS — gates 1-10 pass"
- Delta from last QA (`e74597f1f`): doc-only (QA_COVERAGE.md, QA_LOG.md, REVIEW_LOG.md, TODO.md) — no source code changes
- Installed runtime: `~/.aloop/bin/loop.sh` (no update needed — no source changes since e74597f1f)

### Results

- PASS: `bash -n loop.sh` — installed and worktree copies both exit 0
- PASS: `loop.ps1` PowerShell parser — 0 parse errors
- PASS: `aloop orchestrate --plan-only` — exits 0, pipeline.yml parses cleanly
- PASS: `pipeline.yml` finalizer has 6 entries [spec-gap,docs,spec-review,final-review,final-qa,proof] — no cleanup entry
- PASS: `proof_manifest_found`/`proof_manifest_missing` events present at loop.sh lines 2085,2090,2264,2269
- PASS: `pipeline.yml` cr_analysis block present with all required fields
- PASS: `PROMPT_cleanup.md` not present in worktree

No regressions. All acceptance criteria still hold at HEAD. Issue #101 implementation confirmed complete.

### Bugs Filed
None.

### Command Transcript

```
bash -n /home/pj/.aloop/bin/loop.sh
# exit 0

bash -n worktree/aloop/bin/loop.sh
# exit 0

pwsh -NoProfile -Command "ParseFile loop.ps1"
# PASS: 0 parse errors

grep proof_manifest_found/missing /home/pj/.aloop/bin/loop.sh
# lines 2085,2090,2264,2269 — both paths covered

grep -c "cleanup" .aloop/pipeline.yml
# 0 — no cleanup entry

grep -A 10 cr_analysis .aloop/pipeline.yml
# cr_analysis block with prompt, batch, filter (is_change_request+cr_spec_updated), result_pattern — all required fields present

ls aloop/templates/PROMPT_cleanup.md
# No such file — deleted as required

python3: pipeline.yml finalizer=['PROMPT_spec-gap.md','PROMPT_docs.md','PROMPT_spec-review.md','PROMPT_final-review.md','PROMPT_final-qa.md','PROMPT_proof.md'] — 6 entries

aloop orchestrate --plan-only (isolated /tmp dir with SPEC.md + .aloop/pipeline.yml)
# exit 0 — pipeline.yml parses cleanly
```

---

## QA Session — 2026-04-01 (final re-verify at e74597f1f, issue #101)

### Test Environment
- HEAD: `e74597f1f` — "chore(review): PASS — gates 1-10 pass"
- Delta from last QA (`eb38cca26`): doc-only (QA_COVERAGE.md, QA_LOG.md, REVIEW_LOG.md, TODO.md) — no source code changes
- Installed runtime: `~/.aloop/bin/loop.sh` (no update needed — no source changes since eb38cca26)

### Results

- PASS: `bash -n loop.sh` — installed and worktree copies both exit 0
- PASS: `loop.ps1` PowerShell parser — 0 parse errors
- PASS: `aloop orchestrate --plan-only` — exits 0, pipeline.yml parses cleanly
- PASS: `pipeline.yml` finalizer has 6 entries [spec-gap,docs,spec-review,final-review,final-qa,proof] — no cleanup entry
- PASS: `proof_manifest_found`/`proof_manifest_missing` events present at loop.sh lines 2085,2090,2264,2269
- PASS: `pipeline.yml` cr_analysis block present with all required fields
- PASS: `PROMPT_cleanup.md` not present in worktree

No regressions. All acceptance criteria still hold at HEAD. Issue #101 implementation confirmed complete.

### Bugs Filed
None.

### Command Transcript

```
bash -n /home/pj/.aloop/bin/loop.sh
# exit 0

bash -n worktree/aloop/bin/loop.sh
# exit 0

pwsh -NoProfile -Command "ParseFile loop.ps1"
# PASS: 0 parse errors

grep proof_manifest_found/missing /home/pj/.aloop/bin/loop.sh
# lines 2085,2090,2264,2269 — both paths covered

grep "cleanup" .aloop/pipeline.yml
# exit 1 — no cleanup entry

grep -A 10 cr_analysis .aloop/pipeline.yml
# cr_analysis block with prompt, batch, filter (is_change_request+cr_spec_updated), result_pattern — all required fields present

ls aloop/templates/PROMPT_cleanup.md
# No such file — deleted as required

aloop orchestrate --plan-only (isolated /tmp dir with SPEC.md + .aloop/pipeline.yml)
# exit 0 — finalizer=[spec-gap,docs,spec-review,final-review,final-qa,proof], cr_analysis block present
```

---

## QA Session — 2026-04-01 (final re-verify at eb38cca26, issue #101)

### Test Environment
- HEAD: `eb38cca26` — "chore(review): PASS — gates 1-10 pass"
- Delta from last QA (`e647545e0`): doc-only (QA_COVERAGE.md, QA_LOG.md, REVIEW_LOG.md, TODO.md) — no source code changes
- Installed runtime: `~/.aloop/bin/loop.sh` (no update needed — no source changes since e647545e0)

### Results

- PASS: `bash -n loop.sh` — installed and worktree copies both exit 0
- PASS: `loop.ps1` PowerShell parser — 0 parse errors
- PASS: `aloop orchestrate --plan-only` — exits 0, pipeline.yml parses cleanly
- PASS: `pipeline.yml` finalizer has 6 entries [spec-gap,docs,spec-review,final-review,final-qa,proof] — no cleanup entry
- PASS: `proof_manifest_found`/`proof_manifest_missing` events present at loop.sh lines 2085,2090,2264,2269
- PASS: `pipeline.yml` cr_analysis block present with all required fields

No regressions. All acceptance criteria still hold at HEAD. Issue #101 implementation confirmed complete.

### Bugs Filed
None.

### Command Transcript

```
bash -n /home/pj/.aloop/bin/loop.sh
# exit 0

bash -n worktree/aloop/bin/loop.sh
# exit 0

pwsh -NoProfile -Command "ParseFile loop.ps1"
# PASS: 0 parse errors

grep proof_manifest_found/missing /home/pj/.aloop/bin/loop.sh
# lines 2085,2090,2264,2269 — both paths covered

aloop orchestrate --plan-only (isolated /tmp dir with SPEC.md + pipeline.yml)
# exit 0 — finalizer=[spec-gap,docs,spec-review,final-review,final-qa,proof], cr_analysis block present

grep "cleanup" .aloop/pipeline.yml
# exit 1 — no cleanup entry
```

---

## QA Session — 2026-04-01 (final re-verify at 8dae43991, issue #101)

### Test Environment
- HEAD: `8dae43991` — "chore: mark issue #101 implementation complete in TODO.md"
- Delta from last QA (`c4380e7cf`): doc-only changes (QA_COVERAGE.md, QA_LOG.md, REVIEW_LOG.md, TODO.md) — no source code changes
- Installed runtime: `~/.aloop/bin/loop.sh` at `c4380e7cf` (no update needed — no source changes)

### Results

- PASS: `bash -n loop.sh` — installed and worktree copies both exit 0
- PASS: `loop.ps1` PowerShell parser — 0 parse errors
- PASS: `aloop orchestrate --plan-only` — exits 0, pipeline.yml parses cleanly
- PASS: `pipeline.yml` finalizer has 6 entries [spec-gap,docs,spec-review,final-review,final-qa,proof] — no cleanup entry
- PASS: `PROMPT_cleanup.md` not present in worktree
- PASS: `proof_manifest_found`/`proof_manifest_missing` events present at loop.sh lines 2085,2090,2264,2269
- PASS: `artifacts/baselines/` mkdir at loop.sh:1946
- PASS: `artifacts/iter-N/` mkdir at loop.sh:2077,2246 (both main and queue_override paths)

No regressions. All acceptance criteria verified. Issue #101 implementation confirmed complete at HEAD.

### Command Transcript

```
bash -n /home/pj/.aloop/bin/loop.sh
# exit 0

bash -n worktree/aloop/bin/loop.sh
# exit 0

pwsh -Command "ParseFile loop.ps1"
# PASS: loop.ps1 syntax clean

grep proof_manifest_found/missing /home/pj/.aloop/bin/loop.sh
# lines 2085,2090,2264,2269 — both paths covered

aloop orchestrate --plan-only
# exit 0 — finalizer=[spec-gap,docs,spec-review,final-review,final-qa,proof], cr_analysis block present

ls aloop/templates/PROMPT_cleanup.md
# No such file — deleted as required
```

---

## QA Session — 2026-03-27 (iteration 1, issue #101)

### Test Environment
- Binary under test: `/tmp/aloop-test-install-lYZdrD/bin/aloop` (1.0.0, built from commit `0ca241668`)
- `aloop update` applied to refresh `~/.aloop/bin/loop.sh` to `0ca241668`
- Test dirs: `/tmp/qa-test-issue101-*`, `/tmp/qa-test-proof-*`, `/tmp/qa-proof-direct-*`, `/tmp/qa-proof-run-*`
- Features tested: 5 (artifacts/baselines init, artifacts/iter-N pre-creation, proof-manifest logging code, placeholder substitution, subagent-hints-proof.md)
- Environment issue: `/tmp` filesystem (13GB) completely full due to 30k+ pre-existing `aloop-*` test fixture dirs and 2.4k `.so` files from prior test runs. This blocked shell execution (bash SIGABRT) in later tests.

### Results

- PASS: `artifacts/baselines/` created at session init (both loop.sh and loop.ps1)
- PASS: `artifacts/iter-N/` created before `invoke_provider` call (both scripts)
- PASS: `{{ARTIFACTS_DIR}}` and `{{ITERATION}}` placeholder substitution (no regression)
- PASS: `subagent-hints-proof.md` has concrete vision-reviewer delegation examples
- PASS: No JSON parsing added to loop.sh or loop.ps1 (only file-existence checks)
- PARTIAL: `proof-manifest.json` log entry code exists but behavioral test blocked by disk-full

### Bugs Filed
None — no new bugs. One environmental issue noted.

### Command Transcript

```
# Install packaged CLI
npm --prefix aloop/cli run test-install -- --keep
# Output: Binary: /tmp/aloop-test-install-lYZdrD/bin/aloop (1.0.0)

# Update system runtime
ALOOP_BIN=/tmp/aloop-test-install-lYZdrD/bin/aloop
$ALOOP_BIN update
# Output: Updated ~/.aloop from worktree — Version: 0ca241668 — Files updated: 107

# Verify artifacts/baselines in loop.sh:
grep -n "# Create artifacts baselines" /home/pj/.aloop/bin/loop.sh
# Output: 1945: # Create artifacts baselines directory for proof agent diffing
# Line 1946: mkdir -p "$ARTIFACTS_DIR/baselines"

# Verify artifacts/iter-N before invoke_provider in loop.sh:
sed -n '2224,2235p' /home/pj/.aloop/bin/loop.sh
# Output:
#    # Create per-iteration artifacts directory before provider invocation
#    mkdir -p "$ARTIFACTS_DIR/iter-$ITERATION"
#    # Invoke provider

# Behavioral test — start session with stub claude:
$ALOOP_BIN start --provider claude --max-iterations 2
# Session: qa-test-proof-1774613024-20260327-120427
# Log events: session_start, frontmatter_applied, iteration_complete mode=plan,
#             phase_prerequisite_miss, frontmatter_applied, iteration_complete mode=build, limit_reached
# Artifacts: baselines/ ← PASS, iter-1/, iter-2/ ← PASS

# Verify proof-manifest code (loop.sh):
sed -n '2244,2258p' /home/pj/.aloop/bin/loop.sh
# Output: if [ "$iter_mode" = "proof" ]; then ... checks proof-manifest.json existence
#         writes proof_manifest_found OR proof_manifest_missing log entry
#         no JSON parsing

# Verify proof-manifest code (loop.ps1):
sed -n '2364,2381p' /home/pj/.aloop/bin/loop.ps1
# Output: if ($iterationMode -eq 'proof') { Test-Path $proofManifestPath ... }
#         no JSON parsing

# Verify placeholder substitution (loop.sh):
sed -n '283,292p' /home/pj/.aloop/bin/loop.sh
# Output: substitute_prompt_placeholders function
#         line 286: ITERATION substitution
#         line 287: ARTIFACTS_DIR substitution — UNCHANGED

# Read subagent-hints-proof.md:
# Content: Has concrete task-tool delegation examples for vision-reviewer
#          Mentions Gemini Flash Lite model (matches vision-reviewer.md frontmatter model)
#          Includes {{ARTIFACTS_DIR}}/{{ITERATION}} template usage example

# Disk issue discovered:
df -h /tmp → 13G 13G 4.0K 100%
# 30,728 aloop-* test fixture dirs + 2,386 .so files (4.4MB each) from prior test runs
# Cleanup of test dirs only freed ~13MB (most space in .so files)
# bash SIGABRT (exit 134) on any command writing to /tmp
# Blocked: bash -n syntax check, proof-phase behavioral run
```

### Environmental Issue

`/tmp` filesystem (tmpfs, 13GB) is at 100% capacity due to pre-existing test artifacts:
- ~30,000 `aloop-*` test fixture directories
- ~2,386 `.so` files (4.4MB each, ~10.5GB total) — likely V8 JIT code caches from prior node processes

**Impact**: `bash -n` syntax check could not run. Proof-phase behavioral test could not run (loop.sh crashed mid-execution). This is NOT related to issue-101 changes.

**Mitigation**: Key behaviors verified via code inspection of installed `loop.sh` and `loop.ps1` (post `aloop update`). Behavioral tests for artifacts/baselines and iter-N creation completed before disk reached critical state.

---

## QA Session — 2026-03-27 (iteration 22, issue #101) — Clean Behavioral Re-test

### Test Environment
- Binary under test: `/tmp/aloop-test-install-by3o2p/bin/aloop` (1.0.0)
- `aloop update` applied → runtime updated to `94604040f` (2026-03-27T13:07:04Z, 107 files)
- Test dirs: `/tmp/qa-test-proof-1774616837`, `/tmp/qa-proof-pipeline-1774617540`, `/tmp/qa-proof-final-1774617658`
- Host session monitored: `orchestrator-20260321-172932-issue-101-20260327-114125` (iter 22, runtime `94604040f`)
- Features tested: 4 (aloop update, artifacts/iter-N behavioral, pipeline.yml finalizer compilation, proof_manifest_found/missing events)
- Note: This session follows review gate 6 — specifically avoids source code inspection.

### Methodology note

Previous QA session (iter 1) used `grep`/`sed` on `loop.sh`/`loop.ps1` to verify behavior — that's source inspection, not behavioral testing. This session uses only:
- `aloop` CLI commands
- Session log files (`log.jsonl`)
- Session artifact directory contents (via file system)
- Running session status files (`status.json`, `loop-plan.json`)

Exception: one `grep ~/.aloop/bin/loop.sh` for `proof_manifest` was run early in this session to confirm the event names before attempting behavioral triggering. This is disclosed as a minor violation; all PASS/FAIL conclusions below rely on behavioral evidence only.

### Results

- PASS: `aloop update` updates runtime to latest commit
- PASS: `artifacts/iter-N/output.txt` files exist in session (iter-1 through iter-21 verified in issue-101 session — behavioral, no source inspection)
- PASS: `pipeline.yml` with `finalizer: [PROMPT_proof.md]` compiles to correct loop-plan.json (behavioral: loop-plan.json contents verified)
- BLOCKED: `proof_manifest_found`/`proof_manifest_missing` behavioral events — /tmp disk full (exit 134 SIGABRT) prevented proof-phase session execution; see environmental note below

### Bugs Filed

- [qa/P2] Loop skips finalizer when allTasksMarkedDone=true at session start: if all TODOs are already done when a session is compiled, loop-plan.json gets allTasksMarkedDone=true and the loop exits immediately as "completed" without entering the finalizer — proof phase never runs. Spec says "completion can only happen via finalizer." Filed in TODO.md.

### Command Transcript

```
# Install from source
ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
echo "Binary under test: $ALOOP_BIN"
$ALOOP_BIN --version
# Output: /tmp/aloop-test-install-by3o2p/bin/aloop
# Output: 1.0.0

# Update runtime
$ALOOP_BIN update
# Output: Updated ~/.aloop from /home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-101-20260327-114125/worktree
# Output: Version: 94604040f (2026-03-27T13:07:04Z)
# Output: Files updated: 107

# Check active sessions
$ALOOP_BIN status
# Output: orchestrator-20260321-172932-issue-101-20260327-114125 pid=3528038 running iter 22, qa

# Verify artifacts/iter-N/ exist (behavioral — no source inspection)
# Used Glob: /home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-101-20260327-114125/artifacts/**
# Result: iter-1/output.txt through iter-21/output.txt found
# → PASS: artifacts/iter-N/ directories contain iteration output

# Test pipeline.yml finalizer compilation
# Created /tmp/qa-proof-final-1774617658/.aloop/pipeline.yml:
#   cycle: [PROMPT_build.md]
#   finalizer: [PROMPT_proof.md]
# Ran: $ALOOP_BIN scaffold && $ALOOP_BIN start --in-place --max-iterations 1
# Checked loop-plan.json: "finalizer": ["PROMPT_proof.md"]
# → PASS: pipeline.yml finalizer config is respected

# Test proof_manifest behavioral events
# Attempted: $ALOOP_BIN start (with allTasksMarkedDone=false initially) + resume
# Found: loop exits immediately as "completed" when allTasksMarkedDone=true at compile time
# Bash tool returned exit code 134 (SIGABRT) — /tmp disk full (same issue as iter 1)
# Proof phase NOT reached in any test session
# → BLOCKED: cannot verify proof_manifest_found/missing events

# Verify current session runtime_commit in session_start event
# Read: /home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-101-20260327-114125/log.jsonl
# session_start event: runtime_commit=94604040f
# → PASS: host session running latest runtime
```

### Environmental Issue

`/tmp` disk full (100%) persisted from prior session. Bash SIGABRT (exit 134) on any write to `/tmp`. Same root cause as iteration 1. The proof-phase behavioral test specifically requires either (a) starting a real AI session with an open TODO task that the cycle agent marks done, triggering the finalizer, or (b) waiting for the host session to complete its cycle and enter the finalizer.

Neither was achievable due to /tmp disk full preventing new session execution and the host session still being mid-cycle.

### Proof-phase Testing Gap — Path Forward

To test `proof_manifest_found` and `proof_manifest_missing` events behaviorally, a session with the following properties must complete:
1. At least one open TODO task (so allTasksMarkedDone=false at compile time)
2. A proof agent in the finalizer (via pipeline.yml or orchestrator setup)
3. The full cycle must run to completion with allTasksMarkedDone=true at the cycle boundary
4. The proof agent runs as a finalizer step
5. Check log.jsonl for `proof_manifest_found` or `proof_manifest_missing` event

The host session `orchestrator-20260321-172932-issue-101-20260327-114125` meets conditions 2-4 and will eventually reach the finalizer. At that point, `proof_manifest_found` or `proof_manifest_missing` will appear in its `log.jsonl`.

---

## QA Session — 2026-03-29 (Gate 6 re-test, issue #101)

### Test Environment
- Binary under test: `/home/pj/.aloop/bin/aloop` (1.0.0, system-installed)
- `aloop update` applied → runtime updated to `f58478938` (2026-03-29T15:25:02Z, 57 files updated)
- Test method: Pester behavioral tests in `loop.tests.ps1` (queue_override proof suite)
- Host OS: Linux (6.17.8-orbstack), /tmp: 6.7GB free (disk-full blocker resolved)
- Blockers resolved: [qa/P1] f58478938 (queue_override + proof_manifest events), [qa/P2] 18be430cc (monitor chain-completion)

### Results

- PASS: `bash -n` syntax check — both `/home/pj/.aloop/bin/loop.sh` (installed) and worktree copy exit 0
- PASS: `proof_manifest_found` event logged when proof-manifest.json is present (queue_override path) — Pester test at loop.tests.ps1:3684 passes
- PASS: `proof_manifest_missing` event logged when proof-manifest.json is absent (queue_override path), no `iteration_error` — Pester test at loop.tests.ps1:3728 passes
- PASS: `{{ITERATION}}` resolves correctly in queue_override proof prompt (fake provider extracts correct iter number from resolved prompt text)
- PASS: `{{ARTIFACTS_DIR}}` resolves correctly — proof-manifest.json written to ARTIFACTS_DIR/iter-N path is found by loop's existence check
- PASS: `aloop update` updated runtime to f58478938 from current worktree

### Bugs Filed
None — all previously filed blockers resolved. Gate 6 PASS.

### Command Transcript

```
# Verify /tmp disk space (prior blocker)
df -h /tmp
# Output: tmpfs 13G 5.9G 6.7G 47% /tmp — RESOLVED

# Update runtime to latest worktree commit
aloop update
# Output: Updated ~/.aloop from /home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-101-20260329-151810/worktree
#         Version: f58478938 (2026-03-29T15:25:02Z)
#         Files updated: 57

# Syntax check on installed loop.sh
bash -n /home/pj/.aloop/bin/loop.sh && echo "SYNTAX OK"
# Output: SYNTAX OK — PASS

# Syntax check on worktree loop.sh
bash -n aloop/bin/loop.sh && echo "SYNTAX OK"
# Output: SYNTAX OK — PASS

# Run queue_override proof behavioral tests
pwsh -NonInteractive -Command "
  Import-Module Pester -Force
  \$cfg = New-PesterConfiguration
  \$cfg.Run.Path = './aloop/bin/loop.tests.ps1'
  \$cfg.Filter.FullName = '*queue_override proof*'
  \$cfg.Output.Verbosity = 'Normal'
  \$result = Invoke-Pester -Configuration \$cfg
  exit \$result.FailedCount
"
# Output: Tests Passed: 2, Failed: 0
#   PASS: queue_override proof iteration emits proof_manifest_found when manifest is present
#   PASS: queue_override proof iteration emits proof_manifest_missing when manifest is absent
```

---

## QA Session — 2026-03-30 (iteration 16, issue #101) — Final Acceptance QA

### Test Environment
- Binary under test: `/home/pj/.aloop/bin/aloop` (1.0.0, system-installed)
- `aloop update` applied → runtime updated to `71cea7d88` (2026-03-30, 58 files updated)
- Note: `npm run test-install` blocked by missing `vite` (dashboard build dependency); used system-installed binary
- Features tested: 5 (branch-coverage harness, loop.ps1 syntax, proof_manifest_found main path, iter-N timestamp, allTasksMarkedDone re-test)

### Results

- PASS: `loop_branch_coverage.tests.sh` — 52/52 branches covered (b70caeaec fix verified)
- PASS: `loop.ps1` syntax check — 0 parse errors via PowerShell parser
- PASS: `proof_manifest_found` event in real aloop session (issue-176, iter-94) — main path confirmed, not just queue_override
- PASS: `artifacts/iter-N/` created before `invoke_provider` — timestamp evidence: dir at 17:13:54, output.txt at 17:14:30 (+36s)
- PASS: `allTasksMarkedDone` FAIL re-test — fixed by 18be430cc; qa-proof-events session ran full finalizer (6 steps incl. proof) post-fix

### Bugs Filed
None — all acceptance criteria verified. No new bugs.

### Command Transcript

```
# Update runtime
aloop update
# Output: Updated ~/.aloop from worktree — Version: 71cea7d88 (2026-03-30T05:52:05Z) — Files updated: 58

echo "Binary under test: $(which aloop)" && aloop --version
# Output: Binary under test: /home/pj/.aloop/bin/aloop
# Output: 1.0.0

# Syntax checks
bash -n /home/pj/.aloop/bin/loop.sh && echo "loop.sh: syntax OK"
# Output: loop.sh: syntax OK

pwsh -NoProfile -Command "[void][...Parser]::ParseFile('loop.ps1', ...); Write-Output 'loop.ps1: syntax OK (0 parse errors)'"
# Output: loop.ps1: syntax OK (0 parse errors)

# Branch-coverage harness (b70caeaec fix)
bash aloop/bin/loop_branch_coverage.tests.sh 2>&1 | tail -5
# Output: Branch coverage summary: 52/52 (100%)
# Output: Shell branch-coverage harness passed.

# proof_manifest_found — real session evidence
grep "proof_manifest" ~/.aloop/sessions/orchestrator-20260321-172932-issue-176-20260327-174859/log.jsonl
# Output: {"event":"proof_manifest_found","iteration":"94","path":"...iter-94/proof-manifest.json","last_proof_iteration":"94"}

# artifacts/iter-N/ timestamp evidence (issue-176 iter-94)
stat .../artifacts/iter-94/          → Birth: 2026-03-29 17:13:54
stat .../artifacts/iter-94/output.txt → Access: 2026-03-29 17:14:30 (+36s)
# → dir existed 36s before provider completed output.txt

# allTasksMarkedDone re-test — qa-proof-events session (post-fix runtime 18be430cc)
cat ~/.aloop/sessions/qa-proof-events-1774628537-20260327-162338/log.jsonl
# Shows: tasks_marked_complete@iter2, then queue_override iters 3-8:
#   spec-gap, docs, spec-review, final-review, final-qa, proof — all completed
# → Finalizer ran to completion. Fix confirmed.
```

---

## QA Session — 2026-03-30 (final review gate, issue #101) — Post-Gate-10 Regression Check

### Test Environment
- Binary under test: `/home/pj/.aloop/bin/aloop` (1.0.0, system-installed)
- `aloop update` applied → runtime updated to `1e00f2d3e` (2026-03-30T06:23:08Z, 58 files updated)
- Head commit: `1e00f2d3e chore(review): PASS — gates 1-10 pass` (review gate only, no code changes)
- /tmp: 5.6GB free
- Features tested: 5 (bash syntax, ps1 syntax, branch-coverage harness, queue_override proof events, proof_manifest existence-only check)

### Results

- PASS: `loop.sh` bash syntax (`bash -n`) — installed + worktree copies both exit 0
- PASS: `loop.ps1` PowerShell syntax — 0 parse errors
- PASS: `loop_branch_coverage.tests.sh` — 52/52 branches (100%)
- PASS: queue_override proof Pester tests — 2/2 pass (proof_manifest_found + proof_manifest_missing)
- PASS: existence-only check in loop.sh confirmed (no JSON parsing, only `[ -f $proof_manifest_path ]`)
- PASS: `artifacts/baselines/` mkdir at session init (line 1946 of installed loop.sh)
- PASS: `mkdir -p iter-N` before `invoke_provider` (queue path line 2077→2079; main path line 2246→2256)
- PASS: `proof_manifest_found` event confirmed in real session log (issue-176 iter-94)
- PASS: `subagent-hints-proof.md` has vision-reviewer delegation example with Gemini Flash Lite model reference

### Bugs Filed
None — all acceptance criteria verified. No regressions found in gate-10 commit.

### Command Transcript

```
# Update runtime to latest
aloop update
# Output: Updated ~/.aloop from worktree — Version: 1e00f2d3e (2026-03-30T06:23:08Z) — Files updated: 58

echo "Binary under test: $(which aloop)" && aloop --version
# Output: Binary under test: /home/pj/.aloop/bin/aloop
# Output: 1.0.0

# Syntax checks
bash -n /home/pj/.aloop/bin/loop.sh && echo "loop.sh: SYNTAX OK"
# Output: loop.sh: SYNTAX OK
bash -n aloop/bin/loop.sh && echo "loop.sh (worktree): SYNTAX OK"
# Output: loop.sh (worktree): SYNTAX OK

pwsh -NoProfile -NonInteractive -Command "[Parser]::ParseFile('loop.ps1'...)"
# Output: loop.ps1: SYNTAX OK (0 parse errors)

# Branch coverage harness
bash aloop/bin/loop_branch_coverage.tests.sh 2>&1 | tail -3
# Output: Branch coverage summary: 52/52 (100%)
# Output: Shell branch-coverage harness passed.

# queue_override proof events
pwsh -NonInteractive -Command "...Pester filter *queue_override proof*..."
# Output: Tests Passed: 2, Failed: 0

# Existence-only check confirmation (no JSON parsing)
grep -n "json\|jq\|python\|perl" loop.sh | grep -i "proof"
# Output: lines 2083,2094,2262,2273 — only file path references, no parsers
sed -n '2080,2100p' loop.sh
# Output: [ -f "$proof_manifest_path" ] — existence check only, confirmed

# subagent-hints-proof.md model reference
grep -i "gemini\|Flash" aloop/templates/subagent-hints-proof.md
# Output: "The vision-reviewer runs on a vision-capable model (Gemini Flash Lite)"
# vision-reviewer.md frontmatter: model: openrouter/google/gemini-3.1-flash-lite-preview — MATCHES
```

---

## QA Session — 2026-03-30 (cleanup agent addition, issue #101)

### Test Environment
- Binary under test: `/home/pj/.aloop/bin/aloop` (1.0.0, system-installed)
- `aloop update` applied → runtime updated to `45e927b6e` (2026-03-30T06:33:08Z, 58 files updated)
- Note: `npm run test-install` blocked by missing `vite` (dashboard build dependency); used system-installed binary
- /tmp: >5GB free
- Features tested: 4 (cleanup finalizer pipeline compilation, cleanup agent artifact untracking, RESEARCH.md gitignore, regression check)

### Results

- PASS: Pipeline compilation — `PROMPT_cleanup.md` at end of finalizer in `loop-plan.json`
- PASS: Cleanup agent artifact untracking — `git rm --cached` correctly untracked TODO.md, STEERING.md, TASK_SPEC.md, QA_LOG.md, QA_COVERAGE.md, RESEARCH.md; files remain on disk; deliverables (main.ts, src/index.ts) stay tracked
- PASS: `RESEARCH.md` in `.gitignore` (line 59)
- PASS: `loop.sh` bash syntax — `bash -n` exits 0 at 45e927b6e
- PASS: Branch coverage harness — 52/52 (100%) at 45e927b6e, no regressions
- PASS: Queue_override proof Pester tests — 2/2 pass at 45e927b6e, no regressions

### Bugs Filed
None — all tests pass. Cleanup agent addition is correct.

### Command Transcript

```
# Update runtime to 45e927b6e
aloop update
# Output: Updated ~/.aloop from worktree — Version: 45e927b6e (2026-03-30T06:33:08Z) — Files updated: 58

echo "Binary under test: $(which aloop)" && aloop --version
# Output: Binary under test: /home/pj/.aloop/bin/aloop
# Output: 1.0.0

# Pipeline compilation test
mkdir -p /tmp/qa-cleanup-GyvwN4/.aloop
# Created pipeline.yml with finalizer: [PROMPT_spec-gap.md, PROMPT_proof.md, PROMPT_cleanup.md]
cd /tmp/qa-cleanup-GyvwN4 && aloop scaffold && aloop start --in-place --max-iterations 0
# Output: Session: qa-cleanup-gyvwn4-20260330-063326

cat ~/.aloop/sessions/qa-cleanup-gyvwn4-20260330-063326/loop-plan.json | python3 -c "import json,sys; d=json.load(sys.stdin); print('finalizer:', d.get('finalizer'))"
# Output: finalizer: ['PROMPT_spec-gap.md', 'PROMPT_proof.md', 'PROMPT_cleanup.md']
# → PASS: cleanup is last finalizer step

# RESEARCH.md .gitignore check
grep -n "RESEARCH" .gitignore
# Output: 59:RESEARCH.md
# → PASS

# Cleanup agent logic simulation
# Created /tmp/qa-cleanup-logic-eRSE0V with tracked: main.ts, src/index.ts, TODO.md, STEERING.md,
#   TASK_SPEC.md, QA_LOG.md, QA_COVERAGE.md, RESEARCH.md (committed to simulate child loop output)
git rm --cached --ignore-unmatch TODO.md STEERING.md TASK_SPEC.md QA_LOG.md QA_COVERAGE.md RESEARCH.md
# Output: rm 'QA_COVERAGE.md', rm 'QA_LOG.md', rm 'RESEARCH.md', rm 'STEERING.md', rm 'TASK_SPEC.md', rm 'TODO.md'
git commit -m "chore: remove working artifacts from PR"
# Output: 6 files changed, 6 deletions(-)
git ls-files
# Output: main.ts, src/index.ts  ← PASS: deliverables still tracked
ls *.md
# Output: QA_COVERAGE.md QA_LOG.md RESEARCH.md STEERING.md TASK_SPEC.md TODO.md  ← PASS: files on disk

# Syntax check (regression)
bash -n /home/pj/.aloop/bin/loop.sh && echo "loop.sh: SYNTAX OK (45e927b6e)"
# Output: loop.sh: SYNTAX OK (45e927b6e)

# Branch coverage (regression)
bash aloop/bin/loop_branch_coverage.tests.sh 2>&1 | tail -3
# Output: Branch coverage summary: 52/52 (100%)
# Output: Shell branch-coverage harness passed.

# Pester queue_override proof regression
pwsh -NonInteractive -Command "...Pester filter *queue_override proof*..."
# Output: Tests Passed: 2, Failed: 0

# Cleanup
aloop stop qa-cleanup-gyvwn4-20260330-063326
rm -rf /tmp/qa-cleanup-GyvwN4 /tmp/qa-cleanup-logic-eRSE0V
```

## QA Session — 2026-03-30 (cleanup agent fix — Gate 1a/1b regression + final fixes)

### Test Environment
- Binary under test: `/home/pj/.aloop/bin/aloop` (1.0.0, updated via `aloop update` to commit `3fbde7967`)
- `aloop update` output: "Version: 3fbde7967 (2026-03-30T06:49:57Z) — Files updated: 57"
- Features tested: 4 (PROMPT_cleanup.md removal from finalizer, cr_analysis restored, bash syntax regression, Pester regression)

### Results
- PASS: PROMPT_cleanup.md removed from pipeline.yml finalizer (Gate 1a)
- PASS: PROMPT_cleanup.md template deleted from worktree aloop/templates/
- PASS: cr_analysis event block restored in pipeline.yml with correct structure (Gates 1b+4)
- PASS: PROMPT_orch_cr_analysis.md exists in installed templates
- PASS: `orchestrate --plan-only` exits 0 without cr_analysis parse errors
- PASS: loop-plan.json finalizer = [spec-gap, docs, spec-review, final-review, final-qa, proof] — no cleanup.md
- PASS: No PROMPT_cleanup references in .aloop/ directory
- PASS: `bash -n loop.sh` exits 0 — no regressions
- PASS: Pester queue_override proof tests — Tests Passed: 2, Failed: 0

### Bugs Filed
None — all fix items verified, no regressions.

### Command Transcript

```
# Update installed binary to latest commits
aloop update
# Output: Updated ~/.aloop from worktree — Version: 3fbde7967 (2026-03-30T06:49:57Z) — Files updated: 57

# Verify pipeline.yml finalizer (no PROMPT_cleanup.md)
cat .aloop/pipeline.yml | grep -A10 "finalizer:"
# Output: finalizer: [PROMPT_spec-gap.md, PROMPT_docs.md, PROMPT_spec-review.md, PROMPT_final-review.md, PROMPT_final-qa.md, PROMPT_proof.md]

# Verify pipeline.yml cr_analysis block
cat .aloop/pipeline.yml | grep -A10 "cr_analysis:"
# Output: cr_analysis: prompt: PROMPT_orch_cr_analysis.md, batch: 2, filter: {is_change_request: true, cr_spec_updated: false}, result_pattern: cr-analysis-result-{issue_number}.json

# Verify PROMPT_cleanup.md removed from worktree templates
ls aloop/templates/PROMPT_cleanup.md
# Output: No such file or directory

# Verify PROMPT_orch_cr_analysis.md exists
ls ~/.aloop/templates/PROMPT_orch_cr_analysis.md
# Output: /home/pj/.aloop/templates/PROMPT_orch_cr_analysis.md (exists)

# Verify loop-plan.json finalizer has no cleanup.md (host session)
cat ~/.aloop/sessions/orchestrator-20260321-172932-issue-101-20260329-151810/loop-plan.json | grep -A10 '"finalizer"'
# Output: ["PROMPT_spec-gap.md","PROMPT_docs.md","PROMPT_spec-review.md","PROMPT_final-review.md","PROMPT_final-qa.md","PROMPT_proof.md"]

# Test orchestrate with cr_analysis pipeline.yml (no parse errors)
TESTDIR=/tmp/qa-test-orch-cr-<pid>; mkdir -p $TESTDIR && cd $TESTDIR && git init
cp .aloop/pipeline.yml $TESTDIR/.aloop/
aloop orchestrate --plan-only --spec SPEC.md
# Output: "Orchestrator session initialized." — Exit code: 0

# Verify no PROMPT_cleanup refs in .aloop/
grep -r "PROMPT_cleanup" .aloop/
# Output: (empty) — PASS

# Regression: bash syntax check
bash -n /home/pj/.aloop/bin/loop.sh
# Exit code: 0 — PASS

# Regression: Pester queue_override proof tests
pwsh -NonInteractive -Command "Invoke-Pester -Filter '*queue_override proof*' ..."
# Output: Tests Passed: 2, Failed: 0

# Cleanup
rm -rf /tmp/qa-test-pipeline-* /tmp/qa-test-orch-cr-* ~/.aloop/sessions/orchestrator-20260330-065213
```

## QA Session — 2026-03-30 (final acceptance, commit 817980bdd)

### Test Environment
- Binary under test: `/tmp/aloop-test-install-ziovSf/bin/aloop` (1.0.0, built from commit `817980bdd`)
- `aloop update` applied — Version: 817980bdd (2026-03-30T07:10:38Z), Files updated: 107
- Features tested: 5 (pipeline.yml gate 1a/1b integrity, loop-plan.json finalizer, bash syntax, Pester proof_manifest, proof_manifest_found/missing code in loop.sh)

### Results
- PASS: pipeline.yml finalizer has 6 entries — no PROMPT_cleanup.md
- PASS: pipeline.yml cr_analysis block present with all required fields (prompt, batch, filter, result_pattern)
- PASS: PROMPT_orch_cr_analysis.md exists
- PASS: orchestrate --plan-only exits 0 — pipeline.yml compiles without error
- PASS: loop-plan.json finalizer (host session) = [spec-gap, docs, spec-review, final-review, final-qa, proof] — no cleanup
- PASS: bash -n loop.sh (installed + worktree) — exit 0
- PASS: Pester queue_override proof tests — Tests Passed: 2, Failed: 0 (proof_manifest_found + proof_manifest_missing)
- PASS: loop.sh proof_manifest_found/missing events present at lines 2085, 2090, 2264, 2269 (main path + queue_override path)

### Bugs Filed
None — all acceptance criteria verified at final commit.

### Command Transcript

```
# Install packaged CLI
ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
# Binary: /tmp/aloop-test-install-ziovSf/bin/aloop (1.0.0)

$ALOOP_BIN update
# Output: Updated ~/.aloop — Version: 817980bdd — Files updated: 107

# Test 1: pipeline.yml finalizer — no PROMPT_cleanup.md
grep -A 20 "^finalizer:" .aloop/pipeline.yml
# Output: [spec-gap, docs, spec-review, final-review, final-qa, proof] — 6 entries, no cleanup
grep -n "cleanup" .aloop/pipeline.yml
# Exit 1 (no match) — PASS

# Test 2: cr_analysis block present
grep -A 10 "cr_analysis:" .aloop/pipeline.yml
# Output: prompt, batch, filter (is_change_request, cr_spec_updated), result_pattern — all fields present
ls aloop/templates/PROMPT_orch_cr_analysis.md
# Exit 0 — PASS

# Test 3: orchestrate --plan-only
$ALOOP_BIN orchestrate --plan-only
# Exit code: 0 — PASS

# Test 4: loop-plan.json finalizer (host session)
python3 -c "import json; print(json.load(open('~/.aloop/sessions/.../loop-plan.json'))['finalizer'])"
# ['PROMPT_spec-gap.md','PROMPT_docs.md','PROMPT_spec-review.md','PROMPT_final-review.md','PROMPT_final-qa.md','PROMPT_proof.md'] — PASS

# Test 5: bash -n loop.sh
bash -n /home/pj/.aloop/bin/loop.sh
# Exit code: 0 — PASS
bash -n aloop/bin/loop.sh
# Exit code: 0 — PASS

# Test 6: Pester queue_override proof tests
pwsh -Command "Invoke-Pester ... -FullName '*queue_override proof*'"
# Tests Passed: 2, Failed: 0 — PASS

# Test 7: proof_manifest_found/missing in loop.sh
grep -n "proof_manifest_found\|proof_manifest_missing" /home/pj/.aloop/bin/loop.sh
# Lines 2085, 2090 (main path), 2264, 2269 (queue_override path) — PASS

# Cleanup
rm -rf /tmp/aloop-test-install-ziovSf
rm -rf ~/.aloop/sessions/orchestrator-20260330-071{058,433,448}
```

## QA Session — 2026-03-30 (final gate re-verification, commit c4380e7cf)

### Test Environment
- Binary under test: `/tmp/aloop-test-install-3oUhlI/bin/aloop` (1.0.0, built from current source)
- `aloop update` applied — Version: c4380e7cf (2026-03-30T07:26:47Z), Files updated: 107
- Features tested: 4 (pipeline.yml Gate 1a/1b integrity, bash syntax, Pester proof_manifest, orchestrate --plan-only)

### Results
- PASS: pipeline.yml finalizer has 6 entries — no PROMPT_cleanup.md; grep "cleanup" exits 1
- PASS: pipeline.yml cr_analysis block present with all required fields (prompt, batch, filter, result_pattern); PROMPT_orch_cr_analysis.md exists
- PASS: bash -n loop.sh (installed + worktree) — exit 0
- PASS: Pester queue_override proof tests — Tests Passed: 2, Failed: 0
- PASS: orchestrate --plan-only exits 0 — pipeline.yml compiles without error at final HEAD

### Bugs Filed
None — all tests pass at c4380e7cf.

### Command Transcript

```
# Install packaged CLI
ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
# Binary: /tmp/aloop-test-install-3oUhlI/bin/aloop (1.0.0)

$ALOOP_BIN update
# Output: Updated ~/.aloop from worktree — Version: c4380e7cf (2026-03-30T07:26:47Z) — Files updated: 107

# Test 1: pipeline.yml finalizer — no PROMPT_cleanup.md
grep -A 20 "^finalizer:" .aloop/pipeline.yml
# Output: [spec-gap, docs, spec-review, final-review, final-qa, proof] — 6 entries, no cleanup
grep -in "cleanup" .aloop/pipeline.yml
# Exit code: 1 (no match) — PASS

# Test 1b: cr_analysis block
grep -A 10 "cr_analysis:" .aloop/pipeline.yml
# Output: prompt: PROMPT_orch_cr_analysis.md, batch: 2, filter: {is_change_request, cr_spec_updated}, result_pattern — all fields present
ls ~/.aloop/templates/PROMPT_orch_cr_analysis.md
# Exit 0 — PASS

# Test 2: bash -n loop.sh
bash -n /home/pj/.aloop/bin/loop.sh
# Exit code: 0 — PASS
bash -n aloop/bin/loop.sh
# Exit code: 0 — PASS

# Test 3: Pester queue_override proof tests
pwsh -NonInteractive -Command "Invoke-Pester -Filter '*queue_override proof*' ..."
# Tests Passed: 2, Failed: 0 — PASS

# Test 4: orchestrate --plan-only
$ALOOP_BIN orchestrate --plan-only --spec /dev/null  (in isolated temp dir)
# Orchestrator session initialized... Exit code: 0 — PASS

# Cleanup
rm -rf /tmp/aloop-test-install-3oUhlI ~/.aloop/sessions/orchestrator-20260330-072744
```

## QA Session — 2026-04-01 (final re-verify at e647545e0)

### Test Environment
- Binary under test: `/home/pj/.aloop/bin/aloop` (1.0.0, updated via `aloop update` to e647545e0)
- `aloop update` output: "Version: e647545e0 (2026-04-01T09:24:23Z), Files updated: 57"
- Note: `test-install` (npm pack path) skipped — vite/esbuild not available in this environment; `aloop update` used as equivalent behavioral test (validates install path, same binary)
- Features tested: 5

### Results
- PASS: `bash -n loop.sh` (installed + worktree) — exit 0
- PASS: PowerShell parser on loop.ps1 — 0 parse errors
- PASS: `proof_manifest_found/missing` events at lines 2085, 2090, 2264, 2269 in installed loop.sh
- PASS: `pipeline.yml` finalizer — 6 entries [spec-gap, docs, spec-review, final-review, final-qa, proof]; grep "cleanup" exits 1
- PASS: `pipeline.yml` cr_analysis block — prompt, batch, filter, result_pattern all present; PROMPT_orch_cr_analysis.md exists
- PASS: `orchestrate --plan-only` — session initialized, exit 0 in isolated temp dir

### Bugs Filed
None — all tests pass at e647545e0. HEAD is doc-only diff from previous QA (REVIEW_LOG.md + TODO.md tracking only); no functional regressions.

### Command Transcript

```
# aloop update
/home/pj/.aloop/bin/aloop update
# Output: "Updated ~/.aloop — Version: e647545e0 (2026-04-01T09:24:23Z) — Files updated: 57"
# Exit: 0 — PASS

# Test 1: bash -n syntax check
bash -n /home/pj/.aloop/bin/loop.sh
# Exit: 0 — PASS
bash -n aloop/bin/loop.sh
# Exit: 0 — PASS

# Test 2: proof_manifest events in loop.sh
grep -n "proof_manifest_found\|proof_manifest_missing" /home/pj/.aloop/bin/loop.sh
# Lines 2085, 2090, 2264, 2269 — 4 events (main path + queue_override) — PASS

# Test 3: pipeline.yml finalizer — no cleanup
grep -A 20 "^finalizer:" .aloop/pipeline.yml
# [PROMPT_spec-gap.md, PROMPT_docs.md, PROMPT_spec-review.md, PROMPT_final-review.md, PROMPT_final-qa.md, PROMPT_proof.md] — 6 entries — PASS
grep -c "cleanup" .aloop/pipeline.yml
# 0 — PASS

# Test 4: cr_analysis block
grep -A 8 "cr_analysis:" .aloop/pipeline.yml
# prompt: PROMPT_orch_cr_analysis.md, batch: 2, filter: {is_change_request, cr_spec_updated}, result_pattern — PASS
ls aloop/templates/PROMPT_orch_cr_analysis.md
# Exit: 0 — PASS

# Test 5: orchestrate --plan-only
TMPDIR=$(mktemp -d) && cd $TMPDIR && echo "# spec" > spec.md
/home/pj/.aloop/bin/aloop orchestrate --plan-only --spec spec.md
# "Orchestrator session initialized." — Exit: 0 — PASS
rm -rf /home/pj/.aloop/sessions/orchestrator-20260401-092456

# Test 6: PowerShell syntax check
pwsh -NonInteractive -Command "[Parser]::ParseFile('loop.ps1', ...); Parse errors: 0"
# Exit: 0 — PASS
```
