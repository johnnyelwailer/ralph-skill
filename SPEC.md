# Issue #42: Add concurrent_cap failure classification with 2-min hard cap in both shells

## Objective
Implement and validate `concurrent_cap` provider-failure handling in both loop shells so "Cannot launch inside another session" style failures are classified as transient and always enter a fixed 2-minute cooldown (not exponential escalation).

## Architectural Context
Provider health is owned by the loop runners (`aloop/bin/loop.sh`, `aloop/bin/loop.ps1`) in the provider-health primitives layer:
- Failure classification happens in `classify_provider_failure()` / `Classify-ProviderFailure()`.
- Health state transitions happen in `update_provider_health_on_failure()` / `Update-ProviderHealthOnFailure()`.
- Provider health JSON (`~/.aloop/health/<provider>.json`) is the shared cross-session contract used by round-robin selection.
- Cooldown/degraded behavior is surfaced through `log.jsonl` events (`provider_cooldown`, `provider_degraded`, `provider_recovered`).

Spec alignment note: the failure classification table already defines `concurrent_cap`, but the health-file schema enum in `SPEC.md` should explicitly include it in `failure_reason`.

## Scope
In-scope files/modules for this issue:
- `aloop/bin/loop.sh`
  - `classify_provider_failure()`
  - `update_provider_health_on_failure()`
  - provider-health state write path (`failure_reason`, `status`, `cooldown_until`)
- `aloop/bin/loop.ps1`
  - `Classify-ProviderFailure`
  - `Update-ProviderHealthOnFailure`
  - provider-health state write path (`failure_reason`, `status`, `cooldown_until`)
- `aloop/bin/loop.tests.ps1`
  - provider-health behavioral coverage for `fail-concurrent`
- `aloop/bin/loop_provider_health_primitives.tests.sh` (or equivalent shell health test file)
  - regression coverage for concurrent-cap cooldown behavior in `loop.sh`
- `SPEC.md`
  - health schema enum for `failure_reason` to include `concurrent_cap`

## Out of Scope
Do not modify the following areas as part of this issue:
- Orchestrator/runtime/CLI TypeScript (`aloop/cli/**`, `process-requests`, dashboard) — per Constitution Rules 1, 2, 12, and 18.
- Phase sequencing, loop-plan wiring, queue/request contracts, or GitHub mediation behavior — per Rules 2, 5, 6, and 12.
- Unrelated provider logic (command invocation, model routing, auth bootstrap, container setup) — per Rules 12 and 19.
- Broad refactors across unrelated files — per Rules 18, 19, and 21.

## Constraints
- Respect Constitution Rule 1: keep loop scripts as runners; only adjust provider-health classification/transition behavior needed for this issue.
- Respect Rule 2: no host-runtime responsibilities (GH/API/request processing) added to loop scripts.
- Respect Rule 11: add regression tests for both shells covering this new failure reason.
- Respect Rule 12/19: implement only `concurrent_cap` behavior; do not redesign the whole backoff system.
- Keep existing behavior for `auth`, `rate_limit`, `timeout`, and `unknown` unchanged except where required to add `concurrent_cap` safely.
- `concurrent_cap` must always produce `status = cooldown` and never `degraded`.
- `concurrent_cap` cooldown is fixed to 120 seconds regardless of `consecutive_failures` (no escalation through backoff table).

## Acceptance Criteria
- [ ] `classify_provider_failure()` in `aloop/bin/loop.sh` returns `concurrent_cap` for stderr containing `Cannot launch inside another session` (case-insensitive), and `Classify-ProviderFailure` in `aloop/bin/loop.ps1` does the same.
- [ ] In both shells, when current provider health has `consecutive_failures >= 5` and a concurrent-cap error occurs, resulting health state is:
  - `status: cooldown`
  - `failure_reason: concurrent_cap`
  - `consecutive_failures` incremented by 1
  - `cooldown_until` approximately now + 120s (not 30m/60m escalation).
- [ ] `concurrent_cap` path in both shells emits `provider_cooldown` (not `provider_degraded`) with log payload containing `reason: concurrent_cap`.
- [ ] Health-file contract explicitly recognizes `concurrent_cap` as an allowed `failure_reason` in `SPEC.md` schema text.
- [ ] Regression tests are present and passing for both implementations:
  - shell test coverage for `loop.sh` concurrent-cap cooldown behavior
  - Pester coverage in `aloop/bin/loop.tests.ps1` for `fail-concurrent` ensuring fixed 2-minute cooldown and correct log event.

## Notes
- Preserve existing good behavior: auth failures remain `degraded`; transient failures remain `cooldown`.
- This issue is dependency-free and remains a single concern: provider-health concurrent-cap handling parity across shells.
