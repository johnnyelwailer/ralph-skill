# Issue #142: OrchestratorAdapter interface & GitHubAdapter implementation

## Current Phase: Implementation

### Completed

- [x] Define `OrchestratorAdapter` interface in `aloop/cli/src/lib/adapter.ts` with all required method signatures: Issue CRUD (`createIssue`, `updateIssue`, `closeIssue`, `getIssue`, `queryIssues`), PR ops (`createPr`, `mergePr`, `getPrStatus`, `getPrChecks`), Comments (`postComment`, `listComments`), Labels (`addLabels`, `removeLabels`, `ensureLabelExists`), Bulk fetch (`fetchBulkIssueState` with ETag support). Supporting types defined: `AdapterIssue`, `AdapterPr`, `AdapterComment`, `PrChecksResult`, `PrStatus`, `AdapterConfig`.
- [x] Implement `GitHubAdapter` class wrapping `gh` CLI calls via injected `GhExecFn`. Maps all interface methods to `gh issue create/view/list/edit/close/comment`, `gh pr create/view/merge`, `gh label create`, and delegates bulk fetch to `fetchBulkIssueState` from `github-monitor.ts`.
- [x] No hardcoded `github.com` URLs in adapter. URL parsing uses `/issues/(\d+)` and `/pull/(\d+)` patterns that work for any hostname including GHE. Config accepts `repo` (owner/name) only.
- [x] Implement `createAdapter(config, execGh)` factory function. Returns `GitHubAdapter` for `"github"` type, throws clear error for unknown types.
- [x] Unit tests (25 tests) in `adapter.test.ts` covering: issue create/close/get/query, PR create/merge/status/checks, comments, labels, bulk fetch, factory function, GHE URL compatibility.
