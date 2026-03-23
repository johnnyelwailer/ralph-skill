# Sub-Spec: Issue #127 — Orchestrator self-healing: continue without GH API, sync later

## Objective

Make the orchestrator resilient to transient GitHub API failures. `orchestrator.json` is the source of truth; GH is a sync target. Failed GH operations are queued in `pending-sync.json` and retried on the next process-requests cycle. No transient GH error should set `state=failed` on an issue.

## Architectural Context

All GH operations currently happen in `process-requests.ts` (the runtime layer — correct per constitution rule 2 and rule 4). GH calls are:

- **Write operations**: `createGhIssue()` (lines ~966–984), `execGh(['issue', 'edit', ...])` (line ~228), PR creation/merge calls, `updateParentTasklist()`, project board status updates
- **Read operations**: `fetchBulkIssueState()` in `lib/github-monitor.ts` (GraphQL), `ghApiWithEtag()` for conditional requests

Currently, write failures are caught with `console.error` / `console.warn` and silently dropped — there is no retry or deferral. The `EtagCache` in `lib/github-monitor.ts` already handles read-side resilience (TTL caching). This issue adds write-side resilience.

The new module `lib/pending-sync.ts` will own the pending-sync queue. `process-requests.ts` will call into it when GH writes fail and flush the queue at the start of each cycle. GH health state (last successful call timestamp, pending count) will be written to `gh-health.json` in the session directory so the dashboard can read it without coupling to `orchestrator.json`.

## Scope

Files **in-scope** for modification:

- `aloop/cli/src/commands/process-requests.ts` — wrap GH write calls to catch failures and enqueue them; flush queue at cycle start; update `gh-health.json` after each batch
- `aloop/cli/src/lib/pending-sync.ts` (**new file**) — queue data structure, load/save/flush logic, retry eligibility
- `aloop/cli/src/commands/orchestrate.ts` — add optional `gh_health` field to `OrchestratorState` type (read-only snapshot for dashboard); do NOT add `pending_gh_sync` as an `OrchestratorIssueState` value
- `aloop/cli/src/commands/process-requests.test.ts` (**or new test file**) — unit tests for queue round-trip, flush ordering, health file writes
- `aloop/cli/src/lib/pending-sync.test.ts` (**new**) — unit tests for `PendingSyncQueue` load/save/enqueue/flush
- `aloop/cli/src/dashboard/src/` — read `gh-health.json` via existing data-fetch mechanism and surface GH health indicator in the dashboard UI

## Out of Scope

- `loop.sh` / `loop.ps1` — must stay dumb runners with no GH awareness (constitution rule 1)
- `aloop/cli/src/commands/gh.ts` — binary selection and policy enforcement are unrelated; do not modify
- `aloop/cli/src/lib/github-monitor.ts` — ETag/read-side caching is already resilient; do not change
- Agent prompt files (`aloop/agents/`) — agents never see GH errors; they only write request files (constitution rule 4, rule 5)
- `OrchestratorIssueState` enum — do NOT add a new state value; issue states track work state not GH sync state

## Constraints

- **Constitution rule 2**: All GH operations belong in the runtime (`process-requests.ts`). The pending-sync queue is runtime-owned — agents never interact with it.
- **Constitution rule 4**: Agents are untrusted and never call GH APIs. The queue is invisible to agents.
- **Constitution rule 5**: All side effects flow through request files. The pending-sync queue is a runtime-internal retry buffer, not an agent channel — it holds operations the runtime already decided to execute.
- **Constitution rule 7**: `lib/pending-sync.ts` must stay under 150 LOC. Split further if needed.
- **Constitution rule 8**: Separation of concerns — queue logic lives in `pending-sync.ts`, not inlined in `process-requests.ts`.
- **Constitution rule 11**: Every changed behavior needs a test. The queue flush ordering and GH-down / GH-recovery path must be tested.
- **Constitution rule 15**: Retry limits, flush batch size, and max queue depth must come from config (e.g., a `pending_sync` section in `config.yml`), not magic numbers.
- **GH health granularity**: Track health at the operation level — distinguish rate-limit (back off), auth failure (alert, don't retry), and network error (retry aggressively). Encode this in the queue entry's `error_type` field.
- **Queue ordering**: Operations must be flushed in enqueue order (FIFO) to preserve causal dependencies (e.g., create issue before update issue).
- **Idempotency**: PR creation and issue creation are NOT idempotent. Before flushing a queued `create_issue` or `create_pr`, check if the resource already exists on GH (use the ETag cache or a lightweight REST call). Mark as `skipped` if already created.

## Pending-Sync Queue Schema

`pending-sync.json` lives in the session directory alongside `orchestrator.json`:

```json
{
  "version": 1,
  "entries": [
    {
      "id": "<uuid>",
      "op": "issue_edit" | "issue_create" | "pr_create" | "pr_merge" | "project_status" | "post_comment" | "tasklist_update",
      "args": { /* op-specific payload */ },
      "enqueued_at": "<ISO8601>",
      "attempt_count": 0,
      "last_error": null | "<string>",
      "error_type": null | "rate_limit" | "auth" | "network" | "unknown"
    }
  ]
}
```

The queue is loaded at process-requests startup and saved after each flush attempt.

## GH Health File Schema

`gh-health.json` lives in the session directory and is written by `process-requests.ts` after each cycle:

```json
{
  "last_success_at": "<ISO8601> | null",
  "last_failure_at": "<ISO8601> | null",
  "last_error": "<string> | null",
  "pending_count": 0,
  "status": "ok" | "degraded" | "down"
}
```

`status` is derived: `ok` = last op succeeded, `degraded` = pending > 0 but last attempt succeeded, `down` = last attempt failed.

## Acceptance Criteria

1. **Queue round-trip**: When `execGh` throws during `process-requests`, the failing operation is appended to `pending-sync.json` with `attempt_count=0` and the orchestrator continues without aborting the cycle.
2. **Flush on recovery**: On the next cycle where `execGh` succeeds, all queued entries are flushed in FIFO order before new work proceeds.
3. **No `state=failed` from GH errors**: An issue in `in_progress`, `pr_open`, or `pending` state must not transition to `failed` solely because a GH API call failed. The state transition is blocked until the queued op succeeds.
4. **Idempotency guard**: If a queued `create_issue` entry is about to be flushed and the issue already exists on GH, the entry is marked `skipped` (not retried) and the issue number is reconciled in `orchestrator.json`.
5. **Health file written**: After every `processRequestsCommand` cycle, `gh-health.json` exists in the session directory with `pending_count` matching the current queue length.
6. **Dashboard indicator**: The dashboard reads `gh-health.json` and displays a GH health badge (`ok` / `degraded` / `down`) with the pending sync count when > 0.
7. **Auth failure does not retry**: A queued entry with `error_type=auth` is not retried on subsequent cycles — it is escalated (logged, surfaced in dashboard) instead.
8. **Config-driven limits**: Max queue depth and max retry attempts are read from `config.yml` with documented defaults; no magic numbers in source.
9. **Tests**: `pending-sync.test.ts` covers enqueue, flush (success), flush (partial failure), load/save round-trip. `process-requests` integration tests cover the GH-down scenario and recovery path.
10. **File size**: `lib/pending-sync.ts` is ≤ 150 LOC.

**Wave:** 1
**Dependencies:** none
