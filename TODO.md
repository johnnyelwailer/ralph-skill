# Issue #177: Refactor orchestrate.ts and process-requests.ts to use OrchestratorAdapter

## Tasks

### In Progress

### Up Next
- [x] [qa/P1] Fix checkPrGates test mocks that pass `execGh` in `Partial<PrLifecycleDeps>` overrides (priority: high)
  - **Where**: `orchestrate.test.ts` lines 2974 and 2993 — subtests 5 ("returns pending when workflows exist but checks are not yet reported") and 6 ("fails CI gate when workflows exist and check query errors")
  - **Problem**: `PrLifecycleDeps` (orchestrate.ts:3104) has no `execGh` field — passing it causes TS2353 and runtime failures
  - **Fix**: Replace `execGh: async (args) => ...` in each `createMockPrDeps` override with a `createMockAdapter` that overrides `hasWorkflows` to return `true`, since `hasGithubActionsWorkflows` (orchestrate.ts:3116) now uses `deps.adapter.hasWorkflows()`
  - Test 5 needs `hasWorkflows: async () => true` on the adapter (getPrChecks returns empty checks → pending)
  - Test 6 needs `hasWorkflows: async () => true` on the adapter (getPrChecks throws → fail)

- [ ] [qa/P2] Add unit tests for `closePR` and `getPrDiff` in `adapter.test.ts` (priority: normal)
  - **Where**: `aloop/cli/src/lib/adapter.test.ts` — after the `mergePR` describe block (~line 300)
  - `closePR`: verify `gh pr close <number> --repo owner/repo` is called; with optional `--comment <text>` when comment is provided
  - `getPrDiff`: verify `gh pr diff <number> --repo owner/repo` is called and stdout is returned

### Completed
- [x] Implement as described in the issue — adapter interface, GitHubAdapter, and PrLifecycleDeps using adapter are all in place
