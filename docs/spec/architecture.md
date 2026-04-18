# Architecture

> **Reference document.** Invariants and contracts consumed by agents at runtime. Work items live in GitHub issues; hard rules live in CONSTITUTION.md.
>
> Sources: SPEC.md §Architecture, §Inner Loop vs Runtime, §Cross-Platform (lines ~12-101) (pre-decomposition, 2026-04-18).

## Table of contents

- Layered architecture
- Cross-platform compatibility
- Inner Loop vs Runtime (boundary contract)
- Inner Loop responsibilities
- Inner Loop does NOT
- Aloop Runtime (shared base)
- Dashboard (uses runtime + adds UI)
- Orchestrator (uses runtime + adds issue management)
- Communication contract

---

## Layered architecture

Aloop is an autonomous coding agent orchestrator that runs configurable agent pipelines with multi-provider support (Claude, Codex, Gemini, Copilot, OpenCode), a real-time dashboard, GitHub integration, and a parallel orchestrator for complex multi-issue projects. It operates in two modes: **loop** (single-track iterative development) and **orchestrator** (fan-out via GitHub issues with wave scheduling and concurrent child loops).

Constraints:
- **TypeScript / Bun** — CLI source is TypeScript, built with Bun into a bundled `dist/index.js`
- **Config stays YAML** — shell-friendly for loop.sh/loop.ps1 parsing
- **Runtime state stays JSON** — active.json, status.json, session state, loop-plan.json

| Layer | Runs where | Tech | Deps |
|-------|-----------|------|------|
| `aloop` CLI (discover, scaffold, resolve) | Developer machine | TypeScript / Bun (bundled `dist/index.js`) | Bun |
| Loop scripts (execute compiled pipeline from `loop-plan.json`) | Anywhere — containers, sandboxes, CI | `loop.ps1` / `loop.sh` | Shell + git + provider CLI |

## Cross-platform compatibility

- PowerShell 5.1 requires careful string interpolation — avoid `($var text)` pattern (causes parse failures); use `$($var)` subexpression syntax instead
- `.editorconfig` must enforce `end_of_line = crlf` for `*.ps1` files
- `install.ps1` must normalize line endings when copying loop scripts to `~/.aloop/bin/`
- Agents should use Write tool (full file) instead of Edit for `.ps1` files if line-ending corruption is detected
- Path format must match target script expectations: POSIX paths for bash, Windows-native paths for PowerShell
- `aloop start` must detect the current shell and convert paths to the target script's expected format

---

## Inner Loop vs Runtime (boundary contract)

The inner loop (`loop.sh` / `loop.ps1`) and the aloop runtime (`aloop` CLI, TS/Bun) are **separate programs** with a strict boundary. The inner loop may run inside a container where the aloop CLI is not available.

## Inner Loop responsibilities

The loop has exactly **three concepts**: cycle, finalizer, and queue.

- **Queue** — check `queue/` folder for override prompts before anything else (queue always takes priority)
- **Cycle** — read `loop-plan.json`, pick prompt at `cyclePosition % cycle.length`. Repeats while tasks remain.
- **Finalizer** — when all TODO.md tasks are done at cycle boundary, switch to `finalizer[]` array in `loop-plan.json`. Process sequentially with its own `finalizerPosition`. If any finalizer agent creates new TODOs → abort finalizer, reset `finalizerPosition` to 0, resume cycle. If finalizer completes with no new TODOs → set `state: completed`, exit.
- Parse frontmatter from prompt files (provider, model, agent, reasoning, trigger) — same parser for cycle, finalizer, and queue prompts. **`trigger:` is parsed and logged but never acted upon by the loop.**
- Invoke provider CLIs directly (claude, opencode, codex, gemini, copilot)
- Write `status.json` and `log.jsonl` after each iteration
- Update `cyclePosition`/`finalizerPosition` and `iteration` in `loop-plan.json`
- Delete consumed queue files after agent completes
- Wait for pending `requests/*.json` to be processed by runtime before next iteration (with timeout)
- Iteration counting and status tracking
- Read `TODO.md` to detect `allTasksMarkedDone` (mechanical checkbox count, not agent-emitted)
- Hot-reload provider list from `meta.json` each iteration (for round-robin fallback when frontmatter provider is unavailable)
- Track and kill child processes (provider timeout, cleanup on exit)
- Sanitize environment (`CLAUDECODE`, `PATH` hardening)

## Inner Loop does NOT

- Parse pipeline YAML config
- Evaluate transition rules (`onFailure`, escalation ladders)
- Resolve triggers (loop parses `trigger:` but never acts on it — that's the runtime's job)
- Talk to GitHub API or any external service
- Know about other child loops or the orchestrator
- Run the dashboard or any HTTP server
- Process requests (it writes them; the runtime processes them)
- Decide what work to do next (cycle/finalizer order and queue contents are controlled externally)

## Aloop Runtime (shared base — `aloop/cli/src/lib/runtime.ts`)

The runtime is a **shared library** used by both the dashboard and the orchestrator. It is NOT the dashboard — the dashboard imports it. The runtime handles all intelligence that the loop script cannot:

- Compile pipeline YAML into `loop-plan.json` (cycle + finalizer arrays of prompt filenames)
- Generate prompt files with frontmatter from pipeline config
- Rewrite `loop-plan.json` on permanent mutations (cycle changes, position adjustments)
- **Trigger resolution** — scan prompt catalog for `trigger:` frontmatter, resolve chains, write matching prompts to `queue/`
- **Steering** — detect STEERING.md, queue steer + follow-up plan
- **Stuck detection** — detect N consecutive failures, queue debug agent
- Process `requests/*.json` from agents — execute side effects (GitHub API, child dispatch, PR ops)
- Queue follow-up prompts into `queue/` after processing requests (response baked into prompt)
- Manage sessions (create, resume, stop, cleanup, lockfiles)
- Monitor provider health (cross-session)
- GitHub operations (`aloop gh` subcommands)

## Dashboard (uses runtime + adds UI)

- Imports and calls `runtime.monitorSessionState()` on file changes
- Serves HTTP API + WebSocket for dashboard UI
- Pure observability + user steering interface
- **NOT essential** — loop works without it. Runtime features (trigger resolution, steering) work through other entry points too.
- **Dashboard lifecycle rules:**
  - Orchestrator-dispatched child loops MUST NOT start a dashboard (`--no-dashboard` flag). Dashboards are for human observation; headless children don't need them.
  - `aloop start` checks for an existing dashboard (via `meta.json` dashboard_port) and reuses it if still responding. Only starts a new instance if none is running.
  - `aloop dashboard` (explicit) always starts a new instance regardless.

## Orchestrator (uses runtime + adds issue management)

- Imports runtime for trigger resolution, queue management, session lifecycle
- Adds: spec decomposition, issue tracking, wave scheduling, child loop dispatch, PR gating, replan
- Runs as `aloop orchestrate` — separate process from dashboard

## Communication contract

- **Runtime → Inner Loop**: `loop-plan.json` (cycle + finalizer), `meta.json` (providers), `queue/*.md` (overrides with frontmatter)
- **Inner Loop → Runtime**: `status.json` (current state), `log.jsonl` (history), `requests/*.json` (side-effect requests)
- **Prompt files** (shared): frontmatter carries agent config (provider, model, reasoning, trigger); body is the prompt. Same format for cycle, finalizer, and queue prompts.
