# Sub-Spec: Issue #139 — Failure classification, exponential backoff, and health state transitions

## Objective

Implement failure classification logic, exponential backoff calculations, and health state transition functions that update provider health files on success and failure. Both `loop.sh` and `loop.ps1`.

## Scope

### Failure Classification
Classify provider errors from stderr/exit output into categories:
| Signal | Classification |
|--------|---------------|
| HTTP 429 / rate limit pattern | `rate_limit` |
| Connection timeout / network error | `timeout` |
| Auth error (expired token, invalid key) | `auth` |
| "Cannot launch inside another session" | `concurrent_cap` |
| Unknown non-zero exit | `unknown` |

### Exponential Backoff (hard-capped)
| Consecutive failures | Cooldown |
|---------------------|----------|
| 1 | none (could be flaky) |
| 2 | 2 min |
| 3 | 5 min |
| 4 | 15 min |
| 5 | 30 min |
| 6+ | 60 min (cap) |

### State Transitions
- **On success**: Reset to `healthy`, clear `consecutive_failures` to 0, update `last_success`. If previously unhealthy, log `provider_recovered` event.
- **On failure (non-auth)**: Increment `consecutive_failures`. If ≥2, set `cooldown` with backoff-derived `cooldown_until`. Log `provider_cooldown` event.
- **On failure (auth)**: Set `degraded` immediately (no auto-recover). Log `provider_degraded` event.
- **Concurrent cap**: Always 2-min cooldown regardless of failure count.
- **Cross-session reset**: Any session's successful call resets that provider to `healthy`.

### Observability
- Every health state change logged to `log.jsonl`:
  - `provider_cooldown` — with provider, reason, consecutive_failures, cooldown_until
  - `provider_recovered` — with provider, previous_status
  - `provider_degraded` — with provider, reason, consecutive_failures

### Functions to Implement/Verify
- `classify_provider_failure` / `Classify-ProviderFailure`
- `get_provider_cooldown_seconds` / `Get-ProviderCooldownSeconds`
- `update_provider_health_on_success` / `Update-ProviderHealthOnSuccess`
- `update_provider_health_on_failure` / `Update-ProviderHealthOnFailure`

## Acceptance Criteria

- [ ] Failure classifier correctly categorizes rate_limit, timeout, auth, concurrent_cap, unknown
- [ ] 2 consecutive failures trigger cooldown with correct exponential backoff durations
- [ ] Auth failures mark provider as `degraded` (no auto-recover)
- [ ] Successful provider call resets health to `healthy` (cross-session)
- [ ] Concurrent cap failures always use 2-min cooldown
- [ ] Health state changes logged to `log.jsonl` with correct event types
- [ ] Both `loop.sh` and `loop.ps1` implement matching logic

## Files
- `aloop/bin/loop.sh` (classify/update functions)
- `aloop/bin/loop.ps1` (classify/update functions)

## Labels
`aloop/sub-issue`, `aloop/needs-refine`

## Parent Epic
#24
