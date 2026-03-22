# Issue #114: Responsive layout: touch targets, tap equivalents & accessibility audit

## Current Phase: Implementation

### Context
The dashboard (`aloop/cli/dashboard/src/AppView.tsx`, ~2378 lines) has partial responsive support (mobile sidebar drawer, breakpoint-based hiding) but does not meet WCAG 2.5.8 tap target requirements, lacks long-press context menus, and has unverified tooltip/hover-card tap equivalents. Note: AppView.tsx is a monolith that SPEC-ADDENDUM says should be decomposed, but that's a separate issue — this issue focuses on accessibility within the existing structure.

### QA Bugs

- [ ] [qa/P1] Steer textarea 32px height on mobile: Steer input (`<textarea placeholder="Steer...">`) renders at 266x32px on mobile viewport (390x844). WCAG 2.5.8 requires 44px minimum tap target. Has `min-h-[32px] h-8` in AppView.tsx:1969 but no mobile override to 44px. Fix: change to `min-h-[44px] md:min-h-[32px] h-auto md:h-8`. (priority: high)

- [ ] [qa/P1] GitHub repo link missing aria-label: The GitHub icon link (`<a href="...github...">` at AppView.tsx:1190) contains only an SVG icon with no `aria-label`, `title`, or visible text. Screen readers cannot identify its purpose. Fix: add `aria-label="Open repo on GitHub"`. (priority: high)

### In Progress

- [x] [review] Gate 3: Add `useIsTouchDevice.test.ts` covering: (a) SSR guard returns false when `window` is undefined, (b) `matchMedia` undefined guard, (c) initial `matches=true` state, (d) `change` event listener updates state, (e) effect cleanup calls `removeEventListener`. Also add `hooks/useIsTouchDevice.ts`, `components/ui/tooltip.tsx`, `components/ui/hover-card.tsx` to the vitest coverage `include` array in `dashboard/vitest.config.ts` (currently only includes `src/App.tsx` and `src/AppView.tsx`). Target >=90% branch coverage on the hook. (priority: high)

### Up Next

- [x] [review] Gate 6: Create `proof-manifest.json`. QA session 2 provides equivalent Playwright evidence, so skip with `{"artifacts": []}`. Process gap, not a confidence gap. (priority: medium)

- [ ] **Audit & fix hover-only interactions** — Confirmed gap: overflow tabs menu (AppView.tsx:1174-1186) uses `group-hover:block` with no click/tap equivalent. The `<div>` is purely hover-revealed with no `onClick` handler. Fix: add click toggle state to the overflow button so the dropdown also opens/closes on tap. No other `onMouseEnter`/`onMouseOver` interactions found that reveal content — all other hover effects are purely cosmetic (Tailwind `hover:` for color/bg changes). (priority: medium)

- [ ] **Add ARIA labels and roles for missing elements** — QA session 2 confirmed: all buttons pass, but GitHub repo link needs `aria-label` (covered in QA Bugs above). Additionally review panel collapse buttons and stop/force-stop buttons for `aria-label`. Radix handles `aria-haspopup`/`aria-expanded` on DropdownMenu triggers (verified: Stop button has `aria-haspopup="menu"`). (priority: medium)

- [ ] **Implement long-press context menu on session cards** — Create a `useLongPress` hook with 500ms threshold using `onTouchStart`/`onTouchEnd`/`onTouchMove` (cancel on move). On trigger, show a context menu (reuse DropdownMenu component) with: Stop session, Force-stop session, Copy session ID. Add haptic feedback via `navigator.vibrate(50)` if available. Apply to session card elements in the sidebar (~line 835-838 of AppView.tsx). (priority: medium)

- [ ] **Fix focus management for mobile** — Ensure logical tab order across the responsive layout. When mobile sidebar drawer opens/closes, focus should move to/from the drawer appropriately. Escape key should close overlays and return focus. No focus traps in unexpected places. Verify command palette focus trap works correctly. (priority: medium)

- [ ] **Runtime layout verification** — [review Gate 7] Run Playwright at 390x844 viewport and verify bounding boxes of key elements (hamburger button, session cards, tab triggers, dropdown items) meet 44x44px minimum. This validates the P1 bug fixes are effective. (priority: medium)

- [ ] **Run Lighthouse mobile accessibility audit & fix flagged issues** — Run Lighthouse in mobile mode targeting accessibility category. Fix any issues flagged: color contrast ratios, missing alt text, focus indicators, ARIA violations. Target score >= 90. Document final score. (priority: low)

- [ ] **Capture proof artifacts** — [review Gate 6] Capture Playwright screenshots or recordings at mobile viewport showing (a) tap targets at 44px minimum, (b) tooltip opening on tap, (c) hover-card opening on tap. If proof agent cannot produce these, skip with empty artifacts array. (priority: low)

### Completed

- [x] **Extract `useIsTouchDevice` hook** — [review Gate 4] Extracted from tooltip.tsx and hover-card.tsx into `hooks/useIsTouchDevice.ts`. Both components now import from the shared hook.

- [x] **Expand tooltip & hover-card test coverage** — [review Gate 2/3] Tests cover: tap opens/closes tooltip, desktop mode bypass, controlled `open` prop, `defaultOpen=true`, auto-close timer. tooltip.test.tsx (110 lines), hover-card.test.tsx (87 lines).

- [x] **Fix QA P1 bugs — tap target sizing regressions** — Fixed all 5 P1 bugs: (1) hamburger button made robust with `inline-flex` display + added `aria-label="Toggle sidebar"`, (2) GitHub repo link icon gets `min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0` replacing fixed `h-6 w-6`, (3) QA badge button gets `min-h-[44px] md:min-h-0`, (4) TabsTrigger base gets `min-w-[44px] md:min-w-0` and AppView tab overrides changed from `h-6` to `md:h-6` to not fight min-height on mobile, (5) overflow tabs button gets mobile tap target sizing.

- [x] **Audit & fix tap target sizes across all interactive elements** — Added responsive `min-h-[44px] min-w-[44px]` classes to button.tsx, dropdown-menu.tsx, tabs.tsx, and interactive elements in AppView.tsx. Mobile-first with `md:` breakpoint relaxation.

- [x] **Verify & fix Tooltip tap behavior on mobile** — Implemented custom touch handling in tooltip.tsx with `useIsTouchDevice()` hook, onClick toggle on touch devices, and 2000ms auto-close timer. Test confirms open-on-tap and auto-close.

- [x] **Verify & fix HoverCard tap equivalents** — Implemented custom touch handling in hover-card.tsx with `useIsTouchDevice()` hook and onClick toggle on touch devices. Test confirms toggle behavior.

### Deferred
