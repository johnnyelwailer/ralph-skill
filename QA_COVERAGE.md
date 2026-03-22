# QA Coverage — Issue #114: Responsive layout, touch targets & accessibility

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| Tap target sizing (44x44px) | 2026-03-22 | 6e6c819 | PASS (partial) | Regression fixes verified. 13/14 visible elements pass at 390px. Steer textarea 266x32px still FAIL (P1 bug). Also tested at 320px: same textarea FAIL, all others PASS. |
| Tooltip tap behavior | 2026-03-22 | fb3696a | PASS | Tooltips open on tap on mobile viewport (390x844, touch). Session name, status dot ("Running"), SSE indicator, GitHub link all show tooltips. |
| HoverCard tap equivalents | 2026-03-22 | 2eebe45 | PASS | Provider badge HoverCard opens on click/tap, shows provider details (status, cooldown, etc.) |
| Long-press context menu | 2026-03-22 | fb3696a | N/A | Not yet implemented per TODO.md. Confirmed no context menu appears on long-press. |
| No hover-only interactions | 2026-03-22 | 6e6c819 | PASS | No `group-hover` elements without click parents found. No visible hover-only content-revealing elements. Overflow tabs menu not visible (fewer than threshold). |
| ARIA labels & roles | 2026-03-22 | 6e6c819 | FAIL | Buttons all have accessible labels. Hamburger has aria-label="Toggle sidebar" PASS. GitHub repo link (44x44px icon-only `<a>` with SVG) still missing aria-label — P1 bug still open. |
| Focus management (mobile) | 2026-03-22 | 6e6c819 | FAIL | 3 bugs filed: (1) Escape doesn't close mobile sidebar, (2) focus stays on hamburger after sidebar open instead of moving into sidebar, (3) Ctrl+K command palette opens but focus lands on BODY instead of search input. Tab order is logical (9 visible focusable elements in correct sequence). Overlay click closes sidebar correctly. Escape closes command palette correctly. |
| 320px viewport layout | 2026-03-22 | 6e6c819 | PASS | No horizontal scroll at 320px. document.scrollWidth === window.innerWidth (320px). |
| Lighthouse audit >= 90 | never | — | — | Not yet tested — blocked on focus/aria fixes |
