# Sub-Spec: Issue #142 — OrchestratorAdapter interface & GitHubAdapter implementation

## Objective

Define the pluggable adapter pattern for issue/PR backends and implement the GitHub adapter.

## Scope

- Create `aloop/cli/src/lib/adapter.ts` with the `OrchestratorAdapter` interface
- Interface methods must cover all orchestrator-needed operations:
  - Issue CRUD: `createIssue`, `updateIssue`, `closeIssue`, `queryIssues`, `getIssue`
  - PR operations: `createPr`, `mergePr`, `getPrStatus`, `getPrChecks`
  - Comments: `postComment`, `listComments`
  - Labels: `addLabels`, `removeLabels`, `ensureLabelExists`
  - Bulk fetch: `fetchBulkIssueState` (with ETag support)
- Implement `GitHubAdapter` class wrapping all existing `gh` CLI calls
- GitHub Enterprise URL support: derive all URLs from adapter config (repo owner/name), never hardcode `github.com`
- Adapter selection driven by `meta.json` config field (default: `github`)
- Export a factory function `createAdapter(config): OrchestratorAdapter`

## Inputs
- Existing `gh` CLI call patterns in `orchestrate.ts`, `process-requests.ts`, `gh.ts`
- SPEC-ADDENDUM §Orchestrator Adapter Pattern

## Outputs
- `aloop/cli/src/lib/adapter.ts` with interface + GitHubAdapter + factory
- Unit tests for GitHubAdapter (mock `gh` CLI calls)

## Acceptance Criteria
- [ ] `OrchestratorAdapter` interface defined with all required methods
- [ ] `GitHubAdapter` wraps existing `gh` CLI calls
- [ ] No hardcoded `github.com` URLs in adapter
- [ ] Factory function selects adapter from config
- [ ] Unit tests pass

## Labels
`aloop/sub-issue`, `aloop/needs-refine`
