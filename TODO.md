# Issue #26: Epic: Orchestrator Core — Autonomous Lifecycle & Request Processing

## Tasks

### Up Next

- [ ] Implement `diagnostics.json` and `ALERT.md` generation in `process-requests.ts`: after the scan pass, if any blocker signature has persisted >= N iterations, write `<session>/diagnostics.json` with `{ blocker_fingerprint, first_seen_iteration, last_seen_iteration, attempted_remediations }` and `<session>/ALERT.md` for blockers classified as critical (human action required).

- [ ] Implement auto-remediation for known safe blockers in `process-requests.ts`: when adapter is available and a blocker is "missing label", call `adapter.ensureLabelExists(label)` and log the remediation action. Remediation attempts must be recorded in the blocker's `attempted_remediations` list to prevent infinite retry loops.

- [ ] Add blocker diagnostics tests to `orchestrate.test.ts` and/or `process-requests.test.ts`: (1) after N scan iterations with the same blocker fingerprint, `diagnostics.json` is created with correct fields; (2) after diagnostics threshold, `ALERT.md` is written for critical blockers; (3) auto-remediation calls `adapter.ensureLabelExists` for missing-label blockers and records in `attempted_remediations`.

### Completed

- [x] Blocker persistence tracking: added `BlockerSignatureEntry` type and `blocker_signatures?: Record<string, BlockerSignatureEntry>` to `OrchestratorState`; added `collectActiveBlockerFingerprints` and `updateBlockerSignatures` helpers; wired into `runOrchestratorScanPass` (phase 7.5); added `blockerThreshold` to `ScanLoopDeps` wired from `meta.json` (default 3).
