# Issue #26: Epic: Orchestrator Core — Autonomous Lifecycle & Request Processing

## Tasks

### Up Next

- [x] **Wire adapter in `process-requests.ts`** — Read `meta.json` to determine adapter type and instantiate `OrchestratorAdapter` via `createAdapter()`; replace direct `spawnSync('gh', ...)` calls in Phase 2 (`createGhIssue`) and Phase 2c (PR creation for completed children) with adapter methods (`adapter.createIssue()`, `adapter.createPr()`). Add test in `process-requests.test.ts` verifying that adapter selection reads from `meta.json` and the default adapter is GitHub. (AC 9, 10, 11)

- [ ] **Implement Scan Agent Self-Healing & Diagnostics** — In the scan pass (`processRequestsCommand` or a helper), persist blocker fingerprints across iterations in `orchestrator.json`; after configurable threshold `N` (read from state/config, not hardcoded), write `<session>/diagnostics.json` with fingerprint, first/last-seen iteration, and attempted remediations; write `<session>/ALERT.md` for critical blockers needing human action; auto-remediate known recoverable blockers (missing labels via `adapter.ensureLabelExists()`); log unknown request types with `id`, `type`, and `file` path. Add tests in `process-requests.test.ts` covering threshold trigger, ALERT.md creation, and label auto-remediation. (AC 12, 13, 14)

### Completed

- [x] `aloop orchestrate` launches detached daemon and returns immediately — `orchestrate.ts` lines 1515–1607 spawn loop.sh with `detached: true`, `child.unref()`, and return
- [x] Session registered in `active.json` with `pid`, `session_dir`, `work_dir`, `mode: "orchestrate"` — verified in orchestrate.ts resume path and new-session path
- [x] Loop invocation includes `--no-task-exit` — verified in orchestrate.ts args arrays
- [x] `aloop stop <session_id>` stops orchestrator and removes from `active.json` — session.mjs `stopSession` sends SIGTERM and removes entry
- [x] All 10 request types handled with side effects + archive to `requests/processed/` — `processAgentRequests` in requests.ts
- [x] Malformed/invalid JSON → `requests/failed/` — validation in `processAgentRequests`
- [x] Idempotency via `processed-ids.json` + operation-specific duplicate protection — implemented and tested in requests.test.ts
- [x] `EtagCache` loaded before scan pass and saved after — `etagCache.load()` / `etagCache.save()` in processRequestsCommand
- [x] `OrchestratorAdapter` interface and `GitHubAdapter` implementation in `adapter.ts` — verified
- [x] GHE URL support in adapter (no hardcoded `github.com`) — adapter uses `--repo` flag from config
- [x] Tests in `requests.test.ts` for all request types, validation, idempotency — comprehensive suite present
- [x] Tests in `adapter.test.ts` for GitHubAdapter, createAdapter, GHE URLs — comprehensive suite present
- [x] Tests in `orchestrate.test.ts` for orchestrate lifecycle, triage, dispatch, PR lifecycle — large suite present
- [x] Tests in `process-requests.test.ts` for syncChildBranches, syncMasterToTrunk, PR body enrichment — present
