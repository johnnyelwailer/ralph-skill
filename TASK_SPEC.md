# Sub-Spec: Issue #114 — Responsive layout: touch targets, tap equivalents & accessibility audit

## Objective

Ensure all interactive elements meet mobile accessibility requirements: minimum tap target sizes, tap equivalents for hover interactions, long-press context menus, and Lighthouse mobile accessibility score >= 90.

## Context

WCAG 2.5.8 requires minimum 44x44px tap targets. The current dashboard uses hover-cards, tooltips, and small icon buttons that need tap equivalents. See SPEC-ADDENDUM.md § Touch Considerations.

## Scope

### Tap targets
- Audit all buttons, links, and interactive elements — ensure minimum 44x44px on mobile
- Apply `min-h-[44px] min-w-[44px]` on mobile breakpoint where needed
- Session cards, log entries, tab triggers, dropdown items must all meet the target

### Hover → Tap equivalents
- All `HoverCard` components must also work on tap/click (HoverCard already supports this via Radix, verify)
- All `Tooltip` components must have tap-to-show behavior on mobile
- No interaction should be hover-only — verify every hover interaction has a touch alternative

### Long-press context menu
- Long-press (500ms) on session card opens context menu (stop, force-stop, copy session ID)
- Implement via `onTouchStart`/`onTouchEnd` timer with haptic feedback if available

### Lighthouse audit
- Run Lighthouse mobile accessibility audit
- Target score >= 90
- Fix any flagged issues (color contrast, ARIA labels, focus management)

## Acceptance Criteria

- [ ] All tap targets at least 44x44px on mobile viewports
- [ ] No hover-only interactions — all have tap/click equivalents
- [ ] Long-press on session card opens context menu
- [ ] Lighthouse mobile accessibility score >= 90
- [ ] Focus management works correctly on mobile (no focus traps, logical tab order)

## Files
- `aloop/cli/dashboard/src/AppView.tsx` — tap target sizing, long-press handler
- Various component files with HoverCard/Tooltip usage
- CSS/Tailwind adjustments for mobile sizing

## Labels
`aloop/sub-issue`, `aloop/needs-refine`
