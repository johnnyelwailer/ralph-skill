# Issue #37: CI: Core workflow with Node setup, dependency install, and CLI tests

## In Progress

- [ ] [review] Gate 5: `node-version: '22.x'` in `.github/workflows/ci.yml:19` is invalid for actions/setup-node — change to `'22'` (latest patch) or a pinned version like `'22.14.0'` (priority: high)
- [ ] [review] Gate 4: No npm caching configured in CI workflow — add `cache: 'npm'` to `actions/setup-node@v4` or use `actions/cache` to avoid full `npm ci` on every run (priority: medium)

## Completed

- [x] Implement as described in the issue
