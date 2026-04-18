# Architecture

> **Reference document.** The layers, boundaries, and seams of the `aloopd` daemon. Hard rules live in CONSTITUTION.md. Work items live in GitHub issues.
>
> Sources: SPEC.md §Architecture, §Inner Loop vs Runtime, §Cross-Platform; `daemon.md`, `api.md`, `pipeline.md`, `provider-contract.md`, `work-tracker.md`.

## Table of contents

- One-line summary
- Layers
- The one boundary: the API
- Daemon responsibilities
- Shim responsibilities
- Client responsibilities
- Adapter surfaces
- Cross-platform
- Trust boundaries
- What the architecture rules out

---

## One-line summary

A single long-running local daemon (`aloopd`) owns all state and scheduling. Every client — CLI, dashboard, bot, script, loop shim — talks to it over a versioned HTTP+SSE API. Providers, issue trackers, and worker runtimes are adapters behind typed interfaces, swappable without touching core.

## Layers

```
┌──────────────────────────────────────────────────────────────┐
│  Clients                                                      │
│    aloop CLI · Dashboard (React) · scripts · future integrations │
│    loop.sh / loop.ps1 shim (≤150 LOC each)                    │
└──────────────────────────────────────────────────────────────┘
              │ HTTP + SSE  (v1 API, localhost)
              ▼
┌──────────────────────────────────────────────────────────────┐
│  aloopd  (daemon, Bun TypeScript)                             │
│                                                               │
│    HTTP server · SSE hub · event bus                          │
│    Session runner · workflow state machine · compile step     │
│    Scheduler (permits: system / quota / burn-rate / concurrency)│
│    Watchdog + reconcile jobs                                  │
│    Project registry · overrides store                         │
│                                                               │
│    Adapter interfaces:                                        │
│      ProviderAdapter    (5 impls: opencode, copilot, codex,   │
│                           gemini, claude)                     │
│      TrackerAdapter      (2 impls: github, builtin)           │
│      WorkerAdapter       (1 impl: in-proc; future: remote)    │
│      ProjectAdapter      (1 impl: local-fs; future: remote-clone)│
│      StateStore          (1 impl: SQLite; future: Postgres)   │
│      EventStore          (1 impl: JSONL; future: JSONL + S3)  │
└──────────────────────────────────────────────────────────────┘
              │ filesystem (worktrees, logs) + subprocess (CLIs)
              ▼
┌──────────────────────────────────────────────────────────────┐
│  Provider CLIs       Worktrees & git         Tracker APIs     │
│  (opencode, claude,  (per-session isolated)  (gh, builtin     │
│   codex, gemini,                              filesystem, …)  │
│   copilot)                                                    │
└──────────────────────────────────────────────────────────────┘
```

The layers are cleanly separated by the API at top and typed adapter interfaces at bottom. There is no supplementary control plane, no sidecar, no second runtime.

## The one boundary: the API

Every action against aloop — starting a session, listing sessions, steering, setting overrides, acquiring a permit, streaming events — is an HTTP call against the daemon. The loop shim is an API client. The CLI is an API client. The dashboard is an API client.

This is the load-bearing decision:

- **Any client that exists today, any client that exists tomorrow, uses the same contract.** New surface = new endpoint = everyone gets it.
- **Moving to distributed deployment is a deployment change, not a rewrite.** The API is already the only boundary. (See `daemon.md` §Forward-compat: distribution seams.)
- **There are no side channels.** No "drop a file here," no "write to this magic directory." Agents interact through `aloop-agent submit`, which itself is an API client.

## Daemon responsibilities

`aloopd` is the single process that owns:

- **Sessions** — standalone, orchestrator, child. State machine, lifecycle, parent-child relationships (see `daemon.md` §Session kinds).
- **Scheduler** — the only gate between "a turn is wanted" and "a turn is started." Composes gates for concurrency, system resources, per-provider quota, burn rate, and live overrides.
- **Event bus** — aggregates events from all sessions into per-session JSONL and the global SSE stream. Every state change publishes.
- **Compile step** — translates `pipeline.yml` into `loop-plan.json`. See `pipeline.md` §Compile step for the canonical description (single YAML reader in the system).
- **Watchdog / reconcile** — stuck detection, provider quota refresh, permit expiry sweep, orphan cleanup, burn-rate tracking, crash recovery. All internal to the daemon; no external cron.
- **Project registry** — N unrelated repos served by one daemon instance.
- **Adapter orchestration** — invokes `ProviderAdapter` for turns, `TrackerAdapter` for decomposition/review/merge, `WorkerAdapter` for turn execution.

Full detail in `daemon.md`.

## Shim responsibilities

`loop.sh` and `loop.ps1` are API clients, not business logic. Hard budget: ≤150 LOC each. What they do:

1. Acquire a local session lock.
2. Ask the daemon for the next prompt to execute (`GET /v1/sessions/:id/next`).
3. Invoke the resolved provider CLI with the prompt body.
4. Post turn events as they happen (`POST /v1/sessions/:id/events`, batched).
5. Write turn result + usage chunks.
6. Release lock and exit.

They **do not** parse YAML, do not resolve triggers, do not talk to GitHub, do not manage the queue, do not own any state. If logic beyond "get next thing; run it; report results" creeps in, it belongs in the daemon.

CONSTITUTION rule: the shim must shrink, never grow. Any change that would push it over 150 LOC is rejected and routed into the daemon instead.

## Client responsibilities

All other clients (CLI, dashboard, bots) translate user intent into API calls. They:

- Render state they get from `GET /v1/...` endpoints.
- Subscribe to SSE streams for live updates (`GET /v1/events`, `GET /v1/sessions/:id/events`, `GET /v1/sessions/:id/turns/:turn_id/chunks`).
- Never persist their own state for things the daemon owns. Client-local state is limited to UI prefs, auth tokens, etc.

This keeps the system honest: if the CLI can do X, the dashboard can do X, because X is an API endpoint. If the dashboard needs Y that no one else has, the API is missing an endpoint — fix the API, not the dashboard.

## Adapter surfaces

Six typed interfaces enclose everything external to the daemon core:

| Adapter | Interface file / spec | V1 implementations | Purpose |
|---|---|---|---|
| **ProviderAdapter** | `provider-contract.md` | opencode, copilot, codex, gemini, claude | One per AI provider; runs turns; emits agent chunks |
| **TrackerAdapter** | `work-tracker.md` | github, builtin | Generic work-item (Epic/Story) + change-set surface; GH is one instance |
| **WorkerAdapter** | in-daemon (seam) | in-proc | Runs turns in the daemon's process today; remote worker tomorrow |
| **ProjectAdapter** | in-daemon (seam) | local-fs | Worktree operations on local filesystem today; remote clone tomorrow |
| **StateStore** | in-daemon (seam) | sqlite | Queryable current-state; Postgres tomorrow |
| **EventStore** | in-daemon (seam) | jsonl | Authoritative append-only event log; JSONL + S3 tomorrow |

Each interface has exactly the implementations v1 needs, plus a deliberate seam for future growth. No interface has zero implementations ("abstractions without users"). No interface has an implementation that isn't actually used.

## Cross-platform

Single source of truth for loop shims is their own script. Daemon is platform-agnostic (Bun). The shim scripts differ in syntax (bash vs PowerShell) but their behavior is identical — both call the same API endpoints with the same semantics.

Operational notes:

- PowerShell 5.1: avoid `($var text)`; use `$($var)`.
- `.editorconfig` enforces `end_of_line = crlf` for `*.ps1`.
- `install.ps1` normalizes line endings when placing `loop.ps1` into `~/.aloop/bin/`.
- Windows path format is passed to scripts in Windows-native form; bash path format in POSIX.
- `aloop start` detects the current shell and invokes the correct shim — CLI is the one piece that knows the difference.

## Trust boundaries

The system has one outer boundary and several internal ones:

- **Clients ↔ Daemon**: HTTP request/response, with auth (localhost unauthenticated by default; bearer token when tunneled). Requests are rate-limited per client.
- **Daemon ↔ Agents (via `aloop-agent`)**: agents run inside a provider process with an `AUTH_HANDLE` env variable scoped to a single session. Agents cannot issue calls outside that scope.
- **Daemon ↔ Providers**: daemon spawns provider CLIs as child processes with sanitized environments (`CLAUDECODE`, `PATH`, secrets). Providers receive only the prompt body and declared tool definitions.
- **Daemon ↔ Tracker**: the adapter authenticates to the tracker with credentials supplied in project config (`gh` CLI, env token). Daemon policy restricts allowed operations per role (see `security.md` §Tracker adapter policy for the hardcoded table; GitHub is the shipped example and future adapters follow the same role-based allow-list pattern).
- **Daemon ↔ Filesystem**: worktrees live under `~/.aloop/state/sessions/<id>/worktree/`. A session cannot read outside its own worktree except through well-defined read-only references (the project's repo root, config files).

Agents are the least trusted principal. The daemon is the trust anchor.

## What the architecture rules out

Explicit non-goals — decisions that must not drift back in:

- **No business logic in the shim.** If shrinking requires moving logic, move it.
- **No YAML parsing outside the compile step.** Shims and session runner use `loop-plan.json`.
- **No direct tracker calls from agents.** Always `aloop-agent submit` → daemon → adapter.
- **No expressions in pipeline YAML.** Keywords (`onFailure: retry`, `trigger: merge_conflict`) are data; evaluation is daemon code.
- **No second runtime process.** Orchestrators run as workflows in the same daemon, not separate binaries.
- **No in-process state that outlives a request.** Session state is SQLite + JSONL, not daemon memory.
- **No concurrency that bypasses the scheduler.** Every turn goes through the permit protocol, even for standalone single-session runs.
- **No "aloop gh" treated specially.** GitHub is one adapter among potentially many; `security.md`'s policy table applies to all tracker adapters uniformly.

These rules are not preferences. They are the architecture's load-bearing invariants; the rebuild exists to restore them.
