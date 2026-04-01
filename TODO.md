# Issue #114: Responsive layout: touch targets, tap equivalents & accessibility audit

## Tasks

### Up Next

- [x] [spec-gap] **P2 (in-scope)** — Fix tablet breakpoint to match spec. SPEC-ADDENDUM.md §Dashboard Responsiveness (line 214) defines tablet (640-1024px) as "Sidebar is collapsible (hidden by default, toggled via Ctrl+B / hamburger)". Fixed:
  - `AppView.tsx:366`: `md:hidden` → `lg:hidden` (hamburger persists through tablet).
  - `AppView.tsx:1329`: `hidden sm:flex` → `hidden lg:flex` (desktop sidebar only at lg+).
  - `e2e/proof.spec.ts:136-147`: updated to assert hamburger IS visible and sidebar is hidden at 768px.

- [x] [spec-gap] **P2** — `loop.sh` default Claude model was `sonnet` but `config.yml` (source of truth) and `loop.ps1` declare `opus`. Fixed: `aloop/bin/loop.sh:33` now defaults to `opus` for cross-platform parity.

- [ ] [spec-gap] **P3** — `QA_COVERAGE.md:17` shows swipe gesture as FAIL/"not implemented" (recorded at commit 6e97217), but swipe IS implemented at `AppView.tsx:1009-1028` with a proof test at `e2e/proof.spec.ts:103-134`. Stale QA record contradicts `TODO.md` note (false negative). Suggest: update QA_COVERAGE.md to reflect actual PASS post-implementation. No behavioral gap — cosmetic doc drift only.

- [ ] [spec-gap] **P3** — Unit test suite not re-verified at HEAD (`bb8fce584`) after the two P2 fixes. Last passing entry in `QA_COVERAGE.md` is at `9db0a33` (5 commits prior). Changes were: one CSS class swap and one shell script string — low regression risk, but verification chain is incomplete. Suggest: run `npm test` at HEAD and add QA_COVERAGE.md entry.

### Completed
- [x] Run Lighthouse mobile accessibility audit and verify AC9 — score **94/100** (threshold: >= 90). Recorded in QA_LOG.md (2026-04-01 session). AC9 now explicitly verified. One P3 cosmetic finding (`button-name` in footer) does not affect pass/fail.
- [x] Implement responsive layout (SPEC-ADDENDUM.md §Dashboard Responsiveness) — 158 unit tests passing, review PASS. AC9 (Lighthouse score) explicitly verified: 94/100.
- [x] Playwright touch-event test for swipe-to-open sidebar — `e2e/proof.spec.ts:103-134` already implements the test: dispatches `touchstart`+`touchend` from left edge (clientX=5→80) and asserts `.fixed.inset-0.z-40` overlay becomes visible. QA_LOG false negative ("swipe NOT implemented") was a DOM attribute query limitation, not a missing implementation. `AppView.tsx:1014-1028` implements the handlers; `proof.spec.ts:103` verifies the behavior.
