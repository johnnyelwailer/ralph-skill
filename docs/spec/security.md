# Security

> **Reference document.** Trust boundaries, policy enforcement, and audit guarantees. Hard rules live in CONSTITUTION.md. Work items live in GitHub issues.
>
> Sources: SPEC.md §Security Model: Trust Boundaries & GH Access Control (pre-decomposition, 2026-04-18). Generalized against `daemon.md`, `api.md`, `pipeline.md`, `work-tracker.md`.

## Table of contents

- Principle
- Trust layers
- Deployment scenarios
- Agent ↔ daemon interface (`aloop-agent`)
- Tracker adapter policy (`aloop gh`, builtin, future adapters)
- Hardcoded policy tables
- Environment sanitization (daemon-owned)
- Audit log

---

## Principle

Agents are untrusted. **The daemon (`aloopd`) is the single trust boundary.** Agents never have direct access to tracker APIs (GitHub, GitLab, Linear, or built-in), the `gh` / `glab` / `linear` CLIs, network endpoints, or the `aloop` CLI. All external operations flow through the daemon, which enforces role-based policy before invoking an adapter.

Restated:

- Agent → `aloop-agent <cmd>` → daemon (policy check) → adapter → external system
- Agent → *never directly* → external system

Policy is **hardcoded in the daemon source**, not in project config. This prevents an agent from relaxing policy even if it somehow wrote to the filesystem.

## Trust layers

```
┌─────────────────────────────────────────────────────────────┐
│  LAYER 1: HOST (where the daemon and shims run)             │
│                                                              │
│  aloopd (daemon) — the trust anchor                          │
│    ├─ v1 API (HTTP + SSE, localhost)                         │
│    ├─ Scheduler (permits, quotas, burn-rate)                 │
│    ├─ Project registry                                       │
│    ├─ Overrides store                                        │
│    ├─ Adapter orchestration                                  │
│    │    ├─ ProviderAdapter  (5 impls, spawns provider CLIs)  │
│    │    ├─ TrackerAdapter (github, builtin, …)               │
│    │    ├─ ProjectAdapter   (worktrees, git)                 │
│    │    └─ WorkerAdapter    (turn executor)                  │
│    └─ Audit log (JSONL per session + daemon-level)           │
│                                                              │
│  aloop CLI, loop.sh/ps1 shims — clients of the daemon API    │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  LAYER 2: SANDBOX (where agents run)                         │
│                                                              │
│  provider CLI (claude, opencode, codex, gemini, copilot)     │
│    ├─ worktree read/write (scoped to session's worktree)     │
│    ├─ git (commit, push to own branch only)                  │
│    ├─ tests / validation                                     │
│    └─ aloop-agent (validated CLI → daemon)                   │
│                                                              │
│  ✗ no `gh` / `glab` / tracker CLIs (stripped from PATH)      │
│  ✗ no `aloop` CLI                                            │
│  ✗ no direct network to api.github.com / etc.                │
│  ✗ no read outside the session's worktree                    │
└─────────────────────────────────────────────────────────────┘
```

## Deployment scenarios

The trust boundary holds regardless of where things run:

| Scenario | Host (Layer 1) | Sandbox (Layer 2) | Daemon location |
|---|---|---|---|
| Local dev | Your machine | Provider sandbox | On the same machine |
| Cloud orchestrator (future) | Control-plane host | Remote worker VM | On control plane |
| GitHub Actions | Runner | Spawned containers | Runner (ephemeral) |
| Docker-in-Docker | Outer container | Inner containers | Outer container |
| Devcontainer project | Host | Container | Host (communicates with container over bind-mount for worktree) |

In every case: **the daemon lives with the host**; agents live in sandboxes that can only reach the daemon via `aloop-agent` → localhost API.

## Agent ↔ daemon interface (`aloop-agent`)

Agents communicate via the `aloop-agent` CLI, which is the ONLY privileged binary on the agent's `PATH`. Its contract is defined in `pipeline.md` §Agent contract. Key properties:

- **Auth handle** — every invocation carries an `AUTH_HANDLE` env var set by the daemon at session start. Scoped to one session, short-lived, rotated on daemon restart. Agents cannot forge calls for other sessions.
- **Validated input** — every submit payload is validated against a typed schema. Malformed input is rejected with exit code 10.
- **Role-scoped permissions** — the daemon checks the prompt's declared role against a permissions table (see `pipeline.md` §Permissions). Forbidden operations return exit code 12.
- **Audited** — every call produces a log entry before the operation executes.

The retired pattern of "agents write `.aloop/output/*.json` and the runtime bridges them" is gone. The session JSONL remains, but it's the output of `aloop-agent submit`, not the other way around.

## Tracker adapter policy (`aloop gh`, builtin, future adapters)

The daemon exposes tracker operations through the `aloop gh` subcommand (and future analogues like `aloop gl`, `aloop linear`). Internally these route to the active `TrackerAdapter` for the project. Operations cannot be invoked directly by agents — only through `aloop-agent submit` with a submit type the daemon then translates to an adapter call.

The policy table applies uniformly across adapters. GitHub is used in the examples; the same rules hold for GitLab, Linear, builtin, etc. (with tracker-specific mappings — e.g., "merge" means squash-merge a PR on GitHub, squash-merge an MR on GitLab, merge a linked Git branch on Linear, move built-in change set to `merged` state for builtin).

```bash
# Direct invocations exist for debugging / scripting only — not agent-facing:
aloop gh issue-list    --session <id> [--repo <owner/repo>]
aloop gh issue-create  --session <id> --request <file>   # orchestrator only
aloop gh issue-close   --session <id> --request <file>   # orchestrator only
aloop gh pr-create     --session <id> --request <file>
aloop gh pr-merge      --session <id> --request <file>   # orchestrator only
aloop gh pr-comment    --session <id> --request <file>
aloop gh issue-comment --session <id> --request <file>
```

## Hardcoded policy tables

Not configurable. Lives in daemon source. Prevents tampering.

### Child session (one Story, one child)

| Operation | Allowed | Enforced constraints |
|---|---|---|
| `pr-create` | Yes | `base` forced to `agent/trunk`; `repo` forced from session config |
| `issue-comment` | Yes | Only on the Story issue assigned to this session (ref match) |
| `pr-comment` | Yes | Only on PRs created by this session |
| `issue-create` | **No** | Only orchestrator |
| `issue-close` | **No** | Only orchestrator (via merge flow) |
| `pr-merge` | **No** | Only orchestrator |
| `branch-delete` | **No** | Rejected unconditionally |
| `sub_issue.add/remove` | **No** | Only orchestrator |
| Raw adapter API (`gh api`, etc.) | **No** | Rejected unconditionally |

### Orchestrator session

| Operation | Allowed | Enforced constraints |
|---|---|---|
| `issue-create` | Yes | Must include the project's autodispatch label (`aloop/auto` by default) |
| `issue-close` | Yes | Only issues with the autodispatch label |
| `sub_issue.add/remove/reorder` | Yes | Only for Epics/Stories created by this orchestrator |
| `pr-create` | Yes | `base` forced to `agent/trunk` |
| `pr-merge` | Yes | Only to `agent/trunk`; merge mode per project policy (default squash) |
| `pr-comment`, `issue-comment` | Yes | Only on PRs / issues with autodispatch label |
| `review.submit`, `review_thread.resolve` | Yes | Only on change sets linked to this project |
| Anything targeting `main` / default branch | **No** | Human promotes `agent/trunk` → mainline |
| `branch-delete` | **No** | Rejected — cleanup is manual or daemon-scheduled, not agent-initiated |
| Raw adapter API | **No** | Rejected unconditionally |

### Built-in adapter specifics

The built-in file-based tracker has the same policy surface. Since it's just filesystem operations, "hardcoded policy" maps to validation rules enforced before touching `.aloop/issues/*.json`:

- Children can only update their assigned Story file's `status` → `in_progress`, `in_review`, or append change-set refs.
- Only orchestrator can create files, close Stories, merge change sets (move state from `open` → `merged`).
- `events.jsonl` is append-only; the daemon enforces this at the filesystem level.

## Environment sanitization (daemon-owned)

The daemon, not the shim, sanitizes the environment before spawning a provider CLI:

- **`CLAUDECODE`** unset — prevents "cannot launch inside another session" errors when the parent was itself a Claude Code session.
- **`PATH`** hardened to a known prefix. Tracker CLIs (`gh`, `glab`, `linear`) stripped; only the provider's own CLI and agent essentials (git, test runner, node, bun, etc.) remain.
- **Secrets** stripped except those the provider's own `ProviderAdapter` explicitly declares.
- **Injected**:
  - `AUTH_HANDLE` — session-scoped auth for `aloop-agent`
  - `ALOOP_SESSION_ID`, `ALOOP_PROJECT_PATH`
  - `ALOOP_WORKTREE` — path to the session's worktree
  - Provider-specific credentials (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.) when the provider's adapter declares them
- **Child process supervision** — daemon tracks the provider's PID, enforces per-turn timeout (from `timeout` in prompt frontmatter or `daemon.yml` default), kills on exit.

Defense-in-depth: even if a shim sets `CLAUDECODE=$null`, the daemon has already done so. Environment sanitation is a daemon invariant.

## Audit log

Every policy-gated operation produces a log entry **before** the operation executes. Granted or denied, both are logged.

**Granted:**

```json
{
  "timestamp": "2026-04-18T12:00:00Z",
  "event": "policy.granted",
  "operation": "pr-create",
  "session_id": "s_abc",
  "role": "build",
  "adapter": "github",
  "request": {
    "base": "agent/trunk",
    "repo": "owner/repo",
    "title": "#42: ...",
    "body_file": "requests/bodies/pr-42.md"
  },
  "enforced_constraints": { "base": "agent/trunk", "repo_locked": true }
}
```

**Denied:**

```json
{
  "timestamp": "2026-04-18T12:01:00Z",
  "event": "policy.denied",
  "operation": "pr-merge",
  "session_id": "s_abc",
  "role": "build",
  "adapter": "github",
  "reason": "pr-merge not allowed for child session",
  "policy_code": "child_session_forbidden"
}
```

**Where it lives:**

- Per-session entries in `~/.aloop/state/sessions/<id>/log.jsonl`.
- Daemon-level entries (cross-session: project registration, overrides changes, daemon config reloads, auth handle rotations) in `~/.aloop/state/aloopd.log` (JSONL).
- Both are append-only. The daemon never rewrites history.

**Retention** is governed by `daemon.yml` (`retention.completed_sessions_days`, `retention.interrupted_sessions_days`). Audit entries survive the same lifecycle as the session JSONL.

**Exposure:**

- `GET /v1/sessions/:id/log` returns the session's full event log, including audit entries.
- `GET /v1/events?topics=policy.*` streams audit events live over SSE.
- `aloop audit` CLI subcommand (future) queries and formats audit entries for review.

## Non-goals

- **No agent-side policy.** Agents don't check policy before submitting; the daemon is the single source of enforcement.
- **No configurable bypass.** There is no "dev mode" or env var that relaxes the policy tables. Policy is hardcoded to prevent accidents.
- **No raw API access via any surface.** `gh api`, `glab api`, direct HTTP to tracker endpoints — all forbidden. If a capability is missing from the adapter, it's added to the adapter, not worked around.
- **No cross-session read/write.** A session cannot read another session's worktree, JSONL, state, or auth handle. Daemon enforces this at every read path.
- **No cross-project read/write.** A session scoped to project A cannot touch project B's artifacts.
