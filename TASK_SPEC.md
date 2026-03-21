# Sub-Spec: Issue #84 — Responsive Layout: Touch interactions and mobile accessibility (Lighthouse >= 90)

## Objective

Ensure all interactive elements meet touch accessibility standards and achieve Lighthouse mobile accessibility score >= 90.

## Inputs
- Mobile and tablet responsive layouts (previous sub-issues)
- WCAG 2.5.8 tap target requirements

## Deliverables
- All tap targets minimum 44x44px on mobile/tablet viewports
- Swipe right from left edge opens sidebar (touch gesture)
- Long-press on session/log entries opens context menu
- All hover-card and tooltip interactions have tap equivalents
- No hover-only interactions remain in the mobile/tablet layouts
- Audit and fix any remaining accessibility issues flagged by Lighthouse

## Acceptance Criteria
- [ ] All tap targets at least 44x44px on mobile
- [ ] Swipe right gesture opens sidebar
- [ ] Long-press opens context menu on relevant elements
- [ ] No hover-only interactions on touch devices
- [ ] Lighthouse mobile accessibility score >= 90

## Technical Notes
- Use `touch-action` CSS property and pointer events for gesture detection
- Consider a lightweight gesture library or manual `touchstart`/`touchmove`/`touchend` handlers
- Radix UI `HoverCard` has `openDelay` — add an `onClick` handler as tap equivalent
- Radix UI `Tooltip` — wrap with tap-to-toggle on touch devices
- Run Lighthouse CI via `npx lighthouse --only-categories=accessibility --output=json`

## Labels
`aloop/sub-issue`, `aloop/needs-refine`
