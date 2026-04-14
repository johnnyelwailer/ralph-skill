# Issue #2: Provider Health & Resilient Round-Robin

## Gap Analysis Summary

Most of this issue is **already implemented**:
- Per-provider health files, failure classification, exponential backoff, file locking, round-robin
  integration, health logging, and `aloop status` health table all exist in `loop.sh`, `loop.ps1`,
  and `cli/src/commands/status.ts`.
- `DashboardState` now has `providerHealth` field; `loadStateForContext` calls `readProviderHealth`.
- Dashboard tests for `/api/state` providerHealth are in place.

**Two bugs remain** in `readProviderHealth` (in `cli/lib/session.mjs`): the function reads ALL JSON
files including non-provider files and hidden files, causing pollution in `aloop status` and the
dashboard SSE `providerHealth` field.

**One frontend task remains**: `AppView.tsx` still derives provider health solely from log events
via `deriveProviderHealth(log)` and doesn't consume `state.providerHealth` from the server.

## CONSTITUTION NOTE

The spec lists `loop.sh` / `loop.ps1` as "files in scope" and acceptance criterion #11 says both
scripts must implement health with cross-runtime parity. However, CONSTITUTION rule 1 forbids adding
**anything** to these scripts (they are already at 2373/2388 LOC, far above the 400 LOC target).
This criterion is already satisfied — both scripts have matching health infrastructure. **No changes
to loop.sh or loop.ps1 are needed or permitted.**

## Tasks

### Up Next

- [x] [qa/P1] Fix `readProviderHealth` in `cli/lib/session.mjs`: skip hidden files (names starting
  with `.`) and validate the provider health schema before including a file's data. A file is a
  valid provider health record if its content is an object with at least one of the canonical fields:
  `status`, `last_success`, `last_failure`, `failure_reason`, `consecutive_failures`, `cooldown_until`.
  Files lacking all of these fields (e.g. `heal-counter.json`, `hourly-stats-state.json`) should be
  excluded. Tests should be added or updated in `cli/src/commands/status.test.ts` and
  `cli/src/commands/dashboard.test.ts` to verify the filtering behavior.
  **Re-tested iter 2 (2026-04-14, commit 53e63ad7): PARTIAL FIX — hidden .json entry and 6 files
  removed, but `claude-throttle-state`, `minimax-quota`, `opencode-throttle-state` still appear due
  to coincidental field overlap (`consecutive_failures`, `status`).**

- [ ] [qa/P1] readProviderHealth still includes 3 non-provider files after fix: `claude-throttle-state`,
  `minimax-quota`, and `opencode-throttle-state` remain in `aloop status` and `/api/state` providerHealth
  because they coincidentally contain canonical provider health field names (`consecutive_failures` or
  `status`). The schema-validation approach (match at least one canonical field) is too permissive.
  Fix: require that `status` values be one of the known provider health statuses (`healthy`, `cooldown`,
  `degraded`) when `status` is used as a discriminator, or require a minimum of 3 canonical fields to
  be present. Tested at iter 2 (2026-04-14). (priority: high)

- [ ] [qa/P1] Dashboard unit tests: 4 failures in App.coverage.test.ts and App.coverage.integration-sidebar.test.ts
  after issue-2 changes. Failures: (1) timeout in `covers older-session grouping and docs overflow branches`
  (integration-sidebar, 5000ms timeout), (2) "Found multiple elements with role button and name /activity/i"
  in `covers panel toggles, sidebar shortcut, and session switching`, (3) "expected null not to be null"
  in `covers older-session grouping and docs overflow branches`, (4) "Unable to find element with text: a.png"
  in `covers ActivityPanel and LogEntryRow exhaustive`. Run `npm --prefix aloop/cli/dashboard test` to
  reproduce. Tested at iter 2 (2026-04-14). (priority: high)

- [ ] Update the dashboard frontend (`AppView.tsx`) to:
  1. Add `providerHealth?: Record<string, unknown>` to the `DashboardState` interface (the frontend
     copy in `AppView.tsx` at line 160 — distinct from the server-side copy in `dashboard.ts`).
  2. Add a `stateHealthToProviderHealth` conversion function that maps the raw file-based
     `Record<string, unknown>` (fields: `status`, `last_success`, `last_failure`, `failure_reason`,
     `consecutive_failures`, `cooldown_until`) to `ProviderHealth[]` for display in `HealthPanel`.
  3. In the `providerHealth` useMemo (line 2365), prefer `state.providerHealth` (converted) when it
     is non-empty; fall back to `deriveProviderHealth(log)` otherwise.
  4. Update/add tests in `App.coverage.test.ts` or a dedicated file verifying that when
     `state.providerHealth` is present, the converted values are used instead of log-derived ones.

### Completed

- [x] Per-provider health files at `~/.aloop/health/<provider>.json` (loop.sh + loop.ps1)
- [x] Failure classification: rate_limit, auth, timeout, concurrent_cap, unknown (both scripts)
- [x] Exponential backoff table: 2→5→15→30→60 min hard-cap (get_provider_cooldown_seconds / Get-ProviderCooldownSeconds)
- [x] File locking with graceful degradation on lock failure (both scripts)
- [x] Round-robin skips providers in cooldown/degraded (resolve_healthy_provider)
- [x] All providers in cooldown → sleep until earliest cooldown expiry (both scripts)
- [x] Health state changes logged to log.jsonl: provider_cooldown, provider_recovered, provider_degraded
- [x] `aloop status` shows provider health table (formatHealthLine, renderStatus, readProviderHealth)
- [x] loop.sh / loop.ps1 cross-runtime parity (matching cooldown tables and failure classifiers)
- [x] Add `providerHealth: Record<string, unknown>` to `DashboardState` interface in `cli/src/commands/dashboard.ts`
- [x] Read provider health via `readProviderHealth(runtimeDir)` inside `loadStateForContext`
- [x] Add tests verifying `/api/state` includes `providerHealth` key with correct data
