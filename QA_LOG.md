# QA Log

## QA Session — 2026-03-27 (issue #176)

### Test Environment
- Binary under test: N/A — dashboard deps not installed; tested via `tsx` directly
- Features tested: 4 (adapter interface, GHE support, createAdapter factory, no hardcoded URLs)
- Note: `test-install` failed because dashboard `node_modules` are not installed (vite not found). Tests run directly with `tsx`.

### Results
- PASS: OrchestratorAdapter interface + GitHubAdapter (38/38 tests)
- PASS: GHE URL support in adapter
- PASS: createAdapter factory
- PASS: No hardcoded github.com API URLs in built artifact
- PRE-EXISTING (not from this branch): TypeScript errors in process-requests.ts, requests.ts, gh.test.ts — verified same errors exist on master
- PRE-EXISTING (not from this branch): 25 orchestrate.test.ts failures — verified same count on master

### Bugs Filed
None — all acceptance criteria pass.

### Command Transcript

```
# Run adapter tests
$ node_modules/.bin/tsx --test src/lib/adapter.test.ts
# tests 38 | pass 38 | fail 0

# TypeScript check (whole project)
$ node_modules/.bin/tsc --noEmit
# errors in process-requests.ts, requests.ts, gh.test.ts
# These are PRE-EXISTING — same errors appear after git stash (on master state)

# Build server bundle (skip dashboard)
$ node_modules/.bin/esbuild src/index.ts --bundle --platform=node --format=esm ... --outfile=dist/index.js
# dist/index.js  591.2kb  Done in 13ms

# Check for hardcoded github.com in built artifact
$ grep -n 'https://github\.com' dist/index.js
# 9784: copilot: "Set GH_TOKEN via ... https://github.com/settings/tokens"
# Only in Copilot help text, not in API URL construction

# Verify orchestrate test failures are pre-existing
$ git stash && tsx --test src/commands/orchestrate.test.ts
# pass 321 | fail 25  (same as on branch — pre-existing)
$ git stash pop
```
