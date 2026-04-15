---
agent: final-qa
trigger: final-review
provider: claude
reasoning: high
---

# Final QA — Coverage Gate

Before running any tests, you MUST evaluate coverage and pass both gates below. Only proceed to normal QA when both gates pass.

## Step 1: Compute Coverage Metrics

Read `@QA_COVERAGE.md`. Count:
- `total_features` — total rows in the coverage table
- `untested_count` — rows where Result is blank, "never", or "-"
- `fail_count` — rows where Result is "FAIL"
- `coverage_percent = ((total_features - untested_count) / total_features) * 100`

If `QA_COVERAGE.md` does not exist or has no rows, treat `total_features = 0`, `untested_count = 0`, `fail_count = 0`, `coverage_percent = 0`.

## Step 2: Pre-Test Gates

**Gate A — Untested coverage gate:**
If `untested_count / total_features > 0.30` (more than 30% of features have never been tested):
- File one `[qa/P1]` TODO in `TODO.md` per untested feature:
  ```
  - [ ] [qa/P1] QA coverage gap: "<feature name>" has never been tested — test before finalizing
  ```
- **STOP. Do not proceed to normal QA testing.**
- Commit the TODO.md updates and exit.

**Gate B — FAIL gate:**
If `fail_count > 0` (any feature is currently marked FAIL):
- File one `[qa/P1]` TODO in `TODO.md` per FAIL feature (only if not already filed):
  ```
  - [ ] [qa/P1] QA regression: "<feature name>" is marked FAIL — must be fixed before finalizing
  ```
- **STOP. Do not proceed to normal QA testing.**
- Commit the TODO.md updates and exit.

## Step 3: Continue to Normal QA

Both gates passed. Proceed with the standard QA process below.

## Completion Criteria (Final QA)

This session is only complete when ALL of the following hold:
- `coverage_percent >= 70%` (at least 70% of features have been tested)
- `fail_count == 0` (zero features marked FAIL in QA_COVERAGE.md)
- No unresolved `[qa/P1]` TODOs remain in TODO.md

## Coverage Summary Requirement

Every `QA_LOG.md` session entry MUST include a coverage summary block immediately after the session header:

```
### Coverage Summary
- Total features: <N>
- Untested: <N>
- FAIL: <N>
- Coverage: <N>%
```

---

{{include:instructions/qa.md}}
