# Issue #114: Responsive layout: touch targets, tap equivalents & accessibility audit

## Current Phase: Implementation

### Context
The dashboard (`aloop/cli/dashboard/src/AppView.tsx`, ~2378 lines) has partial responsive support (mobile sidebar drawer, breakpoint-based hiding) but does not meet WCAG 2.5.8 tap target requirements, lacks long-press context menus, and has unverified tooltip/hover-card tap equivalents. Note: AppView.tsx is a monolith that SPEC-ADDENDUM says should be decomposed, but that's a separate issue — this issue focuses on accessibility within the existing structure.

### QA Bugs

- [ ] [qa/P1] Steer textarea 32px height on mobile: Steer input (`<textarea placeholder="Steer...">`) renders at 266x32px on mobile viewport (390x844). WCAG 2.5.8 requires 44px minimum tap target. Has `min-height: 32px` in CSS but no mobile override to 44px. Tested at iter 2, commit fb3696a. (priority: high)

- [ ] [qa/P1] GitHub repo link missing aria-label: The GitHub icon link (`<a href="...github...">`) contains only an SVG icon with no `aria-label`, `title`, or visible text. Screen readers cannot identify its purpose. Has tooltip "Open repo on GitHub" but no ARIA attribute. Tested at iter 2, commit fb3696a. (priority: high)

### In Progress

- [ ] [review] Gate 3: `hooks/useIsTouchDevice.ts` is a new module with no direct test file — add `useIsTouchDevice.test.ts` covering: (a) SSR guard returns false when `window` is undefined, (b) `matchMedia` undefined guard, (c) initial `matches=true` state, (d) `change` event listener updates state, (e) effect cleanup calls `removeEventListener`. Also add `hooks/useIsTouchDevice.ts`, `components/ui/tooltip.tsx`, `components/ui/hover-card.tsx` to the vitest coverage `include` array in `dashboard/vitest.config.ts`. Target >=90% branch coverage on the hook. (priority: high)

- [ ] [review] Gate 6: No proof-manifest.json exists despite observable UI changes (tap target sizing, touch-tap toggling). Either run the proof agent to capture mobile viewport screenshots or explicitly skip with an empty `proof-manifest.json` (`{"artifacts": []}`). QA session 2 provides equivalent Playwright evidence, so this is a process gap not a confidence gap. (priority: medium)

### Up Next

- [x] **Extract `useIsTouchDevice` hook** — [review Gate 4] `useIsTouchDevice()` and `TOUCH_MEDIA_QUERY` are copy-pasted identically in `tooltip.tsx:18-40` and `hover-card.tsx:15-37`. Extract into `hooks/useIsTouchDevice.ts` and import from both components. Simple mechanical refactor. (priority: high)

- [x] **Expand tooltip & hover-card test coverage** — [review Gate 2/3] Tests now execute (vitest alias resolved), but only 1 scenario each. Add edge-case tests: (a) second tap closes tooltip, (b) desktop mode does NOT toggle on click, (c) controlled `open` prop passthrough, (d) `defaultOpen=true`. Target >=90% branch coverage on tooltip.tsx and hover-card.tsx. (priority: high)

- [ ] **Implement long-press context menu on session cards** — Create a `useLongPress` hook with 500ms threshold using `onTouchStart`/`onTouchEnd`/`onTouchMove` (cancel on move). On trigger, show a context menu (reuse DropdownMenu component) with: Stop session, Force-stop session, Copy session ID. Add haptic feedback via `navigator.vibrate(50)` if available. Apply to session card elements in the sidebar (~line 830-874 of AppView.tsx). (priority: medium)

- [ ] **Audit & fix hover-only interactions** — Audit all `onMouseEnter`, `onMouseOver`, `hover:` Tailwind classes that reveal interactive content (not just styling). Known gap: overflow tabs menu uses `group-hover:block` with no tap equivalent (~AppView.tsx:1174-1186). Every hover interaction that shows/hides content must have a tap/click equivalent. (priority: medium)

- [ ] **Add ARIA labels and roles for missing elements** — Review interactive elements for proper `aria-label` on icon-only buttons (panel collapse, stop/force-stop buttons). Ensure dropdown menus have proper `aria-haspopup` and `aria-expanded` attributes (Radix should handle this, but verify). Hamburger aria-label is covered in the P1 bug fix above. (priority: medium)

- [ ] **Fix focus management for mobile** — Ensure logical tab order across the responsive layout. When mobile sidebar drawer opens/closes, focus should move to/from the drawer appropriately. Escape key should close overlays and return focus. No focus traps in unexpected places. Verify command palette focus trap works correctly. (priority: medium)

- [ ] **Runtime layout verification** — [review Gate 7] Run Playwright at 390x844 viewport and verify bounding boxes of key elements (hamburger button, session cards, tab triggers, dropdown items) meet 44x44px minimum. This validates the P1 bug fixes are effective. (priority: medium)

- [ ] **Run Lighthouse mobile accessibility audit & fix flagged issues** — Run Lighthouse in mobile mode targeting accessibility category. Fix any issues flagged: color contrast ratios, missing alt text, focus indicators, ARIA violations. Target score >= 90. Document final score. (priority: low)

- [ ] **Capture proof artifacts** — [review Gate 6] Capture Playwright screenshots or recordings at mobile viewport showing (a) tap targets at 44px minimum, (b) tooltip opening on tap, (c) hover-card opening on tap. If proof agent cannot produce these, skip with empty artifacts array. (priority: low)

### Completed

- [x] **Fix QA P1 bugs — tap target sizing regressions** — Fixed all 5 P1 bugs: (1) hamburger button made robust with `inline-flex` display + added `aria-label="Toggle sidebar"`, (2) GitHub repo link icon gets `min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0` replacing fixed `h-6 w-6`, (3) QA badge button gets `min-h-[44px] md:min-h-0`, (4) TabsTrigger base gets `min-w-[44px] md:min-w-0` and AppView tab overrides changed from `h-6` to `md:h-6` to not fight min-height on mobile, (5) overflow tabs button gets mobile tap target sizing.

- [x] **Audit & fix tap target sizes across all interactive elements** — Added responsive `min-h-[44px] min-w-[44px]` classes to button.tsx, dropdown-menu.tsx, tabs.tsx, and interactive elements in AppView.tsx. Mobile-first with `md:` breakpoint relaxation.

- [x] **Verify & fix Tooltip tap behavior on mobile** — Implemented custom touch handling in tooltip.tsx with `useIsTouchDevice()` hook, onClick toggle on touch devices, and 2000ms auto-close timer. Test confirms open-on-tap and auto-close.

- [x] **Verify & fix HoverCard tap equivalents** — Implemented custom touch handling in hover-card.tsx with `useIsTouchDevice()` hook and onClick toggle on touch devices. Test confirms toggle behavior.

### Deferred
