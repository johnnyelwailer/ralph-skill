# QA Coverage — Issue #114: Responsive layout, touch targets & accessibility

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| Tap target sizing (44x44px) | 2026-03-22 | a8c1680 | PASS | All 14 visible interactive elements >= 44x44px at 390px. Steer textarea now 266x50px (min-height: 44px). All 14 pass at 320px too. |
| Tooltip tap behavior | 2026-03-22 | fb3696a | PASS | Tooltips open on tap on mobile viewport (390x844, touch). Session name, status dot ("Running"), SSE indicator, GitHub link all show tooltips. |
| HoverCard tap equivalents | 2026-03-22 | 2eebe45 | PASS | Provider badge HoverCard opens on click/tap, shows provider details (status, cooldown, etc.) |
| Long-press context menu | 2026-03-22 | fb3696a | N/A | Not yet implemented per TODO.md. Confirmed no context menu appears on long-press. |
| No hover-only interactions | 2026-03-22 | a8c1680 | PASS | No `group-hover` elements without click parents found. Overflow tabs replaced with DropdownMenu (click/tap). Stop button dropdown works via click/tap. |
| ARIA labels & roles | 2026-03-22 | a8c1680 | PASS | All 12 visible buttons have accessible labels. GitHub link has aria-label="Open repo on GitHub". Hamburger has aria-label="Toggle sidebar". |
| Focus management (mobile) | 2026-03-22 | a8c1680 | PASS (partial) | Sidebar: Escape closes drawer PASS, focus moves into sidebar on open PASS, focus returns to hamburger on close PASS. Command palette: focus lands on search input PASS, but Escape does NOT close palette — FAIL (P1 bug filed). |
| 320px viewport layout | 2026-03-22 | a8c1680 | PASS | No horizontal scroll at 320px. document.scrollWidth === window.innerWidth (320px). All tap targets pass 44x44px. |
| Lighthouse audit >= 90 | never | — | — | Not yet tested |
