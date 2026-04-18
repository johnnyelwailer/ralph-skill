# Devcontainer

> **Reference document.** How aloop sessions run inside VS Code devcontainers for isolation. What the container contract is, how providers authenticate inside the container, what the daemon owns on the host and what runs in the sandbox. Hard rules live in CONSTITUTION.md. Work items live in GitHub issues.
>
> Sources: SPEC.md §Devcontainer Support (pre-decomposition, 2026-04-18). Consolidated against `daemon.md`, `security.md`, `provider-contract.md`.

## Table of contents

- Goal
- Configuration contract
- Host / sandbox boundary
- Container reuse across sessions
- Worktree mounting
- `aloop start` with devcontainer
- Provider auth in container
- Claude Code specifics
- Auth resolution strategy
- Auth file bind mounts (fallback)
- What NOT to do

---

## Goal

Enable aloop sessions to run inside VS Code / Docker devcontainers for full isolation. Agents get a sandbox with their provider CLIs and project tooling; the daemon runs on the host where it owns state, scheduling, and tracker access.

Why this matters:

- **Security boundary.** Devcontainer is the natural sandbox for Layer 2 (agent execution per `security.md`). Agents cannot reach host credentials, filesystem beyond mounted paths, or network beyond what the container allows.
- **Reproducibility.** Identical environment across machines. No "works on my machine" drift between provider CLI versions or system tools.
- **Required for the daemon/shim boundary.** The daemon runs on the host; provider CLIs run inside the container. `aloop-agent` in the container talks to the daemon over the mounted Unix socket or localhost HTTP (loopback forwarded into the container).

## Configuration contract

Devcontainer generation is a daemon setup-flow concern; the details of `.devcontainer/devcontainer.json` generation (image selection, feature choice, `postCreateCommand`, etc.) are **implementation**, not contract, and live in the setup docs and code.

What **is** contract:

- The project's `.devcontainer/devcontainer.json` must declare `.aloop/` as a mount (bind or equivalent) so the daemon can expose session-scoped state to the agent.
- The container must have the project's enabled provider CLIs on `PATH`, each able to authenticate (see §Provider auth).
- The container must have `aloop-agent` on `PATH` inside the sandbox. The daemon provisions this as part of setup.
- `ALOOP_CONTAINER=1` environment variable is set so downstream code can distinguish.

The daemon validates these when verifying container readiness. Failure to satisfy the contract is a hard error; setup does not mark a project container-ready until validation passes.

Specific `devcontainer.json` fields, install commands, and feature references change with upstream ecosystem (devcontainer spec, provider packaging) — consult current upstream docs when generating. Do not treat any example in this document as authoritative syntax; treat it as illustrative.

## Host / sandbox boundary

```
┌──────────────────── Host ────────────────────────────────┐
│                                                           │
│  aloopd (daemon)                                          │
│    ├── v1 API (HTTP on 127.0.0.1 + optional unix socket)  │
│    ├── Scheduler, project registry, state                 │
│    ├── Tracker adapters (gh, builtin, …)                  │
│    └── Dashboard (web UI)                                 │
│                                                           │
│  ┌────────── Devcontainer (per project) ──────────────┐   │
│  │                                                     │   │
│  │  Provider CLIs (claude, opencode, codex, gemini,    │   │
│  │                  copilot — based on enabled set)    │   │
│  │  Project deps (node_modules, .NET SDK, etc.)        │   │
│  │  aloop-agent (validated CLI → daemon via socket /   │   │
│  │                forwarded localhost)                 │   │
│  │  Git (operates on bind-mounted worktree)            │   │
│  │                                                     │   │
│  │  NO gh / glab / tracker CLIs (stripped from PATH)   │   │
│  │  NO daemon code, NO tracker API access              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

**Host-only responsibilities:**

- Running the daemon.
- Calling tracker APIs (via adapter).
- Scheduling permits, tracking budgets, running watchdogs.
- Serving the dashboard.
- Session lifecycle.

**Sandbox-only responsibilities:**

- Running provider CLIs.
- Editing files in the session's worktree.
- Running project validation commands.
- Invoking `aloop-agent` to talk to the daemon.

The shim (`loop.sh` / `loop.ps1`) runs inside the container. It asks the daemon for the next prompt, runs the provider, and posts events. The daemon orchestrates everything outside the container.

## Container reuse across sessions

When multiple sessions run in parallel, they share one container per project (not one per session):

- Container startup is slow (seconds). Per-session start is wasteful.
- Provider CLIs and project deps are installed once in the image — no need to duplicate.
- N small containers vs 1 is not a useful isolation boundary since aloop's isolation model is per-**session worktree**, not per-container.
- Each session's worktree is a bind mount into the shared container; scrambled access is prevented by worktree-level git locks and the daemon's scheduler.

First session starts the container; subsequent sessions detect the running container and reuse it. Container stays up until idle timeout (configurable in `daemon.yml`) or explicit shutdown.

## Worktree mounting

Each session has its own worktree under `~/.aloop/state/sessions/<id>/worktree/` on the host. These are bind-mounted into the container. The daemon passes the correct `--workspace-folder` to `devcontainer exec` when invoking the shim for a session so the agent's `$PWD` is that session's worktree.

Alternative: mount the entire `~/.aloop/state/sessions/` directory as a single volume inside the container. Daemon picks the strategy per project; default is per-session bind mounts for explicit scoping.

## `aloop start` with devcontainer

When `.devcontainer/devcontainer.json` exists:

1. CLI calls `POST /v1/sessions` as usual.
2. Daemon checks the project's container state — ensures it is running, starts it if not (`devcontainer up`).
3. Daemon creates the session worktree on the host.
4. Daemon bind-mounts the worktree into the container.
5. Daemon invokes the shim inside the container via `devcontainer exec`.
6. Shim runs the turn loop; `aloop-agent` calls go back to the daemon over the forwarded socket or localhost.
7. Daemon watches state on the host filesystem; dashboard serves it unchanged.

**Container is the default when available.** If `.devcontainer/` exists, the daemon uses it. To bypass, the user passes `--dangerously-skip-container` to `aloop start`, which:

- Prints a visible warning that agents have full host access.
- Logs a `container.bypassed` event.
- Is never set by default by any skill or command.

If `.devcontainer/` does not exist, providers run on the host with a setup suggestion to create one.

## Provider auth in container

**Principle: if authenticated on the host, it should just work in the container, with user-controlled strategy.**

The daemon's setup flow lets the user choose how devcontainer auth is resolved. Default strategy: **`mount-first`** (bind-mount the host auth file first, fall back to env var forwarding). Alternatives: `env-first` (prefer env) or `env-only` (no file mounts at all). The strategy is persisted in project config.

For each enabled provider, the daemon checks the host for available auth signals (env vars and auth files) and produces a `devcontainer.json` fragment per the selected strategy. The user sees a summary (`provider → method`) before files are written.

Only enabled providers get forwarded — unused credentials are never exposed.

### Per-provider auth overview

| Provider | Env var(s) | How to obtain | Notes |
|---|---|---|---|
| Claude Code | `CLAUDE_CODE_OAUTH_TOKEN` (preferred) or `ANTHROPIC_API_KEY` | `claude setup-token` (1-year headless token from Pro/Max subscription) or [Anthropic Console](https://console.anthropic.com/) API Keys | See §Claude Code specifics |
| Codex (OpenAI) | `OPENAI_API_KEY` or `CODEX_API_KEY` | [OpenAI Dashboard](https://platform.openai.com/api-keys) | Can also pipe to `codex login --with-api-key` inside container |
| Gemini CLI | `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) | Supports `.env` in `~/.gemini/` but env var preferred |
| OpenCode | `OPENCODE_API_KEY` or provider-specific keys | Varies by configured backend provider | OpenCode proxies; auth depends on configured models |
| Copilot CLI | `GITHUB_TOKEN` or `GH_TOKEN` or `COPILOT_GITHUB_TOKEN` | GitHub Settings → Fine-grained PATs → enable "Copilot Requests" permission | Older `gh copilot` extension needs separate OAuth (not supported in unattended container) |

## Claude Code specifics

Most nuanced provider for container auth. Three legitimate paths:

1. **`CLAUDE_CODE_OAUTH_TOKEN` env var (recommended).** Generate with `claude setup-token` on a machine with a browser. 1-year headless token from Pro/Max subscription. Forward via `remoteEnv`. ToS-compliant: still Claude Code consuming its own token, just in a headless environment — Anthropic built this command exactly for this case.
2. **`ANTHROPIC_API_KEY` env var.** Pay-as-you-go API billing, no OAuth. Simplest if the user has API access.
3. **Docker volume persistence.** Anthropic's reference devcontainer persists `~/.claude/` across rebuilds in a named volume. Requires one interactive auth after first create. Not ideal for unattended aloop use.

**Preference order for aloop:** `CLAUDE_CODE_OAUTH_TOKEN` > `ANTHROPIC_API_KEY` > volume persistence (fallback).

**Do NOT bind-mount `~/.claude/` from the host.** Anthropic's ToS prohibits third-party tools extracting OAuth tokens. Running the actual `claude` CLI inside a container is not a ToS violation (that's what `setup-token` is for); reusing the OAuth token via extraction is.

## Auth resolution strategy

For each enabled provider, the daemon resolves auth in order:

- **`mount-first` (default)**: auth file bind-mount → env var forwarding → warn user
- **`env-first`**: env var forwarding → auth file bind-mount → warn user
- **`env-only`**: env var forwarding → warn user (never mounts)

The generated `devcontainer.json` reflects the resolution. When neither source is available for an enabled provider, the daemon surfaces a warning and refuses to mark the container ready until the user resolves it or disables that provider.

## Auth file bind mounts (fallback)

Bind mounts for provider auth files, when chosen by the resolution strategy. **Mount only the specific auth file**, never the whole config directory (provider config dirs contain SQLite DBs, lock files, and other state that conflicts with concurrent host access).

| Provider | Auth File Path | Token refresh writes? |
|---|---|---|
| Claude Code | `~/.claude/.credentials.json` | Rare (macOS prefers keychain) |
| OpenCode | `${XDG_DATA_HOME:-~/.local/share}/opencode/auth.json` | No (API keys) |
| Codex | `${CODEX_HOME:-~/.codex}/auth.json` | Yes (refresh token rotation) |
| Copilot | `~/.copilot/config.json` | Yes (token refresh) |
| Gemini | `~/.gemini/oauth_creds.json` + `~/.gemini/google_accounts.json` | Yes (access token expiry) |

**Mount rules:**

- Mount read-write (not read-only). OAuth providers need to write back refreshed tokens.
- Only mount for enabled providers whose auth files exist on host.
- Skip gracefully when an auth file doesn't exist.
- The container user home must match the mount target path (use `remoteUser` from `devcontainer.json`).

## What NOT to do

- **Do NOT bind-mount entire provider config directories** (e.g., `~/.codex/`, `~/.gemini/`). SQLite DBs, lock files, and caches conflict with concurrent host access. Mount only the auth file.
- **Do NOT extract OS keychain tokens.** Brittle, platform-specific.
- **Do NOT store API keys or tokens in `devcontainer.json`.** Always use `${localEnv:...}` references. Never plaintext.
- **Do NOT bind-mount `~/.claude/`** from the host. ToS violation risk. Use `setup-token` or `ANTHROPIC_API_KEY` instead.
- **Do NOT run the daemon inside the container.** The daemon is the host; the container is the sandbox. One per project, on the host.
