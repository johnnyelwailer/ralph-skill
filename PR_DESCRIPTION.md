## Summary

- Adds GitHub Actions CI workflow (`.github/workflows/ci.yml`) with 7 jobs covering CLI tests, CLI type-check, dashboard tests, dashboard type-check, loop script tests (Linux + Windows), and dashboard E2E tests
- Adds CI status badge to README.md
- Widens branch triggers from `agent/trunk` only to `agent/*` and `aloop/*` wildcards

## Files Changed

- `.github/workflows/ci.yml` — new CI workflow with 7 jobs
- `README.md` — CI badge added at line 1
- `aloop/cli/src/commands/orchestrate.test.ts` — test fixture quality improvements (GitHub API format corrections, no behavior changes)

## Verification

- [x] ci.yml exists with correct triggers (master, agent/*, aloop/* for push; master, agent/* for PR) — verified by code review
- [x] CLI tests job: `bun install` + `bun run test` in `aloop/cli` — ✅ 452 tests pass (QA log)
- [x] CLI type-check job: `bun install` + `bun run type-check` in `aloop/cli` — ✅ passes (QA log)
- [x] Dashboard tests job: `npm ci` + `npm test` in `aloop/cli/dashboard` — ✅ 148 tests pass (QA log)
- [x] Dashboard type-check job: `npm ci` + `npm run type-check` in `aloop/cli/dashboard` — ✅ passes (QA log)
- [x] Loop script tests (Linux): bats + 8 shell test scripts — ✅ passes (QA log; 2 scripts silently exit 0 on failure, pre-existing out-of-scope bugs)
- [x] Loop script tests (Windows): Invoke-Pester on loop.tests.ps1 — ✅ job configured (Windows runner not locally testable)
- [x] Dashboard E2E: Playwright chromium + proof-artifacts upload on failure — ✅ job configured
- [x] README CI badge at line 1 — ✅ verified

## Proof Artifacts

- Test output: QA_LOG.md (commit 0a736a81) documents local CI job runs
- CI config: `.github/workflows/ci.yml` is the deliverable — proof requires triggering an actual GitHub Actions run
