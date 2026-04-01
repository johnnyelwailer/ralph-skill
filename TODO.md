# Issue #114: Responsive layout: touch targets, tap equivalents & accessibility audit

## Tasks

### Up Next

- [x] [spec-gap] **P3** — Unit test suite not re-verified at HEAD (`11c26afe6`). Last passing entry in `QA_COVERAGE.md` is at `9db0a33` (several commits prior). Intervening commits are docs/chore-only — low regression risk, but verification chain is incomplete. Fixed: ran `npm test` at HEAD — 158 tests pass (21 test files); QA_COVERAGE.md updated.

### Completed
- [x] [spec-gap] **P2 (in-scope)** — Fix tablet breakpoint to match spec. SPEC-ADDENDUM.md §Dashboard Responsiveness (line 214) defines tablet (640-1024px) as "Sidebar is collapsible (hidden by default, toggled via Ctrl+B / hamburger)". Fixed:
  - `AppView.tsx:366`: `md:hidden` → `lg:hidden` (hamburger persists through tablet).
  - `AppView.tsx:1329`: `hidden sm:flex` → `hidden lg:flex` (desktop sidebar only at lg+).
  - `e2e/proof.spec.ts:136-147`: updated to assert hamburger IS visible and sidebar is hidden at 768px.
- [x] [spec-gap] **P2** — `loop.sh` default Claude model was `sonnet` but `config.yml` (source of truth) and `loop.ps1` declare `opus`. Fixed: `aloop/bin/loop.sh:33` now defaults to `opus` for cross-platform parity.
- [x] [spec-gap] **P3** — `QA_COVERAGE.md:17` showed swipe gesture as FAIL/"not implemented". Fixed: `QA_COVERAGE.md` updated at commit `98e474ce` (2026-04-01) with PASS entry — false negative corrected; `AppView.tsx:1009-1028` implements touchstart/touchend handlers, `e2e/proof.spec.ts:103-134` verifies behavior. Confirmed in commit `11c26afe6`.
- [x] Run Lighthouse mobile accessibility audit and verify AC9 — score **94/100** (threshold: >= 90). Recorded in QA_LOG.md (2026-04-01 session). AC9 now explicitly verified. One P3 cosmetic finding (`button-name` in footer) does not affect pass/fail.
- [x] Implement responsive layout (SPEC-ADDENDUM.md §Dashboard Responsiveness) — 158 unit tests passing, review PASS. AC9 (Lighthouse score) explicitly verified: 94/100.
- [x] Playwright touch-event test for swipe-to-open sidebar — `e2e/proof.spec.ts:103-134` already implements the test: dispatches `touchstart`+`touchend` from left edge (clientX=5→80) and asserts `.fixed.inset-0.z-40` overlay becomes visible. QA_LOG false negative ("swipe NOT implemented") was a DOM attribute query limitation, not a missing implementation. `AppView.tsx:1014-1028` implements the handlers; `proof.spec.ts:103` verifies the behavior.
