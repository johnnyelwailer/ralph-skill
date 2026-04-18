# Provider Contract

> **Reference document.** Contracts between the daemon's scheduler, provider adapters, and workflows. Hard rules live in CONSTITUTION.md. Work items live in GitHub issues.
>
> Sources: SPEC.md §Global Provider Health & Rate-Limit Resilience, §OpenCode First-Class Parity, §OpenRouter Cost Monitoring; CR #287 (aloop-runner foundation), #288 (runtime override policy), #302 (provider load balancing).

## Table of contents

- Provider identity and chain grammar
- Adapter interface
- Health state machine
- Failure classification
- Cooldowns: quota-aware and backoff
- Quota probes
- Overrides (live allow / deny / force)
- Per-turn fallthrough
- Round-robin: authoring pattern, not runtime mode
- Cost and usage capture
- OpenCode parity
- Capability registry

---

## Provider identity and chain grammar

A provider reference uses the single grammar `provider[/track][@version]` from CR #287. One field, three ranks of specificity:

```
opencode
opencode/openrouter
opencode/openrouter/glm
opencode/openrouter/glm@5.1
claude
claude/opus
claude/opus@4.7
gemini/flash@3.1
```

Semantics:

1. `@version` present → pinned version.
2. Track present without version → latest model on that track.
3. Bare provider → default track, latest model from the provider's model map.

**A chain is an ordered array of provider references, maximum 10 entries** (compile-step enforced). The scheduler attempts entries left-to-right within a single turn. The canonical preference for this project:

```yaml
provider: [opencode, copilot, codex, gemini, claude]
```

Chains can mix tracks and versions:

```yaml
provider: [opencode/openrouter/glm@5.1, copilot, claude/opus@4.7]
```

Chains are resolved at **permit-grant time**, not at session start, so live overrides and health changes take effect immediately.

Precedence, highest first:

1. Per-turn queue item's frontmatter `provider:`
2. Workflow/loop-plan override for the current phase
3. Prompt file's frontmatter default
4. Project `aloop/config.yml` default
5. Daemon `daemon.yml` default

Overrides (§Overrides below) are applied **after** precedence resolution but **before** permit grant.

## Adapter interface

Every provider is an adapter implementing the same typed contract. Adapters are the only code in the system that spawns a provider CLI.

```ts
interface ProviderAdapter {
  readonly id: string;                // "opencode", "claude", ...
  readonly capabilities: Capabilities;
  resolveModel(ref: ProviderRef): ResolvedModel;   // expands track/version
  probeQuota?(auth: AuthHandle): Promise<QuotaSnapshot>;
  sendTurn(input: TurnInput): AsyncGenerator<AgentChunk>;
}
```

- `sendTurn` is the turn executor. Emits chunks matching the `agent.chunk` envelope in `api.md` — one chunk for non-streaming providers today, many chunks for streaming providers later. Same type, different cadence.
- `probeQuota` is optional; adapters without quota endpoints (opencode, copilot, codex CLIs today) omit it. The scheduler falls back to failure-driven backoff.
- Adapters never write to the event bus directly — they yield chunks; the daemon publishes.
- Adapters never touch the health FSM — they classify failures and emit them; the daemon mutates state.

### Chunk types (summary; full shape in api.md)

| `type` | Content | When |
|---|---|---|
| `text` | `{delta}` | Model output (streaming: incremental; non-streaming: one final blob) |
| `thinking` | `{delta}` | Reasoning models only; retained if `project.stream_reasoning: true` |
| `tool_call` | `{name, arguments}` | Agent invokes a tool |
| `tool_result` | `{id, output}` | Tool returns |
| `usage` | `{tokens_in, tokens_out, cache_read, cost_usd}` | End of turn, always emitted |
| `error` | `{classification, message, retriable}` | Failure mid-turn |

## Health state machine

Per-provider state lives in the daemon's `StateStore` (SQLite) and is broadcast on the `provider.health` SSE topic. No shared files on disk; the `~/.aloop/health/*.json` scheme is retired.

States:

- `healthy` — no recent failure; available to the scheduler.
- `cooldown` — transient failure (rate limit, timeout, concurrent-cap) in effect until `cooldown_until`.
- `degraded` — persistent failure (auth expired, quota exhausted, no balance) requiring user action. No auto-recovery.
- `unknown` — daemon has not observed this provider yet this session.

Any adapter success promotes to `healthy` and resets `consecutive_failures` to 0.

Health row fields (SQLite):

```
provider_id              text primary key
status                   text
consecutive_failures     int
last_success             timestamp
last_failure             timestamp
failure_reason           text
cooldown_until           timestamp
quota_remaining          int  (nullable; provider-specific unit)
quota_resets_at          timestamp (nullable)
updated_at               timestamp
```

## Failure classification

Adapters map provider-specific signals to a canonical class before reporting:

| Signal | Class | State transition | Notes |
|---|---|---|---|
| HTTP 429, "rate_limit", "usage limit", quota depletion | `rate_limit` | cooldown (quota-aware if probe available) | Reset time from header/probe if provided |
| Network timeout, DNS failure | `timeout` | cooldown (backoff) | |
| Auth expired, invalid key, no balance | `auth` | degraded | Requires user action |
| "Cannot launch inside another session" | `concurrent_cap` | cooldown (short, 2 min) | CLI-specific signal |
| Non-zero exit, stderr not matching above | `unknown` | cooldown (backoff) | |
| Success | — | healthy | Resets `consecutive_failures` |

Every classification is emitted as a chunk (`type: error`) and logged as a JSONL event.

## Cooldowns: quota-aware and backoff

Two sources of cooldown length; scheduler picks the longer:

### Quota-aware

When `probeQuota` is available and the last probe returned `quota_resets_at`, cooldown extends to that timestamp minus a small safety margin. Applies to providers that expose reset times (Claude API, Gemini API, OpenRouter).

### Failure-driven (backoff)

When quota is unknown, use exponential backoff on `consecutive_failures`:

| Consecutive failures | Cooldown |
|---|---|
| 1 | none (possibly flaky) |
| 2 | 2 min |
| 3 | 5 min |
| 4 | 15 min |
| 5 | 30 min |
| 6+ | 60 min (hard cap) |

Caps and the curve itself are daemon config, not hardcoded.

A successful call from **any session** resets `consecutive_failures` and promotes to `healthy`.

## Quota probes

Optional adapter method. The scheduler calls it:

- Opportunistically after an `auth`, `rate_limit`, or `unknown` failure to refresh the picture.
- Periodically for active providers (`scheduler.quota_poll_interval` in daemon config).
- On demand from `GET /v1/providers/:id/quota`.

```ts
type QuotaSnapshot = {
  remaining: number;           // provider-specific unit (tokens, credits, calls)
  total: number | null;        // if known
  resets_at: string | null;    // ISO timestamp
  currency?: "tokens" | "usd" | "credits";
  probed_at: string;
};
```

Adapter support today:

| Provider | Probe available | Notes |
|---|---|---|
| claude | yes | Anthropic API `/v1/organizations/usage` when API key path; Claude Max CLI has no public probe — falls back to backoff |
| gemini | yes | Google API quota endpoint |
| opencode | no (yet) | Relies on OpenRouter usage payloads embedded in responses |
| codex | no | CLI exposes no quota |
| copilot | no | CLI exposes no quota |

Absent probes → scheduler uses backoff-only cooldowns for that provider.

## Overrides (live allow / deny / force)

Persisted at `~/.aloop/overrides.yml`, applied at permit-grant time. Full API in `api.md`.

```yaml
allow: [opencode, copilot]       # whitelist (nil = no restriction)
deny:  [claude]                  # blacklist (nil = none). Wins over allow on conflict.
force: claude/opus@4.7           # override everything to this ref (nil = off)
```

Resolution, given a computed chain and overrides:

1. If `force` is set, resolved chain becomes `[force]`.
2. Otherwise filter the chain: keep only providers satisfying `allow` (if set) **and** not in `deny`.
3. If the filtered chain is empty, permit is denied with `error.code = "overrides_exclude_all"`.

In-flight turns are **not** interrupted — they finish on whatever they were running. The next permit request respects the new overrides.

`provider.override.changed` is broadcast on the bus when overrides mutate.

## Per-turn fallthrough

Per CR #287, fallthrough is mandatory and happens **inside a single turn**, not across iterations.

Algorithm per turn:

1. Resolve chain per precedence.
2. Apply overrides.
3. For each provider in the resolved chain, left to right:
   - Request permit (`POST /v1/scheduler/permits`).
   - On denial for `provider_unavailable`, `rate_limit`, or `overrides_exclude_all`, continue to next entry.
   - On grant, invoke `adapter.sendTurn`.
   - On failure classified as retriable (`rate_limit`, `timeout`, `concurrent_cap`, `unknown`), release permit, record failure, continue to next entry.
   - On success or unrecoverable failure (`auth`), release permit, emit turn result, done.
4. If all chain entries exhausted without a successful response, emit `turn.failed` with the classification list and let the workflow decide (`onFailure: retry`, `onFailure: goto plan`, stuck detection, etc.).

No runtime mode selects between "single provider" and "fallthrough." Fallthrough is always on; a chain of length 1 is the degenerate case.

## Round-robin: authoring pattern, not runtime mode

Round-robin is how a workflow author distributes work across providers at the **workflow** level — e.g., plan on Claude, build on OpenCode, review on Gemini. That's expressed by giving different phases different `provider:` values.

```yaml
# plan-build-review workflow example
phases:
  - { id: plan,   provider: [claude/opus, opencode] }
  - { id: build,  provider: [opencode, copilot, codex] }
  - { id: review, provider: [claude, gemini] }
```

No `--round-robin` flag, no round-robin mode, no round-robin logic in the scheduler. If the spec calls for "cycle providers every iteration," that's two workflows with different phase assignments, or a workflow that reads iteration index and selects a phase — still author-expressed data.

Cross-session load-balancing (CR #302) is a scheduler-level concern: when N sibling sessions are running and each has overlapping chains, the scheduler prefers granting permits that spread load across providers within each session's chain. It does not invent new providers or reorder chains — just picks among equally-eligible entries.

## Cost and usage capture

Every adapter emits a `usage` chunk as the final chunk of every turn:

```json
{
  "type": "usage",
  "content": {
    "tokens_in": 15200,
    "tokens_out": 3400,
    "cache_read": 48000,
    "cost_usd": 0.0034,
    "model_id": "openrouter/anthropic/claude-sonnet-4-6",
    "provider_id": "opencode"
  },
  "final": true
}
```

Fields are **omitted (not zero)** when unavailable. Downstream (scheduler, budget tracker, dashboard) checks field presence before aggregating.

The daemon aggregates into the session row (`cost_usd`, `tokens_in`, `tokens_out`) in near-real-time, and exposes both the running totals (SQLite) and the event history (JSONL).

OpenCode specifics (the only CLI today with a supported usage query path) live in the adapter's implementation, not in this contract — adapters are free to shell out to `opencode export`, `opencode db`, or whatever the provider supports to populate `usage` chunks.

## OpenCode parity

OpenCode is a first-class provider. Agent definitions live in `.opencode/agents/` in the project (installed by `aloop setup`). Subagent delegation works via OpenCode's native `task` tool.

Parity with other providers:

| Feature | OpenCode | Other provider CLIs |
|---|---|---|
| Model selection | `model:` frontmatter, OpenRouter path | same (provider-native model IDs) |
| Reasoning effort | `reasoning:` frontmatter → `--variant` | same (provider-native passing) |
| Subagent delegation | native `task` tool | provider-specific; adapter hides the difference |
| Streaming (future) | native | requires adapter work per provider |
| Quota probe | via OpenRouter usage payloads embedded in responses | provider-specific |

## Capability registry

Each adapter declares its capabilities. Scheduler and workflow author use these to gate features.

```ts
type Capabilities = {
  streaming: boolean;               // emits multiple chunks per turn
  vision: boolean;                  // accepts image inputs
  tool_use: boolean;                // agent can call tools
  reasoning_effort: boolean;        // honors reasoning:* frontmatter
  quota_probe: boolean;             // implements probeQuota
  session_resume: boolean;          // can resume a prior session by id
  cost_reporting: boolean;          // emits usage chunk with cost_usd
  max_context_tokens: number | null;
};
```

Capability gating examples:

- A workflow node declaring `vision: true` fails chain resolution for any provider lacking `capabilities.vision`.
- `project.stream_reasoning: true` is a no-op until the resolved provider has `capabilities.streaming && supports thinking chunks`.
- The `review` phase requires `reasoning_effort: high` — chain filter excludes providers without `capabilities.reasoning_effort`.

Adding a new provider is: implement the adapter, declare capabilities, register with the daemon. No other subsystem changes.
