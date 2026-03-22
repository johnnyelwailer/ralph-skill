# Sub-Spec: Issue #174 — Add provider health integration tests for concurrent access and state transitions

Part of #24: Epic: Provider Health & Rate-Limit Resilience

## Objective

Create automated integration tests validating the provider health system's state machine, concurrency safety, and CLI display.

## Context

The provider health system is critical infrastructure shared across all loop sessions. Bugs in state transitions or concurrent access could cause providers to be incorrectly skipped or health files to be corrupted. Integration tests ensure correctness under realistic conditions.

## Inputs
- Provider health functions in `loop.sh` and `loop.ps1`
- `readProviderHealth()` in `aloop/cli/lib/session.mjs`
- Health display formatting in `aloop/cli/src/commands/status.ts`
- Existing test file: `aloop/bin/loop_provider_health.tests.sh`

## Deliverables
- **State transition tests**: healthy → cooldown → healthy, healthy → degraded (no auto-recover), cooldown escalation through all backoff tiers (2m → 5m → 15m → 30m → 60m cap)
- **Concurrent write safety**: 2+ parallel processes writing to same health file, verify no corruption
- **Lock failure graceful degradation**: simulate lock contention, verify skip-and-continue behavior
- **TypeScript read tests**: `readProviderHealth()` correctly parses health files, handles missing/malformed files
- **Status display tests**: `aloop status` formats health table correctly (healthy/cooldown/degraded with correct metadata)
- **Cross-session reset**: verify that a success from session B resets cooldown set by session A

## Acceptance Criteria
- [ ] State transition tests cover healthy→cooldown→healthy and healthy→degraded paths
- [ ] Backoff escalation verified through all 5 tiers to 60-min cap
- [ ] Concurrent write test with 2+ parallel writers produces valid JSON
- [ ] Lock failure test verifies graceful degradation (no crash, warning logged)
- [ ] TypeScript `readProviderHealth()` tests pass
- [ ] Status formatting tests verify correct output for all 3 states
- [ ] Cross-session health reset verified

## Files
- New test files (e.g., `aloop/bin/loop_provider_health_integration.tests.sh`, `aloop/cli/src/__tests__/provider-health.test.ts`)
- Read-only: `aloop/cli/lib/session.mjs`, `aloop/cli/src/commands/status.ts`

## Existing Issue
#43

## Labels
`aloop/sub-issue`, `aloop/needs-refine`
