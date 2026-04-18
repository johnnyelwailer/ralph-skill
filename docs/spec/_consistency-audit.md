# Consistency Audit — docs/spec/ Reference Docs vs Rebuild Direction

Working doc. Audited on 2026-04-18 against the 12 rebuild directions.

## Blocking issues (contradict the 12 directions)

### Thin-shell / fat-runner (Dir 1)

- **architecture.md:30-33** — the layer table still defines only CLI + loop scripts, no `aloop-runner`. Says `loop.ps1`/`loop.sh` "execute compiled pipeline" — but they must be lock+invoke shims (<150 LOC). No mention of the runner binary.
- **architecture.md:52-68** — Inner Loop responsibilities include "Invoke provider CLIs directly", "Hot-reload provider list from `meta.json`", "Track and kill child processes", "Read `TODO.md` to detect `allTasksMarkedDone`". Under the rebuild, the runner owns all of these. Should shrink to: acquire lock, invoke runner, propagate signals, release lock.
- **security.md:122-132** — "What stays in loop.ps1/loop.sh" still lists iteration counting, provider invocation, status/log writes, TODO.md reading, frontmatter parsing. Must move to runner.
- **orchestrator.md:136-143** — process diagram shows loop.sh running the iteration loop (pick prompt, invoke provider, advance position). Must be replaced with `aloop-runner` owning the turn.
- **pipeline.md:361-369** — "The loop engine is a dumb cycle+finalizer+queue runner" still describes the shell doing frontmatter parsing and invocation. The runner is that engine now; the shell is the lock shim.

### Unified runtime with extensions (Dir 2)

- **architecture.md:80-111** — describes runtime as a "shared library" imported by dashboard and orchestrator (`aloop/cli/src/lib/runtime.ts`). Rebuild direction: single core (turn engine + bus + config + session + provider registry + scheduler) with orchestrator and child-loop as **extensions**. Dashboard isn't the peer — orchestrator is.
- **orchestrator.md:98-121** — "Aloop runtime (TS/Bun, `aloop/cli/`)" as the host-side process that processes requests and spawns child loops. Must be rewritten as "orchestrator extension of the core runtime observing the event bus".
- **architecture.md:107-111** — "Runs as `aloop orchestrate` — separate process from dashboard" directly contradicts the unified-runtime-with-extensions model.

### Data-driven / zero hardcoded values (Dir 3)

- **provider-contract.md:57-64** — backoff table has hardcoded minute values (2/5/15/30/60). Must be `providers.yml` config.
- **loop-invariants.md:178** — `MAX_PHASE_RETRIES = len(round_robin_providers) * 2` is hardcoded formula. Must come from config.
- **loop-invariants.md:193-196** — hardcoded defaults (`max_iterations: 50` for loop mode). Should come from `config.yml`.
- **orchestrator.md:386** — "every 30-60s" polling interval hardcoded. Config.
- **orchestrator.md:711** — "Max N analysis iterations per item (configurable, default 5)" — OK it says configurable but then **orchestrator.md:1091** hardcodes `ORCHESTRATOR_CI_PERSISTENCE_LIMIT = 3`.
- **orchestrator.md:718** — "concurrency cap (configurable, default 3)" — default lives in orchestration.yml now, not in prose.
- **pipeline.md:478** — "runs every N iterations (configurable, default: every 5)". OK for prose but cite config key.
- **agents.md:62-68** — default pipeline phase sequence stated as prose: `plan → build × 5 → qa → review` then `spec-gap → docs → spec-review → final-review → final-qa → proof`. This is data in `pipeline.yml`. Doc should describe the contract, not the content.
- **agents.md:73-96** — literal `loop-plan.json` with hardcoded `PROMPT_*.md` filenames. This is a compiled artifact example only — mark as such, not as invariant.
- **agents.md:297-304** — spec-gap cadence "every 2nd plan phase" is pipeline config. Remove the hardcoded schedule.
- **devcontainer.md:126** — "default 3 hours / 10800 seconds" timeout hardcoded in prose. `security.md:126` restates it. Both must cite config key, not the number.

### Multi-provider parallel dispatch + preference order (Dir 4)

- **provider-contract.md** — **entire doc omits the preference order** (opencode → copilot → codex → gemini → claude). Blocking gap.
- **provider-contract.md:86-94** — "Round-robin integration" section describes round-robin as if it were the runtime dispatch mode. Direction 4: no round-robin as runtime mode. Rename to "Provider chain fallthrough" and describe the ordered chain + mandatory per-turn fallthrough (CR #287).
- **pipeline.md:233-250** — frontmatter example leads with `provider: opencode / claude` inconsistently. The `provider` field grammar (`provider[/track][@version]` per CR #287) is absent.
- **loop-invariants.md:99-102** — "round-robin still rotates providers, so each retry uses a different provider". Contradicts Dir 4. Replace with chain-fallthrough semantics.
- **loop-invariants.md:171** — "Round-robin still rotates on every iteration" — must go.

### `aloop-agent` CLI (Dir 5)

- **No mention anywhere** of `aloop-agent` CLI (#135), `tasks.json`, `pending-sync.json`, `queue-order.json`, `gh-health.json`, `backups/`. Blocking gap.
- **security.md:70-97** — "Convention-file protocol" with `requests/*.json` is the thing being superseded by validated `aloop-agent` CLI.
- **orchestrator.md:429-468** — entire "Request/response protocol" section describes filesystem-contract requests. Must be recast: agents call `aloop-agent submit`/`aloop-agent todo`, which validates and writes session-dir state.
- **agents.md:239-266** — QA agent "commits its own artifacts", files bugs as `[qa/P1]` tasks in TODO.md. Per #135, TODO.md markdown parsing is dead — tasks live in session-dir `tasks.json` via `aloop-agent todo add`.

### Observability (Dir 6)

- **No file defines the event bus or JSONL schema as a first-class contract.** `provider-contract.md:96-97`, `agents.md` proof manifest, `loop-invariants.md` "log events" are all scattered references. Blocking gap — needs a home (probably `observability.md` or a section in `architecture.md`).

### Resilience / checkpoints (Dir 7)

- **No file covers** per-iteration checkpoints, idempotent state writes, or crash-resume as a dedicated invariant. `orchestrator.md:907-923` covers orchestrator resumability only. Blocking gap for child loops and the runner itself.

### Quota-aware cooldowns (Dir 8)

- **provider-contract.md:68-77** — failure classification infers cooldown from stderr parsing. Direction 8: query provider quota endpoints where available (claude, gemini) and fall back to backoff (opencode). Doc doesn't distinguish.
- **provider-contract.md** — scheduler ownership of cooldown state is not stated. Must say: scheduler owns cooldown, not the shell.

### Burn-rate safety (Dir 9)

- **No mention anywhere** of tokens-in vs commits-out tracking or "introspection" diagnostic iteration. Blocking gap.

### Self-healing = observation-driven (Dir 10)

- **orchestrator.md:1006-1032** — "Scan agent self-healing, diagnostics & alerting" keeps the old scripted model: "Missing GitHub labels → create them via `gh label create`", "Missing `config.json` → derive from `meta.json`". This is exactly the heartbeat-auto-fix pattern (Dir 10: dead).
- **orchestrator.md:1069-1097** — "Self-healing: failed issue recovery" state-machine lookup table (`needs_redispatch` + open PR → `pr_open` etc.) is scripted, not observation-driven. Must be replaced with "orchestrator observes event stream and injects diagnostic iteration".
- **orchestrator.md:1099-1104** — V8 cache cleanup via `process-requests` periodically deleting `/tmp/*.so` is scripted auto-fix. Delete or move to devcontainer concerns.

### Dashboard (Dir 11)

- **dashboard.md:341-503** — the entire dashboard component architecture, Storybook integration, and responsive breakpoint tables are a **rebuild plan for an in-repo UI**. Direction 11: for `next` MVP, file contracts + SSE feed only; no UI spec here. Move this to the archived/later pile.
- **dashboard.md:1-339** — `/aloop:dashboard` command, sidebar tree, activity log format, keyboard shortcuts, theme details, SSE heartbeats. All UI implementation. Keep only: file contracts dashboard consumes + SSE event schema.

### Lean core / LOC targets (Dir 12)

- **No file states** core <2,000 LOC or extensions <800 LOC. Belongs in `architecture.md` as hard invariant.
- **dashboard.md:344-348** — "Target: ~150 LOC per file ... 300 LOC is a code smell" applies to dashboard only. Not the same thing as core/extension budgets from Dir 12.

---

## Cross-file inconsistencies (pick one winner)

1. **Finalizer position under queue interrupt.**
   - `loop-invariants.md:56` "steer phase takes priority, the finalizer is aborted (position reset to 0)".
   - `agents.md:59` "Queue still takes priority during finalizer — steering, merge agent, or any other queue entry interrupts the finalizer just like it interrupts the cycle." (implies finalizerPosition preserved).
   - **Winner:** `agents.md`. A queue interrupt should not nuke finalizer progress; only new TODOs do. Edit `loop-invariants.md:56` to match.

2. **`allTasksMarkedDone` owner.**
   - `architecture.md:64` "Read `TODO.md` to detect `allTasksMarkedDone` (mechanical checkbox count, not agent-emitted)".
   - `agents.md` uses it throughout as a loop invariant.
   - Under #135, TODO.md parsing is dead — this flag must come from `tasks.json` via `aloop-agent todo all-done`. **Winner:** #135 model. Both files need rewriting.

3. **SPEC.md vs TASK_SPEC.md in child loops.**
   - `orchestrator.md:240` "Child loops receive their task specification as `TASK_SPEC.md` (NOT `SPEC.md`)".
   - `pipeline.md:336` `{{SPEC_FILES}}` comma-joined list. No mention of TASK_SPEC for child.
   - **Winner:** `orchestrator.md`. `pipeline.md` should document TASK_SPEC substitution for child-loop sessions.

4. **Request/response protocol ownership.**
   - `orchestrator.md:428-490` defines the full protocol, request types, envelope.
   - `security.md:70-97` also defines it, smaller version.
   - `architecture.md:113-117` restates it.
   - **Winner:** `agents.md` or new `agent-contract.md` owns the (new) `aloop-agent` CLI contract. Others cross-reference. The `requests/*.json` protocol must be retired, not re-stated three times.

5. **Orchestrator state source of truth.**
   - `orchestrator.md:348-355` "GitHub is the authoritative state for the orchestrator. There is no local `orchestrator.json` that duplicates issue state."
   - `orchestrator.md:1015` "Set a `stuck: true` flag in `orchestrator.json`" and `orchestrator.md:919` "Reads `orchestrator.json` from the existing session dir".
   - `_cr-synthesis.md:56` "orchestrator.json is source of truth, GH is sync target".
   - **Winner:** `_cr-synthesis.md` + #127 — `orchestrator.json` is source of truth, GH is sync. Rewrite orchestrator.md:348-355 accordingly.

6. **Provider list location.**
   - `architecture.md:66` "Hot-reload provider list from `meta.json`".
   - `_cr-synthesis.md:67` says `.aloop/config.yml` + `providers.yml` in `_cr-synthesis`.
   - **Winner:** `providers.yml` per Dir 3. `meta.json` is session-dir runtime state only.

7. **Session-dir paths.**
   - `orchestrator.md:832` `~/.aloop/sessions/<orchestrator-session-id>/sessions.json`.
   - `_cr-synthesis.md:64` specifies `tasks.json`, `pending-sync.json`, `gh-health.json`, `queue-order.json`, `backups/`.
   - **Winner:** `_cr-synthesis.md`. Add the session-dir-layout section to `architecture.md`.

8. **ETag cache persistence.**
   - `orchestrator.md:209` `etag-cache.json` in session dir.
   - `orchestrator.md:852` `last_poll_etag` field in `sessions.json`.
   - Pick one. Recommend `etag-cache.json`, drop `last_poll_etag`.

---

## Gaps (principles with no home)

| Dir # | Topic | Recommended home |
|---|---|---|
| 1 | `aloop-runner` binary — responsibilities, turn lifecycle | `architecture.md` (new section) |
| 2 | Core-vs-extension interface; event bus contract | `architecture.md` (new section); split dashboard/orchestrator as extensions |
| 3 | Full config file inventory (`pipeline.yml`, `loop-plan.json`, `providers.yml`, `orchestration.yml`, `config.yml`) with schema + ownership | `architecture.md` config-inventory section |
| 4 | Provider preference order `opencode → copilot → codex → gemini → claude`; `provider[/track][@version]` grammar; per-turn fallthrough | `provider-contract.md` (replace round-robin section) |
| 5 | `aloop-agent` CLI contract (`submit`, `todo add/dequeue/complete/all-done/list`), role permissions, session-dir task store | New `agent-contract.md` OR rewrite of `agents.md` |
| 6 | Structured JSONL event log schema; event types; metrics events | New `observability.md` OR section in `architecture.md` |
| 7 | Checkpoints per iteration, idempotent state writes, crash-resume for runner and child loops | New `resilience.md` OR section in `loop-invariants.md` |
| 8 | Quota endpoint polling (claude, gemini); backoff fallback (opencode); scheduler ownership of cooldown | `provider-contract.md` rewrite |
| 9 | Burn-rate tracking (tokens-in vs commits-out); introspection orchestrator iteration | `orchestrator.md` or `observability.md` |
| 10 | Observation-driven self-healing (replaces scripted recovery) | `orchestrator.md` rewrite of self-healing sections |
| 12 | Core <2,000 LOC, extension <800 LOC budgets | `architecture.md` invariants |
| — | CONSTITUTION.md contract (Dir: #233 in CR-synthesis) | `architecture.md` or new `constitution.md` |
| — | Queue priority manifest `queue-order.json` tier semantics | `pipeline.md` or `agent-contract.md` |

---

## Redundancy to collapse

| Topic | Currently in | Owner |
|---|---|---|
| Request/response protocol | architecture.md, orchestrator.md, security.md, agents.md | **`agent-contract.md` (new)** — others link |
| Dashboard lifecycle / `--no-dashboard` | architecture.md:102-105, dashboard.md | **architecture.md** (one line); dashboard.md drops it |
| Convention-file rule "no inline markdown" | orchestrator.md:448, pipeline.md:357, security.md:95 | **`agent-contract.md`** |
| Finalizer state machine | architecture.md:56, loop-invariants.md:23-67, agents.md:43-96, pipeline.md:371-394 | **loop-invariants.md** owns the invariant; agents.md owns the pipeline content; architecture.md drops detail |
| CLAUDECODE sanitization | architecture.md:67, agents.md:358-368 | **agents.md** (or strike entirely — runner owns env sanitation) |
| Frontmatter field list | pipeline.md:244-255, architecture.md:117, agents.md (scattered) | **pipeline.md** — single table |
| `{{include:}}` semantics | pipeline.md:278-326, agents.md:48 | **pipeline.md** |
| `--no-task-exit` flag | loop-invariants.md:207-217 (own section) | Delete — runner owns completion criteria, flag is obsolete |
| Three-level hierarchy (spec/slice/workunit/task) | orchestrator.md:310-318 | **orchestrator.md** (keep) |
| Provider list / health integration | architecture.md:66, provider-contract.md (all), orchestrator.md:903 | **provider-contract.md** |

---

## Work-item leakage still present

- **loop-invariants.md:198-202** — "Implementation:" bullets reading as a checklist ("`compile-loop-plan` must not inject", "`aloop setup` must not prompt"). Work items, not invariants.
- **loop-invariants.md:214-217** — "Implementation:" — specific flag default values for loop.sh/ps1 and orchestrate.ts. Issue, not invariant.
- **dashboard.md:173-182** — "Add the missing command files: `claude/commands/aloop/dashboard.md`" — TODO.
- **dashboard.md:450-453** — "Build agent — when implementing ... creates or updates the corresponding `*.stories.tsx`" — workflow tasking.
- **devcontainer.md:98-106** — "Generate a `postCreateCommand` or `onCreateCommand` script that installs..." — implementation steps.
- **devcontainer.md:108-122** — "Verification" step-by-step. Not a contract.
- **agents.md:361-368** — CLAUDECODE fix-table per-file. Work items.
- **orchestrator.md:635-641** — "1. Read all spec files... 2. Produce... 3. ..." — recipe.
- **orchestrator.md:1033-1047** — "`process-requests` must handle all request types" with bullet list of types to implement.
- **pipeline.md:351-356** — "Planned but not yet implemented" table. Should be an issue, not prose.
- **pipeline.md:726-731** — "Key changes" summary of CLI changes. Work items.

---

## Proposed edits per file (don't apply; propose)

### `architecture.md`
- Replace layer table (lines 30-33) with: `aloop-runner` (runs turn), `aloop-agent` (agent CLI), `loop.sh`/`loop.ps1` (<150 LOC shims), `aloop` CLI (setup/status).
- Delete lines 52-68 Inner Loop responsibilities; replace with 4-bullet shim contract.
- Delete lines 80-111 "shared library" model; rewrite as "core runtime + extensions (orchestrator, dashboard-feed)".
- Add new section: **Config inventory** — `pipeline.yml`, `loop-plan.json`, `providers.yml`, `orchestration.yml`, `config.yml`, session-dir state files.
- Add new section: **LOC budgets** — core <2,000, extensions <800, shims <150.
- Add new section: **Event bus contract** (or point to observability.md).

### `provider-contract.md`
- Add preference order section before line 20: opencode → copilot → codex → gemini → claude.
- Replace lines 86-94 "Round-robin integration" with "Provider chain fallthrough" per CR #287.
- Move backoff numbers (57-64) into `providers.yml` schema; doc explains mechanism only.
- Add quota endpoint section: claude + gemini query, opencode backoff.
- State scheduler ownership of cooldown.
- Delete or move "OpenCode first-class parity" (line 111+) and "OpenRouter cost monitoring" (line 170+) — these are provider-impl details, not the contract. Consider new `providers/opencode.md`.

### `loop-invariants.md`
- Delete lines 71-172 phase-advancement + PowerShell code block + round-robin interactions. Runner owns retry policy; describe as event contract only.
- Delete lines 188-203 orchestrate-mode iteration cap; runner reads completion criteria from extension.
- Delete lines 207-217 `--no-task-exit` flag entirely (runner doesn't exit on tasks-done in orchestrator extension).
- Edit line 56 finalizer-abort-on-steer to match `agents.md:59`.
- Replace "allTasksMarkedDone" prose with `aloop-agent todo all-done` check.
- Add: checkpoint-per-iteration invariant, crash-resume contract.

### `agents.md`
- Delete lines 62-96 default-pipeline prose + `loop-plan.json` sample; point to `pipeline.yml` as source of truth.
- Delete lines 297-304 spec-gap cadence; move to pipeline config example.
- Rewrite lines 239-266 QA agent to use `aloop-agent todo add` instead of `[qa/P1]` TODO.md tasks.
- Delete lines 358-368 CLAUDECODE table; runner owns env sanitation.
- Add: proof/QA/docs/spec-gap agents are **extensions contributed to the pipeline**, not hardcoded.

### `dashboard.md`
- Trim to: file contracts (which session-dir files), SSE event schema, dashboard-as-consumer pattern.
- Delete lines 341-503 (component architecture, Storybook, responsive). Archive or move to `dashboard/README.md` if Archon rebuild revisits them.
- Delete lines 58-90 "aloop setup" subcommand — belongs in `architecture.md` or `setup.md`.
- Delete lines 91-132 ZDR section — belongs in `security.md`.
- Delete lines 134-169 auto-monitoring popup — config, not contract.

### `orchestrator.md`
- Rewrite lines 98-121 "Aloop runtime" as "Orchestrator extension of the core runtime".
- Replace lines 123-192 daemon process diagram — the unified runtime is one process with extensions.
- Fix source-of-truth contradiction at lines 348-355 vs 832 (pick `orchestrator.json` per #127).
- Rewrite lines 428-490 request protocol to reference `aloop-agent` CLI.
- Delete lines 1006-1104 "Scan agent self-healing" + "Self-healing: failed issue recovery" + "V8 code cache cleanup". Replace with short section: "orchestrator extension observes event bus, injects diagnostic iteration on anomalies".
- Add: burn-rate safety trigger (tokens-in vs commits-out → introspection iteration).
- Consolidate `etag-cache.json` vs `last_poll_etag` (pick one).
- Delete lines 1108-1149 synthetic test scenario — that's a work item, not a reference contract.

### `security.md`
- Delete lines 122-132 "What stays in loop.ps1/loop.sh" — runner owns this.
- Lines 70-97 `requests/*.json` protocol: re-point to `agent-contract.md` for `aloop-agent` CLI.
- Keep lines 152-196 `aloop gh` policy — this is the trust boundary.
- Move lines 197-213 PATH sanitization to runner contract.

### `devcontainer.md`
- Delete lines 108-122 verification step-by-step — work item.
- Delete lines 98-106 provider install script recipe.
- Timeout reference (126 elsewhere) → cite config key.
- Keep lines 207-323 auth architecture (contract, not tasks).
- Delete lines 38-51 "Devcontainer spec research" — that's setup-agent instruction, not a reference doc.

### `pipeline.md`
- Delete lines 351-356 "Planned but not yet implemented" table.
- Delete lines 696-731 CLI simplification — belongs in `setup.md`/CLI reference.
- Rewrite lines 244-255 frontmatter fields to include `provider[/track][@version]` grammar.
- Delete lines 396-422 "override queue" duplication — overlap with pipeline mutation at 424-441. Merge.
- Remove round-robin prose (429, loop-invariants links).
- Tie `reasoning` effort levels to providers.yml, not hardcoded table at 527-534.

### `_cr-synthesis.md` (working doc — lighter edits)
- Add explicit preference-order pin (Dir 4) to MVP checklist item #3.
- Add burn-rate (Dir 9) and checkpoint (Dir 7) to Carry-Forward list — currently absent.
- Note: `_cr-synthesis.md:141` already flags the preference-order gap. Good.

---

## Summary

Five files are structurally out of sync with the rebuild (architecture, orchestrator, security, loop-invariants, dashboard). Two (provider-contract, pipeline) need the provider-chain and config-driven reframing. `agents.md` needs to drop hardcoded pipeline content and TODO.md parsing. `devcontainer.md` is closest to correct — mostly needs work-item scrubbing. Biggest missing homes: `aloop-agent` CLI contract, event-bus/observability, resilience/checkpoints, burn-rate, core/extension LOC budgets.
