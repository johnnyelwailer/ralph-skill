# Aloop Next — Feature Spec

This is the master feature backlog for `aloop-next-source`. Codex feature agent reads this file, implements features in priority order, and marks them done.

Status key: `[ ]` = not started, `[W]` = in progress, `[DONE]` = completed

---

## High Priority

- [ ] Implement structured logging with request ID propagation across daemon-http → daemon → providers
- [ ] Add retry budget tracking per-provider (max retries, current attempt count, budget exhausted events)
- [ ] Add a `/status/detailed` endpoint to daemon-http that shows per-provider cooldown state and quota usage
- [ ] Implement graceful shutdown with drain period to daemon (finish in-flight requests before exiting)

## Medium Priority

- [ ] Add SQLite migration runner to daemon startup (boot scripts/auto-migrate)
- [ ] Implement issue dedup by title fuzzy match before creating new issue in issue loop
- [ ] Add `aloop state prune` command to clean stale session rows older than 30 days
- [ ] Add structured error codes (E001, E002, ...) for all daemon error responses instead of plain strings

## Backlog

- [ ] Implement `/projects/:id/export` endpoint to dump project config as tarball
- [ ] Add provider health check pings every 60s and surface degraded providers in status endpoint
- [ ] Implement config hot-reload (SIGHUP) for daemon without full restart
- [ ] Add per-project rate limiting configuration override

---

## Guidelines

- Work on one feature at a time. Move `[ ]` → `[W]` before starting, `[DONE]` when merged or committed.
- Commit after each completed feature with a clear message: `feat: add structured logging with request ID propagation`
- If a feature is too large, break it into smaller steps and implement incrementally.
- If the spec is empty or all features are `[DONE]`, do nothing and exit cleanly.
- Always run existing tests before and after making changes. If tests break, fix them before marking done.
