# Issue #2: Provider Health & Resilient Round-Robin

## Gap Analysis Summary

Most of this issue is **already implemented**:
- Per-provider health files, failure classification, exponential backoff, file locking, round-robin
  integration, health logging, and `aloop status` health table all exist in `loop.sh`, `loop.ps1`,
  and `cli/src/commands/status.ts`.

**One gap remains**: the dashboard SSE state does not include provider health from `~/.aloop/health/`
files. `DashboardState` has no `providerHealth` field; `loadStateForContext` never calls
`readProviderHealth`. The frontend derives health solely from session log entries, which misses
cross-session state.

## CONSTITUTION NOTE

The spec lists `loop.sh` / `loop.ps1` as "files in scope" and acceptance criterion #11 says both
scripts must implement health with cross-runtime parity. However, CONSTITUTION rule 1 forbids adding
**anything** to these scripts (they are already at 2373/2388 LOC, far above the 400 LOC target).
This criterion is already satisfied — both scripts have matching health infrastructure. **No changes
to loop.sh or loop.ps1 are needed or permitted.**

## Tasks

### QA Bugs

- [ ] [qa/P1] providerHealth includes non-provider files: `readProviderHealth` reads ALL JSON files in `~/.aloop/health/` including `claude-throttle-state.json`, `heal-counter.json`, `hourly-stats-state.json`, `opencode-go-usage.json`, `opencode-throttle-state.json`, `provider-status.json`, `resource-guard-state.json`. These appear in `aloop status` with `unknown` status and pollute the dashboard SSE `providerHealth` field. The function should only include files whose content has the expected provider health schema (`status`, `last_success`, `last_failure`, `failure_reason`, `consecutive_failures`, `cooldown_until`), or filter by a known provider allowlist. Tested at iter 1. (priority: high)

- [ ] [qa/P1] providerHealth has empty-string provider key: A hidden file `~/.aloop/health/.json` (174 bytes, created 2026-04-14) contains a provider health record with 135 consecutive_failures and an empty provider name. This renders as a blank entry at the top of `aloop status` Provider Health table and appears as key `""` in the dashboard SSE payload. Root cause: a loop run wrote a health file with an empty provider name. `readProviderHealth` should skip hidden files (names starting with `.`) and `loop.sh`/`loop.ps1` should guard against empty provider names. Tested at iter 1. (priority: high)

### Up Next

- [x] Add `providerHealth: Record<string, unknown>` to `DashboardState` interface in
  `cli/src/commands/dashboard.ts`, read it via `readProviderHealth(runtimeDir)` inside
  `loadStateForContext`, and include it in the returned state object. This makes the SSE `state`
  event automatically carry provider health (since `toStateEventPayload` = `JSON.stringify(state)`).

- [x] Add tests in `cli/src/commands/dashboard.test.ts` verifying that the `/api/state` response
  and the initial SSE `state` event include a `providerHealth` key, with correct data when health
  files exist in the fixture home dir.

- [ ] Update the dashboard frontend (`AppView.tsx`) to prefer `state.providerHealth` (file-based,
  cross-session) over the log-derived `deriveProviderHealth(log)` fallback when the server-provided
  field is available; keep the log fallback for backwards compatibility during the transition.

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
