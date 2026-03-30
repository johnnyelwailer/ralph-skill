## Summary

- Defines `OrchestratorAdapter` interface and `GitHubAdapter` implementation in `src/lib/adapter.ts`, aligning interface shape exactly with SPEC-ADDENDUM.md §"Orchestrator Adapter Pattern" (method names, return types, `labels_add`/`labels_remove` in `updateIssue`)
- Migrates `orchestrate.ts` and `process-requests.ts` to use the adapter interface for all issue/PR operations (dual-path: adapter when available, `execGh` fallback)
- Reads `meta.adapter` from `meta.json` and forwards adapter type through `makeAdapterForRepo`, enabling runtime backend selection
- Restores deleted exports in `process-requests.ts`; adds `'review'` to `OrchestratorIssueState` union; restores `wave/N` label and `deriveComponentLabels` usage
- Adds comprehensive `adapter.test.ts` unit tests (35 tests) and adapter-branch tests across `orchestrate.ts` and `process-requests.ts`

## Files Changed

- `aloop/cli/src/lib/adapter.ts` — `OrchestratorAdapter` interface + `GitHubAdapter` implementation
- `aloop/cli/src/lib/adapter.test.ts` — full unit test suite for adapter (35 tests)
- `aloop/cli/src/lib/labels.ts` — `deriveComponentLabels` utility
- `aloop/cli/src/commands/orchestrate.ts` — adapter threading, dual-path migration for all issue/PR calls, `OrchestratorIssueState` + `'review'` state, label enrichment
- `aloop/cli/src/commands/orchestrate.test.ts` — adapter-branch tests for dual-path functions
- `aloop/cli/src/commands/process-requests.ts` — adapter instantiation (`makeAdapterForRepo`), `meta.adapter` wiring, `updateIssueBodyViaAdapter`, restored exports
- `aloop/cli/src/commands/process-requests.test.ts` — `makeAdapterForRepo` branch tests, adapter conditional tests

## Verification

- [x] `OrchestratorAdapter` interface defined in `src/lib/adapter.ts` — verified: interface present with all 11 methods matching spec exactly (names, param types, return types)
- [x] `GitHubAdapter` wraps all existing `gh` CLI calls — verified: 35/35 adapter unit tests pass
- [x] `orchestrate.ts` uses adapter interface (dual-path: adapter when available, execGh fallback) — verified: adapter-branch tests for `applyTriageResultsToIssue`, `resolveSpecQuestionIssues`, `mergePr`, `flagForHuman`, `processPrLifecycle`, `fetchAndApplyBulkIssueState`, `createTrunkToMainPr`, `createPrForChild`, `updateIssueBodyViaAdapter`; all pass
- [x] Adapter selection configurable in `meta.json` (`adapter: "github" | "local"`) — verified: `meta.adapter` read at process-requests.ts:354, forwarded to `makeAdapterForRepo`; defaults to `'github'`; unknown type throws
- [ ] `LocalAdapter` stores issues as JSON files in `.aloop/issues/`, PRs as branches — NOT verified: deferred per spec "implement local adapter when there's demand"
- [x] All GitHub URL construction derives from adapter, never hardcoded — verified: grep of `orchestrate.ts`, `process-requests.ts`, `adapter.ts` — zero non-comment `github.com` occurrences

## Proof Artifacts

- Internal TypeScript changes only — no UI or CLI observable output
- Test suites: `adapter.test.ts` 35/35, `process-requests.test.ts` 23/23, `orchestrate.test.ts` 335/362 (27 pre-existing failures unrelated to this issue)
- `tsc --noEmit`: zero errors on non-test files; `npm run build`: clean
