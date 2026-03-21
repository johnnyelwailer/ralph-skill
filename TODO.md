# Issue #84: Responsive Layout: Touch interactions and mobile accessibility (Lighthouse >= 90)

## Current Phase: Implementation

### In Progress

- [x] Add `useLongPress` hook — portable long-press gesture detection with configurable delay, cancel on move/scroll (used by session cards and log entries)
- [x] Make Tooltip tap-friendly — wrap Radix `Tooltip` to open/close on tap for touch devices (currently hover-only, ~95 instances in AppView)
- [ ] Make HoverCard tap-friendly — add `onClick` toggle for Radix `HoverCard` on touch devices (iteration info popup is hover-only)
- [ ] Enforce 44x44px minimum tap targets on mobile — add `min-h-11 min-w-11` to all icon-only buttons, sidebar session cards, dropdown triggers, tab triggers (WCAG 2.5.8)
- [ ] Add left-edge swipe gesture to open sidebar — detect `touchstart` near left edge + `touchmove` rightward, open mobile sidebar drawer
- [ ] Add long-press context menus on session cards — stop, force-stop, copy session ID (use `useLongPress` + Radix `ContextMenu` or `DropdownMenu`)
- [ ] Add long-press context menus on log entry rows — copy log text, expand/collapse, copy artifact link
- [ ] Add touch support to image comparison slider — currently mouse-only (`onMouseDown`); add `onTouchStart`/`onTouchMove`/`onTouchEnd` handlers
- [ ] Add ARIA labels to interactive elements — sidebar toggle, mobile menu button, session cards, panel toggle buttons, header action buttons (most currently unlabeled)
- [ ] Add `aria-live` region for activity log updates — screen readers should announce new log entries
- [ ] Audit and fix remaining Lighthouse accessibility issues — run `npx lighthouse --only-categories=accessibility`, fix any score < 90 findings (color contrast, focus order, missing labels)

### QA Bugs

- [ ] [qa/P1] Tooltip tap-toggle not working on touch devices: Emulated touch device (iPhone, pointer:coarse), tapped buttons/session cards/status indicators → no tooltip appeared. Spec says "No hover-only interactions — all tooltips/hover-cards must have tap equivalents." Desktop hover works fine (e.g., sidebar collapse shows "Collapse (Ctrl+B)"), but touch tap produces nothing. Tested at iter 17, commit 1cc2c25. (priority: high)

### Up Next

- [ ] Fix dashboard `npm run type-check` baseline failures in `src/App.coverage.test.ts` and `src/App.test.tsx` (currently unrelated to Issue #84 hook work but blocks full type-check backpressure)
- [ ] Add tap-targets unit test — verify 44px minimum on icon buttons and interactive elements in mobile viewport
- [ ] Add touch interaction tests — swipe gesture, long-press context menus, tap-to-toggle tooltips

### Completed

- [x] Add `useIsTouchLikePointer` hook — detect touch-capable devices via `pointer: coarse` media query (foundation for all touch work)
