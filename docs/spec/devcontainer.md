# Devcontainer

> **Reference document.** Invariants and contracts consumed by agents at runtime. Work items live in GitHub issues; hard rules live in CONSTITUTION.md.
>
> Sources: SPEC.md §Devcontainer Support (lines ~2982-3315) (pre-decomposition, 2026-04-18).

## Table of contents

- Goal
- Devcontainer spec research
- Devcontainer generation
- Config generation
- Provider installation
- Verification
- Loop integration
- Shared container for parallel loops
- `aloop start` with devcontainer
- Provider auth in container
- Per-provider auth
- Claude Code container auth
- `devcontainer.json` configuration
- Fallback: auth file bind-mounts
- What NOT to do

---

## Goal

Enable aloop loops to run inside VS Code devcontainers for full isolation. Provide a skill (`/aloop:devcontainer`) that generates a project-tailored `.devcontainer/` config, verifies it builds and starts, and confirms all loop dependencies are available inside the container.

Why this matters:

- Security boundary: devcontainer is the natural sandbox for Layer 2 (agent execution) — agents can't access host GH tokens, filesystem, or network beyond what's mounted
- Reproducibility: identical environment across machines, no "works on my machine" provider/tool version drift
- Required for convention-file protocol: the harness runs on host, the agent runs in container, `requests/` and `queue/` cross the boundary via bind mount

## Devcontainer spec research

Before implementing any devcontainer generation, the agent MUST research the current devcontainer specification by reading the official documentation at https://code.visualstudio.com/docs/devcontainers and the spec at https://containers.dev/implementors/spec/. This is non-negotiable — do not assume config format, available properties, feature syntax, lifecycle hooks, mount syntax, or `remoteEnv`/`containerEnv` semantics from training data alone. The spec evolves and training data may be stale.

**What to research:**
- `devcontainer.json` full property reference (image vs build, features, mounts, lifecycle hooks)
- Lifecycle hook ordering: `initializeCommand` → `onCreateCommand` → `updateContentCommand` → `postCreateCommand` → `postStartCommand` → `postAttachCommand`
- Feature specification and available features (`ghcr.io/devcontainers/features/`)
- Mount syntax (bind mounts, volume mounts, tmpfs)
- `remoteEnv` / `containerEnv` / `localEnv` semantics and variable substitution (`${localEnv:VAR}`, `${containerWorkspaceFolder}`, etc.)
- `devcontainer` CLI commands: `build`, `up`, `exec`, `read-configuration`
- Multi-workspace and worktree mounting patterns
- Docker Compose integration (for projects needing databases/services)

**The examples in this section below are illustrative, not authoritative.** The implementation must use the researched spec as the source of truth.

## Devcontainer generation

The skill analyzes the project and generates a tailored devcontainer config:

**Step 1 — Project analysis**
- Detect language/runtime (package.json → Node, *.csproj → .NET, pyproject.toml → Python, go.mod → Go, etc.)
- Detect required tools (database services, build tools, system deps)
- Read existing `SPEC.md`, `CLAUDE.md`, `README.md` for dependency hints
- Check for existing `.devcontainer/` — offer to augment or replace

## Config generation

Generate `.devcontainer/devcontainer.json` (and `Dockerfile` if needed):

```jsonc
{
  "name": "${project-name}-aloop",
  "image": "mcr.microsoft.com/devcontainers/${base-image}",
  // OR "build": { "dockerfile": "Dockerfile" } for complex setups
  "features": {
    // auto-selected based on project analysis
    "ghcr.io/devcontainers/features/node:1": {},
    "ghcr.io/devcontainers/features/git:1": {}
  },
  "postCreateCommand": "${install-command}",  // npm install, dotnet restore, etc.
  "mounts": [
    // Bind mount for convention-file protocol (host harness <-> container agent)
    "source=${localWorkspaceFolder}/.aloop,target=/workspace/.aloop,type=bind"
  ],
  "containerEnv": {
    "ALOOP_NO_DASHBOARD": "1",  // dashboard runs on host, not in container
    "ALOOP_CONTAINER": "1"      // signals to loop that it's inside a container
  },
  "customizations": {
    "vscode": {
      "extensions": [
        // provider extensions auto-detected
      ]
    }
  }
}
```

## Provider installation

Generate a `postCreateCommand` or `onCreateCommand` script that installs the enabled providers inside the container:
- `claude`: npm install -g @anthropic-ai/claude-code
- `codex`: npm install -g @openai/codex
- `gemini`: npm install -g @google/gemini-cli (or equivalent)
- `opencode`: npm install -g opencode (or equivalent)
- `copilot`: installed via VS Code extension, not CLI inside container

Only install providers listed in the project's `config.yml` `enabled_providers`.

## Verification

After generating the config, the skill MUST verify it works:

1. `devcontainer build --workspace-folder .` — container image builds successfully
2. `devcontainer up --workspace-folder .` — container starts
3. Inside the running container, verify:
   - Project deps installed (`node_modules/`, `bin/`, etc. exist)
   - Each enabled provider CLI is available (`which claude`, `which codex`, etc.)
   - Git is functional (`git status`)
   - `.aloop/` bind mount is accessible
   - Build/test commands from `config.yml` `validation_commands` pass
4. `devcontainer exec --workspace-folder . -- aloop status` — aloop CLI reachable (if installed globally)
5. Report results: pass/fail per check with actionable fix suggestions

If any check fails, the skill iterates: fix the config, rebuild, re-verify. Do not mark setup complete until all checks pass.

## Loop integration

Once a devcontainer is set up for a project, the loop **automatically** uses it — no `--devcontainer` flag needed. The harness (loop.ps1/loop.sh) detects `.devcontainer/` in the project and routes all provider invocations through `devcontainer exec`. The harness itself always runs on the host.

**Architecture: harness on host, agents in container**

```
┌─── Host ──────────────────────────────────────────────┐
│  loop.ps1 / loop.sh  (harness)                        │
│    ├── reads TODO.md, SPEC.md, status.json             │
│    ├── decides phase, provider, iteration              │
│    ├── dashboard server (node)                         │
│    ├── runtime processes requests/ (convention-file)    │
│    └── invokes provider via:                           │
│         devcontainer exec -- claude --print ...        │
│                                                        │
│  ┌─── Devcontainer ─────────────────────────────────┐  │
│  │  Provider CLIs (claude, codex, gemini)            │  │
│  │  Project deps (node_modules, .NET SDK, etc.)      │  │
│  │  Git (operates on bind-mounted worktree)          │  │
│  │  NO gh CLI, NO host network access beyond API     │  │
│  │  .aloop/ bind mount for convention-file protocol  │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

**Container is the default — opt-out requires explicit danger flag:**

Once `.devcontainer/devcontainer.json` exists in the project, the harness ALWAYS uses it. There is no flag to "prefer" host execution. To bypass the container, the user must pass `--dangerously-skip-container`, which:
- Prints a visible warning: `⚠️  DANGER: Running agents directly on host without container isolation. Agents have full access to your filesystem, network, and credentials.`
- Logs a `container_bypass` event to `log.jsonl`
- Is never set by default or by any skill/command

**Auto-detection logic in harness:**
1. Check if `.devcontainer/devcontainer.json` exists in the work directory
2. If yes and `--dangerously-skip-container` NOT set:
   a. Check if container is already running (`devcontainer exec -- echo ok`)
   b. If not running, `devcontainer up --workspace-folder .`
   c. All `Invoke-Provider` / `invoke_provider` calls wrap the CLI command in `devcontainer exec --workspace-folder <workdir> -- <provider-command>`
3. If `.devcontainer/` does not exist, providers run directly on host (current behavior) — but `aloop start` prints a suggestion: `No devcontainer found. Run /aloop:devcontainer to set up isolated agent execution.`

This means: after `/aloop:devcontainer` sets up the container once, every subsequent `aloop start` automatically sandboxes agents inside it. The container is opt-out, not opt-in.

## Shared container for parallel loops

When running multiple loops in parallel (orchestrator mode or manual), do NOT start a separate container per loop. All loops share one running container instance, each operating on its own worktree:

**Why shared:**
- Container startup is slow (10-30s) — unacceptable per-iteration or per-loop
- Provider CLIs are installed once in the container image — no need to duplicate
- Memory/CPU overhead of N containers vs 1 is significant
- Worktree isolation already provides filesystem separation

**How it works:**
1. First loop to start calls `devcontainer up` — container starts
2. Subsequent loops detect the container is already running (via `devcontainer exec -- echo ok`) and reuse it
3. Each loop passes its own `--workspace-folder` / `--work-dir` pointing to its worktree
4. The harness uses `devcontainer exec --workspace-folder <worktree-path> -- <command>` so the agent's `$PWD` is the correct worktree
5. Container stays running until explicitly stopped or last loop finishes

**Worktree mount strategy:**
- The project root is already mounted at `/workspace` by devcontainer default
- Git worktrees created by `aloop start` live under `~/.aloop/sessions/<id>/worktree/` on the host
- These must be bind-mounted into the container — the harness adds them dynamically:
  `devcontainer exec --remote-env WORK_DIR=<path> --workspace-folder <path> -- <command>`
- Alternatively, mount `~/.aloop/sessions/` as a volume in `devcontainer.json` so all worktrees are accessible

**Concurrency safety:**
- Provider CLIs are stateless per-invocation — safe to run N in parallel
- Each worktree has its own `.git` lock — no git conflicts between loops
- `requests/` and `queue/` are per-session — no cross-contamination

## `aloop start` with devcontainer

1. Harness detects `.devcontainer/devcontainer.json` in project root
2. If container not running → `devcontainer up --workspace-folder .`
3. Harness creates session, worktree (on host)
4. Harness runs loop iterations, wrapping each provider call in `devcontainer exec`
5. Host monitors `status.json` directly (host filesystem)
6. Runtime processes `requests/*.json` (convention-file protocol)
7. Dashboard runs on host, reads session data from host filesystem

## Provider auth in container

**Principle: if you're authenticated on the host, it should just work in the container. Zero manual config, with user-controlled strategy.**

The setup skill must let the user choose how devcontainer auth is resolved. Default is `mount-first` (auth file bind-mounts first), with `env-first` and `env-only` as alternatives. The confirmation summary must show the proposed method per activated provider before files are written.

**Auto-detection flow (runs during devcontainer setup/verification):**

For each activated provider, the skill checks the host for existing auth and resolves it using the selected strategy:

1. Gather both available signals (env vars and auth files) per provider.
2. Apply the selected strategy:
   - `mount-first` (default): auth file bind-mount → env var forwarding → warn/prompt
   - `env-first`: env var forwarding → auth file bind-mount → warn/prompt
   - `env-only`: env var forwarding → warn/prompt
3. Show a pre-write summary (`provider -> method`) and allow user override before scaffold/devcontainer generation.

Only activated providers get forwarded — never expose unused credentials.

## Per-provider auth

| Provider | Env var(s) | How to obtain | Notes |
|---|---|---|---|
| Claude Code | `CLAUDE_CODE_OAUTH_TOKEN` (preferred) or `ANTHROPIC_API_KEY` | `claude setup-token` (generates 1-year headless token from Pro/Max subscription) or [Anthropic Console](https://console.anthropic.com/) API Keys | See Claude-specific section below. `setup-token` uses existing subscription; `ANTHROPIC_API_KEY` switches to pay-as-you-go. |
| Codex (OpenAI) | `OPENAI_API_KEY` or `CODEX_API_KEY` | [OpenAI Dashboard](https://platform.openai.com/api-keys) | Can also pipe to `codex login --with-api-key` inside container |
| Gemini CLI | `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) | Also supports `.env` file in `~/.gemini/` but env var preferred |
| OpenCode | `OPENCODE_API_KEY` or provider-specific keys | Varies by configured backend provider | OpenCode proxies to various providers; auth depends on which backend models are configured |
| Copilot CLI | `GITHUB_TOKEN` or `GH_TOKEN` or `COPILOT_GITHUB_TOKEN` | GitHub Settings → Fine-grained PATs → enable "Copilot Requests" permission | Newer Copilot CLI supports PAT via env var; older `gh copilot` extension requires separate OAuth (not supported in unattended container) |
| GitHub CLI (gh) | `GH_TOKEN` or `GITHUB_TOKEN` | GitHub Settings → PATs | For convention-file GH request processing on host-side monitor (not typically needed inside container) |

## Claude Code container auth

Claude Code is the most nuanced provider for container auth. Three legitimate approaches exist:

1. **`CLAUDE_CODE_OAUTH_TOKEN` env var (recommended for aloop)** — Run `claude setup-token` on a machine with a browser. This generates a 1-year OAuth token designed for headless/container use. Requires Claude Pro or Max subscription. Forward via `remoteEnv`:
   ```json
   "remoteEnv": { "CLAUDE_CODE_OAUTH_TOKEN": "${localEnv:CLAUDE_CODE_OAUTH_TOKEN}" }
   ```
   This is ToS-compliant: it's still Claude Code consuming its own token, just in a headless environment. Anthropic built this command specifically for this use case.

2. **`ANTHROPIC_API_KEY` env var** — Uses API pay-as-you-go billing (separate from subscription). No OAuth involved. Simplest option if user has API access:
   ```json
   "remoteEnv": { "ANTHROPIC_API_KEY": "${localEnv:ANTHROPIC_API_KEY}" }
   ```

3. **Docker volume persistence** — Anthropic's own reference devcontainer uses a named volume to persist `~/.claude/` across container rebuilds. User authenticates once interactively inside the container, credentials persist in the volume:
   ```json
   "mounts": [ "source=claude-code-config-${devcontainerId},target=/home/node/.claude,type=volume" ]
   ```
   This is official Anthropic practice (from their [reference devcontainer](https://github.com/anthropics/claude-code/tree/main/.devcontainer)). Not ideal for aloop's unattended use — requires one-time interactive auth after first container creation.

**Preference order for aloop:** `CLAUDE_CODE_OAUTH_TOKEN` > `ANTHROPIC_API_KEY` > volume persistence (fallback).

**ToS clarification:** Anthropic's ToS prohibits third-party tools from extracting and reusing OAuth tokens. Running the actual `claude` CLI binary inside a container (which is what aloop does — `claude -p`) is NOT a ToS violation — it's Claude Code itself running in a different environment. The `setup-token` command was built explicitly for this. Do NOT bind-mount `~/.claude/` from the host — use env vars or volume persistence instead.

## `devcontainer.json` configuration

Only forward env vars for providers **activated in the project's aloop config**.

Since multiple loops with different providers may share one container, the devcontainer must forward auth for **all providers the project has configured** — not just the ones a single loop uses. For example, if the project config lists `claude`, `codex`, and `gemini` as available providers, all three get `remoteEnv` entries even if a given loop only uses `claude`. This ensures any loop launched inside the shared container can use any configured provider without rebuilding.

```json
{
  "remoteEnv": {
    "CLAUDE_CODE_OAUTH_TOKEN": "${localEnv:CLAUDE_CODE_OAUTH_TOKEN}",
    "OPENAI_API_KEY": "${localEnv:OPENAI_API_KEY}",
    "GEMINI_API_KEY": "${localEnv:GEMINI_API_KEY}"
  }
}
```

The skill's devcontainer generator MUST:
- Read the project's provider config to determine which providers are activated
- Only add `remoteEnv` entries for activated providers — never forward unused credentials
- Warn the user if a required env var is not set on the host
- For Claude Code: check `CLAUDE_CODE_OAUTH_TOKEN` first, fall back to `ANTHROPIC_API_KEY`, then suggest `claude setup-token` if neither is set
- Verification step MUST confirm each activated provider can authenticate inside the container

## Fallback: auth file bind-mounts

Most users authenticate providers via browser OAuth and never set env vars. The default `mount-first` strategy should work for this path by bind-mounting individual auth credential files. **Mount only the specific auth file, never the whole config directory** (provider config dirs contain SQLite DBs, lock files, and other state that conflicts with concurrent host access).

| Provider | Auth File Path | XDG? | Token Refresh Writes? |
|----------|---------------|------|----------------------|
| Claude Code | `~/.claude/.credentials.json` | No | Rare (macOS prefers keychain) |
| OpenCode | `${XDG_DATA_HOME:-~/.local/share}/opencode/auth.json` | Yes | No (API keys, not OAuth) |
| Codex | `${CODEX_HOME:-~/.codex}/auth.json` | No | Yes (refresh token rotation) |
| Copilot | `~/.copilot/config.json` | No | Yes (token refresh) |
| Gemini | `~/.gemini/oauth_creds.json` + `~/.gemini/google_accounts.json` | No | Yes (access token expiry) |

**Mount rules:**
- Mount read-write (not read-only) — OAuth providers need to write back refreshed tokens
- Only mount for activated providers whose auth files exist on host
- Skip mount gracefully if auth file doesn't exist (user hasn't authenticated that provider)
- Container user home must match mount target path — use `remoteUser` from devcontainer config to determine target
- For Claude Code on macOS: the file may not exist if auth is keychain-only — fall back to `claude setup-token` guidance

**Auth resolution order (per provider):**
- `mount-first` (default): auth file exists on host -> bind-mount; else env var set on host -> `remoteEnv`; else warn user
- `env-first`: env var set on host -> `remoteEnv`; else auth file exists on host -> bind-mount; else warn user
- `env-only`: env var set on host -> `remoteEnv`; else warn user

```jsonc
{
  "mounts": [
    // Only for providers where auth file exists but no env var is set
    "source=${localEnv:HOME}/.codex/auth.json,target=/home/dev/.codex/auth.json,type=bind",
    "source=${localEnv:HOME}/.gemini/oauth_creds.json,target=/home/dev/.gemini/oauth_creds.json,type=bind",
    "source=${localEnv:HOME}/.gemini/google_accounts.json,target=/home/dev/.gemini/google_accounts.json,type=bind"
  ]
}
```

## What NOT to do

- **Do NOT bind-mount entire provider config directories** (e.g. `~/.codex/`, `~/.gemini/`) — they contain SQLite DBs, lock files, and caches that conflict with concurrent host access. Mount only the auth file.
- **Do NOT extract OS keychain tokens** — brittle, platform-specific
- **Do NOT store API keys or tokens in devcontainer.json** — use `${localEnv:...}` references, never plaintext
