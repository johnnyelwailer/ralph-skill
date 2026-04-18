# Security

> **Reference document.** Invariants and contracts consumed by agents at runtime. Work items live in GitHub issues; hard rules live in CONSTITUTION.md.
>
> Sources: SPEC.md §Security Model: Trust Boundaries & GH Access Control (lines ~2389-2634) (pre-decomposition, 2026-04-18).

## Table of contents

- Principle
- Trust layers
- Deployment scenarios
- Convention-file protocol
- Architecture: keep loop scripts lean
- `aloop gh` subcommand
- Hardcoded policy
- PATH sanitization (defense-in-depth)
- Audit log

---

## Principle

Agents are untrusted. The aloop CLI is the single trust boundary. Agents never have direct access to GitHub APIs, network endpoints, or the `gh` CLI. All external operations flow through the harness, which delegates to `aloop gh` — a policy-enforced subcommand of the aloop CLI.

## Trust layers

```
┌──────────────────────────────────────────────┐
│  LAYER 1: HOST (where harness runs)          │
│                                              │
│  loop.ps1 / loop.sh (harness)                │
│    ├─ aloop CLI (single trust boundary)      │
│    │    ├─ aloop gh      (GH operations)     │
│    │    ├─ aloop resolve (project config)    │
│    │    ├─ aloop orchestrate (fan-out)       │
│    │    └─ aloop status  (monitoring)        │
│    │                                         │
│    └─ launches provider CLI ─────────────────┼──┐
│                                              │  │
│  worktree ◄──────────────────────────────────┼──┼── shared volume
│                                              │  │
├──────────────────────────────────────────────┤  │
│  LAYER 2: SANDBOX (where agent runs)         │  │
│                                              │  │
│  agent (provider CLI) ◄──────────────────────┼──┘
│    ├─ git (commit, push to own branch only)  │
│    ├─ file read/write (worktree only)        │
│    ├─ test runner                            │
│    └─ requests/ (write side-effect requests)  │
│                                              │
│  ✗ no `gh` CLI (stripped from PATH)          │
│  ✗ no `aloop` CLI                            │
│  ✗ no direct network to api.github.com       │
└──────────────────────────────────────────────┘
```

## Deployment scenarios

The trust boundary works regardless of where things run:

| Scenario | Host (Layer 1) | Sandbox (Layer 2) | aloop CLI location |
|----------|----------------|--------------------|--------------------|
| Local dev | Your machine | Provider sandboxes (Codex sandbox, etc.) | Installed on machine |
| Cloud orchestrator | Cloud VM / CI runner | Nested containers | In orchestrator container |
| GitHub Actions | GH Actions runner | Spawned containers | Installed in action setup |
| Docker-in-Docker | Outer container | Inner containers | In outer container |

In every case: **aloop CLI lives where the harness lives**. The agent never needs it.

## Convention-file protocol

Agents communicate intent via filesystem — the only interface that crosses all sandbox boundaries (Docker volumes, bind mounts, NFS, etc.).

This is the same Request/Response Protocol described in the orchestrator section — `requests/*.json` for side effects, `queue/*.md` for follow-up prompts. Markdown content is always passed as file path references (`body_file`), never inline in the JSON.

**Request files** (agent writes to `$SESSION_DIR/requests/`):
```json
{
  "id": "req-001",
  "type": "create_pr",
  "payload": {
    "head": "aloop/issue-42",
    "base": "agent/trunk",
    "title": "Issue #42: Add provider health subsystem",
    "body_file": "requests/bodies/pr-42.md",
    "issue_number": 42
  }
}
```

**Follow-up prompts** (runtime writes to `$SESSION_DIR/queue/`): response data is baked into the next prompt's body. No separate response files — the queue IS the response channel.

**Protocol rules:**
- Request files: `req-<NNN>-<type>.json`, monotonic counter, processed in order
- Markdown content: always file path references (`body_file`, `sub_spec_file`, `prompt_file`, `content_file`)
- Request files deleted by runtime after processing
- Malformed requests moved to `requests/failed/` with error annotation

## Architecture: keep loop scripts lean

**Critical design rule:** `loop.ps1` and `loop.sh` must NOT contain convention-file processing, GH logic, or any host-only operations directly. The loop scripts run inside containers and must stay minimal: iterate phases, invoke providers, write status/logs. That's it. Remote backup setup (repo creation via `gh`) belongs in `aloop start`, not in the loop scripts.

All host-side operations (GH requests, steering injection, dashboard, request processing) are handled by the **aloop host monitor** — a separate process that runs alongside the loop on the host:

```
┌─── Host ──────────────────────────────────────────────┐
│                                                        │
│  aloop start                                           │
│    ├── loop.ps1/sh (may run in container)              │
│    │     └── just: read loop-plan.json + provider invoke│
│    │                                                   │
│    └── aloop monitor (host-side, always on host)       │
│          ├── watches requests/ → executes side effects  │
│          ├── writes to queue/ → loop picks up next iter  │
│          ├── serves dashboard                          │
│          ├── processes convention-file protocol         │
│          └── manages provider health (cross-session)   │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**What stays in loop.ps1/loop.sh:**
- Read `loop-plan.json` each iteration, pick agent at `$cyclePosition`
- Provider invocation (direct — loop and providers run in the same environment)
  - Must track child PIDs when invoking providers
  - Per-iteration timeout (default 3 hours / 10800 seconds) with precedence: prompt frontmatter `timeout` -> `ALOOP_PROVIDER_TIMEOUT` -> default. The built-in default must be identical in `loop.sh` and `loop.ps1` for cross-runtime parity. Timeout remains a catastrophic safety net only; not a behavioral limit on agent runtime
  - On loop exit (`finally`/`trap`), kill all spawned child processes
- Iteration counting
- Status.json and log.jsonl writes
  - Each session run must include a unique `run_id` in all log entries, or rotate logs on session start
- TODO.md reading for phase prerequisites
- PATH hardening (defense in depth, even though container already isolates)

**Execution model:** The loop script and provider CLIs always run in the same environment. When containerized, `aloop start` on the host launches the loop **inside** the container via `devcontainer exec -- loop.sh` (or `loop.ps1`). From that point, the loop invokes providers directly (they're co-located). The loop never calls `devcontainer exec` itself — that's the host's job.

**What moves to aloop monitor (host-side):**
- Convention-file request processing (`requests/` → `aloop gh` → `queue/`)
- Steering file detection and injection
- Dashboard server
- Provider health file management (already cross-session)
- Session lifecycle (start, stop, cleanup, lockfile management)
  - Session must use a PID lockfile (`session.lock`) in the session directory
  - On start, check if lockfile exists and PID is alive — refuse to start or kill stale process
  - On exit (including Ctrl+C and errors), clean up lockfile in `finally`/`trap` block
  - Both `loop.ps1` and `loop.sh` must implement lockfile handling

The monitor is a long-running process started by `aloop start` that watches the session directory via filesystem polling. It reads `status.json` to know the current iteration and processes requests/steering between iterations. This cleanly separates container-safe loop logic from host-privileged operations.

**If convention-file processing was already added to loop.ps1:** It must be extracted out. The loop script should not import or call `aloop gh`. Any such code is a spec violation — the loop may run in a container where `aloop` is not available.

## `aloop gh` subcommand

The aloop CLI exposes policy-enforced GH operations:

```bash
aloop gh pr-create   --session <id> --request <file>
aloop gh pr-comment  --session <id> --request <file>
aloop gh issue-comment --session <id> --request <file>
aloop gh issue-create  --session <id> --request <file>   # orchestrator only
aloop gh issue-close   --session <id> --request <file>   # orchestrator only
aloop gh pr-merge      --session <id> --request <file>   # orchestrator only
```

## Hardcoded policy

Not configurable — prevents tampering.

**Child loop (per-issue agent):**

| Operation | Allowed | Enforced constraints |
|-----------|---------|---------------------|
| `pr-create` | Yes | `--base` forced to `agent/trunk`, `--repo` forced from session config |
| `issue-comment` | Yes | Only on the issue assigned to this child session |
| `pr-comment` | Yes | Only on PRs created by this child session |
| `pr-merge` | **No** | Rejected — only orchestrator can merge |
| `issue-create` | **No** | Rejected — only orchestrator can create issues |
| `issue-close` | **No** | Rejected — only orchestrator can close issues |
| `branch-delete` | **No** | Rejected unconditionally |
| Raw `gh api` | **No** | Rejected unconditionally |

**Orchestrator:**

| Operation | Allowed | Enforced constraints |
|-----------|---------|---------------------|
| `issue-create` | Yes | Must include `aloop/auto` label |
| `issue-close` | Yes | Only issues with `aloop/auto` label |
| `pr-create` | Yes | `--base` forced to `agent/trunk` |
| `pr-merge` | Yes | Only to `agent/trunk`, only squash merge |
| `pr-comment` | Yes | Only on PRs with `aloop/auto` label |
| `issue-comment` | Yes | Only on issues with `aloop/auto` label |
| Anything targeting `main` | **No** | Rejected — human promotes to main |
| `branch-delete` | **No** | Rejected — cleanup is manual |
| Raw `gh api` | **No** | Rejected unconditionally |

Policy is **hardcoded in the aloop CLI source**, not in a config file. This prevents an agent from modifying policy even if it somehow accessed the host filesystem.

## PATH sanitization (defense-in-depth)

The harness strips `gh` from the agent's PATH before launching the provider:

```powershell
# In loop.ps1, before Invoke-Provider
$originalPath = $env:PATH
$env:PATH = ($env:PATH -split [IO.Path]::PathSeparator | Where-Object {
    -not (Test-Path (Join-Path $_ 'gh.exe') -ErrorAction SilentlyContinue) -and
    -not (Test-Path (Join-Path $_ 'gh') -ErrorAction SilentlyContinue)
}) -join [IO.Path]::PathSeparator

try {
    $providerOutput = Invoke-Provider -ProviderName $iterationProvider -PromptContent $promptContent
} finally {
    $env:PATH = $originalPath  # restore for harness use
}
```

This is defense-in-depth. Even without it, agents can't do GH operations (they use the convention-file protocol). But stripping `gh` from PATH ensures an agent can't accidentally or intentionally bypass the protocol.

## Audit log

Every `aloop gh` invocation is logged to the session's `log.jsonl`:

```json
{
  "timestamp": "2026-02-27T12:00:00Z",
  "event": "gh_operation",
  "type": "pr-create",
  "session": "ralph-skill-20260227-issue42",
  "role": "child-loop",
  "request_file": "001-pr-create.json",
  "result": "success",
  "pr_number": 15,
  "enforced": { "base": "agent/trunk", "repo": "owner/repo" }
}
```

Failed policy checks are logged as `gh_operation_denied`:

```json
{
  "timestamp": "2026-02-27T12:01:00Z",
  "event": "gh_operation_denied",
  "type": "pr-merge",
  "session": "ralph-skill-20260227-issue42",
  "role": "child-loop",
  "reason": "pr-merge not allowed for child-loop role"
}
```
