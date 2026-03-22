# Issue #166: Review agent must read PR comment history and only re-review on new commits

## Current Phase: Complete

### Context
TASK_SPEC requires three things: (1) track reviewed commit SHA to prevent spam, (2) include PR comment history with attribution in review prompts, (3) conversation-aware delta verdicts. All three are implemented, tested, and reviewed (PASS — gates 1-9). Type safety cleanup and test coverage also done.

### Spec-Gap Analysis

[spec-gap] ~~**P1: Double SHA storage**~~ — RESOLVED. SHA storage removed from process-requests.ts queuing path; orchestrate.ts now stores only on non-pending verdict.

[spec-gap] ~~**P2: Comment history lacks attribution**~~ — RESOLVED. `formatReviewCommentHistory()` in process-requests.ts now formats with `@author` + `createdAt`. Tests in process-requests.test.ts verify.

[spec-gap] ~~**P2: Review prompt missing conversation-aware instructions (TASK_SPEC req #3)**~~ — RESOLVED. `PROMPT_orch_review.md` now has delta-review section with instructions to acknowledge fixes and only flag remaining/new issues.

### QA Bugs

- [x] [qa/P1] Steer textarea 32px height on mobile. (priority: high)

- [x] [qa/P1] GitHub repo link missing aria-label. (priority: high)

- [x] [qa/P1] Escape key does not close mobile sidebar drawer. (priority: high)

- [x] [qa/P1] Focus not moved into sidebar on mobile open. (priority: high)

- [x] [qa/P1] Command palette focus not trapped on open. (priority: high)

- [x] [qa/P1] aloop steer accepts empty instruction. (priority: high)

- [~] [qa/P1] Dashboard /api/artifacts endpoint still returns 404: **URL format mismatch, not a code bug.** QA tested `curl /api/artifacts/QA_COVERAGE.md` but the endpoint requires `/api/artifacts/<iteration>/<filename>` (e.g. `/api/artifacts/3/screenshot.png`). The route regex at dashboard.ts:1095 requires a digit for iteration. Tests at dashboard.test.ts:1394-1430 pass with correct URL format. If session-level artifact access is needed, that's a new feature, not a bug. (priority: low)

- [x] [qa/P2] Lighthouse accessibility 84% (target >= 90): Fixed all 4 failures — moved GitHub link outside tablist, added explicit aria-labels for Send + Stop trigger, replaced low-contrast `text-muted-foreground/50` usages with `text-muted-foreground` in key UI text, and changed `CardTitle` heading level to `h2` to preserve heading order. Updated coverage tests for accessible-name selectors. (priority: medium)

### Up Next

- [x] **Rebuild and commit dist files** — `aloop/cli/dist/index.js` and `aloop/cli/dist/dashboard/index.html` are out of date vs source. Run build and commit. (priority: high)

- [x] **Audit & fix hover-only interactions** — Overflow tabs menu now uses a click/tap-accessible Radix dropdown menu with explicit trigger label and tab selection behavior for overflow docs. Covered by `App.coverage.test.ts` assertions for opening overflow menu and selecting STEERING/EXTRA docs. (priority: medium) [reviewed: gates 1-9 pass]

- [ ] **Add ARIA labels and roles for missing elements** — Activity panel collapse button, stop/force-stop dropdown items. Sidebar expand/collapse buttons and GitHub repo link already done. (priority: medium)

- [ ] **Implement long-press context menu on session cards** — `useLongPress` hook with 500ms threshold, context menu with Stop/Force-stop/Copy ID, haptic feedback. (priority: medium)

- [x] **Capture proof artifacts** — [review Gate 6] Captured Playwright screenshot at mobile viewport (390x844) and updated `proof-manifest.json` with structured metadata. (priority: low)

### Completed (issue #166 — review agent)

- [x] **Fix scan loop premature skip** — Removed scan loop SHA check that skipped entire PR lifecycle. SHA dedup now handled solely by `invokeAgentReview`. (priority: critical)

- [x] **Fix premature SHA storage in invokeAgentReview** — Moved `last_reviewed_sha` storage from queuing time to post-verdict. Only stored after non-pending verdict. (priority: critical)

- [x] **Enrich PR comment history with author/timestamp** — `formatReviewCommentHistory()` formats threaded history with `@author` + `createdAt`, skips empty bodies. Tests verify attribution and edge cases. (priority: high) [reviewed: gates 1-9 pass]

- [x] [review] Gate 2: SHA dedup tests — 9 tests in orchestrate.test.ts covering: early return on matching SHA, proceed on different/undefined SHA, SHA stored only on non-pending verdicts. (priority: high)

- [x] [review] Gate 3: SHA dedup branch coverage — Tests cover early-return path, SHA storage conditional, and SHA clear on redispatch. (priority: high)

- [x] **Update review prompt for conversation-aware verdicts** — Added delta-review section to `PROMPT_orch_review.md`: read prior comments, compare against current diff, acknowledge fixes, flag remaining/new issues, produce delta-style summaries. Closes TASK_SPEC req #3. (priority: high) [reviewed: gates 1-9 pass]

- [x] **Add review fields to OrchestratorIssue interface** — `last_reviewed_sha`, `last_review_comment`, `needs_redispatch`, `review_feedback`, `review_pending_count` added to interface at orchestrate.ts:91-95. (priority: medium)

- [x] [review] Gate 4: Remove `(issue as any)` casts for typed review fields — Added `child_pid` to `OrchestratorIssue` interface. Replaced all 14 casts with direct property access. tsc clean, 343 tests pass. (priority: high) [reviewed: gates 1-9 pass]

- [x] **Add remaining test coverage for review dedup** — `runOrchestratorScanPass` regression test in `orchestrate.test.ts` covers redispatch flow: `needs_redispatch` reset, `review_feedback` clear, `last_reviewed_sha` clear, plus review-fixes prompt generation. (priority: medium) [reviewed: gates 1-9 pass]

### Completed (upstream — dashboard accessibility)

- [x] **Fix `deriveFilterRepo` env var fallback** — Removed `&& ghHost` guard so `GITHUB_REPOSITORY` is used unconditionally. Added test with only `GITHUB_REPOSITORY` set (no `GH_HOST`). (priority: high) [qa/P1 + review Gate 1 + review Gate 2]

- [x] **Implement startup health checks in `session-health.json`** — Added `runStartupHealthChecks` function that runs `gh auth status`, `gh repo view`, and `git status --porcelain` checks. All results (labels + startup checks) now written to `session-health.json`. (priority: high) [qa/P1 + review Gate 1]

- [x] **Implement `ALERT.md` on critical startup failures** — When `gh auth status` fails (critical check), writes `ALERT.md` with error details and throws with non-zero exit. `gh repo view` failure is non-critical since repo may not be configured yet. (priority: high) [qa/P1 + review Gate 1]

- [x] [review] Gate 6: Create `proof-manifest.json`. QA session 2 provides equivalent Playwright evidence. [reviewed: gates 1-9 pass]

- [x] [review] Gate 3: `useIsTouchDevice.test.ts` with >=90% branch coverage. Coverage config updated. [reviewed: gates 1-9 pass]

- [x] **Extract `useIsTouchDevice` hook** — Shared hook in `hooks/useIsTouchDevice.ts`. Both tooltip.tsx and hover-card.tsx import from it.

- [x] **Expand tooltip & hover-card test coverage** — tooltip.test.tsx (110 lines), hover-card.test.tsx (87 lines).

- [x] **Fix QA P1 bugs — tap target sizing regressions** — Fixed all 5 P1 bugs with mobile-responsive min-h/min-w classes.

- [x] **Audit & fix tap target sizes across all interactive elements** — Responsive `min-h-[44px] min-w-[44px]` with `md:` breakpoint relaxation.

- [x] **Verify & fix Tooltip tap behavior on mobile** — Custom touch handling with `useIsTouchDevice()`, onClick toggle, 2000ms auto-close.

- [x] **Verify & fix HoverCard tap equivalents** — Custom touch handling with onClick toggle on touch devices.

- [x] **Fix QA P1 bugs — steer textarea + GitHub aria-label** — (1) Steer textarea `min-h-[44px] md:min-h-[32px]`. (2) GitHub repo link `aria-label`. (priority: high)

- [x] **Fix focus management for mobile overlays** — Escape sidebar, focus into sidebar, command palette focus. Three fixes in AppView.tsx. (priority: high)

- [x] **Runtime layout verification** — Playwright test in smoke.spec.ts validating 44x44 min bounding boxes for key mobile controls. (priority: medium)

- [x] **Run Lighthouse mobile accessibility audit** — Score: 84% (below 90% target). 4 failures filed as [qa/P2] bug. (priority: low)

---

## Spec-Gap Analysis (2026-03-22)

### Findings

- [ ] **[spec-gap] SPEC.md missing orchestrator startup self-healing behaviors** — The code implements three self-healing features not documented in SPEC.md acceptance criteria: (1) `session-health.json` startup health checks (`gh auth status`, `gh repo view`, `git status --porcelain`) at `orchestrate.ts:1284-1347`, (2) `ALERT.md` creation on critical failures at `orchestrate.ts:1739-1757`, (3) `ensureLabels` label self-healing at `orchestrate.ts:1213-1260`. SPEC.md's orchestrator acceptance criteria (lines 2183-2229) don't mention startup validation or label bootstrapping. **Suggested fix:** Add acceptance criteria to SPEC.md under the orchestrator section covering startup health checks, ALERT.md on critical failure, and label self-healing. (priority: P2 — correctness drift, code ahead of spec)

### No Issues Found

- Config completeness: all 5 providers + round-robin consistent across `config.yml`, `start.ts`, loop scripts
- Model IDs current (last updated 2026-03-19), `start.ts` DEFAULT_MODELS match `config.yml`
- Template frontmatter: all loop templates use `provider: claude`; orchestrator templates correctly omit provider (runtime-provided)
- No orphan templates; all referenced templates exist
- Provider validation sets consistent across `start.ts` PROVIDER_SET and loop scripts
- TODO hygiene: all 4 items marked done, no stale or hallucinated items
- No previously filed `[spec-gap]` items to resolve
