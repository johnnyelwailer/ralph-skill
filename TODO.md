# Issue #114: Responsive layout: touch targets, tap equivalents & accessibility audit

## Current Phase: Implementation

### Context
The dashboard (`aloop/cli/dashboard/src/AppView.tsx`, ~2378 lines) has partial responsive support (mobile sidebar drawer, breakpoint-based hiding) but does not meet WCAG 2.5.8 tap target requirements, lacks long-press context menus, and has unverified tooltip/hover-card tap equivalents. Note: AppView.tsx is a monolith that SPEC-ADDENDUM says should be decomposed, but that's a separate issue — this issue focuses on accessibility within the existing structure.

### In Progress

### Up Next

- [x] **Audit & fix tap target sizes across all interactive elements** — Button default size is h-10 (40px), sm is h-9 (36px), dropdown items ~28px. Add responsive `min-h-[44px] min-w-[44px]` classes on mobile breakpoint to: button.tsx variants, dropdown-menu.tsx items, session cards in sidebar, tab triggers, collapsible triggers, panel toggle buttons, footer controls. Use Tailwind's default (mobile-first) prefix so 44px applies at base and can be relaxed at `md:` if desired.

- [x] **Verify & fix Tooltip tap behavior on mobile** — Radix Tooltip is hover-triggered by default. On touch devices it may not show on tap. Verify `@radix-ui/react-tooltip` behavior on touch — if it doesn't show on tap, wrap tooltips to also respond to click/touch events (e.g., toggle open state on tap). The TooltipProvider has `delayDuration={300}` at line ~2329 in AppView.tsx. Key tooltip usages: status dot (~line 467), connection indicator (~line 481), panel collapse/expand (~line 2298-2319).

- [x] **Verify HoverCard tap equivalents** — Radix HoverCard supports `openDelay` but on mobile touch events should trigger open. Verify that existing HoverCard usage in AppView.tsx works on tap/click. If not, add `onClick` toggle or switch to a Popover on mobile.

- [ ] **Implement long-press context menu on session cards** — Create a `useLongPress` hook with 500ms threshold using `onTouchStart`/`onTouchEnd`/`onTouchMove` (cancel on move). On trigger, show a context menu (reuse DropdownMenu component) with: Stop session, Force-stop session, Copy session ID. Add haptic feedback via `navigator.vibrate(50)` if available. Apply to session card elements in the sidebar (~line 812, 838, 963 area of AppView.tsx).

- [ ] **Ensure no hover-only interactions exist** — Audit all `onMouseEnter`, `onMouseOver`, `hover:` Tailwind classes that reveal interactive content (not just styling). Every hover interaction that shows/hides content or enables an action must have a tap/click equivalent. Check: hover-cards, tooltips, any conditional rendering gated on hover state.

- [ ] **Add ARIA labels and roles for missing elements** — Review interactive elements for proper `aria-label` on icon-only buttons (sidebar toggle, panel collapse, mobile menu hamburger, stop/force-stop buttons). Ensure all form inputs have associated labels. Check that dropdown menus have proper `aria-haspopup` and `aria-expanded` attributes (Radix should handle this, but verify).

- [ ] **Fix focus management for mobile** — Ensure logical tab order across the responsive layout. When mobile sidebar drawer opens/closes, focus should move to/from the drawer appropriately. Escape key should close overlays and return focus. No focus traps in unexpected places. Verify command palette focus trap works correctly.

- [ ] **Run Lighthouse mobile accessibility audit & fix flagged issues** — Run Lighthouse in mobile mode targeting accessibility category. Fix any issues flagged: color contrast ratios, missing alt text, focus indicators, ARIA violations. Target score >= 90. Document final score.

### QA Bugs

- [ ] [qa/P1] GitHub repo link icon undersized on mobile: Tapped the external link icon (GitHub repo URL) on mobile viewport (390x844) → measured 24x24px → spec requires minimum 44x44px tap target (WCAG 2.5.8). The `<a>` has explicit `h-6 w-6` classes with no mobile override. Tested at commit 2eebe45. (priority: high)

- [ ] [qa/P1] QA badge button undersized on mobile: Tapped the "QA N/A" badge in the header bar on mobile viewport → measured 87x39px (height 39px < 44px minimum) → spec requires all interactive elements at minimum 44x44px. The badge button lacks `min-h-[44px]` class. Tested at commit 2eebe45. (priority: high)

- [ ] [qa/P1] Hamburger menu button renders at 0x0px on mobile: Inspected hamburger/sidebar toggle button on mobile viewport → bounding box is 0x0px despite having `min-h-[44px] min-w-[44px]` CSS classes → button is invisible but still responds to tap at origin coordinates. The button works functionally but has zero rendered dimensions which fails WCAG 2.5.8 and makes it visually untappable. Tested at commit 2eebe45. (priority: high)

- [ ] [qa/P1] SPEC tab trigger slightly undersized on mobile: Tapped SPEC tab on mobile viewport → measured 42x44px (width 42px < 44px minimum) → spec requires all interactive elements at minimum 44x44px. Other tabs (TODO=46px, RESEARCH=70px, Health=65px) pass. Tested at commit 2eebe45. (priority: high)

- [ ] [qa/P1] Hamburger button missing aria-label: The sidebar toggle (hamburger) button has no `aria-label` attribute → screen readers cannot identify its purpose. This is also listed under the ARIA labels task but found during QA testing. Tested at commit 2eebe45. (priority: high)

### Completed

### Deferred
