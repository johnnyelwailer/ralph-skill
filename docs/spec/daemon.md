# Daemon

> **Reference document.** Invariants and contracts for the `aloopd` daemon — the long-running service that owns session state, scheduling, and event aggregation.
>
> Hard rules live in CONSTITUTION.md. Work items live in GitHub issues.

## Table of contents

- Role
- Process model
- State layout
- Project registry (multi-project)
- Session kinds
- Scheduler authority
- Watchdog / reconcile jobs
- Configuration
- Lifecycle (install, start, upgrade, crash)
- Forward-compat: distribution seams

---

## Role

`aloopd` is the single process that owns:

- **Active sessions** and their state machines
- **Provider health, quota, and cooldown** state
- **Scheduler permits** — the truth on what runs when
- **Event aggregation** from all sessions into per-session JSONL + the global event bus
- **Project registry** — the set of repos known to this machine
- **Overrides** — live allow/deny/force policy for providers

CLI (`aloop`), dashboard, bots, and scripts never bypass the daemon. Every action goes through the HTTP API. There are no side channels, no direct filesystem manipulations by clients, no "just drop a file and hope."

## Process model

Single daemon per host. One SQLite file, one set of JSONL logs, one HTTP listener, one scheduler. Lock file at `~/.aloop/aloopd.pid` enforces singleton.

The daemon hosts workers **in-process** in v1. A worker is the code path that runs a session's turns — spawns provider CLIs, reads output, writes events. In v2 workers may decompose into separate processes on separate VMs (see distribution seams).

No forking per session in v1. Every session runs on the daemon's event loop with per-turn timeouts and cancellation tokens. Provider CLIs are spawned as child processes; the daemon supervises them.

## State layout

```
~/.aloop/
  daemon.yml                    daemon configuration (port, autostart, defaults)
  aloopd.pid                    singleton lock
  aloopd.sock                   unix socket (optional, future)
  overrides.yml                 persisted provider overrides
  token                         bearer token (for remote/tunneled access)
  state/
    db.sqlite                   queryable state: sessions, permits, projects, health
    sessions/<id>/
      log.jsonl                 authoritative event history
      worktree/                 git worktree (for standalone/child sessions)
      artifacts/                proof artifacts per iteration
```

**Split of responsibility:**

- `db.sqlite` — **queryable current state**. What is *true now*. Indexed for fast list/filter (active sessions by project, permits in-flight, provider health snapshot).
- `log.jsonl` — **authoritative history**. What *happened*. Append-only, `fsync` per line, crash-safe. Replayable.

The two never overlap. SQLite is a projection of truth; JSONL is the truth. On corruption or schema change, SQLite is rebuildable from JSONL via a deterministic projector.

## Project registry

The daemon serves N unrelated repositories on one host.

**Registry table (SQLite):**
- `id` — uuid
- `abs_path` — canonicalized absolute path (unique key)
- `name` — defaults to basename of `abs_path`
- `added_at`, `last_active_at`

**Per-project config** at `<abs_path>/.aloop/config.yml` — pipeline, provider chain, validation commands, safety rules. Daemon reads on session start; does not cache across sessions unless a file watcher invalidates.

**Daemon-level config** at `~/.aloop/daemon.yml` — port, autostart, global defaults used when project config is silent.

**Inference and resolution:**
- `aloop start` invoked in a directory walks up for `.aloop/` to find the project. Explicit `--project <path>` overrides.
- CLI resolves `abs_path` → `project_id` via `GET /v1/projects?path=<abs_path>`. Unknown path → `POST /v1/projects` registers it.
- Every session op in the API carries `project_id`. No path walking in the daemon.

**Isolation:**
- A session from project A cannot read project B's worktree, config, secrets, or event log.
- Scheduler permits are **global** (one host, one daemon, one set of quotas) but session data is project-scoped.
- Deleting a project soft-deletes its sessions (moved to `archived`), does not reclaim disk until `aloop project purge <id>`.

## Session kinds

Three kinds, one table, same API.

| Kind | Has worktree | Has parent | Can create children | Runs workflow |
|---|---|---|---|---|
| `standalone` | yes | no | no | plan-build-review, single, etc. |
| `orchestrator` | no (or read-only project root) | no | yes | orchestrator.yaml |
| `child` | yes | yes (link to orchestrator) | no (no grandchildren) | plan-build-review, review-only, etc. |

**Session row (SQLite `sessions` table):**
- `id`, `project_id`, `kind`, `parent_session_id`
- `workflow` — which compiled `loop-plan.json` is active
- `provider_chain` — resolved ordered chain for this session (opencode → copilot → ...)
- `status` — `pending`, `running`, `paused`, `completed`, `failed`, `interrupted`, `archived`
- `worktree_path` — null for orchestrator
- `created_at`, `updated_at`, `ended_at`
- `cost_usd`, `tokens_in`, `tokens_out`, `commits` — running aggregates updated from events

**Parent/child:**
- Orchestrator creates a child via the same API — `POST /v1/sessions` with `parent_session_id` set. Nesting is enforced (no grandchildren) server-side.
- Orchestrator **observes** its children's events by subscribing to `/v1/events?parent=<id>` over SSE. Self-healing logic lives in the orchestrator *workflow*, not in a daemon-side daemon.
- Kill semantics: `DELETE` on a child ends only that child. `DELETE` on an orchestrator cascades to all its children with a grace period, then force-stops.

## Scheduler authority

The scheduler is the **only gate** between a turn being "wanted" and a turn being "started." Every turn — standalone, orchestrator, child — acquires a permit first.

**Permit gates (composed, all must grant):**

1. **Concurrency gate** — total in-flight turns ≤ configured cap.
2. **System gate** — CPU, memory, load under thresholds (from daemon config or live metrics).
3. **Provider gate** — per-provider quota probe (for providers that expose one: claude, gemini APIs) or backoff state (for those that don't: opencode, copilot, codex CLIs).
4. **Burn-rate gate** — session's tokens-spent / commits-produced ratio below threshold.
5. **Overrides gate** — provider not on deny list; if `force` is set, only that provider can acquire.
6. **Project gate** (optional) — per-project concurrency cap and daily cost cap if configured.

**Permit lifecycle:**
- `POST /v1/scheduler/permits` — acquire. Body: `{ session_id, provider_candidate, estimated_cost }`. Returns granted permit with `ttl` or denial with reason.
- Permit is written to SQLite before the turn starts. Survives daemon crash (the turn is marked interrupted on restart if the permit is found in-flight).
- Turn completion → `DELETE /v1/scheduler/permits/:id` releases.
- TTL expiry without release → scheduler reclaims, emits `scheduler.permit.expired`.

**No process-local permits.** Even in-daemon code talks to the scheduler over HTTP. This is the single most important forward-compat move.

## Watchdog / reconcile jobs

Internal to the daemon, not external cron. Run on a tick (default 15s, configurable):

| Job | Purpose | Action on hit |
|---|---|---|
| **Stuck session** | No events for `stuck_threshold` (default 10m) | Emit `session.stuck`; orchestrator (if parent) gets a diagnose trigger; CLI/dashboard subscribers see it |
| **Provider health refresh** | Poll quota endpoints where supported | Update `provider.health`, adjust cooldowns |
| **Permit expiry sweep** | Release expired permits | Reclaim capacity, emit event |
| **Orphan worker** | Child process has no corresponding session | Kill process, log |
| **Burn-rate watch** | Per-session token/commit ratio | Deny future permits for that session, emit `scheduler.burn_rate_exceeded` |
| **Crash recovery** | At startup only: scan sessions marked `running` | Move to `interrupted`, offer resume via API |

All watchdog findings publish events on the global bus. Self-healing behavior is an **orchestrator workflow** subscribing to those events — not daemon-side logic.

## Configuration

`~/.aloop/daemon.yml` (example, all fields optional):

```yaml
http:
  bind: 127.0.0.1
  port: 7777                 # null or absent = pick available and write back
  autostart: true            # CLI autostarts daemon on first use
scheduler:
  concurrency_cap: 3
  system_limits:
    cpu_max_pct: 80
    mem_max_pct: 85
    load_max: 4.0
  burn_rate:
    max_usd_per_commit: 5.00
    min_commits_per_hour: 1
watchdog:
  tick_interval: 15s
  stuck_threshold: 10m
logging:
  level: info
  path: ~/.aloop/state/aloopd.log
retention:
  completed_sessions_days: 30
  interrupted_sessions_days: 90
```

Daemon **fails loud** if a value is referenced in code but missing from config and has no documented default. No silent fallbacks.

`PUT /v1/daemon/config` hot-reloads the non-listener parts (scheduler limits, watchdog, burn-rate, logging level). HTTP bind/port require restart.

## Lifecycle

### Install

`aloop install` detects the init system and installs a service unit:

- Linux: systemd user unit at `~/.config/systemd/user/aloopd.service`
- macOS: launchd agent at `~/Library/LaunchAgents/ai.aloop.daemon.plist`
- Windows: NSSM service wrapping `aloopd.exe`

`aloop uninstall` reverses it.

### Start / stop

- `aloop daemon start` — idempotent, returns when HTTP is ready
- `aloop daemon stop` — graceful (drain in-flight turns up to grace period, then force)
- `aloop daemon status` — health check
- `aloop daemon restart` — stop + start

### Auto-start

CLI commands that need the daemon check `GET /v1/daemon/health`. If no response within 500ms and autostart is enabled, CLI runs `aloop daemon start` and retries. Opt-out: `ALOOP_NO_AUTOSTART=1`.

### Upgrade

1. `aloop daemon stop` (graceful)
2. Replace binary
3. `aloop daemon start` — runs state migrations from `schema_version` in SQLite before opening the port

Migrations are versioned, tested, irreversible. State that fails migration goes to `state/quarantine/`.

### Crash recovery

On startup the daemon scans the `sessions` table for rows with `status=running`:

- Mark `status=interrupted`.
- Read the tail of their JSONL to know the last recorded event.
- Emit `session.interrupted` events so clients update.
- Offer resume via `POST /v1/sessions/:id/resume`.

Permits held at crash time are released on startup (their TTL would have expired anyway). In-flight provider processes that survived the daemon crash become orphans; the watchdog kills them on first tick.

## Forward-compat: distribution seams

v1 is single-host. v2+ may run the daemon as a backend service with session workers on separate VMs. The following seams exist in v1 so that transition is a deployment change, not a rewrite.

### Seam 1: API is the only boundary

Everything a client (CLI, dashboard, bot, remote worker) does goes through the HTTP API. There are no internal-only mechanisms. This is already how v1 is designed.

### Seam 2: `StateStore` adapter

SQLite operations are behind a `StateStore` interface. v1 implementation: SQLite. v2 implementation: Postgres. Interface covers the full set of queries the daemon makes — no raw SQL outside the adapter.

### Seam 3: `EventStore` adapter

JSONL writes go through an `EventStore` interface. v1 implementation: local per-session files. v2 implementation: local ring buffer + write-through to object storage (S3-compatible), with `GET /events` paginating across both. Read path is the same.

### Seam 4: `ProjectAdapter`

Worktree operations (open, list, diff, commit) go through `ProjectAdapter`. v1 implementation: local filesystem (~50 LOC). v2 worker implementation: clone the repo onto the worker's VM, operate against the clone, push back via gh/git.

### Seam 5: `WorkerAdapter`

The code path that runs a turn is behind `WorkerAdapter.runTurn(turnSpec): AsyncGenerator<AgentChunk>`. v1 implementation: in-process (direct function call, still emits events through the event bus). v2 implementation: HTTP to a remote worker that implements the same interface.

Worker identity is an event field (`worker_id`). v1 always emits `"local"`. v2 emits the worker's assigned ID. Dashboard groups events by worker without knowing which era it's in.

### Seam 6: Scheduler as HTTP service

Already designed that way. Permit acquire/release are HTTP calls, not function calls, even in-daemon. v2 deployment can split the scheduler onto its own replica without touching worker code.

### Seam 7: Event publication is async batched

Workers (in-proc in v1, remote in v2) accumulate events in a local buffer and POST them to `POST /v1/events` in batches (every 100ms or 1KB, whichever first). The daemon's own in-proc worker uses the same batching path — "it's HTTP all the way down" is the mental model.

### What v1 explicitly does NOT implement

- Postgres, S3, object storage, remote workers, worker leases
- Any queue system (Redis, SQS, Postgres FOR UPDATE SKIP LOCKED)
- Authentication beyond "localhost = trusted"
- Container orchestration, Kubernetes primitives, gRPC meshes
- Tunneling, VPNs, multi-user

These are v2+ concerns. Mentioning them here locks the seams so we don't design ourselves into a corner.

### What v2 transition looks like (for context, not to build now)

1. Implement `Postgres` `StateStore` adapter behind the existing interface.
2. Implement `S3` `EventStore` adapter (write-through) behind the existing interface.
3. Extract `aloopd-worker` binary that hosts `WorkerAdapter` over HTTP, registers with the control plane on boot, polls for work.
4. Deploy control plane as a stateless HTTP service with Postgres + S3 behind it.
5. Deploy workers as a fleet of VMs with all 5 provider CLIs pre-installed and auth seeded per-VM.
6. API contract unchanged. CLI, dashboard, bots work against the hosted endpoint with a bearer token.

Estimated scope when the time comes: 3–4 weeks, not a rewrite. That's the payoff for treating the seams as load-bearing in v1.
