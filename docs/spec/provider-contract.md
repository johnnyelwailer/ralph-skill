# Provider Contract

> **Reference document.** Invariants and contracts consumed by agents at runtime. Work items live in GitHub issues; hard rules live in CONSTITUTION.md.
>
> Sources: SPEC.md §Global Provider Health & Rate-Limit Resilience (lines ~103-204), SPEC-ADDENDUM.md §OpenCode First-Class Parity, §OpenRouter Cost Monitoring (pre-decomposition, 2026-04-18).

## Table of contents

- Health file layout
- Status definitions
- Exponential backoff
- Failure classification
- Concurrency / file locking
- Round-robin integration
- Observability
- OpenCode first-class parity
- OpenRouter cost monitoring

---

## Health file layout

All sessions share a cross-session provider health system so that when a provider hits rate limits, auth expiry, or outages, all loops skip it immediately instead of burning iterations retrying independently.

**One health file per provider** to minimize lock contention:

```
~/.aloop/health/
  claude.json
  codex.json
  gemini.json
  copilot.json
  opencode.json
```

Each file tracks:

```json
{
  "status": "healthy | cooldown | degraded",
  "last_success": "<iso-timestamp>",
  "last_failure": "<iso-timestamp | null>",
  "failure_reason": "<rate_limit | auth | timeout | unknown>",
  "consecutive_failures": 0,
  "cooldown_until": "<iso-timestamp | null>"
}
```

## Status definitions

- `healthy` — provider available, no recent failures
- `cooldown` — transient failures (rate limit, timeout), auto-recovers after backoff
- `degraded` — persistent failure (auth expired, quota exhausted), requires user action

## Exponential backoff (hard-capped)

| Consecutive failures | Cooldown |
|---------------------|----------|
| 1 | none (could be flaky) |
| 2 | 2 min |
| 3 | 5 min |
| 4 | 15 min |
| 5 | 30 min |
| 6+ | 60 min (hard cap) |

Any successful call from ANY session resets `consecutive_failures` to 0 and status to `healthy`.

## Failure classification

| Signal | Classification | Action |
|--------|---------------|--------|
| HTTP 429 / rate limit pattern in stderr | `rate_limit` | cooldown |
| Connection timeout / network error | `timeout` | cooldown |
| Auth error (expired token, invalid key) | `auth` | degraded (no auto-recover) |
| "Cannot launch inside another session" | `concurrent_cap` | cooldown (short — 2 min) |
| Unknown non-zero exit | `unknown` | cooldown |

## Concurrency / file locking

- **Writes**: Exclusive file lock via `[System.IO.File]::Open()` with `FileShare.None`
- **Reads**: Shared lock via `FileShare.Read` (multiple loops can read simultaneously)
- **Lock retry**: 5 attempts with progressive backoff (50ms, 100ms, 150ms, 200ms, 250ms)
- **Graceful degradation**: If lock acquisition fails after all retries, skip health update and log `health_lock_failed` — loop continues normally, just without updating health that iteration
- **One file per provider**: Two loops hitting different providers = zero contention

## Round-robin integration

Before selecting the next provider, check its health file:
- `healthy` → use it
- `cooldown` with `cooldown_until` in the future → skip, try next in rotation
- `degraded` → skip, try next in rotation

If ALL providers are in cooldown/degraded: sleep until the earliest cooldown expires, then retry. Log `all_providers_unavailable` event.

## Observability

- Every health state change logged to `log.jsonl` (`provider_cooldown`, `provider_recovered`, `provider_degraded`)
- `/aloop:status` (and `aloop status` CLI) displays provider health table:
  ```
  Provider Health:
    claude   healthy     (last success: 2m ago)
    codex    cooldown    (3 failures, resumes in 12m)
    gemini   healthy     (last success: 5m ago)
    copilot  degraded    (auth error — run `gh auth login`)
    opencode healthy     (last success: 3m ago)
  ```
- Dashboard SSE includes provider health in session status events

---

## OpenCode first-class parity

OpenCode is a fully supported provider with feature parity to Claude agents. Agent definitions for OpenCode live in `.opencode/agents/` in the worktree (installed by `aloop setup`). Each agent is a markdown file with YAML frontmatter:

```
.opencode/agents/
  vision-reviewer.md
  error-analyst.md
  code-critic.md
  test-writer.md
  security-scanner.md
```

**Full agent YAML parity with Claude agents:**

| Feature | Claude (`claude/commands/`) | OpenCode (`.opencode/agents/`) |
|---------|---------------------------|-------------------------------|
| Agent definition format | Markdown with YAML frontmatter | Markdown with YAML frontmatter |
| Model selection | `model:` in frontmatter | `model:` in frontmatter (OpenRouter path) |
| Reasoning effort | `reasoning:` in frontmatter | `reasoning:` in frontmatter (passed as `--variant`) |
| Subagent delegation | `Task` tool (native) | `task` tool (native in opencode) |
| File attachment | Not supported in headless | `-f` flag on `opencode run` |
| Session export | Not available | `opencode export <sessionID>` for cost data |

**Task tool for subagent delegation:** OpenCode's `task` tool creates a child session with a specified agent. This is the primary delegation mechanism. The `task` tool is available when agents are defined in `.opencode/agents/`. No additional configuration is needed.

**OpenRouter model selection:** OpenCode routes through OpenRouter, supporting any model in the OpenRouter catalog. Model IDs in frontmatter use the OpenRouter path format:

```yaml
---
provider: opencode
model: openrouter/anthropic/claude-opus-4-6
reasoning: xhigh
---
```

The `openrouter/` prefix is required for models accessed via OpenRouter. Models in opencode's built-in registry can be referenced directly.

**Cost-aware provider routing:** When multiple providers are configured and the round-robin selects a provider, cost should be a factor:

- For equivalent capability (e.g., two frontier models), prefer the cheaper provider
- `reasoning: medium` tasks should prefer cheaper models over expensive reasoning models
- This is a soft preference, not a hard rule — provider health and availability take priority

Configuration in `meta.json`:

```json
{
  "cost_aware_routing": true,
  "model_cost_preferences": {
    "build": "prefer_cheap",
    "review": "prefer_capable",
    "proof": "prefer_cheap"
  }
}
```

---

## OpenRouter cost monitoring

All cost data is obtained through OpenCode's public CLI interface — **no reading of internal files like `auth.json` or direct SQLite access**. OpenCode provides three methods:

**1. Per-session cost — `opencode export <sessionID>`**

Returns full session JSON with per-message cost and token data:

```json
{
  "messages": [
    {
      "role": "assistant",
      "tokens": { "input": 15200, "output": 3400, "cache": { "read": 48000 } },
      "cost": 0.0034,
      "modelID": "openrouter/anthropic/claude-sonnet-4-6",
      "providerID": "openrouter"
    }
  ]
}
```

This is the primary per-iteration cost source.

**2. Aggregate statistics — `opencode stats`**

```bash
opencode stats              # Overall aggregate
opencode stats --models     # Per-model breakdown
opencode stats --days 7     # Last 7 days
```

**3. SQL queries — `opencode db` (most powerful for dashboard)**

```bash
# Per-session cost aggregate
opencode db "
  SELECT session_id,
    SUM(CAST(json_extract(data,'$.tokens.input') AS INTEGER)) as input_tokens,
    SUM(CAST(json_extract(data,'$.tokens.output') AS INTEGER)) as output_tokens,
    SUM(CAST(json_extract(data,'$.cost') AS REAL)) as cost_usd
  FROM message
  WHERE json_extract(data,'$.role')='assistant'
  GROUP BY session_id
" --format json
```

The `opencode db` command handles all database access internally — aloop never touches the SQLite file directly.

**OpenRouter usage payloads:** OpenRouter includes a `usage` object in every API response (streaming and non-streaming):

```json
{
  "usage": {
    "prompt_tokens": 1940,
    "completion_tokens": 512,
    "total_tokens": 2452,
    "cost": 0.0034
  }
}
```

**Extraction approach** for loop.sh:

```bash
# Get the latest session ID
session_id=$(opencode session list --format json | jq -r '.[0].id')
# Export and sum token/cost across assistant messages
opencode export "$session_id" | jq '{
  tokens_input: [.messages[] | select(.role=="assistant") | .tokens.input] | add,
  tokens_output: [.messages[] | select(.role=="assistant") | .tokens.output] | add,
  tokens_cache_read: [.messages[] | select(.role=="assistant") | .tokens.cache.read] | add,
  cost: [.messages[] | select(.role=="assistant") | .cost] | add
}'
```

Note: `opencode run` does NOT output usage data to stdout/stderr. The export API is the only supported way to retrieve per-run token/cost data.

**Container awareness:** When opencode runs inside a devcontainer, its session data lives inside the container. The extraction commands must run in the same environment as the provider — use `${DC_EXEC[@]}` (which expands to `devcontainer exec --workspace-folder "$WORK_DIR" --` when containerized, or empty when running on host).

**Log schema extension** — add optional fields to `iteration_complete` events:

```json
{
  "event": "iteration_complete",
  "iteration": "42",
  "mode": "build",
  "provider": "opencode",
  "model": "openrouter/hunter-alpha",
  "duration": "180s",
  "tokens_input": 15200,
  "tokens_output": 3400,
  "tokens_cache_read": 48000,
  "cost_usd": 0.0034
}
```

Fields are omitted (not zero) when unavailable. Dashboard and orchestrator check for field presence before rendering/accounting.

**Polling strategy:**
- On session start: query `opencode db` for current total spend, store snapshot
- On session end: query again, compute delta, log to `log.jsonl` as `session_cost` event
- During active session: aggregate from `iteration_complete` events in log (no external queries needed)
- Dashboard refresh: `opencode db` query every 5 minutes (configurable via `cost_poll_interval_minutes`)
