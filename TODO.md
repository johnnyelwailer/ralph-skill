# Issue #26: Epic: Orchestrator Core — Autonomous Lifecycle & Request Processing

## Tasks

### Up Next

- [x] Extend `BlockerSignatureEntry` (orchestrate.ts:96) with `attempted_remediations?: string[]`: this field is required by both the diagnostics task (to report remediation history) and the auto-remediation task (to prevent infinite retry). Add it to the type before implementing either of the next two tasks.

- [ ] Implement `diagnostics.json` and `ALERT.md` generation in `process-requests.ts`: after `runOrchestratorScanPass` (line 1099), read the updated state's `blocker_signatures`, and for each entry with `count >= blockerThreshold`, write/update `<sessionDir>/diagnostics.json` as an array of `{ blocker_fingerprint, first_seen_iteration, last_seen_iteration, attempted_remediations }` objects. For `blocked_on_human:*` fingerprints (severity: critical), also write `<sessionDir>/ALERT.md` with what's blocked, how long, and suggested action. Clear both files when all blockers resolve.

- [ ] Implement auto-remediation for `missing_label` blockers in `process-requests.ts`: (a) add a `missing_label:{label_name}` fingerprint to `collectActiveBlockerFingerprints` — detected when an issue has a required label that doesn't exist in the adapter; (b) after the scan pass, for each `missing_label:*` blocker not yet in `attempted_remediations`, call `adapter.ensureLabelExists(label)` and append the label name to `attempted_remediations` on the `BlockerSignatureEntry` to prevent infinite retries. Adapter is available in `processRequestsCommand` as the `GitHubAdapter` instance.

- [ ] Add blocker diagnostics tests to `process-requests.test.ts`: (1) after N scan iterations with the same blocker fingerprint (count >= threshold), `diagnostics.json` is created at the correct path with correct fields; (2) `ALERT.md` is written for `blocked_on_human:*` blockers and omitted for non-critical blockers; (3) auto-remediation calls `adapter.ensureLabelExists` for `missing_label:*` blockers and records in `attempted_remediations`; (4) a blocker already in `attempted_remediations` does not trigger a second `ensureLabelExists` call.

### Completed

- [x] Blocker persistence tracking: added `BlockerSignatureEntry` type and `blocker_signatures?: Record<string, BlockerSignatureEntry>` to `OrchestratorState`; added `collectActiveBlockerFingerprints` and `updateBlockerSignatures` helpers; wired into `runOrchestratorScanPass` (phase 7.5); added `blockerThreshold` to `ScanLoopDeps` wired from `meta.json` (default 3).
