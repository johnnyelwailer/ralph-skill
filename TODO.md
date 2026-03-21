# Issue #84: Responsive Layout: Touch interactions and mobile accessibility (Lighthouse >= 90)

## Current Phase: Implementation

### In Progress

### Up Next
- [x] Audit and enlarge all tap targets to minimum 44x44px on mobile/tablet — buttons, sidebar session items, tab triggers, dropdown triggers, and icon buttons all currently use default sizing with no mobile minimum. Add responsive min-height/min-width (Tailwind `min-h-11 min-w-11` = 44px) at mobile breakpoints. (priority: critical)
- [ ] Add swipe-right-from-left-edge gesture to open sidebar — no touch/gesture handling exists. Implement `touchstart`/`touchmove`/`touchend` handlers on the app container that detect a right-swipe originating near the left edge (<30px) and open the sidebar. Use `touch-action` CSS to avoid scroll interference. (priority: critical)
- [ ] Create a `useLongPress` hook and wire it to session/log entries to open a context menu — no context menu or long-press handling exists. Create a Radix UI `ContextMenu` wrapper triggered by long-press (500ms threshold via `touchstart`/`touchend` timing). Apply to session list items and log entries. (priority: critical)
- [ ] Add tap equivalents for HoverCard interactions — the iteration info HoverCard (AppView.tsx:832-850) is hover-only with no `onClick` tap equivalent. Add an `onClick` handler on `HoverCardTrigger` that toggles the card open on touch devices. Use pointer media query or `onPointerDown` with `pointerType` detection. (priority: high)
- [ ] Add tap-to-toggle for all Tooltip instances — tooltips (40+ usages) are hover-only. Wrap `TooltipTrigger` with tap-to-toggle behavior on touch devices: tap opens, tap-outside or second tap closes. Can be done centrally by creating a `TouchTooltip` wrapper component. (priority: high)
- [ ] Eliminate any remaining hover-only interactions on touch devices — audit all `onMouseEnter`, `onMouseOver`, `hover:` Tailwind classes, and Radix hover primitives. Ensure every hover-triggered visual change has a touch/click equivalent or is purely decorative. (priority: high)
- [ ] Integrate Lighthouse accessibility audit into the test pipeline — no Lighthouse or axe-core integration exists. Add `@axe-core/playwright` to Playwright E2E tests for automated accessibility checks. Optionally add an npm script for `npx lighthouse --only-categories=accessibility --output=json` against the dev server. Target score >= 90. (priority: high)
- [ ] Fix any accessibility issues flagged by Lighthouse/axe audit — run the audit, triage findings, fix issues (missing ARIA labels, color contrast, focus management, semantic HTML). This task depends on the Lighthouse integration task. (priority: high)

### Completed
