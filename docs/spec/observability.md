# Observability

> **Reference document.** The event bus, JSONL log schema, SSE streaming contract, and projector model for aloop's observability layer.
>
> Hard rules live in CONSTITUTION.md. Work items live in GitHub issues.
>
> External implementation reference for overlapping trace/event concepts: [pingdotgg/t3code](https://github.com/pingdotgg/t3code), especially its local `server.trace.ndjson`, provider event NDJSON, OTLP export path, and trace/debugging guide.

---

## Table of contents

- [Guiding principles](#guiding-principles)
- [Event envelope](#event-envelope)
- [JSONL log](#jsonl-log)
- [SSE streaming](#sse-streaming)
- [Event topic catalog](#event-topic-catalog)
- [Projectors](#projectors)
- [Metrics from projections](#metrics-from-projections)
- [Rebuildability contract](#rebuildability-contract)

---

## Guiding principles

1. **JSONL is authoritative.** The per-session `log.jsonl` is the source of truth. SQLite projections are queryable views, not the source of truth. On corruption or schema change, projections are rebuildable from JSONL. JSONL is never rebuildable from SQLite.

2. **Every observable change emits a structured event.** If it is not observable, it should not have happened. Every observable change is replayable via SSE `Last-Event-ID`.

3. **Sessions are replayable.** A daemon crash, upgrade, or graceful stop leaves the session resumable. State reconstructs from JSONL and the scheduler's durable permit table. No in-process state is load-bearing across restarts.

4. **Metrics that gate permits are daemon-computed.** Agents produce events; projectors compute metrics from events. No agent emits a metric value that gates its own permits — the DGM-resistance rule (CONSTITUTION.md §IX.36).

5. **Silent fallbacks are forbidden.** If a metric value is missing and has no documented default, the endpoint fails loud. Hidden defaults are bugs.

6. **Operator debugging starts local.** T3 Code's observability split is a useful model: human-readable console logs are ephemeral, while completed spans are persisted as local NDJSON and can optionally export to OTLP. Aloop's authoritative session truth remains per-session JSONL, but daemon/service traces should follow the same local-first pattern: inspectable files by default, backend export as an add-on, and provider runtime event logs separate from service traces. Reference: [pingdotgg/t3code](https://github.com/pingdotgg/t3code).

---

## Event envelope

Every event in every session's JSONL log uses this shape:

```typescript
type EventEnvelope<T = unknown> = {
  readonly _v: 1;                        // envelope version — stable v1
  readonly id: string;                    // monotonic: `{ms}.{seq}`, zero-padded
  readonly timestamp: string;             // ISO-8601 UTC
  readonly topic: string;                 // dot-namespaced topic, e.g. "session.update"
  readonly data: T;                      // topic-specific payload
};
```

**ID format:** `{ms:013}.{seq:06}` — 13 digits of milliseconds since epoch (room to year ~2286), 6 digits of per-millisecond sequence counter. IDs are lexicographically sortable. The sequence resets to 0 each millisecond. This makes `id` monotonically increasing without requiring a global counter.

**Envelope stability:** The `_v: 1` envelope is stable for v1. Additive changes — new topics, new optional fields inside `data` — do not bump `_v` or break existing readers. Breaking changes increment the major version.

**Envelope examples:**

```
{"_v":1,"id":"1748537600000.000001","timestamp":"2026-05-01T22:30:00.000Z","topic":"session.update","data":{"session_id":"s_abc","status":"running","phase":"plan","iteration":1}}
{"_v":1,"id":"1748537600000.000002","timestamp":"2026-05-01T22:30:05.123Z","topic":"scheduler.permit.grant","data":{"permit_id":"p_001","session_id":"s_abc","provider_id":"opencode","ttl":600}}
{"_v":1,"id":"1748537600000.000003","timestamp":"2026-05-01T22:30:06.456Z","topic":"agent.chunk","data":{"session_id":"s_abc","turn_id":"t_001","sequence":0,"type":"text","content":{"delta":"Implementing..."},"final":false}}
```

---

## JSONL log

**Path:** `~/.aloop/state/sessions/<project_id>/s_<session_id>/log.jsonl`

Append-only. One JSON line per event, terminated by `\n`. Empty lines are skipped on read.

**Authoritative log vs SSE:**

| Property | JSONL (authoritative) | SSE (live tail) |
|---|---|---|
| Ordering | Strict monotonic | Strict monotonic within topic |
| Durability | Permanent | Best-effort |
| Lossless | Yes | No (drops allowed) |
| Replay | Via `Last-Event-ID` | Via `Last-Event-ID` |
| Access | `GET /v1/sessions/:id/log` | `GET /v1/events` |

Clients needing lossless tail read JSONL directly. The SSE stream is for live monitoring.

**Trace-file reference.** For daemon-level debugging that is not itself session truth, use a separate NDJSON trace file rather than overloading `log.jsonl`. T3 Code's `docs/observability.md` is the relevant external reference for practical queries: failed spans, slow spans, orchestration command latency, git spans, provider turn spans, and OTLP startup configuration. Reference: [pingdotgg/t3code](https://github.com/pingdotgg/t3code).

**Write atomicity:** Each `append` call writes exactly one line. A crash mid-write results in either a complete line or nothing — never a partial line. This is guaranteed by the `JsonlEventStore` lazy-open file handle: the line is buffered and flushed (`fsync`) before the call returns.

**Read:** `JsonlEventStore.read(since?: string)` — yields events with `id > since` (exclusive). The `since` value is an event `id`. When absent, yields all events from the beginning.

**Read all:** `JsonlEventStore.readAllEvents()` — yields all events in file order. Returns `[]` for non-existent files.

---

## SSE streaming

**Endpoint:** `GET /v1/events`

**Transport:** `text/event-stream` over HTTP or Unix socket. Identical contract over both transports.

**Query parameters:**

| Param | Default | Description |
|---|---|---|
| `topics` | `*` | Comma-separated glob patterns. `*` matches any topic segment. `session.*` matches all session topics. Absent param subscribes to all topics. |
| `session_id` | — | Filter to events whose `data.session_id` equals the given value. |
| `since` | — | Serve events with `id > since` (exclusive). Sets `Last-Event-ID` on the stream. |

**Response format:**

```
event: session.update
id: 1748537600000.000001
data: {"session_id":"s_abc","status":"running","phase":"plan","iteration":1}

event: scheduler.permit.grant
id: 1748537600000.000002
data: {"permit_id":"p_001","session_id":"s_abc","provider_id":"opencode","ttl":600}

```

Each event maps to one SSE "event:" block using the topic string as the SSE event name. The `id` field carries the monotonic event ID for `Last-Event-ID` replay.

**Ordering guarantees:**

- The daemon never publishes events out of monotonic order within a topic.
- Clients MUST tolerate gaps in event IDs — a gap indicates a dropped event, not a reorder.
- Clients MUST NOT tolerate reordering — observing an out-of-order event within a topic is a daemon bug.
- If a client needs lossless delivery, it reads JSONL directly.

**Backpressure:**

- Per-client buffer: 1 MB default.
- On overflow: emits `warning.dropped` event to the client and keeps the most recent events, dropping the oldest.

**Empty stream:** If no matching events exist and no log files are present, the stream closes immediately with no bytes written.

**Session-scoped SSE:** `GET /v1/sessions/:id/events` mirrors the global bus but is pre-filtered to the session's `log.jsonl` and the session's directory-scoped event path.

---

## Event topic catalog

Topics are dot-namespaced. The segment prefix identifies the subsystem that owns the topic. Topics are immutable once introduced; retired topics are documented as such.

### `session.*` — Session lifecycle

| Topic | When emitted | Data fields |
|---|---|---|
| `session.update` | Phase, iteration, status, or provider changes | `{session_id, status?, phase?, iteration?, provider?, project_id?}` |
| `session.stuck` | Watchdog detects last event older than `stuckThresholdSeconds` | `{session_id, last_event_at, elapsed}` — `elapsed` is seconds since `last_event_at` |
| `session.interrupted` | Crash recovery marks a running session as interrupted | `{session_id, last_event_at}` |
| `session.event` | Any raw entry written to a session's `log.jsonl` | The full JSONL record — allows SSE consumers to relay the authoritative log entry verbatim |

### `scheduler.permit.*` — Permit lifecycle

| Topic | When emitted | Data fields |
|---|---|---|
| `scheduler.permit.grant` | Permit issued | `{permit_id, session_id?, provider_id, ttl, ...}` |
| `scheduler.permit.deny` | Permit refused | `{session_id?, reason, gate, details?, retry_after_seconds?}` |
| `scheduler.permit.release` | Permit explicitly released | `{permit_id, session_id?}` |
| `scheduler.permit.expired` | TTL timer reclaimed the permit | `{permit_id, session_id?}` |

### `scheduler.*` — Scheduler state

| Topic | When emitted | Data fields |
|---|---|---|
| `scheduler.limits.changed` | `PUT /v1/scheduler/limits` succeeds | `{limits}` — full limits object |
| `scheduler.burn_rate_exceeded` | Burn-rate gate (tokens-in or commits-out) breached | `{session_id, observed, threshold}` |

### `provider.*` — Provider state

| Topic | When emitted | Data fields |
|---|---|---|
| `provider.health` | Provider cooldown entered/exited, or failure classification updated | Health state object |
| `provider.quota` | Quota probe result from a provider adapter | `{provider_id, remaining, reset_at}` |
| `provider.override.changed` | `PUT /v1/providers/overrides` succeeds | New overrides document |

### `workspace.*` — Workspace lifecycle

| Topic | When emitted | Data fields |
|---|---|---|
| `workspace.created` | Workspace registered | `{workspace_id, name, description?, ...}` |
| `workspace.updated` | Workspace name or description changed | `{workspace_id, name?, description?, updated_at}` |
| `workspace.archived` | Workspace archived | `{workspace_id, archived_at}` |
| `workspace.project_added` | Project added to workspace | `{workspace_id, project_id, role}` |
| `workspace.project_removed` | Project removed from workspace | `{workspace_id, project_id}` |

### `agent.*` — Agent runtime

| Topic | When emitted | Data fields |
|---|---|---|
| `agent.chunk` | Streaming content from a provider turn | `{session_id, turn_id, sequence, type, content, final}` — see `agent.chunk` payload below |

**`agent.chunk` payload shape:**

```typescript
type AgentChunkData = {
  readonly session_id: string;
  readonly turn_id: string;
  readonly parent_id?: string;      // set when this turn belongs to an orchestrator session
  readonly sequence: number;         // monotonically increasing per turn
  readonly type: "text" | "reasoning" | "usage" | "error" | "result";
  readonly content: {
    readonly delta?: string;        // for type=text, reasoning
    readonly summary?: string;       // for final=true
    readonly tokens?: number;        // for type=usage
    readonly cost_usd?: number;      // for type=usage
    readonly error?: string;         // for type=error
    readonly result?: unknown;       // for type=result — submit payload
  };
  readonly final: boolean;           // true = last chunk for this turn
};
```

### `daemon.*` — Daemon-wide

| Topic | When emitted | Data fields |
|---|---|---|
| `daemon.log` | Daemon stdout line relayed over SSE | `{level, message, fields?}` |

### `warning.*` — Client-side signals

| Topic | When emitted | Data fields |
|---|---|---|
| `warning.dropped` | SSE client buffer overflow | `{dropped_count}` |

---

## Projectors

A **projector** is a pure function that consumes events and updates a SQLite projection. Projectors are stateless — they read an event and call SQLite. The same projector run over the full JSONL history produces the same state as running it incrementally.

Projectors implement the `Projector` interface:

```typescript
interface Projector {
  readonly name: string;
  apply(db: Database, event: EventEnvelope): void;
}
```

Projectors are registered on `createEventWriter`. Every `append` call first writes the JSONL line, then calls every registered projector in order. If a projector `apply` throws, the SQLite transaction rolls back — the JSONL write is already permanent (append-only), but the projection stays consistent.

### Built-in projectors

**`EventCountsProjector`** — maintains `event_counts` table: per-topic total event count.

**`PermitProjector`** — maintains active permit state:
- `permit.grant` → inserts/upserts into `permits` table
- `permit.release` / `permit.expired` → deletes from `permits` table

**`SchedulerMetricsProjector`** — maintains counters in `scheduler_metrics` table:
- `permit.deny` → increments `permit_denial_total{gate}` and `permit_decision_total`
- `permit.grant` → increments `permit_decision_total`

**`WorkspaceProjector`** — maintains workspace and workspace-project state:
- `workspace.created` → inserts workspace
- `workspace.updated` → updates workspace
- `workspace.archived` → archives workspace
- `workspace.project_added` → inserts/updates workspace-project role
- `workspace.project_removed` → deletes workspace-project link

### Running a projector

```typescript
projector.runProjector(db, events: AsyncIterable<EventEnvelope>): Promise<void>
```

Runs over the full event history. On completion, the projection reflects all events seen. Partial runs are safe — running again from the start is idempotent.

### Rebuilding projections

Because projections are rebuildable from JSONL:

```bash
# Rebuild all projections from JSONL
cat ~/.aloop/state/sessions/*/s_*/log.jsonl | jq --slurp 'sort_by(.id)' | node rebuild-projections.js
```

The rebuild procedure:
1. Open a fresh SQLite database with the current schema.
2. Instantiate all projectors.
3. Stream all `log.jsonl` files in `id` order across all sessions.
4. Call `projector.apply(db, event)` for each event.
5. Verify `projector.name` checkpoint at the end.

---

## Metrics from projections

Metrics are computed at read time from SQLite projections. No agent emits a metric value that gates its own permits — this is enforced structurally (CONSTITUTION.md §IX.36).

**Scheduler metrics (from `scheduler_metrics` projection):**

| Metric | Formula |
|---|---|
| `permit_decision_total` | `SUM(value) WHERE metric_name = 'permit_decision_total'` |
| `permit_denial_total` | `SUM(value) WHERE metric_name = 'permit_denial_total'` |
| `permit_denial_rate` | `permit_denial_total / seconds_since_oldest_denial` |
| `permit_denial_rate_per_gate` | `permit_denial_total{gate} / seconds_since_oldest_denial` |

**Provider health (from `provider_health` table):**

| Field | Source |
|---|---|
| `cooldown_until` | Last `provider.health` event with `cooldown: true` |
| `failure_class` | Last `provider.health` event with `class` |
| `quota_remaining` | Last `provider.quota` event |

**Burn rate (daemon-computed, not agent-reported):**

| Metric | Source |
|---|---|
| `tokens_since_commit` | Counted from `agent.chunk` events with `type: "usage"` in the session |
| `commits_since_start` | Counted from git log in worktree |
| `burn_rate_exceeded` | `scheduler.burn_rate_exceeded` event |

---

## Rebuildability contract

Per CONSTITUTION.md §IV.15: **JSONL is the authoritative event log. SQLite is a queryable projection. On corruption or schema change, SQLite is rebuildable from JSONL. JSONL is never rebuildable from SQLite.**

Implications:

1. **JSONL writes are never skipped.** Every `append` call produces one line in the file, regardless of whether the SQLite write succeeds.
2. **Projectors are deterministic.** Running the same projector over the same events in the same order always produces the same result.
3. **Schema migrations never mutate JSONL.** If a schema change requires a different projection shape, the new projector is run over the existing JSONL history.
4. **Idempotent projectors.** All built-in projectors use `ON CONFLICT DO UPDATE` or delete-then-insert, so re-running over already-projected events is safe.
5. **No synthetic data in projections.** If a metric cannot be computed from events, the endpoint returns the metric as absent — never a fabricated value.
