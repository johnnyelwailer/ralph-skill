## Summary

- Defines `OrchestratorAdapter` interface and `GitHubAdapter` implementation in `src/lib/adapter.ts`, aligning interface shape exactly with the spec (method names, return types, `labels_add`/`labels_remove` in `updateIssue`)
- Restores deleted exports in `process-requests.ts` (regressions from adapter refactor)
- Adds comprehensive `adapter.test.ts` unit tests covering all adapter methods including `updateIssue` branches and `listComments` since-filter
- Adds `'review'` to `OrchestratorIssueState` union type, fixing TS2367 at `process-requests.ts:551`
- Restores `wave/N` label and `deriveComponentLabels` usage in `applyDecompositionPlan`

## Files Changed

- `aloop/cli/src/lib/adapter.ts` — `OrchestratorAdapter` interface + `GitHubAdapter` implementation
- `aloop/cli/src/lib/adapter.test.ts` — full unit test suite for adapter
- `aloop/cli/src/lib/labels.ts` — `deriveComponentLabels` utility
- `aloop/cli/src/commands/orchestrate.ts` — `OrchestratorIssueState` + `'review'` state, `applyDecompositionPlan` label enrichment, `deriveComponentLabels` import
- `aloop/cli/src/commands/process-requests.ts` — restored deleted exports

## Verification

- [x] `OrchestratorAdapter` interface defined in `src/lib/adapter.ts` — verified: interface present with all 11 methods matching spec
- [x] `GitHubAdapter` wraps all existing `gh` CLI calls — verified: 27/27 adapter unit tests pass
- [ ] `orchestrate.ts` uses adapter interface, not raw `execGh` — NOT verified: migration deferred; adapter threading removed pending re-implementation per TODO "Up Next"
- [ ] Adapter selection configurable in `meta.json` (`adapter: "github" | "local"`) — NOT verified: deferred
- [ ] `LocalAdapter` stores issues as JSON files in `.aloop/issues/` — NOT verified: deferred per spec
- [ ] All GitHub URL construction derives from adapter — NOT verified: blocked on AC #3

## Proof Artifacts

- Internal TypeScript changes only — no UI or CLI observable output
- Test output: `npm test` passes adapter unit tests (27/27); `tsc --noEmit` clean for non-test files
