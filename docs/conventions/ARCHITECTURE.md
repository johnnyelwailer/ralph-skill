# Architecture Conventions — Aloop

> Agents read this file to make consistent architectural decisions.

## Two-Boundary Design

Aloop has two distinct execution boundaries:

| Boundary | Tech | Runs Where | Purpose |
|----------|------|-----------|---------|
| **Aloop Runtime** | TypeScript / Bun (bundled ESM) | Developer machine | CLI, dashboard server, orchestrator, request processing |
| **Inner Loop** | Shell scripts (`loop.sh` / `loop.ps1`) | Anywhere — containers, CI, sandboxes | Execute compiled pipeline, invoke provider CLIs |

These boundaries communicate exclusively through files. The inner loop may run in a container where the aloop CLI is not installed.

### Communication Contract

```
Runtime → Inner Loop:
  loop-plan.json    (cycle + finalizer arrays of prompt filenames)
  meta.json         (available providers, models)
  queue/*.md        (override prompts with frontmatter)

Inner Loop → Runtime:
  status.json       (current state, iteration, position)
  log.jsonl         (iteration history)
  requests/*.json   (side-effect requests for runtime to process)
```

## File-Based State (JSON)

All runtime state is stored as JSON files in the session directory. No databases.

| File | Purpose | Written By |
|------|---------|-----------|
| `loop-plan.json` | Compiled pipeline (cycle, finalizer, positions) | Runtime |
| `status.json` | Current loop state (iteration, phase, provider) | Inner loop |
| `log.jsonl` | Append-only iteration history | Inner loop |
| `active.json` | Currently active session pointer | Runtime |
| `meta.json` | Provider health, available models | Runtime |
| `requests/*.json` | Agent side-effect requests | Inner loop (agent output) |
| `queue/*.md` | Priority prompt overrides | Runtime (steering, triggers) |

Why file-based: The inner loop runs in shell. JSON is the simplest format that both shell (`jq`) and TypeScript can read/write reliably.

## Pipeline Architecture

Pipelines are defined in YAML agent configs and compiled to `loop-plan.json`:

```
YAML config → aloop compile → loop-plan.json → loop.sh executes
```

The default pipeline: `plan → build x5 → proof → qa → review`

- **Cycle** — repeating sequence while tasks remain in TODO.md
- **Finalizer** — sequential post-completion steps (proof, qa, review). If any creates new TODOs, abort finalizer, resume cycle.
- **Queue** — priority overrides that interrupt the cycle (steering, triggered prompts)

## Multi-Provider Agent Configs

Agents are configured via YAML with frontmatter in prompt files:

```yaml
provider: claude          # Which CLI to invoke
model: opus               # Model ID (optional, uses default)
reasoning: extended        # Reasoning effort level
trigger: on-test-failure   # When to auto-queue this prompt
```

Supported providers: `claude`, `opencode`, `codex`, `gemini`, `copilot`

Per-phase reasoning effort:
- `xhigh` for plan and review phases
- `medium` for build phases
- Configurable via frontmatter or agent YAML

## Dashboard as Separate React SPA

The dashboard is a standalone React application served by the aloop CLI:

```
aloop/cli/dashboard/     # Vite + React 18 SPA
aloop/cli/src/           # Express server serves built dashboard + API
```

- Dashboard is **not essential** — the loop works without it.
- Pure observability + user steering interface.
- Communicates with runtime via HTTP API + WebSocket.
- Reads session state files; writes steering commands to `STEERING.md` and `queue/`.

## Orchestrator Architecture

The orchestrator (`aloop orchestrate`) manages multi-issue projects:

1. **Spec decomposition** — break spec into GitHub issues
2. **Wave scheduling** — group issues into dependency waves
3. **Child loop dispatch** — spawn a loop per issue (parallel within wave)
4. **PR gating** — each child creates a PR; orchestrator gates merges
5. **Replan** — after a wave completes, reassess remaining work

The orchestrator imports the shared runtime library for trigger resolution, queue management, and session lifecycle.

### Pluggable Adapters

- **Issue/PR adapter** — GitHub first, local file-based adapter planned
- Adapter interface allows swapping GitHub for other systems

## Separation of Concerns

- **Separate I/O from logic.** Business rules are testable without file systems or APIs.
- **Boundary pattern:** Core logic is pure functions; adapters handle external communication.
- **Don't leak infrastructure into domain.** HTTP details, file paths, and provider CLI specifics stay at the edges.

## Error & Resilience Patterns

| Pattern | Use When |
|---------|----------|
| **Fail fast** | Invalid state detected early — reject immediately |
| **Retry + backoff** | Transient provider failures, rate limits. Cap retries (3-5). |
| **Stuck detection** | N consecutive failures → queue debug agent |
| **Graceful degradation** | Provider unavailable → round-robin fallback |
| **Idempotency** | Request processing — same request ID processed once |

## Resumability

The orchestrator and loops must be **resumable after kill/restart**:
- All state is in files (no in-memory-only state)
- `loop-plan.json` tracks position; resume from last position
- Orchestrator tracks wave progress; resume from last incomplete wave
- Session lockfiles prevent duplicate runs

## When to Split vs Keep Together

| Signal | Action |
|--------|--------|
| Logic needs both TS and shell | Boundary contract via JSON files |
| Feature is dashboard-only | Keep in `dashboard/` |
| Feature is CLI-only | Keep in `cli/src/` |
| Feature is shared | Put in `cli/src/lib/` (shared runtime) |
| "Just in case" | Don't split. YAGNI. |

References:
- [Martin Fowler: Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/)
- [Microsoft: Cloud Design Patterns](https://learn.microsoft.com/en-us/azure/architecture/patterns/)
