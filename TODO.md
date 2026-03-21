# Issue #102: Review Gate 10: QA trend checking

## Current Phase: Implementation

### In Progress

### Completed
- [x] Add Gate 10 (QA Coverage & Bug Fix Rate) section to `aloop/templates/instructions/review.md` after Gate 9 — includes: parse QA_COVERAGE.md for coverage %, scan TODO.md for stale [qa/P1] bugs, fail criteria (coverage < 30%, stale P1 > 3 iterations), graceful skip when QA_COVERAGE.md absent
- [x] Update all references to "9 gates" in review.md to "10 gates" — affects: process step 2 ("9 gates"), approval flow ("gates 1-9 pass" x2), objective line
