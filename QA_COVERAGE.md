# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| pipeline.yml periodic fields (spec-gap + docs) | 2026-03-27 | 5e9f8ddcc | PASS | Both agents have correct `every: 2`, `inject_before/after` fields |
| compile-loop-plan super-cycle (18-entry cycle) | 2026-03-27 | 5e9f8ddcc | PASS | aloop start produces cycle[0..7]=pass1, cycle[8..17]=pass2 as spec requires |
| compile-loop-plan backwards compat (no periodic → 8-entry cycle) | 2026-03-27 | 5e9f8ddcc | PASS | pipeline.yml without periodic fields compiles to length-8 cycle |
| loop.sh / loop.ps1 not modified by issue-103 | 2026-03-27 | 5e9f8ddcc | PASS | git show of issue-103 commits shows no changes to loop scripts |
| npm test suite — compile-loop-plan tests | 2026-03-27 | 5e9f8ddcc | PASS | Tests 1–36 all pass; no regressions in compile-loop-plan |
| npm test suite — periodic super-cycle unit tests | 2026-03-27 | 5e9f8ddcc | FAIL | Tests not written yet (TODO task still unchecked); bug filed |
| npm test suite — pre-existing failures | 2026-03-27 | 5e9f8ddcc | SKIP | 17 failures are pre-existing (master had 28); none in compile-loop-plan |
