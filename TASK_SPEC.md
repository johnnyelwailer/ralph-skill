# Sub-Spec: Issue #173 — Add concurrent_cap failure classification with 2-min hard cap in both shells

Part of #24: Epic: Provider Health & Rate-Limit Resilience

## Objective

Add `concurrent_cap` failure classification and a fixed 2-minute cooldown in both `loop.sh` and `loop.ps1` so that "Cannot launch inside another session" errors are handled distinctly from other failure types — with a flat 120s cooldown instead of exponential backoff.

## Architectural Context

`loop.sh` and `loop.ps1` are the inner-loop runner scripts (Constitution Rule 1: dumb runners). They contain a provider health subsystem with two key layers:

1. **Classification layer** — `classify_provider_failure()` / `Classify-ProviderFailure`: pure text→enum pattern match. Returns one of: `rate_limit`, `concurrent_cap`, `auth`, `timeout`, `unknown`.

2. **Health-update layer** — `update_provider_health_on_failure()` / `Update-ProviderHealthOnFailure`: reads current state, computes next status and cooldown, writes state, emits log events. This is where `concurrent_cap` diverges from other failure types: it uses a **flat 120s cooldown** bypassing `get_provider_cooldown_seconds()` / `Get-ProviderCooldownSeconds`, and sets status to `cooldown` (auto-recoverable) rather than `degraded` (which requires manual intervention).

The design rationale: Claude Code enforces a single-session limit, so if another session is active the error is transient and self-resolving. Exponential backoff is wrong here — the other session will finish within a predictable window. The `consecutive_failures` counter still increments (tracks history), but the cooldown duration does not scale with it for this failure type.

**Note:** As of the current branch state, both files already contain the `concurrent_cap` implementation. The child loop **must verify** each acceptance criterion against the actual code and confirm the implementation is complete. If all criteria are met, close the issue as done. If any gap is found, implement the missing piece.

## Scope

Only these two files may be modified:
- `aloop/bin/loop.sh`
- `aloop/bin/loop.ps1`

Specific touch-points within each file:
- `classify_provider_failure()` / `Classify-ProviderFailure` — detection pattern
- `update_provider_health_on_failure()` / `Update-ProviderHealthOnFailure` — cooldown override and status assignment
- `get_provider_cooldown_seconds()` / `Get-ProviderCooldownSeconds` — **do not add `concurrent_cap` handling here**; the override belongs in the health-update layer to preserve the flat/non-scaling behavior

## Out of Scope

- **No CLI / runtime changes** (Constitution Rule 2: host-side operations belong in `aloop` CLI, not the loop scripts)
- **No `pipeline.yml` or `loop-plan.json` changes** — this is a runtime behavior change, not a pipeline configuration change
- **No new functions** — Constitution Rule 1 prohibits new functions in loop scripts unless explicitly authorized; the change must fit within existing function bodies
- **No spec rewrites** — Constitution Rule 12: one issue, one concern
- **No test files for loop.sh/loop.ps1** — there is no shell test suite in this project; do not create one as part of this issue

## Constraints

- **Constitution Rule 1**: loop.sh/loop.ps1 are dumb runners. No new top-level functions. Modifications are confined to existing function bodies.
- **Constitution Rule 6**: No hardcoded values in general, but `get_provider_cooldown_seconds()` already uses inline numeric literals for its exponential table. The 120s concurrent_cap override follows the same established pattern and is acceptable as a named operational constant within the health-update function.
- **Constitution Rule 13**: No dead code — if `get_provider_cooldown_seconds()` / `Get-ProviderCooldownSeconds` already returns 120 for 2 failures, the `concurrent_cap` bypass must still exist separately because the flat-120s behavior must not scale with `consecutive_failures`.
- **Constitution Rule 15**: The 120s value should be applied consistently in both shells; the override lives inline in `update_provider_health_on_failure()` (not in `get_provider_cooldown_seconds()`) because it bypasses failure-count scaling entirely.
- **SPEC.md §Failure Classification**: `concurrent_cap` maps to `cooldown` status with a 2-minute duration. This is normative.

## Acceptance Criteria

- [ ] In `loop.sh`, `classify_provider_failure()` returns `concurrent_cap` when the input (case-insensitively) matches `cannot launch inside another session`
- [ ] In `loop.ps1`, `Classify-ProviderFailure` returns `concurrent_cap` for the same pattern (case-insensitive via `.ToLowerInvariant()`)
- [ ] In `loop.sh`, `update_provider_health_on_failure()` applies exactly 120s cooldown when `reason=concurrent_cap`, regardless of `consecutive_failures` count
- [ ] In `loop.ps1`, `Update-ProviderHealthOnFailure` applies exactly 120s cooldown when `reason=concurrent_cap`, regardless of `consecutive_failures` count
- [ ] The `concurrent_cap` cooldown path sets `new_status` / `newStatus` to `cooldown` (not `degraded`)
- [ ] The `provider_cooldown` log event is emitted with `reason: concurrent_cap` and a valid ISO-8601 `cooldown_until` timestamp
- [ ] `get_provider_cooldown_seconds()` / `Get-ProviderCooldownSeconds` is NOT called for `concurrent_cap` failures — the 120s is applied directly without going through the exponential backoff table
- [ ] All other failure classifications (`rate_limit`, `auth`, `timeout`, `unknown`) remain unaffected
- [ ] `auth` failures still result in `degraded` status (not `cooldown`)

## Files
- `aloop/bin/loop.sh`
- `aloop/bin/loop.ps1`

## Related
- Existing issue: #42
- Epic: #24

**Wave:** 1  
**Dependencies:** none
