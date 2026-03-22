# Issue #166: Review agent must read PR comment history and only re-review on new commits

## Current Phase: Implementation

### Context
TASK_SPEC requires three things: (1) track reviewed commit SHA to prevent spam, (2) include PR comment history with attribution in review prompts, (3) conversation-aware delta verdicts. Items 1 and 2 are complete. Item 3 (prompt instructions) is now also complete.

### In Progress

- [x] **Add review fields to OrchestratorIssue interface** — `last_reviewed_sha`, `last_review_comment`, `needs_redispatch`, `review_feedback`, `review_pending_count` are accessed via `(issue as any)` casts in `orchestrate.ts` and `process-requests.ts`. Add these to the `OrchestratorIssue` interface at `orchestrate.ts:69-91` for type safety. (priority: medium)

- [ ] **Add remaining test coverage for review dedup** — SHA gating (items 1-2) and comment attribution (item 4) already have tests. Still need: (3) result file still read even when SHA matches, (5) re-dispatch clears `last_reviewed_sha`. Add these to `orchestrate.test.ts`. (priority: medium)

### Spec-Gap Analysis

[spec-gap] ~~**P1: Double SHA storage**~~ — RESOLVED. SHA storage removed from process-requests.ts queuing path; orchestrate.ts now stores only on non-pending verdict.

[spec-gap] ~~**P2: Comment history lacks attribution**~~ — RESOLVED. `formatReviewCommentHistory()` in process-requests.ts now formats with `@author` + `createdAt`. Tests in process-requests.test.ts verify.

[spec-gap] ~~**P2: Review prompt missing conversation-aware instructions (TASK_SPEC req #3)**~~ — RESOLVED. `PROMPT_orch_review.md` now has delta-review section with instructions to acknowledge fixes and only flag remaining/new issues.

### QA Bugs

- [x] [qa/P1] Steer textarea 32px height on mobile: Steer input renders at 32px on mobile. WCAG 2.5.8 requires 44px minimum. Fix: `min-h-[44px] md:min-h-[32px] h-auto md:h-8`. (priority: high)

- [x] [qa/P1] GitHub repo link missing aria-label: SVG-only link at AppView.tsx:1190. Fix: add `aria-label="Open repo on GitHub"`. (priority: high)

- [x] [qa/P1] Escape key does not close mobile sidebar drawer: Pressing Escape does not close the sidebar on mobile. Overlay click works. Fix: add keydown listener for Escape. (priority: high)

- [x] [qa/P1] Focus not moved into sidebar on mobile open: Focus remains on hamburger button instead of moving into sidebar content. Fix: programmatically focus first focusable element inside sidebar. (priority: high)

- [x] [qa/P1] Command palette focus not trapped on open: `document.activeElement` is `BODY` instead of search input after Ctrl+K. Fix: auto-focus command input on open. (priority: high)

- [x] [qa/P1] aloop steer accepts empty instruction: `aloop steer "" --session <id>` succeeds with exit 0. Expected: reject with error and non-zero exit. (priority: high)

- [ ] [qa/P1] Dashboard /api/artifacts endpoint still returns 404: Re-tested at iter 5 via installed binary (`/tmp/aloop-test-install-XIG8ZU/bin/aloop`). `curl http://localhost:4398/api/artifacts/QA_COVERAGE.md` → 404. Tried query param variant too. Endpoint not reachable through packaged CLI. (priority: high)

- [ ] [qa/P2] Lighthouse accessibility 84% (target >= 90): Four failures: (1) tablist contains non-tab child `a[aria-label]`, (2) two buttons in footer lack accessible names (Send disabled + Stop dropdown trigger), (3) `text-muted-foreground/50` contrast ratio 1.96:1 (needs 4.5:1), (4) heading order skips h2 → h3. Tested at iter 5. (priority: medium)

### Up Next

- [x] **Extract shared `runGh` helper** — The duplicated `runGh` closures in `deriveFilterRepo` and `deriveTrunkBranch` were replaced by shared `runGhWithFallback` helper to eliminate duplication while preserving behavior/logging. (priority: medium) [review Gate 4]

- [x] **Fix focus management for mobile overlays** — Addresses QA bugs: Escape sidebar, focus into sidebar, command palette focus. Three fixes in AppView.tsx. (priority: high)

- [ ] **Audit & fix hover-only interactions** — Overflow tabs menu (AppView.tsx:1174-1186) uses `group-hover:block` with no click/tap equivalent. Fix: add click toggle state. (priority: medium)

- [ ] **Add ARIA labels and roles for missing elements** — Sidebar expand/collapse buttons, activity panel collapse button, stop/force-stop dropdown items. GitHub repo link already done. (priority: medium)

- [ ] **Implement long-press context menu on session cards** — `useLongPress` hook with 500ms threshold, context menu with Stop/Force-stop/Copy ID, haptic feedback. (priority: medium)

- [x] **Runtime layout verification** — [review Gate 7] Run Playwright at 390x844 viewport and verify bounding boxes of key elements meet 44x44px minimum. Added Playwright test in `aloop/cli/dashboard/e2e/smoke.spec.ts` validating 44x44 min bounding boxes for key mobile controls. (priority: medium)

- [x] **Run Lighthouse mobile accessibility audit** — Ran at iter 5. Score: 84% (below 90% target). 4 failures filed as [qa/P2] bug. (priority: low)

- [ ] **Capture proof artifacts** — [review Gate 6] Capture Playwright screenshots at mobile viewport. (priority: low)

### Completed (issue #166 — review agent)

- [x] **Fix scan loop premature skip** — Removed scan loop SHA check that skipped entire PR lifecycle. SHA dedup now handled solely by `invokeAgentReview`. (priority: critical)

- [x] **Fix premature SHA storage in invokeAgentReview** — Moved `last_reviewed_sha` storage from queuing time to post-verdict. Only stored after non-pending verdict. (priority: critical)

- [x] **Enrich PR comment history with author/timestamp** — `formatReviewCommentHistory()` formats threaded history with `@author` + `createdAt`, skips empty bodies. Tests verify attribution and edge cases. (priority: high) [reviewed: gates 1-9 pass]

- [x] [review] Gate 2: SHA dedup tests — 8 tests in orchestrate.test.ts covering: early return on matching SHA, proceed on different/undefined SHA, SHA stored only on non-pending verdicts. (priority: high)

- [x] [review] Gate 3: SHA dedup branch coverage — Tests cover early-return path, SHA storage conditional, and SHA clear on redispatch. (priority: high)

- [x] **Update review prompt for conversation-aware verdicts** — Added delta-review section to `PROMPT_orch_review.md`: read prior comments, compare against current diff, acknowledge fixes, flag remaining/new issues, produce delta-style summaries. Closes TASK_SPEC req #3. (priority: high) [reviewed: gates 1-9 pass]

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

- [x] **Fix QA P1 bugs — steer textarea + GitHub aria-label** — (1) Steer textarea changed to `min-h-[44px] md:min-h-[32px] h-auto md:h-8`. (2) GitHub repo link gets `aria-label="Open repo on GitHub"`. (priority: high)

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
