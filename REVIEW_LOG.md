# Review Log

## Review — 2026-04-03 — commit 8b825a886..a5a6b89cd

**Verdict: FAIL** (2 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/cli/src/lib/adapter.ts`, `aloop/cli/src/lib/adapter.test.ts`, `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/commands/orchestrate.test.ts`, `aloop/cli/src/commands/process-requests.ts`

### Gate 1: Spec Compliance — PASS (with observation)

TASK_SPEC.md contained a self-contradictory constraint: "migrate all execGh calls in the PR lifecycle" AND "do not add new adapter methods." The builder resolved this by extending the adapter to support the migration (`closePR`, `listPRs`, `getPrDiff`, `hasWorkflows`, `branchExists`). The additions are necessary for a complete migration, correctly implemented, and well-tested. The spec intent (migrate `execGh` → adapter) was achieved.

**Observation:** SPEC-ADDENDUM.md's adapter interface block (lines 982–1001) does not include the newly added methods. Future agents reading the spec will see an incomplete interface. SPEC-ADDENDUM.md should be updated to match the actual interface.

### Gate 2: Test Depth — PASS

- `adapter.test.ts` tests for `closePR` and `getPrDiff` assert exact `gh` args and exact returned content — not shallow.
- `checkPrGates` tests (orchestrate.test.ts:2906–3088) verify specific gate statuses with concrete detail string assertions, including `hasWorkflows` interactions.
- `resolveSpecQuestionIssues adapter path` tests (orchestrate.test.ts:6678+) check exact call counts, argument values, and label operations — thorough.
- `setIssueStatus` tests cover: correct option ID selection, case-insensitive matching, no-op when no project/status, caching behavior (GraphQL called only once).

### Gate 3: Coverage — FAIL

**Finding:** `triageMonitoringCycle` adapter path (orchestrate.ts lines ~1784–1816) has **no unit tests**. This code was added/restructured to use `deps.adapter.listComments()` for issue and PR comments. The early-exit guard (`if (!deps.adapter) return`) gates all the new code, but neither the guard nor the adapter path has test coverage. The resolveSpecQuestionIssues adapter path and the checkPrGates adapter path both have dedicated test suites — `triageMonitoringCycle` does not.

→ Written to TODO.md as `[review]` task.

### Gate 4: Code Quality — FAIL

**Finding:** `adapter.ts` is now **451 lines** (was 280 at last review). SPEC-ADDENDUM.md states: "Files above 300 LOC are a code smell and must be decomposed before adding new features." The file was already above 200 LOC (the "should be split" threshold) before this session; instead of decomposing first, new features were added, growing it to 451 lines. The `resolveProjectStatusContext` + `setIssueStatus` GraphQL implementation alone is ~85 lines and is a clear extraction candidate.

→ Written to TODO.md as `[review]` task.

### Gate 5: Integration Sanity — PASS

- `npm test`: 1202/1208 pass, 5 fail. QA_LOG.md explicitly documents: "Dashboard/GH request processor suite failures (tests 37, 39–42, 51): pre-existing, unrelated to adapter work." Confirmed — `dashboard.test.ts` not modified in this session.
- `npm run type-check`: zero errors.
- `npm run build`: passes.

### Gate 6: Proof — PASS

Internal TypeScript refactoring only — no observable CLI/UI output. Skipping proof with no artifacts is the correct outcome.

### Gate 7: Runtime Layout — N/A (no UI changes)

### Gate 8: Version Compliance — PASS (no dependency changes)

### Gate 9: Documentation — PASS

No user-facing README or docs/ changes required for this internal refactor.

---
