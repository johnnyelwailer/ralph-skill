# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| Tap target sizing (44x44px) | 2026-03-22 | d784b59 | PASS | All elements pass at 390px and 320px. Steer textarea now 50px (min-h-[44px]). Desktop correctly 32px. |
| Tooltip tap behavior | 2026-03-22 | fb3696a | PASS | Tooltips open on tap on mobile viewport (390x844, touch). Session name, status dot ("Running"), SSE indicator, GitHub link all show tooltips. |
| HoverCard tap equivalents | 2026-03-22 | 2eebe45 | PASS | Provider badge HoverCard opens on click/tap, shows provider details (status, cooldown, etc.) |
| Long-press context menu | 2026-03-22 | fb3696a | N/A | Not yet implemented per TODO.md. Confirmed no context menu appears on long-press. |
| No hover-only interactions | 2026-03-22 | 6e6c819 | PASS | No `group-hover` elements without click parents found. No visible hover-only content-revealing elements. Overflow tabs menu not visible (fewer than threshold). |
| ARIA labels & roles | 2026-03-22 | b75312a | PASS | Fix verified: GitHub repo link now has `aria-label="Open repo on GitHub"`. All buttons have accessible labels. Lighthouse still flags 2 unnamed buttons in footer (Send/Stop dropdown). |
| Focus management (mobile) | 2026-03-22 | b75312a | PASS | All 3 P1 bugs fixed: (1) Escape closes mobile sidebar, (2) focus moves into sidebar on open, (3) Ctrl+K auto-focuses search input (INPUT type=text role=combobox). |
| 320px viewport layout | 2026-03-22 | 6e6c819 | PASS | No horizontal scroll at 320px. document.scrollWidth === window.innerWidth (320px). |
| Lighthouse audit >= 90 | 2026-03-22 | b75312a | FAIL | Score: 84%. Failures: (1) tablist has non-tab children (a[aria-label]), (2) 2 buttons without accessible names in footer, (3) color contrast ratio 1.96:1 on text-muted-foreground/50, (4) heading order skips levels (h3 without h2). |
| aloop --version | 2026-03-21 | 9062093 | PASS | Reports 1.0.0 correctly |
| aloop --help | 2026-03-21 | 9062093 | PASS | Lists all commands, exit code 0 |
| aloop status | 2026-03-21 | 9062093 | PASS | Shows active sessions + provider health table |
| aloop active | 2026-03-21 | 9062093 | PASS | Lists sessions, --output json works |
| aloop setup --non-interactive | 2026-03-21 | 9062093 | PASS | Creates config.yml correctly |
| aloop scaffold | 2026-03-21 | 9062093 | PASS | Generates prompt files |
| aloop discover | 2026-03-21 | 9062093 | PASS | Detects specs, providers, recommends mode |
| aloop dashboard | 2026-03-21 | 9062093 | PASS | Serves HTML + /api/state JSON endpoint |
| aloop steer (happy path) | 2026-03-21 | 9062093 | PASS | Queues steering instruction |
| aloop steer (empty string) | 2026-03-22 | d784b59 | PASS | Fix verified: empty and whitespace-only strings rejected with exit 1 |
| aloop stop (no args) | 2026-03-21 | 9062093 | PASS | Proper error: missing required argument |
| aloop stop (invalid session) | 2026-03-21 | 9062093 | PASS | Proper error: session not found |
| aloop (unknown command) | 2026-03-21 | 9062093 | PASS | Proper error: unknown command |
| npm pack + install path | 2026-03-21 | 9062093 | PASS | test-install script works, binary runs from /tmp |
| aloop start / stop / resume | 2026-03-22 | d784b59 | PASS | Start creates session, status shows it, stop removes it, resume resumes. All exit codes correct. |
| Dashboard SSE live updates | 2026-03-22 | b75312a | PASS (partial) | /api/state OK, /events SSE OK, /api/qa-coverage OK. /api/artifacts still 404 via installed binary (bug re-confirmed). /api/cost 404. |
| aloop gh subcommands | 2026-03-22 | d784b59 | PASS | gh --help lists 14 subcommands. gh start/watch/stop/status/pr-create/pr-merge all have proper help text and error handling. gh status shows tracked issues. Policy commands require --session. |
