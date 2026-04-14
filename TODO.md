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
- [ ] #172 review already queued from prior scan (review-172-pr308)
- [ ] #144, #124, #39 needs_redispatch=true — awaiting free slot after #173 dispatch
- [x] #173 reaped again: child 161533 (dispatch from 16:13 scan) completed plan-only — 3rd failure. Root cause: issue body corrupted with false "This issue is already implemented" text causing child sessions to exit after plan. Transitioned → pr_open/needs_redispatch. New dispatch written with explicit override instructions.
- [x] #173 reaped again: child 162409 / PID 95703 (force-impl dispatch from 16:32) completed plan-only — **4th failure**. Branch diff shows zero loop.sh/loop.ps1 changes. Escalated → `blocked_on_human`. Dispatch archived. Human must remove false "Implementation Status" section from GitHub issue #173 body before redispatching.
- [ ] #39 dispatch still pending (dispatch-39-review-fix from 16:04) — slot now free, runtime to dispatch next

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