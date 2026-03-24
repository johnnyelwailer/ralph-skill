# Issue #176: OrchestratorAdapter interface and GitHubAdapter implementation

## Acceptance Criteria (from SPEC-ADDENDUM.md §Orchestrator Adapter Pattern)

- [x] `OrchestratorAdapter` interface defined in `src/lib/adapter.ts`
- [x] `LocalAdapter` stores issues as JSON files in `.aloop/issues/`, PRs as branches
- [ ] `GitHubAdapter` wraps all existing `gh` CLI calls (adapter exists but orchestrate.ts still bypasses it)
- [ ] `orchestrate.ts` uses adapter interface, not raw `execGh`
- [ ] Adapter selection configurable in `meta.json` (`adapter: "github" | "local"`)
- [ ] All GitHub URL construction derives from adapter, never hardcoded

## Tasks

### In Progress

### Up Next

- [x] Add adapter type selection to `aloop setup` prompts and store `adapter` field in `meta.json`
  - `setup.ts` has no prompt for adapter type; `process-requests.ts` reads `meta.adapter` but it's never written
  - Add a `select` prompt: "Issue/PR backend: github (default) | local"
  - Write the chosen value to `meta.json` as `adapter: "github" | "local"`

- [x] Migrate `orchestrate.ts` issue/PR operations to use adapter instead of raw `execGh`
  - Migrated: `checkPrGates` (getPrStatus, getPrChecks), `mergePr`, `flagForHuman`, `createPrForChild`
  - Migrated: `processPrLifecycle` (postComment, addLabels, closeIssue), `runOrchestratorScanPass` (getIssue, adapter passthrough)
  - Added `adapter?` field to `PrLifecycleDeps` and `MonitorChildDeps`
  - Wired adapter through to prLifecycleDeps in process-requests.ts
  - ~31 execGh calls remain for: GraphQL project status, custom aloop commands, fallback branches, GH API calls

- [x] Verify no hardcoded GitHub URLs remain in orchestrate.ts after migration
  - Only a comment on line 4385 mentions https://github.com — no code uses hardcoded URLs

### QA Bugs

- [ ] [qa/P1] 25 orchestrate.test.ts failures after adapter migration: tests for `checkPrGates`, `reviewPrDiff`, `launchChildLoop`, and `validateDoR` return unexpected values after the adapter migration (e.g., `reviewPrDiff` returns `'flagged_for_human'` instead of `'merged'` when all gates pass; `checkPrGates` returns wrong pending status; `launchChildLoop` worktree branch creation fails). Tests were mocking `execGh` directly but code now calls through the adapter interface — test mocks need to be updated to mock the adapter instead. Tested at 2026-03-24 @ 28f0d0f9. (priority: high)

### Completed

- [x] `OrchestratorAdapter` interface defined in `src/lib/adapter.ts` (lines 68–97)
- [x] `GitHubAdapter` class implements full interface with GHE support (`adapter.ts` lines 101–299)
- [x] `LocalAdapter` class implements full interface with file-based storage (`adapter.ts` lines 301–626)
- [x] `createAdapter()` factory function dispatches to correct implementation
- [x] `repoSlug` and `baseUrl` metadata properties on both adapters
- [x] 47 unit tests in `adapter.test.ts` covering both adapters
- [x] `process-requests.ts` reads `meta.adapter` and creates adapter instance
- [x] Adapter typed in `DispatchDeps` and `runTriageMonitorCycle` signature
