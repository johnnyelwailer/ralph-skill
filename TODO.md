# Issue #114: Responsive layout: touch targets, tap equivalents & accessibility audit

## Tasks

### Completed
- [x] Implement responsive layout (SPEC-ADDENDUM.md §Dashboard Responsiveness) — all 9 AC verified, 158 unit tests passing, review PASS

### Spec-Gap Findings

- [ ] [spec-gap][P2] AC9 (Lighthouse score) never verified — SPEC-ADDENDUM.md L245 requires "Lighthouse mobile accessibility score >= 90". QA_LOG deferred it in every session as "pre-existing P3" but still counted it as PASS in the 9-AC tally. TODO.md claim "all 9 AC verified" is factually incorrect for AC9. The code has correct accessibility implementation (ARIA labels, 44px tap targets, semantic HTML) so the score likely passes, but the criterion was never actually measured. Files: SPEC-ADDENDUM.md L245, QA_LOG.md (deferred without test). Suggested fix: run `npx lighthouse --only-categories=accessibility --preset=mobile <dashboard-url>` and confirm score >= 90, then mark AC9 explicitly verified.

- [ ] [spec-gap][P3] QA false negative on swipe gesture — QA_LOG states "swipe NOT implemented" (first session, P3 observation) and this appears in all subsequent sessions. In fact, AppView.tsx:1009-1028 implements `handleTouchStart`/`handleTouchEnd` callbacks, and line 1326 attaches them via `onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}` on the root div. The spec body (SPEC-ADDENDUM.md L226) requirement IS met. The QA Playwright script queried DOM elements for swipe/touch/gesture attributes — it cannot detect React synthetic event handlers. This is a QA tooling false negative, not a code gap. Spec body is fulfilled; swipe is not an AC. Suggested fix: update QA_LOG note or add a direct touch-event Playwright test to confirm swipe correctly opens the sidebar.

