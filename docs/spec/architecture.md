# Architecture

> **Reference document.** The layers, boundaries, and seams of the `aloopd` daemon. Hard rules live in CONSTITUTION.md. Work items live in GitHub issues.
>
> Sources: SPEC.md §Architecture, §Inner Loop vs Runtime, §Cross-Platform; `daemon.md`, `api.md`, `pipeline.md`, `provider-contract.md`, `work-tracker.md`, `incubation.md`.

## Table of contents

- One-line summary
- Layers
- The one boundary: the API
- Daemon responsibilities
- Shim responsibilities
- Client responsibilities
- Standards-first design
- Adapter surfaces
- Cross-platform
- Trust boundaries
- What the architecture rules out

---

## One-line summary

A single long-running local daemon (`aloopd`) owns all state and scheduling. Every client — CLI, dashboard, bot, script, loop shim — talks to it over a versioned HTTP+SSE API. Providers, issue trackers, and sandbox execution backends are adapters behind typed interfaces, swappable without touching core.

## Layers

```
┌──────────────────────────────────────────────────────────────┐
│  Clients                                                      │
│    aloop CLI · Dashboard · global composer · mobile web      │
│    bots · scripts                                            │
│    future integrations                                       │
│    loop.sh / loop.ps1 shim (≤150 LOC each)                    │
└──────────────────────────────────────────────────────────────┘
              │ HTTP + SSE  (v1 API, localhost)
              ▼
┌──────────────────────────────────────────────────────────────┐
│  aloopd  (daemon, Bun TypeScript)                             │
│                                                               │
│    HTTP server · SSE hub · event bus                          │
│    Composer turns · incubation inbox · research runs          │
│    promotion proposals                                       │
│    Setup runs · session runner · workflow state machine       │
│    Compile step                                               │
│    Scheduler (permits: system / quota / burn-rate / concurrency)│
│    Watchdog + reconcile jobs                                  │
│    Project registry · overrides store                         │
│                                                               │
│    Adapter interfaces:                                        │
│      ProviderAdapter    (5 impls: opencode, copilot, codex,   │
│                           gemini, claude)                     │
│      TrackerAdapter      (2 impls: github, builtin)           │
│      SandboxAdapter      (v1: local execution / devcontainer;  │
│                           future: sandbox-core-backed backends)│
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

- **Incubation** — captured ideas, research runs, synthesis proposals, and explicit promotion into setup/spec/tracker/session targets (see `incubation.md`).
- **Composer turns** — provider-backed, multimodal control turns that translate text, speech, media, links, and selected app context into scoped subagent delegations, daemon-owned objects, normal API mutation proposals, long-running jobs, configuration changes, or status summaries. The composer is an agentic client interface, not a second runtime.
- **Setup runs** — long-lived onboarding state before a project becomes `ready` (see `setup.md`).
- **Sessions** — standalone, orchestrator, child. State machine, lifecycle, parent-child relationships (see `daemon.md` §Session kinds).
- **Scheduler** — the only gate between "a turn is wanted" and "a turn is started." Composes gates for concurrency, system resources, per-provider quota, burn rate, and live overrides.
- **Event bus** — aggregates events from all sessions into per-session JSONL and the global SSE stream. Every state change publishes.
- **Compile step** — translates `pipeline.yml` into `loop-plan.json`. See `pipeline.md` §Compile step for the canonical description (single YAML reader in the system).
- **Prompt context assembly** — resolves prompt `context` declarations through registered context plugins, injects bounded source-cited context blocks, and records what was injected. See `context.md`.
- **Runtime extension manifests** — supervises typed project-code extensions such as `exec` steps and `context-provider`s through one manifest-backed execution model. See `pipeline.md` §Runtime extension manifests.
- **Watchdog / reconcile** — stuck detection, provider quota refresh, permit expiry sweep, orphan cleanup, burn-rate tracking, crash recovery. All internal to the daemon; no external cron.
- **Project registry** — N unrelated repos served by one daemon instance.
- **Adapter orchestration** — invokes `ProviderAdapter` for agent turns and research reasoning, `TrackerAdapter` for decomposition/review/merge, `SandboxAdapter` for session execution environments and deterministic exec/experiment steps, and future outreach/source adapters only through the same policy-controlled adapter pattern.

Full detail in `daemon.md`.

## Shim responsibilities

`loop.sh` and `loop.ps1` are API clients, not business logic. Hard budget: ≤150 LOC each. What they do:

1. Acquire a local session lock.
2. Ask the daemon for the next step to execute (`GET /v1/sessions/:id/next`).
3. Invoke the resolved provider CLI or deterministic runtime with the compiled step payload.
4. Post step events as they happen (`POST /v1/sessions/:id/events`, batched).
5. Write turn result + usage chunks.
6. Release lock and exit.

They **do not** parse YAML, do not resolve triggers, do not talk to GitHub, do not manage the queue, do not own any state. If logic beyond "get next thing; run it; report results" creeps in, it belongs in the daemon.

CONSTITUTION rule: the shim must shrink, never grow. Any change that would push it over 150 LOC is rejected and routed into the daemon instead.

## Client responsibilities

All other clients (CLI, dashboard, global composer, mobile web, bots) translate user intent into API calls. They:

- Render state they get from `GET /v1/...` endpoints.
- Subscribe to SSE streams for live updates (`GET /v1/events`, `GET /v1/sessions/:id/events`, `GET /v1/sessions/:id/turns/:turn_id/chunks`).
- Never persist their own state for things the daemon owns. Client-local state is limited to UI prefs, auth tokens, etc.
- Treat incubation captures, research results, syntheses, comments, and promotion decisions as daemon-owned state, not local drafts once submitted.
- Treat composer turns as a natural-language and multimodal interface to the same primitives. If a composer launches work or changes control-plane state, it may delegate to a scoped control subagent; the effect is still a `Project`, `ResearchRun`, `ResearchMonitor`, `SetupRun`, `Session`, tracker mutation, provider override, scheduler/config patch, proposal, comment, or artifact with normal events and projections.

This keeps the system honest: if the CLI can do X, the dashboard can do X, because X is an API endpoint. If the dashboard needs Y that no one else has, the API is missing an endpoint — fix the API, not the dashboard.

The end-to-end object flow is:

```text
incubation capture
  -> research / synthesis
  -> explicit promotion
  -> setup run | spec proposal | Epic / Story | session steering | decision record
  -> orchestrator / child sessions
  -> artifacts, metrics, learning
```

Each arrow crosses the same daemon API boundary and emits events. There is no private dashboard path from a phone capture to a tracker issue or repo edit.

The composer may accelerate any arrow or coordinate the control plane, including from spoken input, screenshots, voice notes, videos, PDFs, links, or pasted logs, but it does not create a parallel object model. Media becomes artifacts/source records first; speech becomes native model input or transcript artifacts under daemon policy; subagents run with scoped capability grants; mutations become normal policy-checked API calls; the composer observes child work by reading the same projections and event streams as every other client.

## Standards-first design

Aloop should reuse industry standards wherever a standard exists. The architecture should not invent custom protocols, hidden file handshakes, bespoke plugin formats, or ad hoc transport layers when a mature standard or established ecosystem convention covers the job.

Default choices:

| Area | Preferred standard / convention |
|---|---|
| Client/daemon transport | HTTP/1.1 or later, JSON, SSE for server-pushed events |
| API description | OpenAPI-compatible paths and JSON Schema-compatible payloads |
| Auth for remote/tunneled deployments | Bearer tokens in v1; OAuth/OIDC-compatible flows when multi-user auth lands |
| Streaming | `text/event-stream` SSE before custom WebSockets; WebSockets only when bidirectional low-latency semantics are required |
| Artifacts/media | MIME types, content-length, stable URLs, checksums where needed |
| Events/logs | JSONL/NDJSON for append-only logs and exports |
| State | SQLite locally; Postgres when distributed |
| Version control | Git primitives and normal branch/commit semantics |
| Tool/subagent contracts | Typed JSON tool calls and established tool protocols where applicable; no raw shell/string protocols |
| Extensions | Existing runtime extension manifest model; align with external tool standards where possible |

When aloop needs semantics that standards do not provide, keep the custom part narrow and explicit:

- put aloop semantics in resource names, schemas, and daemon policy, not in a new wire protocol
- prefer adapter implementations over new protocol families
- document why an existing standard was insufficient before adding a new primitive
- add conformance tests around the boundary
- expose the capability through the same v1 API so every client can use it

## Adapter surfaces

Six typed interfaces enclose everything external to the daemon core:

| Adapter | Interface file / spec | V1 implementations | Purpose |
|---|---|---|---|
| **ProviderAdapter** | `provider-contract.md` | opencode, copilot, codex, gemini, claude | One per AI provider; runs turns; emits agent chunks |
| **TrackerAdapter** | `work-tracker.md` | github, builtin | Generic work-item (Epic/Story) + change-set surface; GH is one instance |
| **SandboxAdapter** | in-daemon (seam) | host execution, project devcontainer | Acquires the execution environment for a session and runs turns inside it; later maps to `sandbox-core` backends for local Docker and hosted sandboxes |
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
- **No hidden intake channel.** Captures, research, and promotion proposals are first-class daemon state under `incubation.md`, not dashboard-local chat transcripts or ad hoc tracker issues.
- **No composer-only backend.** The composer can be smart, provider-backed, and always available, but it must express durable effects as scoped subagent runs, normal API mutations, and long-running daemon jobs.
- **No YAML parsing outside the compile step.** Shims and session runner use `loop-plan.json`.
- **No direct tracker calls from agents.** Always `aloop-agent submit` → daemon → adapter.
- **No expressions or inline code in pipeline YAML, prompt frontmatter, or daemon config.** Keywords (`onFailure: retry`, `trigger: merge_conflict`, `context: orch_recall`) are data; project-defined logic runs through typed runtime extension manifests.
- **No parallel plugin systems.** New extensibility points must reuse the runtime extension manifest model unless there is a documented reason it cannot fit.
- **No custom protocol when a standard fits.** Use HTTP/SSE/JSON/JSON Schema/MIME/Git/SQLite/Postgres/OAuth-style conventions and established tool protocols before inventing aloop-specific mechanisms.
- **No research-specific runtime.** Source acquisition, experiment attempts, monitors, outreach drafts, artifacts, metrics, and events reuse daemon adapters, runtime extension manifests, scheduler permits, SQLite projections, and JSONL logs.
- **No second runtime process.** Orchestrators run as workflows in the same daemon, not separate binaries.
- **No in-process state that outlives a request.** Session state is SQLite + JSONL, not daemon memory.
- **No concurrency that bypasses the scheduler.** Every provider-backed session turn or incubation research turn goes through the permit protocol.
- **No "aloop gh" treated specially.** GitHub is one adapter among potentially many; `security.md`'s policy table applies to all tracker adapters uniformly.

These rules are not preferences. They are the architecture's load-bearing invariants; the rebuild exists to restore them.
