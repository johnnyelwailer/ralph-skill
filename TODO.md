# Issue #114: Responsive layout: touch targets, tap equivalents & accessibility audit

## Tasks

### Up Next

- [x] [spec-gap] **P2 (in-scope)** — Fix tablet breakpoint to match spec. SPEC-ADDENDUM.md §Dashboard Responsiveness (line 214) defines tablet (640-1024px) as "Sidebar is collapsible (hidden by default, toggled via Ctrl+B / hamburger)". Fixed:
  - `AppView.tsx:366`: `md:hidden` → `lg:hidden` (hamburger persists through tablet).
  - `AppView.tsx:1329`: `hidden sm:flex` → `hidden lg:flex` (desktop sidebar only at lg+).
  - `e2e/proof.spec.ts:136-147`: updated to assert hamburger IS visible and sidebar is hidden at 768px.

- [ ] [spec-gap] **P2 (out-of-scope — file separate issue)** — `loop.sh` default Claude model is `sonnet` (line 33: `CLAUDE_MODEL="${ALOOP_CLAUDE_MODEL:-sonnet}"`), but `config.yml` (source of truth, line 21) declares `claude: opus`. `loop.ps1` line 34 correctly defaults to `opus`. Cross-platform parity broken. Files: `aloop/bin/loop.sh:33`, `aloop/bin/loop.ps1:34`, `aloop/config.yml:21`. Suggested fix: update `loop.sh` line 33 to `CLAUDE_MODEL="${ALOOP_CLAUDE_MODEL:-opus}"`. **Not in scope for issue #114 (responsive layout) — file a new issue.**

### Completed
- [x] Run Lighthouse mobile accessibility audit and verify AC9 — score **94/100** (threshold: >= 90). Recorded in QA_LOG.md (2026-04-01 session). AC9 now explicitly verified. One P3 cosmetic finding (`button-name` in footer) does not affect pass/fail.
- [x] Implement responsive layout (SPEC-ADDENDUM.md §Dashboard Responsiveness) — 158 unit tests passing, review PASS. AC9 (Lighthouse score) explicitly verified: 94/100.
- [x] Playwright touch-event test for swipe-to-open sidebar — `e2e/proof.spec.ts:103-134` already implements the test: dispatches `touchstart`+`touchend` from left edge (clientX=5→80) and asserts `.fixed.inset-0.z-40` overlay becomes visible. QA_LOG false negative ("swipe NOT implemented") was a DOM attribute query limitation, not a missing implementation. `AppView.tsx:1014-1028` implements the handlers; `proof.spec.ts:103` verifies the behavior.
