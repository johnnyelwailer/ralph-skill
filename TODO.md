# Issue #80: ZDR configuration — `opencode.json` generation and config recording

## Current Phase: Implementation

### In Progress

### Up Next
- [x] Add `--data-privacy <level>` flag to CLI setup command in `index.ts` (line ~52) so non-interactive mode can receive the flag from the command line (priority: high)

### Completed
- [x] Generate `opencode.json` with `{ "provider": { "zdr": true } }` in `scaffoldWorkspace()` when private + opencode, with deep-merge of existing settings
- [x] Tests for `opencode.json` generation: created when private + opencode, not created when public, not created when opencode not in providers, existing settings preserved during merge
- [x] `zdr_enabled` and `data_classification` recorded in project config — already in `project.mjs` lines 945-947 under `privacy_policy` section
- [x] ZDR provider warnings displayed during setup — already in `setup.ts` via `getZdrWarnings()`
- [x] `--data-privacy` handled in `SetupCommandOptions` and `setupCommandWithDeps` — already parses and passes to scaffold

### Spec-Gap Analysis
- [spec-gap] analysis: no discrepancies found — spec fully fulfilled. All 5 acceptance criteria verified against implementation and tests.
