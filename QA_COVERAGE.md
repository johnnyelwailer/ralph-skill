# QA Coverage — Issue #114: Responsive layout, touch targets & accessibility

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| Tap target sizing (44x44px) | 2026-03-22 | 2eebe45 | FAIL | Most elements pass (10/14 on mobile), but GitHub link (24x24), QA badge (87x39), hamburger (0x0), SPEC tab (42x44) fail. 5 bugs filed. |
| Tooltip tap behavior | 2026-03-22 | 2eebe45 | PASS | Status dot and provider tooltips open on click/tap. Tested on desktop viewport with touch. |
| HoverCard tap equivalents | 2026-03-22 | 2eebe45 | PASS | Provider badge HoverCard opens on click/tap, shows provider details (status, cooldown, etc.) |
| Long-press context menu | never | — | — | Not yet implemented per TODO.md |
| No hover-only interactions | never | — | — | Not yet implemented per TODO.md |
| ARIA labels & roles | never | — | — | Not yet implemented; hamburger missing aria-label found during testing |
| Focus management (mobile) | never | — | — | Not yet implemented per TODO.md |
| Lighthouse audit >= 90 | never | — | — | Not yet implemented per TODO.md |
