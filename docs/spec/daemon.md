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
- Workspace registry
- Project registry (multi-project)
- Session kinds
- Scheduler authority
- Watchdog / reconcile jobs
- Configuration
- Lifecycle (install, start, upgrade, crash)
- Deployment seams

---

## Role

`aloopd` is the durable control plane that owns:

- **Incubation items, research runs, and promotion proposals**
- **Composer turns** that translate user intent into daemon-owned objects and long-running jobs
- **Active sessions** and their state machines
- **Active setup runs** and their state machines
- **Provider health, quota, and cooldown** state
- **Scheduler permits** — the truth on what runs when
- **Triggers** — durable time/event rules that create daemon-owned work
- **Event aggregation** from all sessions into per-session JSONL + the global event bus
- **Workspace registry** — human/operator groupings across projects and repos
- **Project registry** — the set of repos/projects known to this control plane
- **Overrides** — live allow/deny/force policy for providers

CLI (`aloop`), dashboard, bots, and scripts never bypass the daemon. Every action goes through the HTTP API. There are no side channels, no direct filesystem manipulations by clients, no "just drop a file and hope."

## Process model

Primary deployment: one always-reachable control plane service backed by durable state, plus a pool of isolated workers. Workers may be containers, VMs, managed jobs, local sandboxes, or nodes. A worker leases one bounded unit of execution, reports events/artifacts through the API, and can be replaced without losing control-plane truth.

Fully local deployment remains supported by collapsing the same pieces onto one machine: control plane process, SQLite or local Postgres, JSONL/local files, and host/devcontainer/local Docker workers. In that profile, the lock file at `~/.aloop/aloopd.pid` enforces singleton for the local control plane.

The daemon owns session execution policy, scheduling, leases, timeouts, and cancellation. The actual provider CLI or deterministic runtime may run directly on the local host, inside a devcontainer, inside a container job, on a VM, or behind a sandbox backend. The worker is execution capacity; the daemon is authority.

## State layout

Durable deployments use the same logical state split with different backing stores:

- Postgres for queryable current state and projections.
- Object/artifact storage for append-only event history, artifacts, transcripts, media, and research/source records.
- Worker-local files only as cache/scratch; worker loss must not destroy authoritative state.

Fully local deployments may use the file layout below as the concrete backing for the same interfaces:

```
~/.aloop/
  daemon.yml                    daemon configuration (port, autostart, defaults)
  aloopd.pid                    singleton lock
  aloopd.sock                   unix socket (required in v1) — local clients (CLI, shim, aloop-agent) prefer this; HTTP on 127.0.0.1 for browsers (dashboard)
  overrides.yml                 persisted provider overrides
  token                         bearer token (for remote/tunneled access)
  state/
    db.sqlite                   queryable daemon-native state and projections:
                                workspaces, projects, incubation, setup, sessions,
                                permits, provider health, metrics, tracker projections
    incubation/
      <id>/
        log.jsonl               authoritative event history for one incubation item
        artifacts/              attachments, research outputs, transcripts, synthesis evidence
    composer/
      turns/<id>/
        log.jsonl               authoritative history for one composer control turn
      subagents/<id>/
        log.jsonl               authoritative history for one scoped control subagent run
    sessions/<id>/
      log.jsonl                 authoritative event history
      worktree/                 git worktree (for standalone/child sessions)
      artifacts/                proof artifacts per iteration
    setup_runs/<id>/
      log.jsonl                 authoritative event history for a setup run
      scratch/                  discovery output, drafts, ambiguity ledger, chapter state
```

**Split of responsibility:**

- `StateStore` — **queryable current state**. What is *true now*. Indexed for fast list/filter across daemon-native objects and projections: workspaces, projects, incubation, setup, sessions, permits, provider health, tracker projections, metrics. Postgres is the primary durable implementation; SQLite is the local/single-node implementation.
- `EventStore` — **authoritative history**. What *happened*. Append-only, crash-safe, replayable. Object storage is the primary durable implementation; JSONL is the local/single-node implementation.

The two never overlap. Queryable state is a projection of truth; append-only event history is the truth. On corruption or schema change, projections are rebuildable from event history via a deterministic projector.

Tracker adapters are not the daemon's database. They are external/offline projection and mutation surfaces for the work-tracker subset. GitHub can own GitHub-native issues and PRs; the built-in tracker can own local Epic/Story/change-set files; neither owns workspaces, incubation, setup internals, scheduler state, provider health, metrics, artifacts, or composer/subagent history.

## Incubation

Incubation is daemon-owned state for captures, research, synthesis, and explicit promotion before setup, tracker, or implementation work begins.

Practical consequences:

- An incubation item may be global, project-scoped, or tied to a candidate project path/repo.
- Background research may run for minutes or days while the item remains open.
- Monitors may schedule recurring research runs on a bounded cadence with explicit budget and alert policy.
- Monitor cadence is backed by the daemon trigger engine, so monitors can fire from time intervals, relevant source events, or explicit manual refresh requests.
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

- A composer turn can clarify user intent, summarize current state, prepare a proposed action, or delegate specialized work to scoped control subagents.
- Composer input is multimodal; images, audio, video, documents, URLs, logs, and diffs are normalized into artifacts, transcripts, OCR, source records, or typed text records before provider reasoning.
- Voice input is first-class. The daemon chooses native speech handling when the selected provider supports it, otherwise routes through a configured fallback transcriber and records transcript provenance.
- If it starts long-running work or changes control-plane state, that effect is a normal daemon object or mutation: `Project`, `ResearchRun`, `ResearchMonitor`, `SetupRun`, `Session`, tracker mutation, provider override, scheduler limit change, config patch, proposal, comment, or artifact.
- Specialized control subagents run with isolated role/scope/capability grants. They can inspect and propose within their scope; the daemon performs final mutations after policy and approval checks.
- The composer observes child work through SQLite projections and SSE events; it does not own a hidden child-agent graph.
- Provider-backed composer turns acquire scheduler permits using `composer_turn_id`.
- Risky or durable mutations can stop at `waiting_for_approval` with a structured preview.
- Project registration, project setup, provider overrides, scheduler limits, daemon config, project config, tracker writes, outreach, session starts, and destructive actions are always policy-checked and audited through the same path as structured UI/API requests, whether initiated by UI controls, composer, or a control subagent.
- The transcript is useful history, but the launched object is the source of truth.

## Workspace registry

A workspace is a human/operator grouping. It can represent a product, client, company, initiative, research area, or any other durable context the user wants to operate from.

Important properties:

- A workspace can contain multiple projects and therefore multiple Git repositories.
- A workspace can exist before any repo exists.
- A project can belong to more than one workspace.
- Workspaces are not runnable. They do not own sessions, worktrees, setup readiness, or tracker mutations directly.
- Workspace-scoped incubation, research, dashboards, budgets, and defaults are allowed, but execution always resolves to one or more projects before sessions start.

**Workspace tables (StateStore):**
- `workspaces` — `id`, `name`, `description`, `default_project_id?`, `metadata`, `created_at`, `updated_at`, `archived_at?`
- `workspace_projects` — `workspace_id`, `project_id`, `role`, `added_at`

## Project registry

The daemon serves N projects in one control plane. A project is the smallest setup-gated and runnable aloop unit. It usually maps to a Git repository or a subfolder of a monorepo, but it is not the same thing as a workspace.

**Registry table (StateStore):**
- `id` — uuid
- `workspace_ids` — projection from `workspace_projects`; a project may be in zero, one, or many workspaces
- `abs_path` — canonicalized absolute path (unique key)
- `repo_url?` — optional remote URL when known
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
- Workspace context can supply defaults and navigation scope, but it never replaces `project_id` on session/setup/tracker operations.

**Isolation:**
- A session from project A cannot read project B's worktree, config, secrets, or event log.
- A setup run from project A cannot read project B's setup workspace, drafts, comments, or discovery state.
- Scheduler permits are **global to the control plane** but session data is project-scoped.
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

**Session row (StateStore `sessions` table):**
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
- Permit is written to `StateStore` before the turn starts. Survives control-plane restart (the turn is marked interrupted on restart if the permit is found in-flight).
- Turn completion → `DELETE /v1/scheduler/permits/:id` releases.
- TTL expiry without release → scheduler reclaims, emits `scheduler.permit.expired`.

**Permit TTL.** Default 600 seconds, configurable in `daemon.yml` (`scheduler.permit_ttl_default`). Longer-running turns request longer TTLs at acquire time (capped by `scheduler.permit_ttl_max`, default 1 hour). Expired permits are reclaimed by the watchdog's permit-expiry-sweep job.

**One contract, multiple placements.** In-process callers may invoke the scheduler through a typed interface that implements the same contract as the HTTP endpoint — no local HTTP hop per permit. Remote workers use the HTTP path. No process-local permits — every path goes through the scheduler's single authority.

## Trigger engine

The trigger engine is the daemon-owned primitive for durable scheduling. It decides **when to create or refresh work**; it does not grant provider capacity. Any provider-backed work it creates still goes through scheduler permits.

Supported trigger sources:

| Source | Examples | Target action |
|---|---|---|
| `time` | every two weeks, every Monday, cron expression, one-shot reminder | create a research run, run reconcile, refresh proposal |
| `event` | `provider.model_catalog.changed`, `model_intelligence.candidate_recorded`, `metrics.change`, `provider.health`, tracker human comment | create a research run, queue diagnose, refresh candidate proposal |
| `manual` | dashboard/CLI/composer "run now" | fire the same target immediately with audit trail |

Trigger actions are typed, not arbitrary code:

- `create_research_run`
- `tick_monitor`
- `queue_orchestrator_trigger`
- `refresh_projection`
- `create_proposal`
- `emit_alert`

Rules are structured filters over event topics, labels, thresholds, and object scope. No inline JavaScript, shell, or prompt-defined expressions live in trigger definitions. If a project needs custom signal detection, it must be a typed runtime extension that emits a normal event; the trigger engine consumes that event.

Trigger rows live in `StateStore` and emit `trigger.fired`, `trigger.skipped`, and `trigger.failed` events. Firing is idempotent by `(trigger_id, scheduled_for | source_event_id, target_kind)` so daemon restart or SSE replay cannot duplicate work.

## Watchdog / reconcile jobs

Internal to the daemon, not external cron. These are built-in trigger/reconcile rules. Time-based rules run on a tick (default 15s, configurable); event-based rules evaluate from the event bus:

| Job | Purpose | Action on hit |
|---|---|---|
| **Stuck session** | No events for `stuck_threshold` (default 10m) | Emit `session.stuck`; orchestrator (if parent) gets a diagnose trigger; CLI/dashboard subscribers see it |
| **Provider health refresh** | Poll quota endpoints where supported | Update `provider.health`, adjust cooldowns |
| **Permit expiry sweep** | Release expired permits | Reclaim capacity, emit event |
| **Orphan worker** | Child process has no corresponding session | Kill process, log |
| **Burn-rate watch** | Per-session token/commit ratio | Deny future permits for that session, emit `scheduler.burn_rate_exceeded` |
| **Incubation monitor tick** | Monitor time trigger or matching event trigger fires and budget/policy permits | Create a normal research run with `monitor_id`, emit `incubation.monitor.update` |
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
3. `aloop daemon start` — runs state migrations from `schema_version` in `StateStore` before opening the listener.

Migrations are versioned, tested, irreversible. State that fails migration goes to `state/quarantine/`.

**Session-ID stability.** Session IDs are stable across minor-version upgrades. A major-version upgrade may require a migration that rewrites IDs; if so, the migration preserves a mapping in a `session_id_migrations` table for API callers holding stale IDs.

Zero-downtime code swap is NOT a v1 goal. A restart is the supported path; the graceful drain + permit reclaim on restart produces minimal disruption (sessions resume on daemon start via the interrupted flow).

### Crash recovery

On startup the daemon scans the `sessions` table for rows with `status=running`:

- Mark `status=interrupted`.
- Read the tail of their event history to know the last recorded event.
- Emit `session.interrupted` events so clients update.
- Offer resume via `POST /v1/sessions/:id/resume`.

Permits held at crash time are released on startup (their TTL would have expired anyway). In-flight provider processes that survived the daemon crash become orphans; the watchdog kills them on first tick.

## Deployment seams

The product center is a durable backend service with session/setup/research workers on separate VMs, containers, local sandboxes, or managed job runners. A fully local install is the same model collapsed into one process and one machine. The following seams are not speculative; they are the way the system avoids baking "laptop loop" assumptions into the core.

The target is cloud portability, not one blessed cloud. Azure should be straightforward, but so should AWS, GCP, Fly.io, Render, Railway, DigitalOcean, Hetzner, bare-metal Docker, and Kubernetes.

### Seam 1: API is the only boundary

Everything a client (CLI, dashboard, bot, remote worker) does goes through the HTTP API. There are no internal-only mechanisms. This is already how v1 is designed.

### Seam 2: `StateStore` adapter

State operations are behind a `StateStore` interface. Primary durable implementation: Postgres. Local/single-node implementation: SQLite. Interface covers the full set of queries the daemon makes — no raw SQL outside the adapter.

Portable mappings:

- Azure Database for PostgreSQL
- AWS RDS / Aurora Postgres
- Google Cloud SQL for PostgreSQL
- Neon, Supabase, Crunchy, Railway, Render, Fly Postgres, DigitalOcean Managed PostgreSQL
- self-hosted Postgres container or VM

### Seam 3: `EventStore` adapter

Event and artifact writes go through `EventStore` and artifact-storage interfaces. Primary durable implementation: object storage, optionally with a local ring buffer on workers/control plane. Local/single-node implementation: JSONL per-session files and local artifact directories. `GET /events` and artifact APIs read through the same abstraction.

Prefer S3-compatible semantics where available because they map to many providers and self-hosted stores. Provider-native blob storage is acceptable behind the same adapter.

Portable mappings:

- Azure Blob Storage
- AWS S3
- Google Cloud Storage
- Cloudflare R2, Backblaze B2, Wasabi, MinIO

### Seam 4: `ProjectAdapter`

Worktree operations (open, list, diff, commit) go through `ProjectAdapter`. Primary worker implementation: clone the repo onto the worker's VM/container, operate against the clone, push back via git/tracker adapter. Local implementation: local filesystem.

### Seam 5: `SandboxAdapter`

The execution environment for a session sits behind `SandboxAdapter`. Conceptually it owns:

- provisioning or attaching to the session sandbox
- hydrating the worktree into that environment
- executing provider turns there
- streaming chunks/events back to the daemon
- collecting artifacts and terminating or retaining the sandbox

Implementations may be local host execution, project devcontainer execution, local Docker, hosted containers, managed jobs, VMs, or sandbox-core-compatible backends. Hosted deployments should normally place each loop/session/research job in its own offloaded sandbox without changing the orchestrator, API, or tracker logic.

Portable mappings:

- Azure Container Apps jobs, AKS jobs, or VM Scale Sets
- AWS ECS/Fargate tasks, EKS jobs, or EC2 workers
- Google Cloud Run jobs, GKE jobs, or Compute Engine workers
- Fly machines, Railway/Render jobs where suitable, DigitalOcean Apps/Droplets, Hetzner VMs, Nomad jobs, Docker Compose workers

### Seam 6: Scheduler and worker leases

Permit acquire/release and worker lease claim/release are API-level operations. The scheduler may run inside the control plane process or later split onto its own service, but workers never rely on process-local permits.

### Seam 7: Event publication is async batched

Execution backends (host, devcontainer, container worker, VM, managed job, or sandbox backend) accumulate events in a local buffer and POST them to `POST /v1/events` in batches (every 100ms or 1KB, whichever first). The local execution path uses the same batching model — "it's HTTP all the way down" is the mental model.

### Local composition

The local composition is not deprecated. It is the small, useful subset where the control plane, state store, event store, project adapter, and sandbox adapter all run on one machine. It is appropriate for development, demos, offline work, and users who explicitly want zero external infrastructure.

Local mode may skip TLS, use SQLite, use JSONL/local files, and execute through host/devcontainer/local Docker. It must not introduce local-only semantics into core APIs. If a behavior cannot survive worker replacement, control-plane restart, or remote API access, it is local-mode-only and must be documented that way.

### What the production path looks like

1. Package the control plane as an OCI container.
2. Deploy control plane as an HTTP service with Postgres + object storage behind it.
3. Deploy sandbox capacity as a fleet of VMs, containers, managed jobs, local nodes, or sandbox-core-compatible backends with the required provider CLIs, auth, and runtime profiles pre-seeded.
4. Use durable worker leases so abandoned capacity is reconciled by the scheduler/watchdog.
5. Ship provider-specific deployment recipes as thin templates over the same capability model, for example Azure Container Apps + Azure Postgres + Blob Storage.
6. Keep the API contract unchanged. CLI, dashboard, mobile web, bots, and workers all use the hosted endpoint with auth.

This is the main product path, not an optional rewrite later. The local path remains valuable precisely because it is the same primitives with smaller adapters.
