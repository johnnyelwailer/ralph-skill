# Issue #22: Epic: Set up GitHub Actions CI

## Tasks

- [ ] Implement as described in the issue

## QA Bugs

- [x] [qa/P1] CLI type-check CI job will fail: `bun run type-check` (`tsc --noEmit`) exits code 2 with 2 pre-existing TypeScript errors in `src/commands/process-requests.ts` — TS2367 type overlap error on line 442 and TS2304 undefined name `sweepStaleRunningIssueStatuses` on line 818. The `cli-type-check` CI job will always fail until these are fixed. Tested at iter 2. (priority: high)
- [x] [qa/P1] Dashboard type-check CI job will fail: `npm run type-check` in `aloop/cli/dashboard` exits code 2 with TypeScript errors — `beforeEach`, `afterEach`, `vi` not found in `App.coverage.test.ts` (missing Vitest type references in tsconfig), and `ArtifactEntry` shape mismatch in `App.test.tsx` (missing `description` property). The `dashboard-type-check` CI job will always fail until fixed. Tested at iter 2. (priority: high)
- [ ] [qa/P1] CLI tests CI job will fail: `bun run test` (`tsx --test src/**/*.test.ts && node --test aloop.test.mjs`) exits code 1 with 27 pre-existing test failures. The `cli-tests` CI job will always fail until the underlying test failures are fixed. Tested at iter 2. (priority: high)
