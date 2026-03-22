# Issue #114: Responsive layout: touch targets, tap equivalents & accessibility audit

## Current Phase: Implementation

### Context
The dashboard (`aloop/cli/dashboard/src/AppView.tsx`, ~2378 lines) has partial responsive support (mobile sidebar drawer, breakpoint-based hiding) but does not meet WCAG 2.5.8 tap target requirements, lacks long-press context menus, and has unverified tooltip/hover-card tap equivalents. Note: AppView.tsx is a monolith that SPEC-ADDENDUM says should be decomposed, but that's a separate issue — this issue focuses on accessibility within the existing structure.

### QA Bugs

- [x] [qa/P1] Steer textarea 32px height on mobile: Fixed — changed to `min-h-[44px] md:min-h-[32px] h-auto md:h-8` for WCAG 2.5.8 compliance. (priority: high)

- [x] [qa/P1] GitHub repo link missing aria-label: Fixed — added `aria-label="Open repo on GitHub"` to the link. (priority: high)

- [x] [qa/P1] Escape key does not close mobile sidebar drawer: Fixed — added mobile drawer-scoped Escape key handler (`useEffect` gated by `mobileMenuOpen`) to close the overlay via keyboard. Verified with new integration test. (priority: high)

- [x] [qa/P1] Focus not moved into sidebar on mobile open: Fixed — mobile drawer now focuses first focusable control on open and returns focus to hamburger button on close. Verified with new integration test. (priority: high)

- [x] [qa/P1] Command palette focus not trapped on open: Fixed — command palette input now uses `autoFocus` + mount-time focus effect to reliably focus the search input on open. Verified with new integration test. (priority: high)

### In Progress

_(none — ready for next task)_

### Up Next

- [x] **Fix QA P1 bugs — steer textarea + GitHub aria-label** — (1) Steer textarea changed to `min-h-[44px] md:min-h-[32px] h-auto md:h-8` for mobile tap target compliance. (2) GitHub repo link gets `aria-label="Open repo on GitHub"`. (priority: high)

- [x] **Fix focus management for mobile overlays** — Completed in `AppView.tsx`: (1) mobile drawer Escape handler closes overlay, (2) mobile drawer focus-in and focus-return via refs/effects, (3) command palette input autofocus on open (`autoFocus` + RAF focus effect). Added regression tests in `App.test.tsx` for all three behaviors. (priority: high)

- [x] **Audit & fix hover-only interactions** — Replaced the overflow tabs hover-only menu in `DocsPanel` with an accessible click/tap dropdown (`DropdownMenu`) and controlled tab state (`activeTab` + `onValueChange`) so overflow docs can be opened without hover. Added regression test in `App.test.tsx` verifying overflow menu opens via click and selecting `STEERING` switches document content. (priority: medium)

- [ ] **Add ARIA labels to collapse/expand buttons** — Three buttons lack `aria-label`: (1) sidebar expand button (line 802) — add `aria-label="Expand sidebar"`, (2) sidebar collapse button (line 882) — add `aria-label="Collapse sidebar"`, (3) activity panel collapse button (line 2314) — add `aria-label="Collapse activity panel"`. These all have adjacent TooltipContent text that can be reused. Stop/force-stop dropdown: Radix already provides `aria-haspopup="menu"` on triggers — no fix needed. (priority: medium)

- [ ] **Implement long-press context menu on session cards** — Create a `useLongPress` hook with 500ms threshold using `onTouchStart`/`onTouchEnd`/`onTouchMove` (cancel on move). On trigger, show a context menu (reuse DropdownMenu component) with: Stop session, Force-stop session, Copy session ID. Add haptic feedback via `navigator.vibrate(50)` if available. Apply to session card elements in the sidebar (~line 835-838 of AppView.tsx). (priority: medium)

- [ ] **Runtime layout verification** — [review Gate 7] Run Playwright at 390x844 viewport and verify bounding boxes of key elements (hamburger button, session cards, tab triggers, dropdown items, steer textarea) meet 44x44px minimum. This validates the P1 bug fixes are effective. (priority: medium)

- [ ] **Run Lighthouse mobile accessibility audit & fix flagged issues** — Run Lighthouse in mobile mode targeting accessibility category. Fix any issues flagged: color contrast ratios, missing alt text, focus indicators, ARIA violations. Target score >= 90. Document final score. (priority: low)

- [ ] **Capture proof artifacts** — [review Gate 6] Capture Playwright screenshots or recordings at mobile viewport showing (a) tap targets at 44px minimum, (b) tooltip opening on tap, (c) hover-card opening on tap. If proof agent cannot produce these, skip with empty artifacts array. (priority: low)

### Completed

- [x] [review] Gate 6: Create `proof-manifest.json`. QA session 2 provides equivalent Playwright evidence, so skip with `{"artifacts": []}`. Process gap, not a confidence gap. [reviewed: gates 1-9 pass]

- [x] [review] Gate 3: Add `useIsTouchDevice.test.ts` with full branch coverage. Added hook + tooltip + hover-card to vitest coverage include array. >=90% branch coverage achieved. [reviewed: gates 1-9 pass]

- [x] **Extract `useIsTouchDevice` hook** — [review Gate 4] Extracted from tooltip.tsx and hover-card.tsx into `hooks/useIsTouchDevice.ts`. Both components now import from the shared hook.

- [x] **Expand tooltip & hover-card test coverage** — [review Gate 2/3] Tests cover: tap opens/closes tooltip, desktop mode bypass, controlled `open` prop, `defaultOpen=true`, auto-close timer. tooltip.test.tsx (110 lines), hover-card.test.tsx (87 lines).

- [x] **Fix QA P1 bugs — tap target sizing regressions** — Fixed all 5 P1 bugs: (1) hamburger button made robust with `inline-flex` display + added `aria-label="Toggle sidebar"`, (2) GitHub repo link icon gets `min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0` replacing fixed `h-6 w-6`, (3) QA badge button gets `min-h-[44px] md:min-h-0`, (4) TabsTrigger base gets `min-w-[44px] md:min-w-0` and AppView tab overrides changed from `h-6` to `md:h-6` to not fight min-height on mobile, (5) overflow tabs button gets mobile tap target sizing.

- [x] **Audit & fix tap target sizes across all interactive elements** — Added responsive `min-h-[44px] min-w-[44px]` classes to button.tsx, dropdown-menu.tsx, tabs.tsx, and interactive elements in AppView.tsx. Mobile-first with `md:` breakpoint relaxation.

- [x] **Verify & fix Tooltip tap behavior on mobile** — Implemented custom touch handling in tooltip.tsx with `useIsTouchDevice()` hook, onClick toggle on touch devices, and 2000ms auto-close timer. Test confirms open-on-tap and auto-close.

- [x] **Verify & fix HoverCard tap equivalents** — Implemented custom touch handling in hover-card.tsx with `useIsTouchDevice()` hook and onClick toggle on touch devices. Test confirms toggle behavior.

### Deferred
