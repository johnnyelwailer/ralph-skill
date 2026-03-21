# Issue #84: Responsive Layout: Touch interactions and mobile accessibility (Lighthouse >= 90)

## Current Phase: Implementation

### In Progress
- [ ] Fix overflow tabs menu hover-only interaction — the docs panel overflow menu (AppView.tsx:~958) uses `hidden group-hover:block` with no click/tap handler, making it completely inaccessible on touch devices. Add a click-to-toggle or always-visible-on-mobile approach. (priority: critical — blocks acceptance criteria "no hover-only interactions")
- [ ] Add tap equivalents for HoverCard interactions — the iteration info HoverCard (AppView.tsx:858-876) trigger is hidden on mobile (`hidden sm:flex`) with no alternative. On small screens, this content is completely inaccessible. Add an `onClick` toggle or a mobile-specific UI to expose iteration details on touch devices. (priority: high — blocks acceptance criteria "no hover-only interactions")
- [ ] Add tap-to-toggle for all Tooltip instances — 5 tooltip usages in AppView.tsx are hover-only. Create a `TouchTooltip` wrapper or add `onClick` tap-to-toggle behavior on touch devices. Affects: sidebar expand/collapse, session items, command palette button, JSON payload preview. (priority: high — blocks acceptance criteria "no hover-only interactions")

### Up Next
- [x] [review] Gate 2+3 (merged): `useLongPress` tests have ~25% branch coverage (2 of ~7 branches). Add tests for: (a) touchEnd before 500ms should NOT fire onLongPress, (b) multi-touch cancellation (touchStart with 2+ fingers), (c) touchCancel handler, (d) onClickCapture suppression after long-press fires, (e) clearPress when no timeout is pending. Target >=90% branch coverage. (priority: high)
- [x] [review] Gate 4: `AppView.tsx` `openLongPressContextMenu` function dispatches a synthetic PointerEvent with a MouseEvent fallback — this is a brittle coupling to Radix ContextMenu internals. If Radix changes its trigger mechanism, this breaks silently. Add a code comment documenting why this hack is needed and which Radix version it targets. (priority: medium)
- [ ] Integrate Lighthouse accessibility audit into the test pipeline — no Lighthouse or axe-core integration exists. Add `@axe-core/playwright` to Playwright E2E tests for automated accessibility checks. Optionally add an npm script for `npx lighthouse --only-categories=accessibility --output=json` against the dev server. Target score >= 90. (priority: high)
- [ ] Fix any accessibility issues flagged by Lighthouse/axe audit — run the audit, triage findings, fix issues (missing ARIA labels, color contrast, focus management, semantic HTML). This task depends on the Lighthouse integration task. (priority: high)

### Completed
- [x] Audit and enlarge all tap targets to minimum 44x44px on mobile/tablet — all interactive elements now have `min-h-11 min-w-11` (44px) with `md:min-h-0 md:min-w-0` desktop reset. Verified across sidebar buttons, session items, tab triggers, dropdown triggers, icon buttons, panel toggles.
- [x] Add swipe-right-from-left-edge gesture to open sidebar — implemented with 30px edge threshold, 60px drag distance, 40px vertical drift tolerance. Sets both `setSidebarCollapsed(false)` and `setMobileMenuOpen(true)`. Tested in App.coverage.test.ts.
- [x] Create a `useLongPress` hook and wire it to session/log entries to open a context menu — hook at `hooks/useLongPress.ts` with 500ms threshold, movement cancellation, multi-touch rejection, click suppression. Wired to `SessionContextMenu` (copy session ID/path) and `LogEntryContextMenu` (copy raw line/JSON payload) via Radix ContextMenu.
