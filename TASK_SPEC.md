# Sub-Spec: Issue #189 — Split test files and final validation pass

Split test files.

Dashboard components in aloop/cli/dashboard/src/.

## Scope

- aloop/cli/dashboard/src/App.test.tsx
- aloop/cli/dashboard/src/App.coverage.test.ts

## Out of Scope

- aloop/bin/loop.sh (Constitution Rule 1)
- aloop/cli/src/commands/ (not dashboard)

## Constraints

- Constitution Rule 7: < 150 LOC per file
- Constitution Rule 11: test everything

## Acceptance Criteria

- [ ] No test file exceeds 200 LOC
- [ ] All tests pass
