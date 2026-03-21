# QA Coverage

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
| aloop --version | 2026-03-21 | 9062093 | PASS | Reports 1.0.0 correctly |
| aloop --help | 2026-03-21 | 9062093 | PASS | Lists all commands, exit code 0 |
| aloop status | 2026-03-21 | 9062093 | PASS | Shows active sessions + provider health table |
| aloop active | 2026-03-21 | 9062093 | PASS | Lists sessions, --output json works |
| aloop setup --non-interactive | 2026-03-21 | 9062093 | PASS | Creates config.yml correctly |
| aloop scaffold | 2026-03-21 | 9062093 | PASS | Generates prompt files |
| aloop discover | 2026-03-21 | 9062093 | PASS | Detects specs, providers, recommends mode |
| aloop dashboard | 2026-03-21 | 9062093 | PASS | Serves HTML + /api/state JSON endpoint |
| aloop steer (happy path) | 2026-03-21 | 9062093 | PASS | Queues steering instruction |
| aloop steer (empty string) | 2026-03-21 | 9062093 | FAIL | Accepts empty instruction — should reject, bug filed |
| aloop stop (no args) | 2026-03-21 | 9062093 | PASS | Proper error: missing required argument |
| aloop stop (invalid session) | 2026-03-21 | 9062093 | PASS | Proper error: session not found |
| aloop (unknown command) | 2026-03-21 | 9062093 | PASS | Proper error: unknown command |
| npm pack + install path | 2026-03-21 | 9062093 | PASS | test-install script works, binary runs from /tmp |
