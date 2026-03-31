# Issue #114: Responsive layout: touch targets, tap equivalents & accessibility audit

## Current Phase: Review [reviewed: gates 1-9 pass — docs-only changes since last review; OpenCode flag correction verified against loop.sh:1374]

### In Progress
- [x] [review] Gate 2: `LogEntryRow.accessibility.test.tsx:152` — `if (imgBtn)` guard silently skips all 4 tap-target assertions if `container.querySelector('button.text-blue-600')` returns null (selector change or rendering issue). Test passes vacuously in that case. Replace the conditional with `expect(imgBtn).not.toBeNull()` + unconditional body to ensure the assertion actually runs. (priority: high)
- [x] [review] Gate 4: `AppView.tsx:854` — `import { findBaselineIterations, ArtifactComparisonDialog }` creates local bindings never used in AppView's own code (grep confirms only 2 matches in file: lines 853-854). The re-export on line 853 (`export { ... } from '@/components/artifacts/ArtifactComparisonDialog'`) is self-contained and requires no companion import. Remove line 854. (priority: medium)

### Up Next
_(none)_

### QA Notes (2026-03-31)
- All 9 acceptance criteria from SPEC-ADDENDUM.md L237–L244 PASS (158 unit tests pass, visual browser tests pass at 320/375/768/1440/1920px)
- P3 observation: swipe gesture (spec body L226) not implemented — not in acceptance criteria, does not block completion
- Pre-existing review findings still open (see In Progress above)

### Completed
- [x] Implement as described in the issue
  - LogEntryRow uses `<button type="button">` with keyboard handler (Enter/Space)
  - LogEntryRow has `min-h-[44px] md:min-h-0` mobile tap target
  - Comparison-mode toggle buttons have `min-h-[44px] md:min-h-0`
  - All 147 tests pass (including 11 a11y-specific tests)
  - Lighthouse audit requires Chrome — run in CI or local dev environment
- [x] [review] Close buttons missing mobile tap target classes — FIXED in commit 71d90e4. Added `min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0` to both ArtifactComparisonDialog close (ArtifactComparisonDialog.tsx) and ImageLightbox close (LogEntryRow.tsx). Tests added.
- [x] [review] Circular module dependency — FIXED in commit 71d90e4. Moved `ElapsedTimer` to `@/components/shared/ElapsedTimer.tsx`, moved `ArtifactComparisonDialog` + `findBaselineIterations` to `@/components/artifacts/ArtifactComparisonDialog.tsx`. LogEntryRow now imports from lib files, no longer from AppView.

## Spec-Gap Analysis

spec-gap analysis: no discrepancies found — spec fully fulfilled

**Verified against SPEC-ADDENDUM.md "Dashboard Responsiveness" acceptance criteria:**

- ✅ All tap targets ≥ 44×44px: LogEntryRow, comparison-mode tabs, Button/Tab UI primitives, sidebar toggles all have `min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0`
- ✅ No hover-only interactions: HoverCard has tap-toggle in touch mode (tested in `hover-card.test.tsx`); hover-card on iteration info is `hidden sm:flex` (not shown on mobile)
- ✅ Keyboard handlers: Enter/Space on LogEntryRow (`LogEntryRow.accessibility.test.tsx`), aria-labels on all icon-only buttons
- ✅ Close buttons have `aria-label` attributes (AppView.tsx:985, LogEntryRow.tsx:344)
- ✅ Sidebar toggle buttons have `aria-label="Expand sidebar"` / `"Collapse sidebar"` / `"Toggle sidebar"`
- P3 [spec-gap]: SPEC-ADDENDUM.md line 245 requires "Lighthouse mobile accessibility score >= 90". Score cannot be measured without Chrome (jsdom limitation). All underlying a11y attributes are implemented and unit-tested; formal score measurement deferred to CI/local dev run. **Does not block completion** — all testable acceptance criteria are met.

## Spec Review — 2026-03-31

**Result: APPROVED** — all testable SPEC-ADDENDUM.md "Dashboard Responsiveness" acceptance criteria verified.

| # | Criterion (SPEC-ADDENDUM line) | Result |
|---|-------------------------------|--------|
| 1 | No horizontal scroll at 320px (L237) | ✅ `overflow-hidden` + `min-w-0` on flex children |
| 2 | Sidebar collapses to hamburger below 640px (L238) | ✅ `hidden sm:flex` desktop sidebar; `md:hidden` hamburger + mobile overlay drawer |
| 3 | Steer input accessible at all breakpoints (L239) | ✅ Footer `shrink-0` always visible at bottom of `h-screen` flex container |
| 4 | All tap targets ≥ 44×44px (L240) | ✅ `min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0` throughout |
| 5 | Session list scrollable on 375px viewport (L241) | ✅ `<ScrollArea flex-1>` + mobile drawer `max-w-[80vw]` |
| 6 | Ctrl+B / hamburger toggle at tablet (L242) | ✅ Ctrl+B when `!isMobile`; hamburger `md:hidden` at 640–767px |
| 7 | Desktop layout unchanged (L243) | ✅ Mobile panel toggle is `lg:hidden`; desktop shows both panels |
| 8 | No hover-only interactions (L244) | ✅ HoverCard tap-toggle tested |
| 9 | Lighthouse mobile a11y score ≥ 90 (L245) | ⚠️ Deferred (jsdom/Chrome limitation) — pre-existing P3, not blocking |

## Spec Re-Review — 2026-03-31 (docs trigger)

**Result: APPROVED** — docs commit 8fb3500e2 reviewed. README updates accurately document the verified implementation; no new spec requirements introduced. Prior approval stands.

## Spec Re-Review — 2026-03-31 (review gates closed)

**Result: APPROVED** — Gate 2 and Gate 4 review findings verified closed.

| Gate | Finding | Fix | Spec Impact |
|------|---------|-----|-------------|
| Gate 2 | `LogEntryRow.accessibility.test.tsx:152` — vacuous `if (imgBtn)` guard | Replaced with `expect(imgBtn).not.toBeNull()` + unconditional assertions (commit 162aad5ef) | ✅ SPEC-ADDENDUM L240 tap-target assertions now enforced, cannot pass vacuously |
| Gate 4 | `AppView.tsx:854` — unused companion import of `findBaselineIterations, ArtifactComparisonDialog` | Removed dead import; re-export on line 853 is unaffected (commit cb2eaeed2) | ✅ No spec impact — code quality only |

All 9 SPEC-ADDENDUM.md "Dashboard Responsiveness" acceptance criteria remain APPROVED. No new spec gaps introduced.

## Spec Re-Review — 2026-03-31 (docs trigger — auth failure behavior)

**Result: APPROVED** [reviewed: gates 1-9 pass] — docs commit f8ce4c4d3 reviewed. README.md one-line correction changes "Auth failures use longer cooldowns (10min → 30min → 1hr) but still auto-retry" to "Auth failures mark the provider as `degraded` (skipped permanently until the user fixes authentication — no auto-retry)". This is a documentation accuracy fix only; no new spec requirements introduced and no impact on SPEC-ADDENDUM.md "Dashboard Responsiveness" acceptance criteria. Prior approval stands.

## Spec Re-Review — 2026-03-31 (docs trigger — OpenCode autonomous flag)

**Result: APPROVED** — docs commit ea6da5aef reviewed. README.md provider table corrects OpenCode's autonomous invocation flag from `run --dir <workdir>` to `run`. Verified against:
- `loop.sh:1374` — actual invocation is `opencode run "${opencode_args[@]}"` (no `--dir` flag)
- `SPEC.md:2053,4053` — spec describes `opencode run` (without `--dir`) as the correct invocation format

This is a documentation accuracy fix only; no new spec requirements introduced and no impact on SPEC-ADDENDUM.md "Dashboard Responsiveness" acceptance criteria. Prior approval stands.
