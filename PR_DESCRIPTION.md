## Summary

- Defines `OrchestratorAdapter` interface and `GitHubAdapter` implementation in `src/lib/adapter.ts`, aligning interface shape exactly with SPEC-ADDENDUM.md §"Orchestrator Adapter Pattern" (method names, return types, `labels_add`/`labels_remove` in `updateIssue`)
- Migrates `orchestrate.ts` and `process-requests.ts` to use the adapter interface for all issue/PR operations (dual-path: adapter when available, `execGh` fallback)
- Reads `meta.adapter` from `meta.json` and forwards adapter type through `makeAdapterForRepo`, enabling runtime backend selection
- Restores deleted exports in `process-requests.ts`; adds `'review'` to `OrchestratorIssueState` union; restores `wave/N` label and `deriveComponentLabels` usage
- Migrates `checkPrGates` to adapter dual-path; adds `getPrChecks` to interface for per-check detail reporting
- Extracts `applySubDecompositionResult`, `createGhIssuesForNewEntries`, `createPRViaAdapter`, `updateParentTasklist` as tested helpers in `process-requests.ts`
- Adds comprehensive `adapter.test.ts` unit tests (35 tests) and adapter-branch tests across `orchestrate.ts` and `process-requests.ts` (total 1148 passing tests)

## Files Changed

- `aloop/cli/src/lib/adapter.ts` — `OrchestratorAdapter` interface + `GitHubAdapter` implementation; `getPrChecks` added to interface
- `aloop/cli/src/lib/adapter.test.ts` — full unit test suite for adapter (35 tests)
- `aloop/cli/src/lib/labels.ts` — `deriveComponentLabels` utility
- `aloop/cli/src/commands/orchestrate.ts` — adapter threading, dual-path migration for all issue/PR calls, `OrchestratorIssueState` + `'review'` state, label enrichment, `checkPrGates` adapter path
- `aloop/cli/src/commands/orchestrate.test.ts` — adapter-branch tests for dual-path functions + `checkPrGates adapter path` suite (5 tests)
- `aloop/cli/src/commands/process-requests.ts` — adapter instantiation (`makeAdapterForRepo`), `meta.adapter` wiring, `updateIssueBodyViaAdapter`, restored exports, extracted testable helpers
- `aloop/cli/src/commands/process-requests.test.ts` — `makeAdapterForRepo` branch tests, adapter conditional tests, 14 new tests for extracted helpers

## Verification

- [x] `OrchestratorAdapter` interface defined in `src/lib/adapter.ts` — verified: interface present with all 12 methods matching spec exactly (names, param types, return types; `getPrChecks` additive extension)
- [x] `GitHubAdapter` wraps all existing `gh` CLI calls — verified: 35/35 adapter unit tests pass
- [x] `orchestrate.ts` uses adapter interface (dual-path: adapter when available, execGh fallback) — verified: adapter-branch tests for `applyTriageResultsToIssue`, `resolveSpecQuestionIssues`, `mergePr`, `flagForHuman`, `processPrLifecycle`, `fetchAndApplyBulkIssueState`, `createTrunkToMainPr`, `createPrForChild`, `updateIssueBodyViaAdapter`, `checkPrGates`; all pass
- [x] Adapter selection configurable in `meta.json` (`adapter: "github" | "local"`) — verified: `meta.adapter` read at process-requests.ts:354, forwarded to `makeAdapterForRepo`; defaults to `'github'`; unknown type throws
- [ ] `LocalAdapter` stores issues as JSON files in `.aloop/issues/`, PRs as branches — NOT verified: deferred per spec "implement local adapter when there's demand"
- [x] All GitHub URL construction derives from adapter, never hardcoded — verified: grep of `orchestrate.ts`, `process-requests.ts`, `adapter.ts` — zero non-comment `github.com` occurrences

## Proof Artifacts

- Internal TypeScript changes only — no UI or CLI observable output
- Test suites: `adapter.test.ts` 35/35, `process-requests.test.ts` 37/37 (14 new), `orchestrate.test.ts` (5 new adapter path tests pass); overall 1148/1183 pass (34 pre-existing failures unrelated to this issue)
- `tsc --noEmit`: zero errors on non-test files; `npm run build`: clean
