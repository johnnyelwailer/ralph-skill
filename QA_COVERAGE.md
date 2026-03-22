# QA Coverage — Issue #174: Provider Health Subsystem

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| `aloop status` provider health display | 2026-03-22 | b00e50b | PASS | All 5 providers shown with correct status (healthy/cooldown/degraded). Cooldown shows failure count + resume time. Degraded shows auth error hint. Healthy shows relative last success. |
| `aloop status --output json` health data | 2026-03-22 | b00e50b | PASS | Full health JSON object with all fields returned correctly for all providers. |
| Malformed/missing health files | 2026-03-22 | b00e50b | PASS | Empty file: provider skipped silently. Invalid JSON: skipped silently. Partial JSON: displayed with available fields. No health dir: empty health object. No crashes. |
| Cross-session health reset | 2026-03-22 | b00e50b | PASS | External write to shared health file immediately reflected in `aloop status` from any session. Cooldown→healthy transition displays correctly. |
| Concurrent read safety | 2026-03-22 | b00e50b | PASS | 10 concurrent `aloop status --output json` reads all return valid JSON. Concurrent read/write: 0 failures out of 5 reads during rapid writes. |
| Cooldown with expired timestamp | 2026-03-22 | b00e50b | PASS (minor) | Expired cooldown_until: no metadata shown (just "cooldown"). Missing failure count is a minor gap vs spec but not a crash. Filed P2. |
| Non-provider files in health dir | 2026-03-22 | b00e50b | FAIL | Arbitrary .json files in ~/.aloop/health/ displayed as providers (e.g., "random-file healthy"). Should filter to known providers or ignore unknown files. Filed P2. |
| Unknown status values | 2026-03-22 | b00e50b | PASS (minor) | Unknown status (e.g., "banana") displayed as-is without validation. No crash. Minor — could warn. |

---

## Previous Coverage (Issue #114)

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
