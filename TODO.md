# Issue #112: Responsive layout: breakpoint hooks & mobile sidebar collapse

## Current Phase: Implementation

### Analysis

Significant responsive behavior already exists inline in `AppView.tsx`:
- Hamburger `Menu` icon in Header (line 818, `md:hidden`)
- `mobileMenuOpen` state + mobile sidebar drawer with overlay (lines 2048-2056)
- `sidebarCollapsed` state + `Ctrl+B` keyboard shortcut (line 1831)
- Desktop sidebar hidden on mobile via `hidden md:flex` (line 2045)
- Mobile panel toggle for docs/activity (lines 2059-2075)
- Responsive padding/sizing via Tailwind prefixes throughout

**Missing from spec:**
1. `useBreakpoint` hook as a standalone file — current code uses Tailwind CSS classes only, no JS breakpoint detection
2. `ResponsiveLayout.tsx` wrapper with breakpoint context
3. Swipe-right gesture from left edge to open sidebar on mobile
4. Verification that 320px viewport has no horizontal scroll
5. Verification that session list is scrollable on 375px (iPhone SE)

### In Progress

(none)

### Up Next

- [ ] Create `ResponsiveLayout.tsx` — Wrapper component that provides breakpoint context via React context, consumes `useBreakpoint`, and controls layout mode. Other components read breakpoint from context instead of relying solely on CSS.
- [ ] Integrate `ResponsiveLayout.tsx` into `AppView.tsx` — Wrap the app shell with `ResponsiveLayout`, replace inline `mobileMenuOpen`/`sidebarCollapsed` logic with context-driven behavior. Desktop layout must remain unchanged.
- [ ] Add swipe-right gesture on mobile — Touch event handler on left edge (e.g., touchstart within 20px of left edge, touchmove rightward > 50px) opens the sidebar drawer. Only active at mobile breakpoint.
- [ ] Verify 320px no-scroll and 375px session list — Ensure no horizontal overflow at 320px viewport width. Verify session list is scrollable on 375px. Fix any overflow issues (likely needs `max-w-full`, `overflow-hidden` on key containers).
- [ ] Wire `Ctrl+B` to sidebar toggle at tablet breakpoint specifically — Current implementation toggles `sidebarCollapsed` at all breakpoints. Spec says `Ctrl+B` should toggle sidebar at tablet (640-1024px). At desktop it may remain as-is (sidebar always visible). Verify behavior matches spec.

### Completed

- [x] Create `useBreakpoint.ts` hook — React hook using `matchMedia` listeners returning `'mobile' | 'tablet' | 'desktop'` based on 640px/1024px breakpoints. This is the foundation other tasks depend on.
