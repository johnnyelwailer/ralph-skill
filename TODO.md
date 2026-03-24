# Issue #163: Conflict resolution must happen in child loop, not orchestrator — pre-iteration rebase

## Current Phase: Implementation + Tests

### In Progress

### Up Next

- [x] Fix Phase 2c in process-requests.ts: after writing `000-merge-conflict.md` on rebase failure, set `needs_redispatch = true` on the matching state issue and persist state (priority: critical)

  **Why:** The queue file is written correctly but the child loop is never restarted to process it, leaving 9/9 PRs stuck in conflict forever. Fix 2 from TASK_SPEC.md §Fix 2. Spec line: "Also persist state after this mutation so it's not lost."

- [x] Add test: Phase 2c rebase failure → queue file written AND `needs_redispatch === true` set on state issue (priority: critical)

  **Why:** Acceptance criterion from TASK_SPEC.md: "Phase 2c test: when git rebase fails in a child worktree, `000-merge-conflict.md` is written AND `needs_redispatch === true` is set on the matching state issue"

- [x] Add test: Phase 2c rebase success → no queue file written, `needs_redispatch` not set (priority: high)

  **Why:** Acceptance criterion from TASK_SPEC.md: "Phase 2c test: when git rebase succeeds, no queue file is written and `needs_redispatch` is not set"

- [x] [review] Gate 2: Update existing `processPrLifecycle` test "requests rebase on first merge conflict" to also assert `issue.needs_rebase === true` (priority: high)

  **Why:** Acceptance criterion: "`issue.needs_rebase === true` (not `review_feedback` with rebase text)". Current test asserts `needs_redispatch === true` but not `needs_rebase === true`.

- [x] [review] Gate 2/3: Add test for redispatch path when `needs_rebase === true` → writes `000-rebase-conflict.md` with `agent: merge` frontmatter and clears `needs_rebase` to `false` (priority: high)

  **Why:** The entire `if (issue.needs_rebase === true)` branch in `runOrchestratorScanPass` (orchestrate.ts ~line 5615) is untested. This is the core behavior of Fix #1 — choosing the merge agent over the build agent. A broken implementation writing the wrong file would not be caught.

- [x] [review] Gate 2/3: Add test for redispatch path when `needs_rebase === false` (normal review rejection) → writes `000-review-fixes.md` with `agent: build` frontmatter (regression guard) (priority: high)

  **Why:** The `else` branch of the `needs_rebase` conditional in the redispatch path is also untested. This is a regression guard — without it, a refactor that accidentally broke the non-rebase path (changing `agent: build` back to `agent: merge`) would go undetected.

- [x] [review] Gate 4: Remove dead JSDoc + dangling comment at orchestrate.ts:3651-3655 referencing the removed `requestRebase` function (priority: low)

  **Why:** Lines 3651-3655 contain a JSDoc block ("Request a child loop to rebase its branch...") followed by a `// requestRebase is no longer used` comment. The function this documented was removed; the orphaned documentation is misleading.

- [x] [review] Gate 9: Update SPEC-ADDENDUM.md line 1434 to document `needs_rebase = true` instead of `review_feedback` for merge conflict dispatch (priority: medium)

  **Why:** SPEC-ADDENDUM.md §PR Lifecycle line 1434 still says "sets `needs_redispatch = true` and `review_feedback` with rebase instructions" — but the implementation now sets `needs_rebase = true` and no longer uses `review_feedback` for conflict cases. The spec is stale and will mislead future developers.

- [ ] [spec-gap] P2: Update SPEC-ADDENDUM.md §Review Re-Dispatch to document the `needs_rebase` dispatch path (priority: medium)

  **What's mismatched:** `SPEC-ADDENDUM.md` lines 1465–1509 (`§Review Re-Dispatch`) only documents the `CHANGES_REQUESTED` path — it says the queue file is always `000-review-fixes.md` with `agent: build` frontmatter. But the implementation added in Issue #163 (`orchestrate.ts` lines 5609–5622) now branches: when `issue.needs_rebase === true`, it writes `000-rebase-conflict.md` with `agent: merge`; otherwise it writes `000-review-fixes.md` with `agent: build`. The `000-rebase-conflict.md` file, its frontmatter, and the state-cleanup step (`needs_rebase = false`) are not documented anywhere in the `§Review Re-Dispatch` section. The acceptance criteria block for that section also has no criterion covering the merge-conflict redispatch path.

  **Files involved:**
  - `SPEC-ADDENDUM.md` lines 1465–1509 (spec is incomplete)
  - `aloop/cli/src/commands/orchestrate.ts` lines 5609–5622 (implementation reference)

  **Suggested fix:** Update `§Review Re-Dispatch` to add a sub-section (e.g. "Merge Conflict Re-Dispatch") documenting: when `needs_rebase === true`, write `000-rebase-conflict.md` with `agent: merge` frontmatter and clear `needs_rebase = false`. Add corresponding acceptance criteria (`grep "000-rebase-conflict" orchestrate.ts` and `grep "needs_rebase.*false" orchestrate.ts`). Update spec, not code.

- [ ] [spec-gap] P3: `loop.sh` default `ROUND_ROBIN_PROVIDERS` is inconsistent with `config.yml` and loop.sh's own help text (priority: low, pre-existing, not related to Issue #163)

  **What's mismatched:** `aloop/bin/loop.sh` line 31 sets `ROUND_ROBIN_PROVIDERS="claude,gemini,opencode"` (3 providers). `config.yml` lists 5 providers in `round_robin_order`: `claude, opencode, codex, gemini, copilot`. `loop.sh` help text at line 65 says the default is `"claude,codex,gemini,copilot"` (4 providers, different set). `loop.ps1` default matches config.yml (all 5). Three sources disagree.

  **Files involved:**
  - `aloop/bin/loop.sh` line 31 (3-provider default)
  - `aloop/bin/loop.sh` line 65 (4-provider help text — different set)
  - `aloop/config.yml` (5-provider `round_robin_order`)
  - `aloop/bin/loop.ps1` (5-provider default — consistent with config.yml)

  **Suggested fix:** Update `loop.sh` line 31 default to match config.yml: `ROUND_ROBIN_PROVIDERS="claude,opencode,codex,gemini,copilot"`. Also align help text at line 65. Code is wrong relative to config; config is the single source of truth.

### Completed

- [x] Add `needs_rebase?: boolean` to `OrchestratorIssue` interface in orchestrate.ts
- [x] Fix `processPrLifecycle`: when `!gatesResult.mergeable`, set `needs_rebase = true` and `needs_redispatch = true` (not `review_feedback`)
- [x] Fix redispatch path (orchestrate.ts ~line 5602): when `needs_rebase === true`, write `000-rebase-conflict.md` with `agent: merge` frontmatter; else write `000-review-fixes.md` with `agent: build`
