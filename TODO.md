# Issue #114: Responsive layout: touch targets, tap equivalents & accessibility audit

## Tasks

### Up Next

### Completed
- [x] Run Lighthouse mobile accessibility audit and verify AC9 — score **94/100** (threshold: >= 90). Recorded in QA_LOG.md (2026-04-01 session). AC9 now explicitly verified. One P3 cosmetic finding (`button-name` in footer) does not affect pass/fail.
- [x] Implement responsive layout (SPEC-ADDENDUM.md §Dashboard Responsiveness) — 158 unit tests passing, review PASS. AC9 (Lighthouse score) explicitly verified: 94/100.
- [x] Playwright touch-event test for swipe-to-open sidebar — `e2e/proof.spec.ts:103-134` already implements the test: dispatches `touchstart`+`touchend` from left edge (clientX=5→80) and asserts `.fixed.inset-0.z-40` overlay becomes visible. QA_LOG false negative ("swipe NOT implemented") was a DOM attribute query limitation, not a missing implementation. `AppView.tsx:1014-1028` implements the handlers; `proof.spec.ts:103` verifies the behavior.
