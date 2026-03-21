# Issue #84: Responsive Layout: Touch interactions and mobile accessibility (Lighthouse >= 90)

## Current Phase: Implementation

### In Progress

- [ ] [qa/P1] Fix Tooltip tap-toggle on touch devices — emulated touch (iPhone, pointer:coarse) tap produces nothing; desktop hover works fine. Likely Radix pointer-event vs click-event interaction issue. Must fix before other touch work builds on this pattern. (priority: critical, tested at iter 17, commit 1cc2c25)
- [x] [review] Fix `vitest.config.ts` coverage `include` — add `src/hooks/*.ts` and `src/components/**/*.tsx` so new modules are tracked in coverage reports. Must fix before other coverage tasks since they depend on coverage being measured. (priority: high)
- [ ] [review] Add `useLongPress.ts` branch coverage tests — (1) non-primary pointer (`isPrimary: false`) ignored, (2) mouse right-click (`button !== 0`) ignored, (3) `onPointerCancel` cancels press, (4) `onPointerLeave` cancels press, (5) public `cancel()` method cancels active press (priority: high)
- [ ] [review] Add `tooltip.tsx` branch coverage tests — (1) desktop (non-touch) click does NOT toggle, (2) controlled `open` prop respected, (3) `event.preventDefault()` skips toggle (line 64 `defaultPrevented` guard), (4) device-change effect resets `uncontrolledTouchOpen` when switching touch→mouse (priority: high)
- [ ] [review] Add `useIsTouchLikePointer.ts` SSR branch test — mock `window` undefined or `matchMedia` absent to cover `typeof window === 'undefined'` guard at line 13 (priority: medium)
- [ ] [review] Fix `useLongPress.ts:85-91` indentation — normalize `addScrollListener` to consistent 2-space indent (priority: low)

### Up Next

- [ ] Make HoverCard tap-friendly — add `onClick` toggle for Radix `HoverCard` on touch devices (iteration info popup at AppView.tsx:832-850 is hover-only)
- [ ] Enforce 44x44px minimum tap targets on mobile — add `min-h-11 min-w-11` to all icon-only buttons, sidebar session cards, dropdown triggers, tab triggers (WCAG 2.5.8)
- [ ] Add touch support to image comparison slider — currently mouse-only (`onMouseDown`); add `onTouchStart`/`onTouchMove`/`onTouchEnd` handlers (AppView.tsx:1630-1660)
- [ ] Add left-edge swipe gesture to open sidebar — detect `touchstart` near left edge + `touchmove` rightward, open mobile sidebar drawer
- [ ] Add long-press context menus on session cards — stop, force-stop, copy session ID (use `useLongPress` + Radix `ContextMenu` or `DropdownMenu`)
- [ ] Add long-press context menus on log entry rows — copy log text, expand/collapse, copy artifact link
- [ ] Add ARIA labels to interactive elements — sidebar toggle, mobile menu button, session cards, panel toggle buttons, header action buttons (most currently unlabeled)
- [ ] Add `aria-live` region for activity log updates — screen readers should announce new log entries
- [ ] Audit and fix remaining Lighthouse accessibility issues — run Lighthouse accessibility-only audit, fix any score < 90 findings (color contrast, focus order, missing labels)

### Deferred

- [ ] Fix dashboard `npm run type-check` baseline failures in `src/App.coverage.test.ts` and `src/App.test.tsx` (unrelated to Issue #84 but blocks full type-check backpressure)
- [ ] Add tap-targets unit test — verify 44px minimum on icon buttons and interactive elements in mobile viewport (after tap targets are enforced)
- [ ] Add touch interaction tests — swipe gesture, long-press context menus, tap-to-toggle tooltips (after features are implemented)

### Completed

- [x] Add `useIsTouchLikePointer` hook — detect touch-capable devices via `pointer: coarse` media query (foundation for all touch work)
- [x] Add `useLongPress` hook — portable long-press gesture detection with configurable delay, cancel on move/scroll (used by session cards and log entries)
- [x] Make Tooltip tap-friendly — wrap Radix `Tooltip` to open/close on tap for touch devices (currently hover-only, ~95 instances in AppView) — note: has QA bug, tap-toggle not working on touch devices
