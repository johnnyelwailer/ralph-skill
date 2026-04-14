# Issue #200: CI: Add agent/* branch triggers and workflow polish

## Tasks

- [x] Implement as described in the issue — merged and done

# Issue #183: Configure Storybook 8 with react-vite and Tailwind decorators

## Tasks

- [x] Implement as described in the issue — `.storybook/main.ts`, `.storybook/preview.tsx`, `button.stories.tsx`, and package.json scripts/deps all in place; storybook build verified — issue CLOSED on GitHub

# Cleanup tasks

## Tasks

- [x] Add storybook-static to .gitignore — done on aloop/issue-183 branch
- [x] Review untracked files and decide whether to commit or ignore

# orchestrator scan (2026-04-14)

## State transitions

- [x] #173 transitioned from `in_progress` → `pr_open` (child 154752 completed plan only, PR still wrong) — redispatch written
- [x] #160 review request queued (child 154010 completed, PR #309 open, no review yet)
- [x] #172 review already queued from prior scan (review-172-pr308)
- [ ] #144, #124, #39 needs_redispatch=true — awaiting free slot after #173 dispatch
- [x] #173 reaped again: child 161533 (dispatch from 16:13 scan) completed plan-only — 3rd failure. Root cause: issue body corrupted with false "This issue is already implemented" text causing child sessions to exit after plan. Transitioned → pr_open/needs_redispatch. New dispatch written with explicit override instructions.
- [x] #173 reaped again: child 162409 / PID 95703 (force-impl dispatch from 16:32) completed plan-only — **4th failure**. Branch diff shows zero loop.sh/loop.ps1 changes. Escalated → `blocked_on_human`. Dispatch archived. Human must remove false "Implementation Status" section from GitHub issue #173 body before redispatching.
- [x] #39 dispatch still pending (dispatch-39-review-fix from 16:04) — slot now free, runtime to dispatch next

## Scan pass (~16:45)

- [x] #157: child PID 116572 alive, actively running (started 16:31). No action — occupying the 1 concurrency slot.
- [x] #173: confirmed `blocked_on_human` in orchestrator.json. Added comment to GH issue #173 explaining human action needed.
- [x] #160: PR #252 and PR #309 both closed without merge. Reset `needs_redispatch=True` in orchestrator.json.
- [x] #172: PR #211 and PR #308 both closed without merge. Reset `needs_redispatch=True` in orchestrator.json.
- [x] #144: GH issue is CLOSED. Updated orchestrator.json status → `Closed on GitHub - paused`.
- [x] #39, #124, and 15 other issues reset to `Ready` (see scan pass below).

# runtime bug fix (2026-04-14)

## Findings

- [x] [FIXED] `ReferenceError: state is not defined` in `/home/pj/.aloop/cli/dist/index.js` — `launchChildLoop` referenced undeclared `state` and `roundRobinOrder` variables (lines 13766-13768, 13791). Caused every redispatch to fail with `child_dispatch_failed`. Fixed by removing the dead `state?.round_robin_order` block and replacing the `stateRoundRobinOrder` assignment with `["claude", "opencode"]` fallback.

# spec-gap analysis (2026-04-13)

## Findings

- [x] [spec-gap] [P2] `CLAUDE_MODEL` default mismatch between `loop.ps1` and `loop.sh`
  - **What's mismatched**: `config.yml` line 21 specifies `claude: opus` (Last updated: 2026-03-19) as single source of truth. `loop.ps1` line 34 correctly uses `$ClaudeModel = 'opus'`. But `loop.sh` line 33 uses `CLAUDE_MODEL="${ALOOP_CLAUDE_MODEL:-sonnet}"` — defaults to `sonnet`, not `opus`.
  - **Files involved**: `aloop/bin/loop.ps1:34`, `aloop/bin/loop.sh:33`, `aloop/config.yml:21`
  - **Suggested fix**: Update `loop.sh` default from `sonnet` to `opus` to match config.yml

- [x] [spec-gap] [P2] SPEC.md acceptance criteria contradiction for Proof Phase (lines 716-717 vs 402-409)
  - **What's mismatched**: Line 717 acceptance criteria says "Default pipeline becomes: plan → build × 5 → proof → qa → review (9-step)". But line 407 describes the continuous cycle as "plan → build × 5 → qa → review (8-step)" and line 409 states "Proof does NOT run in the cycle — it's expensive and only meaningful as final evidence." Proof runs in the finalizer array, not the cycle array.
  - **Files involved**: `SPEC.md:402-409`, `SPEC.md:716-717`, `aloop/bin/loop.ps1:246-259`, `aloop/bin/loop.sh:358-367`
  - **Suggested fix**: SPEC.md acceptance criteria is wrong — the described behavior (proof only in finalizer) is correct and matches the code. Update acceptance criteria to match the actual 8-step cycle + finalizer design.

- [x] [spec-gap] [P2] SPEC.md QA Agent description says it runs "after proof" but proof is not in the cycle
  - **What's mismatched**: Line 733 states "It runs after proof and before review in the default pipeline." But the described pipeline has QA in the cycle (before review), and proof only runs in the finalizer after all tasks complete — they don't appear in the same pipeline. QA does not run after proof in the actual flow.
  - **Files involved**: `SPEC.md:402-409`, `SPEC.md:733`
  - **Suggested fix**: Update SPEC.md line 733 to remove "after proof" — QA runs in the cycle, proof runs in finalizer. These are sequential (cycle → finalizer) but not in the same pipeline phase ordering.

- [x] [spec-gap] [P1] `pipeline.yml` referenced in SPEC.md but no such file exists in codebase — RESOLVED: file exists at `.aloop/pipeline.yml`; spec-gap analysis searched wrong location
  - **What's mismatched**: SPEC.md lines 413, 477-497 describe `pipeline.yml` as the configuration file that compiles into `loop-plan.json`. The acceptance criteria at line 840 references "pipeline.yml / loop-plan.json". However, no `pipeline.yml` file exists anywhere in the worktree. The loop-plan.json appears to be compiled by runtime code, not read from a pipeline.yml file.
  - **Files involved**: `SPEC.md:413`, `SPEC.md:477-497`, `SPEC.md:840`
  - **Suggested fix**: Either implement `pipeline.yml` support in the runtime (compile to loop-plan.json), or update SPEC.md to remove references to `pipeline.yml` and clarify that `loop-plan.json` is the direct configuration input to the loop scripts.
# orchestrator scan (2026-04-14 ~second pass)

## State transitions

- [x] #157: child PID 116572 alive and running (started 16:31, state=running). Concurrency slot occupied (cap=1).
- [x] #173: still `blocked_on_human` — no action. Human must remove false "Implementation Status" section from GH issue #173 body.
- [x] #108: still `blocked_on_human` — 9 failed rebases. Human must manually rebase PR #132 onto agent/trunk.
- [x] 17 issues reset from `In review` (needs_redispatch=true or stuck with no PR) → `Ready`:
  - #39 (changes_requested on PR #289, review feedback ready)
  - #101, #111, #114, #124 (PR closed or merge conflict)
  - #143, #145, #147 (no PR, pending)
  - #151, #152, #153, #154, #155, #156 (no PR, pending)
  - #158 (stuck pending/no PR)
  - #160, #172 (PRs closed without merge, already reset in prior scan)
- [x] Awaiting #157 completion before next dispatch (concurrency_cap=1).

# orchestrator scan (2026-04-14 ~third pass)

## State transitions

- [x] #157: child PID 116572 dead. Session completed plan-only — worktree had wrong TODO.md (issue #22 content, all tasks checked), causing allTasksMarkedDone=true in loop-plan.json. Branch `aloop/issue-157` has 2 partial commits (Header components + utility functions) but no PR. Transitioned `In progress` → `Ready` (needs_redispatch=True).
- [x] #173: still `blocked_on_human` — no action.
- [x] #108: still `blocked_on_human` — no action.
- [x] active.json = [] — concurrency slot free.
- [x] Dispatch written for #39 (review-fix): PR #289 FAIL — 3 of 10 bash test scripts missing from CI (loop_retry_same_phase, loop_task_management, loop_health_and_usage). Branch is 34 commits behind trunk — rebase required.

# orchestrator scan (2026-04-14 ~fourth pass)

## State transitions

- [x] #157: child PID 139176 ALIVE (started 16:46:37, running ~2 min). Phase=plan, iteration=1. Correct TODO.md in worktree. PR #310 open. Concurrency slot occupied — no new dispatches.
- [x] #173: still `blocked_on_human` — human must remove false "Implementation Status" section from GH issue #173 body before redispatching.
- [x] #108: still `blocked_on_human` (In review) — human must manually rebase PR #132 onto agent/trunk.
- [x] #39: `Ready` (priority=0), PR #289. Queued for dispatch when #157 slot frees. PR needs review-fix (3 missing bash test scripts, branch 34 commits behind trunk).
- [x] 97 other `Ready` issues waiting. 5 `Ready` with needs_redispatch=True (#70, #71, #73, #85, #198).

# orchestrator scan (2026-04-14 ~fifth pass)

## State transitions

- [x] #157: child PID 139176 ALIVE (started 16:46:37, iteration=30, cyclePosition=1 = build phase). Concurrency slot occupied — no new dispatches.
- [x] #173: still `blocked_on_human` — no action.
- [x] #108: still `blocked_on_human` — no action.
- [x] No queue overrides found. Awaiting #157 completion before next dispatch.

# orchestrator scan (2026-04-14 ~fifth pass)

## State transitions

- [x] #157: child PID 139176 ALIVE. Session `orchestrator-20260321-172932-issue-157-20260414-164637`, iteration=2, phase=planning (loop-plan.json tasks=[]), PR #310 open. Concurrency slot occupied (cap=1) — no new dispatches.
- [x] #108: In review, blocked_on_human=True — PR #132 has 9 failed rebase attempts against agent/trunk. Human must manually rebase. No automated action possible.
- [x] Queue empty — no override prompts to process.
- [x] active.json=[] but orchestrator.json correctly tracks #157 as in_progress with child_pid=139176. No correction needed (active.json managed by runtime).
- [x] 105 Ready issues waiting (top priority -10: #188, #187, #186, #185, #184, #182, #158, #156). Next dispatch after #157 completes.

# orchestrator scan (2026-04-14 ~sixth pass)

## State transitions

- [x] #157: child PID 139176 ALIVE. Session `orchestrator-20260321-172932-issue-157-20260414-164637`, iteration=2, phase=**build** (status.json confirmed), state=running. PR #310 open. Concurrency slot occupied (cap=1) — no new dispatches.
- [x] #173: still `blocked_on_human` — human must remove false "Implementation Status" section from GH issue #173 body.
- [x] #108: still `blocked_on_human` — human must manually rebase PR #132 onto agent/trunk.
- [x] Queue empty — no override prompts.
- [x] No state transitions required this pass — child active and progressing normally.

# orchestrator scan (2026-04-14 ~seventh pass)

## State transitions

- [x] #157: child PID 139176 ALIVE. Session `orchestrator-20260321-172932-issue-157-20260414-164637`, iteration=13, phase=**qa**, state=running. PR #310 open. Concurrency slot occupied (cap=1) — no new dispatches.
- [x] #173: still `blocked_on_human` — human must remove false "Implementation Status" section from GH issue #173 body.
- [x] #108: still `blocked_on_human` (In review) — human must manually rebase PR #132 onto agent/trunk.
- [x] Queue empty — no override prompts.
- [x] No state transitions required this pass — child progressing normally (build → qa).

# orchestrator scan (2026-04-14 iteration 14+)

## State transitions

- [x] #157: child PID 139176 alive, iteration 28, phase "orch" — slot occupied, no action
- [x] #148: cleared stale dead child_pid 817718 (process dead, status already Ready)
- [x] #127: cleared stale dead child_pid 2323224 (process dead, status already Ready)
- [x] #173: remains blocked_on_human — human must fix GH issue body
- [x] #108: remains blocked_on_human — 9 failed rebases, human must resolve
- [x] Concurrency cap=1, slot occupied by #157 — no new dispatches this pass

# orchestrator scan (2026-04-14 iteration 33)

## State transitions

- [x] #157: child PID 139176 ALIVE (subprocess PID 172371 active). Session `orchestrator-20260321-172932-issue-157-20260414-164637`, iteration=16, phase=**build**, state=running (last updated 17:00:30 UTC). PR #310 open. Concurrency slot occupied (cap=1) — no new dispatches.
- [x] #173: still `blocked_on_human` — human must remove false "Implementation Status" section from GH issue #173 body.
- [x] #108: still `blocked_on_human` — human must manually rebase PR #132 onto agent/trunk.
- [x] Queue empty — no override prompts to process.
- [x] No state transitions required this pass — child progressing normally in build phase.

# orchestrator scan (2026-04-14 ~eighth pass)

## State transitions

- [x] #157: child PID 139176 ALIVE. Iteration=14, phase=**review** (frontmatter_applied 16:57:17Z, timeout=3600s, ~32 min elapsed — within limits). loop-plan.json: cyclePosition=4 (review), allTasksMarkedDone=false. PR #310 open. Concurrency slot occupied (cap=1) — no new dispatches.
  - Note: previous scan reported "iteration 28 / phase orch" — this was a misread. Authoritative state: iteration=14, review phase, progressing normally.
- [x] #173: still blocked_on_human — human must remove false "Implementation Status" section from GH issue #173 body.
- [x] #108: still blocked_on_human (In review) — human must manually rebase PR #132 onto agent/trunk.
- [x] Queue directory absent — no override prompts.
- [x] 105 Ready issues waiting. Top priority (-10): #188, #187, #186, #185, #184. Next dispatch after #157 completes.

# orchestrator scan (2026-04-14 ~ninth pass)

## State transitions

- [x] #157: child PID 139176 ALIVE. status.json: iteration=16, phase=**build**, state=running, updated_at=17:00:30Z. loop-plan.json: cyclePosition=1 (build_claude), allTasksMarkedDone=false. Concurrency slot occupied (cap=1) — no new dispatches.
- [x] #173: still blocked_on_human — human must remove false "Implementation Status" section from GH issue #173 body.
- [x] #108: still blocked_on_human (In review) — human must manually rebase PR #132 onto agent/trunk.
- [x] Queue: fixture files only (e2e test data, not real overrides) — nothing to process.
- [x] 105 Ready issues waiting. No state transitions required — child active and progressing.

# orchestrator scan (2026-04-14 ~tenth pass)

## State transitions

- [x] #157: child PID 139176 ALIVE. status.json: iteration=17, phase=**build**, state=running, updated_at=17:08:29Z. loop-plan.json: cyclePosition=2, allTasksMarkedDone=false. Concurrency slot occupied (cap=1) — no new dispatches.
- [x] #173: still blocked_on_human — human must remove false "Implementation Status" section from GH issue #173 body.
- [x] #108: still blocked_on_human (In review) — human must manually rebase PR #132 onto agent/trunk.
- [x] Queue: absent — no override prompts to process.
- [x] 105 Ready issues waiting (top priority -10: #188, #187, #186, #185, #184). No state transitions required — child active and progressing in build phase.

# orchestrator scan (2026-04-14 ~eleventh pass)

## State transitions

- [x] #157: child PID 139176 ALIVE. status.json: iteration=29, phase=**plan**, state=running, updated_at=17:17:19Z. loop-plan.json: cyclePosition=0, allTasksMarkedDone=false. Cycle advanced from iteration=28 review → iteration=29 plan (full cycle completed, restarting). Concurrency slot occupied (cap=1) — no new dispatches.
- [x] #173: still blocked_on_human — human must remove false "Implementation Status" section from GH issue #173 body.
- [x] #108: still blocked_on_human (In review) — human must manually rebase PR #132 onto agent/trunk.
- [x] Queue/requests: absent or only old archived files — no override prompts to process.
- [x] No state transitions required — child #157 actively cycling, all other waiting.

# orchestrator scan (2026-04-14 ~twelfth pass)

## State transitions

- [x] #157: child PID 139176 ALIVE. status.json: iteration=30, phase=**build**, state=running, updated_at=17:19:25Z. Concurrency slot occupied (cap=1) — no new dispatches.
- [x] #173: still blocked_on_human — human must remove false "Implementation Status" section from GH issue #173 body.
- [x] #108: still blocked_on_human (In review) — human must manually rebase PR #132 onto agent/trunk.
- [x] Queue: empty — no override prompts to process.
- [x] No state transitions required — child #157 progressing normally in build phase.

# orchestrator scan (2026-04-14 ~thirteenth pass)

## State transitions

- [x] #157: child PID 139176 ALIVE. status.json: iteration=31, phase=**build**, state=running, updated_at=17:28:27Z. Concurrency slot occupied (cap=1) — no new dispatches.
- [x] #173: still blocked_on_human — human must remove false "Implementation Status" section from GH issue #173 body.
- [x] #108: still blocked_on_human (In review) — human must manually rebase PR #132 onto agent/trunk.
- [x] Queue: empty — no override prompts to process.
- [x] No state transitions required — child #157 progressing normally in build phase.

# orchestrator scan (2026-04-14 ~fourteenth pass)

## State transitions

- [x] #157: child PID 139176 ALIVE. status.json: iteration=41, phase=**qa**, state=running, updated_at=17:29:05Z. loop-plan.json: cyclePosition=3 (qa), allTasksMarkedDone=false. Advanced from build → qa phase. Concurrency slot occupied (cap=1) — no new dispatches.
- [x] #173: still blocked_on_human — human must remove false "Implementation Status" section from GH issue #173 body.
- [x] #108: still blocked_on_human (In review) — human must manually rebase PR #132 onto agent/trunk.
- [x] Queue: absent — no override prompts to process.
- [x] No state transitions required — child #157 progressing normally in qa phase.

# orchestrator scan (2026-04-14 ~fifteenth pass)

## State transitions

- [x] #157: child PID 139176 ALIVE (started 16:46, ~45 min running). status.json: iteration=41, phase=**qa**, state=running, updated_at=17:29:05Z (2.5 min ago — not stale). loop-plan.json: cyclePosition=3 (qa), allTasksMarkedDone=false, tasks=0. Concurrency slot occupied (cap=1) — no new dispatches.
- [x] #173: still blocked_on_human — human must remove false "Implementation Status" section from GH issue #173 body.
- [x] #108: still blocked_on_human (In review) — human must manually rebase PR #132 onto agent/trunk.
- [x] Queue: empty — no override prompts to process.
- [x] No state transitions required — child #157 progressing in qa phase, iteration 41.

# orchestrator scan (2026-04-14 ~sixteenth pass)

## State transitions

- [x] #157: child PID 139176 ALIVE (~70 min running). status.json: iteration=58, phase=**build**, state=running, updated_at=17:51:31Z (4.6 min ago — not stale). loop-plan.json: cyclePosition=1 (build/PROMPT_build_claude.md), allTasksMarkedDone=false. Advanced through qa → orch → build cycle. Concurrency slot occupied (cap=1) — no new dispatches.
- [x] #173: still blocked_on_human — human must remove false "Implementation Status" section from GH issue #173 body.
- [x] #108: still blocked_on_human (In review) — human must manually rebase PR #132 onto agent/trunk.
- [x] Queue: empty — no override prompts to process.
- [x] No state transitions required — child #157 progressing normally in build phase, iteration 58.
