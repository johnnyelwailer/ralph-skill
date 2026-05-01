# Daemon

> **Reference document.** Invariants and contracts for the `aloopd` daemon — the long-running service that owns session state, scheduling, and event aggregation.
>
> Hard rules live in CONSTITUTION.md. Work items live in GitHub issues.

## Table of contents

- Role
- Process model
- State layout
- Incubation
- Composer turns
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

- **Incubation items, research runs, and promotion proposals**
- **Composer turns** that translate user intent into daemon-owned objects and long-running jobs
- **Active sessions** and their state machines
- **Active setup runs** and their state machines
- **Provider health, quota, and cooldown** state
- **Scheduler permits** — the truth on what runs when
- **Event aggregation** from all sessions into per-session JSONL + the global event bus
- **Project registry** — the set of repos known to this machine
- **Overrides** — live allow/deny/force policy for providers

CLI (`aloop`), dashboard, bots, and scripts never bypass the daemon. Every action goes through the HTTP API. There are no side channels, no direct filesystem manipulations by clients, no "just drop a file and hope."

## Process model

Single daemon per host. One SQLite file, one set of JSONL logs, one HTTP listener, one scheduler. Lock file at `~/.aloop/aloopd.pid` enforces singleton.

The daemon owns session execution in v1, but the execution environment is a seam. A session may run directly on the host or inside a local sandbox backend such as the project's devcontainer. In later deployments, the same seam may target offloaded sandbox infrastructure (see distribution seams).

No separate worker fleet in v1. Every session runs under daemon supervision with per-turn timeouts and cancellation tokens. Provider CLIs are spawned either directly on the host or inside the selected local sandbox backend; the daemon supervises the lifecycle either way.

## State layout

```
~/.aloop/
  daemon.yml                    daemon configuration (port, autostart, defaults)
  aloopd.pid                    singleton lock
  aloopd.sock                   unix socket (required in v1) — local clients (CLI, shim, aloop-agent) prefer this; HTTP on 127.0.0.1 for browsers (dashboard)
  overrides.yml                 persisted provider overrides
  token                         bearer token (for remote/tunneled access)
  state/
    db.sqlite                   queryable state: sessions, permits, projects, health
    incubation/
      <id>/
        log.jsonl               authoritative event history for one incubation item
        artifacts/              attachments, research outputs, transcripts, synthesis evidence
    composer/
      turns/<id>/
        log.jsonl               authoritative history for one composer control turn
    sessions/<id>/
      log.jsonl                 authoritative event history
      worktree/                 git worktree (for standalone/child sessions)
      artifacts/                proof artifacts per iteration
    setup_runs/<id>/
      log.jsonl                 authoritative event history for a setup run
      scratch/                  discovery output, drafts, ambiguity ledger, chapter state
```

**Split of responsibility:**

- `db.sqlite` — **queryable current state**. What is *true now*. Indexed for fast list/filter (active sessions by project, permits in-flight, provider health snapshot).
- `log.jsonl` — **authoritative history**. What *happened*. Append-only, `fsync` per line, crash-safe. Replayable.

The two never overlap. SQLite is a projection of truth; JSONL is the truth. On corruption or schema change, SQLite is rebuildable from JSONL via a deterministic projector.

## Incubation

Incubation is daemon-owned state for captures, research, synthesis, and explicit promotion before setup, tracker, or implementation work begins.

Practical consequences:

- An incubation item may be global, project-scoped, or tied to a candidate project path/repo.
- Background research may run for minutes or days while the item remains open.
- Monitors may schedule recurring research runs on a bounded cadence with explicit budget and alert policy.
- Research uses provider adapters and scheduler permits, but it is non-mutating by default.
- Source acquisition uses runtime extension manifests and daemon policy, not arbitrary agent network access.
- Experiment-loop attempts use the existing sandbox adapter and deterministic exec-step/event pipeline, not a separate runner.
- Outreach uses the same policy-controlled adapter pattern as tracker/provider integrations; draft/analyze is allowed before any outbound adapter exists.
- Promotion creates normal target objects through their existing APIs: setup runs, spec proposals, tracker work items, session steering, or decision records.
- Mobile web, dashboard, CLI, and bots all attach to the same item through the HTTP API.

The detailed contract lives in `incubation.md`; this document's invariant is that intake and research are durable daemon state, not client-owned conversation state.

## Composer turns

The composer is a provider-backed control agent exposed through the same API as every other client action.

Practical consequences:

- A composer turn can clarify user intent, summarize current state, prepare a proposed action, or request a daemon mutation.
- If it starts long-running work, that work is a normal daemon object: `ResearchRun`, `ResearchMonitor`, `SetupRun`, `Session`, tracker mutation, proposal, comment, or artifact.
- The composer observes child work through SQLite projections and SSE events; it does not own a hidden child-agent graph.
- Provider-backed composer turns acquire scheduler permits using `composer_turn_id`.
- Risky or durable mutations can stop at `waiting_for_approval` with a structured preview.
- The transcript is useful history, but the launched object is the source of truth.

## Project registry

The daemon serves N unrelated repositories on one host.

**Registry table (SQLite):**
- `id` — uuid
- `abs_path` — canonicalized absolute path (unique key)
- `name` — defaults to basename of `abs_path`
- `status` — `setup_pending` | `ready` | `archived`. Setup is the only writer of the transition to `ready` (see `setup.md` §Verification); sessions may only start against `ready` projects.
- `added_at`, `last_active_at`

`setup_pending` may represent an active multi-day setup orchestration, not just a newly registered repo. The daemon remains the single authority over that run's lifecycle and over the transition to `ready`.

**Per-project config** at `<abs_path>/.aloop/config.yml` — pipeline, provider chain, validation commands, safety rules. Daemon reads on session start; does not cache across sessions unless a file watcher invalidates.

**Daemon-level config** at `~/.aloop/daemon.yml` — port, autostart, global defaults used when project config is silent.

**Inference and resolution:**
- `aloop start` invoked in a directory walks up for `.aloop/` to find the project. Explicit `--project <path>` overrides.
- CLI resolves `abs_path` → `project_id` via `GET /v1/projects?path=<abs_path>`. Unknown path → `POST /v1/projects` registers it.
- Every session op in the API carries `project_id`. No path walking in the daemon.
- Setup runs are project-scoped. A project may have at most one active setup run at a time.

**Isolation:**
- A session from project A cannot read project B's worktree, config, secrets, or event log.
- A setup run from project A cannot read project B's setup workspace, drafts, comments, or discovery state.
- Scheduler permits are **global** (one host, one daemon, one set of quotas) but session data is project-scoped.
- Deleting a project soft-deletes its sessions (moved to `archived`), does not reclaim disk until `aloop project purge <id>`.

## Setup runs

Setup runs are not normal implementation sessions, but the daemon treats them with the same discipline: authoritative state, durable event history, resumability, and background child execution where applicable.

Practical consequences:

- A setup run may live for minutes or days.
- A setup run may continue background research while awaiting user input.
- CLI, dashboard, and skill/chat shells all attach to the same setup run through the HTTP API.
- A project cannot start normal sessions while its setup state is not `ready`.
- The daemon only permits setup to advance into scaffold, verification, or runtime handoff when the latest setup readiness verdict is `resolved`.

The detailed setup contract lives in `setup.md`; this document's invariant is simpler: setup is daemon-owned state, not client-owned conversation state.

## Session kinds

Three kinds, one table, same API.

| Kind | Has worktree | Has parent | Can create children | Runs workflow |
|---|---|---|---|---|
| `standalone` | yes | no | no | plan-build-review, single, etc. |
| `orchestrator` | no (or read-only project root) | no | yes | orchestrator.yaml |
| `child` | yes | yes (link to orchestrator) | no (nesting cap, `api.md`) | plan-build-review, review-only, etc. |

**Session row (SQLite `sessions` table):**
- `id`, `project_id`, `kind`, `parent_session_id`
- `workflow` — which compiled `loop-plan.json` is active
- `provider_chain` — resolved ordered chain for this session (opencode → copilot → ...)
- `status` — canonical enum: `pending | running | paused | interrupted | stopped | completed | failed | archived`. Transitions: `pending → running` (on first permit grant); `running → paused` (explicit pause) and back; `running → interrupted` (daemon crash / graceful daemon stop mid-turn); `running → stopped` (explicit `DELETE`); `running → completed` (final review approved or workflow's own exit); `running → failed` (unrecoverable error). `interrupted | stopped | paused` are resumable. `completed | failed | archived` are terminal.
- `worktree_path` — null for orchestrator
- `created_at`, `updated_at`, `ended_at`
- `cost_usd`, `tokens_in`, `tokens_out`, `commits` — running aggregates updated from events

**Parent/child:**
- Orchestrator creates a child via the same API — `POST /v1/sessions` with `parent_session_id` set. Nesting cap is API-enforced; see `api.md` §Sessions §Create.
- Orchestrator **observes** its children's events by subscribing to `/v1/events?parent=<id>` over SSE. Self-healing logic lives in the orchestrator *workflow*, not in a daemon-side daemon.
- Kill semantics: `DELETE` on a child ends only that child. `DELETE` on an orchestrator cascades to all its children with a grace period, then force-stops.

## Scheduler authority

The scheduler is the **only gate** between a provider turn being "wanted" and a provider turn being "started." Every provider-backed turn — standalone, orchestrator, child, composer, or incubation research — acquires a permit first.

**Permit gates (composed, all must grant):**

1. **Concurrency gate** — total in-flight turns ≤ configured cap.
2. **System gate** — CPU, memory, load under thresholds (from daemon config or live metrics).
3. **Provider gate** — per-provider quota probe (for providers that expose one: claude, gemini APIs) or backoff state (for those that don't: opencode, copilot, codex CLIs).
4. **Burn-rate gate** — session's tokens-spent / commits-produced ratio below threshold.
5. **Overrides gate** — provider not on deny list; if `force` is set, only that provider can acquire.
6. **Project gate** (optional) — per-project concurrency cap and daily cost cap if configured.

**Permit lifecycle:**
- `POST /v1/scheduler/permits` — acquire. Body: `{ session_id? | research_run_id?, provider_candidate, estimated_cost }`. Returns granted permit with `ttl` or denial with reason.
- Permit is written to SQLite before the turn starts. Survives daemon crash (the turn is marked interrupted on restart if the permit is found in-flight).
- Turn completion → `DELETE /v1/scheduler/permits/:id` releases.
- TTL expiry without release → scheduler reclaims, emits `scheduler.permit.expired`.

**Permit TTL.** Default 600 seconds, configurable in `daemon.yml` (`scheduler.permit_ttl_default`). Longer-running turns request longer TTLs at acquire time (capped by `scheduler.permit_ttl_max`, default 1 hour). Expired permits are reclaimed by the watchdog's permit-expiry-sweep job.

**In-proc in v1, HTTP-ready for v2.** In v1, in-daemon callers invoke the scheduler through a typed interface that implements the same contract as the HTTP endpoint — no local HTTP hop per permit. The HTTP path exists so a v2 split (scheduler on its own replica, or workers on remote VMs) is a deployment change. No process-local permits — even the in-proc path goes through the scheduler's single authority.

## Watchdog / reconcile jobs

Internal to the daemon, not external cron. Run on a tick (default 15s, configurable):

| Job | Purpose | Action on hit |
|---|---|---|
| **Stuck session** | No events for `stuck_threshold` (default 10m) | Emit `session.stuck`; orchestrator (if parent) gets a diagnose trigger; CLI/dashboard subscribers see it |
| **Provider health refresh** | Poll quota endpoints where supported | Update `provider.health`, adjust cooldowns |
| **Permit expiry sweep** | Release expired permits | Reclaim capacity, emit event |
| **Orphan worker** | Child process has no corresponding session | Kill process, log |
| **Burn-rate watch** | Per-session token/commit ratio | Deny future permits for that session, emit `scheduler.burn_rate_exceeded` |
| **Incubation monitor tick** | Monitor `next_run_at` is due and budget/policy permits | Create a normal research run with `monitor_id`, emit `incubation.monitor.update` |
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

Two modes:

**Config hot-reload** (no restart):

- Change `~/.aloop/daemon.yml`, `~/.aloop/overrides.yml`, or project-level `aloop/config.yml`.
- `POST /v1/daemon/reload` re-reads the files. Scheduler limits, retention, overrides, project status maps are applied on the next permit acquire / next session start — in-flight turns are never mutated.
- HTTP bind/port require a daemon restart — they cannot hot-reload.

**Binary / code upgrade** (restart required):

1. `aloop daemon stop` (graceful — drains in-flight turns up to grace period, then force).
2. Replace binary.
3. `aloop daemon start` — runs state migrations from `schema_version` in SQLite before opening the listener.

Migrations are versioned, tested, irreversible. State that fails migration goes to `state/quarantine/`.

**Session-ID stability.** Session IDs are stable across minor-version upgrades. A major-version upgrade may require a migration that rewrites IDs; if so, the migration preserves a mapping in a `session_id_migrations` table for API callers holding stale IDs.

Zero-downtime code swap is NOT a v1 goal. A restart is the supported path; the graceful drain + permit reclaim on restart produces minimal disruption (sessions resume on daemon start via the interrupted flow).

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

### Seam 5: `SandboxAdapter`

The execution environment for a session sits behind `SandboxAdapter`. Conceptually it owns:

- provisioning or attaching to the session sandbox
- hydrating the worktree into that environment
- executing provider turns there
- streaming chunks/events back to the daemon
- collecting artifacts and terminating or retaining the sandbox

v1 implementations are local: host execution and project devcontainer execution. The planned next step is to map this seam to `sandbox-core` so aloop can target local Docker and hosted backends through one abstraction. A later hosted deployment may then place each loop in its own offloaded sandbox without changing the orchestrator, API, or tracker logic.

### Seam 6: Scheduler as HTTP service

Already designed that way. Permit acquire/release are HTTP calls, not function calls, even in-daemon. v2 deployment can split the scheduler onto its own replica without touching worker code.

### Seam 7: Event publication is async batched

Execution backends (host, devcontainer, or future offloaded sandbox) accumulate events in a local buffer and POST them to `POST /v1/events` in batches (every 100ms or 1KB, whichever first). The daemon's own local execution path uses the same batching model — "it's HTTP all the way down" is the mental model.

### What v1 explicitly does NOT implement

- Postgres, S3, object storage, offloaded sandbox fleets, sandbox leases
- Any queue system (Redis, SQS, Postgres FOR UPDATE SKIP LOCKED)
- Authentication beyond "localhost = trusted"
- Container orchestration, Kubernetes primitives, gRPC meshes
- Tunneling, VPNs, multi-user

These are v2+ concerns. Mentioning them here locks the seams so we don't design ourselves into a corner.

### What v2 transition looks like (for context, not to build now)

1. Implement `Postgres` `StateStore` adapter behind the existing interface.
2. Implement `S3` `EventStore` adapter (write-through) behind the existing interface.
3. Implement a `sandbox-core`-backed `SandboxAdapter` for hosted sandboxes.
4. Deploy control plane as a stateless HTTP service with Postgres + S3 behind it.
5. Deploy sandbox capacity as a fleet of VMs / containers with the required provider CLIs, auth, and runtime profiles pre-seeded.
6. API contract unchanged. CLI, dashboard, bots work against the hosted endpoint with a bearer token.

Estimated scope when the time comes: 3–4 weeks, not a rewrite. That's the payoff for treating the seams as load-bearing in v1.
