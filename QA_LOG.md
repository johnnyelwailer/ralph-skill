# QA Log

## QA Session — 2026-04-14 (iteration 1)

### Test Environment
- Worktree: /home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-157-20260414-164637/worktree
- Branch: aloop/issue-157
- Commit: 90c20275
- Features tested: 5 (DocsPanel extraction, Header extraction, Footer extraction, type-check, test suite)

### Results
- PASS: Footer.tsx extraction (66 LOC, within 200 LOC limit)
- FAIL: DocsPanel.tsx extraction — 204 LOC exceeds 200 LOC limit
- FAIL: Header.tsx extraction — 385 LOC exceeds 200 LOC limit (pre-existing known issue, tracked in TODO)
- FAIL: npm run type-check — 5 TypeScript errors
- FAIL: npm test — 3 of 243 tests failing

### Bugs Filed
- [qa/P1] type-check fails after DocsPanel extraction (5 TypeScript errors)
- [qa/P1] 3 tests fail after DocsPanel/Header extraction
- [qa/P1] DocsPanel.tsx exceeds 200 LOC limit (204 LOC)

### Command Transcript

```
$ wc -l aloop/cli/dashboard/src/components/layout/*.tsx
   95 DocsPanel.test.tsx
  204 DocsPanel.tsx         ← FAIL: spec limit is 200 LOC
   66 Footer.tsx            ← PASS
  385 Header.tsx            ← FAIL: spec limit is 200 LOC (known, tracked)
   92 ResponsiveLayout.test.tsx
  100 ResponsiveLayout.tsx
  942 total

$ npm run type-check
# Exit code: 2 (FAIL)
src/App.coverage.test.ts(636,65): error TS2769: No overload matches this call.
  Argument of type '{}' is not assignable to parameter of type 'Attributes & TooltipProviderProps'.
  Property 'children' is missing in type '{}' but required in type 'TooltipProviderProps'.
src/App.coverage.test.ts(636,92): error TS2769: No overload matches this call.
  Property 'sessionCost' is missing in type '{ sessions: any[]; selectedSessionId: string; ... }'
  but required in type '{ ... sessionCost: number; ... }'.
src/App.coverage.test.ts(674,43): error TS2769: TooltipProvider missing 'children'
src/App.coverage.test.ts(695,43): error TS2769: TooltipProvider missing 'children'
src/components/layout/DocsPanel.test.tsx(85,44): error TS2322: Type 'null' is not assignable to type 'string'.

$ npm test
# 1 failed test file, 3 test failures, 240 passing
# FAIL src/App.coverage.test.ts:
#   - "covers panel toggles, sidebar shortcut, and session switching"
#     TestingLibraryElementError: Found multiple elements with role "button" name /activity/i
#   - "covers older-session grouping and docs overflow branches"
#     AssertionError: expected null not to be null
#     container.querySelector('aside .mt-3 button') returned null
#   - "covers ActivityPanel and LogEntryRow exhaustive"
#     TestingLibraryElementError: Unable to find element with text "a.png"
```
