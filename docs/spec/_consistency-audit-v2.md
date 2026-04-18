# Consistency Audit v2 — `docs/spec/*` (post-rewrite)

Working doc. Not a spec. No edits applied — proposals only. Previous audit (`_consistency-audit.md`) is historical. Citations are `file:line`.

---

## 1. Blocking issues (direct contradictions)

### 1.1 Shim LOC budget: 150 vs 400

- `CONSTITUTION.md:11` — **"Target: < 400 LOC each"** for `loop.sh`/`loop.ps1`.
- `architecture.md:32`, `architecture.md:92`, `architecture.md:103`, `architecture.md:159` — **"≤150 LOC each"** and "Any change that would push it over 150 LOC is rejected".
- `_cr-synthesis.md:12,99` — 400 and 150 both appear.

**Resolution:** CONSTITUTION wins — it's the normative doc, and 400 is the realistic near-term target (see recent commits `330523cba`, `d27447e2c`). Change architecture.md's four references from `≤150` to `<400`, or parametrize as "the budget is in CONSTITUTION.md". Recommend the second: architecture.md should not hardcode a number that will shrink over time.

### 1.2 Session status enum diverges between daemon and API

- `daemon.md:109` — **"`pending`, `running`, `paused`, `completed`, `failed`, `interrupted`, `archived`"**.
- `api.md:150-151` — uses `status=stopped`; `api.md:160` — resume valid for `(interrupted, stopped, paused)`.

`stopped` is not in daemon.md's enum; `completed`/`failed`/`archived` are not in api.md's resume list.

**Resolution:** Pick one enum and publish it once. Proposed canonical set in `daemon.md` §Session kinds, referenced from api.md:

```
pending | running | paused | interrupted | stopped | completed | failed | archived
```

Add `stopped` to daemon.md:109. Clarify api.md DELETE endpoint sets `status=stopped` (not "completed"), and `completed` is the state machine's own terminal per `loop-invariants.md:57`. Resume valid iff `status in (interrupted, stopped, paused)` — already stated at api.md:160.

### 1.3 Agent chunk "ordered delivery" is unspecified, but api.md v1 stability promises otherwise

- `api.md:277` — **"`sequence` is monotonic within a turn, starts at 0"**.
- `api.md:241-243` — per-client SSE backpressure: "keeps the most recent events" on overflow.

If the buffer drops middle chunks, `sequence` is still monotonic but not contiguous. No doc states whether clients must treat gaps as drops or as buffer reordering. This is a real ambiguity because agent.chunk is on the v1-stable list (`api.md:451`).

**Resolution:** Add to api.md §Agent streaming: "Clients MUST tolerate gaps in `sequence` (indicates drop); clients MUST NOT tolerate reordering. The daemon never publishes chunks out of order." Also: declare chunk durability — chunks are in JSONL even when dropped from SSE (partially stated at api.md:295, strengthen).

### 1.4 CONSTITUTION.md contradicts the new architecture in three places

- `CONSTITUTION.md:15` — "Agents write results to `.aloop/output/` (filesystem baseline) or via MCP tools" — **directly contradicted** by `agents.md:49`, `pipeline.md:322`, `security.md:90` which all say `.aloop/output/` is retired by CR #135 and `aloop-agent submit` is the only path.
- `CONSTITUTION.md:11` — "(`process-requests.ts`, `orchestrate.ts`, or a new CLI command)" names the old CLI-as-runtime. The new architecture says the daemon (`aloopd`) is the runtime; there is no `process-requests.ts`/`orchestrate.ts` in the rebuild target.
- `CONSTITUTION.md` (all 41 lines) — no mention of `aloopd`, the v1 HTTP API, the scheduler + permits, the TrackerAdapter abstraction, or the ProviderAdapter interface. A reader of CONSTITUTION alone would reconstruct the pre-rebuild model.

**Resolution:** CONSTITUTION.md needs a rewrite pass. See §5 below for structure.

### 1.5 Trigger table covers different sets across files

- `pipeline.yml` example in `pipeline.md:73-78` — keys: `merge_conflict`, `stuck_detected`, `steer`, `burn_rate_alert`, `orch_diagnose`.
- `orchestrator.yaml` example in `pipeline.md:424-433` — keys: `decompose_needed`, `refine_needed`, `estimate_needed`, `pr_review_needed`, `merge_conflict_pr`, `orch_diagnose`, `burn_rate_alert`, `child_stuck`.
- `orchestrator.md:254-261` — table with `child_stuck`, `burn_rate_alert`, `provider_degraded`, `pr_review_needed`, `merge_conflict_pr`.
- `pipeline.md:275-281` — dispatch table uses `steer`, `merge_conflict`, `stuck_detected`, `burn_rate_alert`, `orch_diagnose`.

`stuck_detected` vs `child_stuck` — same condition, different trigger names for standalone vs orchestrator. `merge_conflict` vs `merge_conflict_pr` — same.

**Resolution:** Explicitly distinguish "session-level" triggers (fired into child's own queue) from "orchestrator-level" triggers (fired into orch's queue when observing a child). Document in pipeline.md with a two-column canonical table. The current implicit convention (orch prefix `child_`, suffix `_pr`) works but is undocumented.

### 1.6 `aloopd.sock` — deferred or optional?

- `daemon.md:48` — "`aloopd.sock` unix socket (optional, future)".
- `api.md:37` — "**Unix socket** at `~/.aloop/aloopd.sock` optional in v1 (decision deferred; API contract identical either way)".
- `devcontainer.md:31`, `devcontainer.md:65` — treats the unix socket as if present ("over the mounted Unix socket or localhost HTTP"), which is load-bearing for the devcontainer story since mounting a TCP socket cross-host is awkward.

**Resolution:** Decide. Either (a) unix socket is v1-required because devcontainer relies on it, or (b) devcontainer.md falls back to forwarded localhost HTTP as the documented primary path. Recommend (a): implement `aloopd.sock` in v1, remove "optional" from daemon.md:48 and api.md:37. Container stories work without exposing ports.

### 1.7 Subagent catalog drift between pipeline.md and agents.md

- `pipeline.md:463-472` — 8 subagents including `spec-checker` and no `perf-analyzer` or `docs-extractor`.
- `agents.md:233-244` — 10 subagents including `spec-checker`, `perf-analyzer`, `docs-extractor`.

**Resolution:** agents.md owns the catalog; pipeline.md defers to it via `{{SUBAGENT_HINTS}}`. Replace pipeline.md:463-472 with "See agents.md §Subagent catalog."

---

## 2. Open questions (decisions not yet made)

### 2.1 Daemon / API

- **Event envelope versioning.** `api.md:211-216` defines the envelope once; no version field on individual events. If `session.update`'s payload shape evolves, how does a client know? **Options:** (a) topic suffix (`session.update.v2`), (b) embedded `schema_version` per data payload, (c) version the whole SSE stream. **Pick (b):** `data._v: 1` is least invasive, survives topic renames.
- **Permit TTL default.** `daemon.md:136` says "TTL expiry without release → scheduler reclaims." `api.md:369` shows `ttl_seconds: 600` in an example. No default is named authoritatively. **Pick:** 600s as the default in daemon.md §Scheduler authority, per-adapter override in `daemon.yml`.
- **Rate-limit of `aloop-agent` calls per session.** `pipeline.md:321-398` defines the CLI but no throttle. An agent in a loop calling `aloop-agent todo list` every second is valid but expensive. **Pick:** a per-session token bucket (e.g., 100 req/min), denial returns exit 22 (new), emits `agent_cli.throttled`.
- **Scheduler transport: HTTP vs in-process.** `daemon.md:138` says "even in-daemon code talks to the scheduler over HTTP." But `daemon.md:41` says workers are in-process in v1. A local HTTP hop per permit per turn is wasteful if both live in one process. **Pick:** document that v1 uses in-process function calls that implement the same interface as the HTTP endpoint; the HTTP path exists for the v2 split. Clarify daemon.md:138.

### 2.2 Setup / lifecycle

- **What happens when setup is abandoned mid-run.** `setup.md:248-250` says state in `~/.aloop/state/setup_runs/<id>/` is durable and resumable. Nothing says how long we keep abandoned runs, whether project registration is rolled back on delete (`api.md:417`), or what happens to partially-scaffolded files. **Pick:** 14-day retention for abandoned runs; `DELETE /v1/setup/runs/:id` leaves already-written project files in place (they're committed), unregisters the project if `status=setup_pending` and no sessions exist, and logs the action.
- **`adapter.ping` failure mode during setup.** `setup.md:160-162` and `work-tracker.md:80` mark it a gate. What if ping succeeds intermittently? **Pick:** require 2/3 consecutive successes over 10s before flipping `ready`. Flakiness is a real tracker signal.

### 2.3 Orchestrator / tracker

- **Webhook delivery loss.** `work-tracker.md:385-389` describes webhooks + polling reconciliation but doesn't say what "reconciliation" means. **Pick:** on poll, diff adapter state vs last-seen; emit synthetic `tracker.event` entries for missed changes with `source: "poll_reconcile"`. Document reconciliation window (last 1h by default).
- **Builtin tracker audit log format.** `work-tracker.md:314,343` reference `events.jsonl`. Shape not specified. **Pick:** same envelope as daemon events (`timestamp`, `kind`, payload), so tooling is reusable.
- **Cross-epic Story dependencies.** `work-tracker.md:211`, `orchestrator.md:168` mention `dependencies` as slug-lists including "across Epics." Not stated: are circular cross-Epic deps allowed? Are they resolved at dispatch or at refinement? **Pick:** validate in `orch_estimate` (reject cycles), resolve at dispatch (permit blocked until deps merged), document at `orchestrator.md` §Refinement pipeline.
- **Max chain length.** `provider-contract.md:45-57` shows chains; no cap. **Pick:** hard cap of 10 entries (practical — over that, you're misusing it), enforced at compile step. Document in provider-contract.md.

### 2.4 Resilience

- **Session identity across daemon version bumps.** `daemon.md:213-217` describes state migrations. Nothing says session IDs survive minor versions. **Pick:** state: session IDs stable across minor versions; major versions may require migration. Document in daemon.md §Upgrade.
- **Out-of-order agent chunks.** See 1.3 above.

### 2.5 Pipeline

- **Finalizer-abort vs steer-preserves-finalizerPosition.** `loop-invariants.md:73` says finalizer resets to 0 on steering; `loop-invariants.md:74` (edge cases) says same. No conflict inside current docs — but no explicit statement that queue items other than steer don't abort finalizer. **Pick:** any queue item during finalizer aborts finalizer to position 0 (that's the current rule); clarify loop-invariants.md §Edge cases.
- **What constitutes "turn success" for cyclePosition.** `loop-invariants.md:82-88` says "successful outcome" advances. But if the provider emits a `usage` chunk with cost but the agent submitted nothing, is that success? **Pick:** turn success = adapter emitted `final: true` chunk AND at least one `agent.result` submit (or the agent's role has no submit types, e.g., pure read-only). Document in loop-invariants.md.

---

## 3. Naming drift and redundancy

| Term | Current usage | Proposed canonical |
|---|---|---|
| `aloop runtime` | `architecture.md:3`, `pipeline.md:473` | "daemon (`aloopd`)" — runtime is pre-rebuild vocabulary |
| `aloopd` vs `daemon` | Mixed everywhere | Use `aloopd` as the binary name; "daemon" as the role |
| `session runner` / `runner` / `shim` | `agents.md:38`, `pipeline.md:257`, `loop-invariants.md:151`, `architecture.md:159`, many | **session runner** = code inside the daemon that advances `cyclePosition`. **shim** = `loop.sh`/`loop.ps1`. Never call the shim "the runner." Never call the session runner "the shim." Audit every file for this. |
| `Issue` vs `WorkItem` | `work-tracker.md:5` justifies "WorkItem"; `security.md:97-107` still shows `issue-list`, `issue-create`, `issue-close`, `issue-comment` in `aloop gh` table | For CLI subcommands scoped to GitHub, `issue-*` naming is fine (it's GH's term). For cross-adapter logic, always "WorkItem." Document this split in `work-tracker.md` §Why an abstraction. |
| `aloop gh` | `security.md:92-107`, `architecture.md:149` | Aloop-level vocab should be "tracker CLI proxy" with adapter-specific subcommands (`aloop gh`, `aloop gl`, `aloop linear`). The name `aloop gh` is fine as a concrete command; security.md should introduce the generic concept first. |
| `ChangeSet` vs `PR` | `work-tracker.md` consistently abstract; `security.md:113-114,120` mixes "pr-create", "pr-merge" | Security table is at the CLI-proxy level (GH-specific) so PR vocabulary is correct there. No change. Document that §Hardcoded policy tables is the GH adapter's policy; other adapters get analogous tables. |
| `tessl skill` | `setup.md:147` | Fine. Label is out-of-band. |
| `project config` vs `aloop/config.yml` | Interchangeable | Use `aloop/config.yml` when the path matters, "project config" for prose. No change. |
| `orchestrator.yaml` | `pipeline.md:405`, `orchestrator.md:69` reference a file by that name | Canonicalize: `aloop/orchestrator.yaml` or just "the orchestrator workflow." Current references don't specify path. |

---

## 4. Missing homes (invariants not owned)

| Invariant | Asserted in | Should own |
|---|---|---|
| "Setup never marks ready without verification" | `setup.md:351` (stated); unclear if daemon enforces at `aloop start` | `daemon.md` §Project registry — add explicit "sessions may only start against `ready` projects" (briefly at daemon.md:78 but not enforced in the API spec). `api.md` §Sessions §Create should state refusal with `error.code = "project_not_ready"`. |
| "No agent-side policy; daemon is single enforcement" | `security.md:221` + scattered | Already well-owned by security.md. |
| "Queue items do not advance cyclePosition" | `loop-invariants.md:85`, `pipeline.md:264` | Keep in loop-invariants.md; pipeline.md should defer. |
| "Compile step is the only YAML reader" | `architecture.md:159`, `pipeline.md:49,253,525` | **Redundant four ways.** Pick pipeline.md:49 as canonical; others say "per pipeline.md §Compile step." |
| "Failed turn does not advance cyclePosition" | `loop-invariants.md:85` | Well-owned. |
| "Permits gate every turn" | `daemon.md:121`, `pipeline.md:528`, `architecture.md:163` | Redundant three ways. Pick daemon.md:121 canonical. |
| "No grandchildren" | `daemon.md:115`, `api.md:130`, `orchestrator.md:75`, `orchestrator.md:320` | Redundant four ways. Pick api.md:130 (API-enforced) as canonical; others defer. |
| "Orchestrator has no worktree" | `orchestrator.md:77,318` | Well-owned. |
| "Merge authority is daemon-level" | `orchestrator.md:195-199,321`, `security.md:133-136` | Security owns enforcement; orchestrator.md owns meaning. Current split is OK. |
| "`CLAUDECODE` sanitization" | `security.md:154`, `agents.md:250-251` | Security.md owns. Agents.md should one-line-defer. |
| "Burn rate gate trips for orchestrator, not child" | `pipeline.md:279` (buried in a table) | Should be a named sub-rule under `daemon.md` §Scheduler authority or `provider-contract.md`. Currently too easy to miss. |

---

## 5. Constitution alignment

CONSTITUTION.md is 41 lines, pre-rebuild, and materially wrong in three places (see §1.4). A constitution for the new architecture needs, roughly:

1. **Architecture hard rules.**
   - `aloopd` is the single runtime process; no parallel binaries.
   - HTTP+SSE API (`/v1/`) is the only boundary; every client uses it.
   - Shim budget (pick a number, state it).
   - Compile step is the only YAML reader.
   - No side channels for agents (no `.aloop/output/` — retire rule 5).
   - `aloop-agent` is the only agent→daemon path.
   - No in-process state outliving a request; SQLite + JSONL is truth.
   - Every turn through the scheduler.

2. **Security / trust hard rules.**
   - Agents are untrusted; daemon is the trust anchor.
   - Policy is hardcoded, not configurable.
   - No raw tracker/provider API from agents.
   - Environment sanitization is daemon-owned.

3. **Data hard rules.**
   - `pipeline.yml` is input; `loop-plan.json` is output; shim reads only the output.
   - Every decision is resolvable from config + events — no hardcoded paths, phases, or thresholds in code.
   - Keywords, not expressions, in pipeline YAML.

4. **Scope / quality rules (already good).**
   - Small files, separation of concerns, test everything, no dead code, no fabricated data (rules 7-17). Keep these largely as-is.
   - Drop or rewrite rule 5 (`.aloop/output/`).
   - Drop or rewrite rule 11's cross-platform reference if pre-rebuild.

The current rules 1-2 mix normative ("must shrink") with rationale ("can run in a container") — the rewrite should keep the rule crisp and move rationale to architecture.md.

---

## 6. Vision gap

**No `VISION.md` or equivalent exists.** The spec docs collectively answer "what is aloop built from" but not "what is aloop for." Readers reconstruct product intent from architecture.md:24 ("a single long-running local daemon...") and security.md's trust boundary diagram — neither tells them who uses it or why.

`claude/skills/aloop/SKILL.md:7` has a "What is Aloop?" section (user-facing), which is a skill file, not a spec doc. It shouldn't be authoritative for an audit of `docs/spec/`.

**Proposed `docs/VISION.md` structure** (sections only; content TBD):

1. **One-paragraph pitch** — what aloop is in 3 sentences.
2. **Who it's for** — primary personas (solo dev running overnight loops; small team with a shared daemon; future: org-scale fleet).
3. **What problem it solves** — agents ship features autonomously without becoming rogue.
4. **Non-goals** — not a CI system, not a tracker, not an LLM, not a cloud service (in v1).
5. **Design principles** — daemon-first, adapter-everywhere, keywords-over-expressions, shims-are-clients, permits-gate-everything.
6. **Shipping model** — local-first; distribution seams intact; v2 is deployment, not rewrite.
7. **How the docs fit** — map of `CONSTITUTION.md` (rules), `docs/spec/*` (contracts), GitHub issues (work). Where to start reading per role.

Place under `docs/VISION.md` (not `docs/spec/`) so specs and vision are visibly distinct.

---

## 7. Cross-link breakage

- `architecture.md:149` — "`security.md` `aloop gh` table, now generalized across adapters" — security.md §"Tracker adapter policy" exists; the "generalized across adapters" table doesn't, it's still GH-specific at security.md:113-140. Either generalize the table or remove the "now generalized" claim.
- `pipeline.md:5` — "SPEC-ADDENDUM.md §Prompt Reference Rule, §`aloop start` Unification" — SPEC-ADDENDUM.md may not be in scope of the new docs; verify these references still resolve. (Not read by this audit.)
- `pipeline.md:378` — mentions "task store" — fine — but `pipeline.md:351-374` presents `aloop-agent todo` while `agents.md:52` refers to "`aloop-agent`" interface defined in `pipeline.md` §Agent contract. No §Agent contract heading in pipeline.md — the section is titled "Agent contract — the `aloop-agent` CLI" at pipeline.md:321. Link anchor is imprecise; repeated in `security.md:83`, `agents.md:57`. **Fix:** rename section to "Agent contract" so anchors match.
- `orchestrator.md:5` — references "SPEC-ADDENDUM.md §Session Resumability (pre-decomposition, 2026-04-18)" — same note as above.
- `work-tracker.md:94` — "`aloop-agent submit --type <decompose|refine|estimate|review|...>`" — submit types listed here (`decompose`) don't match the canonical type names elsewhere (`decompose_result`). Align.
- `agents.md:57` — "`pipeline.md` §Agent contract — the permissions table" — anchor again.
- `setup.md:7` — references `aloop/templates/PROMPT_setup.md` and CLI files — verify these still exist; the current PR touches several templates.
- `loop-invariants.md:79,89` — "see `provider-contract.md`" — sections exist. OK.
- `orchestrator.md:289` — "(see `daemon.md` §Lifecycle)" — section exists at daemon.md:188. OK.

---

## 8. Feature-creep red flags

- **`PUT /v1/daemon/config` hot-reload** (`daemon.md:186`, `api.md:429`). Moving non-listener config live is useful but adds complexity (scheduler limits changing mid-permit, burn-rate threshold changing mid-turn). v1 could restart the daemon on config changes — the "hot" part earns its complexity only if users need it.
- **Telegram bot** (`dashboard.md:12`, `architecture.md:30`). Mentioned as a client class but no file specifies the bot's contract. Either commit to it (add `bot.md` stub) or drop the references.
- **Unix socket as alternative to HTTP** (`daemon.md:48`, `api.md:37`, `devcontainer.md:31`). See §1.6 — decide whether this is v1 or cut it.
- **`aloop tracker migrate --from builtin --to github`** (`work-tracker.md:357`, `setup.md:339`). Flagged as future; still appears as a setup edge-case remedy. Acceptable as forward-compat but risky to promise — cut to a sentence.
- **Mirror tasks to tracker** (`work-tracker.md:259-299`). Three mirror shapes (checkboxes_in_body, sub_children, projects_board). Noisy for v1. Defer implementation to v2; keep the capability flag in the interface.
- **Crash recovery "offer resume via API"** (`daemon.md:226`). The "offer" is passive — who surfaces it? CLI? Dashboard? Currently neither file names the mechanism. Concrete UX belongs in a later doc — for the spec, specify where resume intent originates (CLI default? auto-resume toggle? dashboard nudge?).
- **`metrics.tick` per-second SSE event** (`api.md:236`). One event per second per session on the bus is a lot of volume for v1. Prometheus `GET /v1/metrics` (`api.md:436`) covers the same need without polluting SSE. Consider dropping `metrics.tick`.
- **`fully_autonomous` autonomy level** (`orchestrator.md:267`, `setup.md:303`). Acknowledged as "not recommended." Ship v1 with `attended | supervised | autonomous`; leave `fully_autonomous` out of the schema entirely until there's demand.
- **Setup Phase 5 orchestrator bootstrap as a "single daemon transaction"** (`setup.md:182`). Atomic bootstrap across tracker writes + session creation is hard to get right; not worth it if the alternative is "Phase 5 is best-effort and recoverable."
- **`GET /v1/providers/resolve-chain`** (`api.md:317-322`). Debug-only endpoint. OK to have, but call it out as debug so it's not documented as user-facing.

---

## Summary of the top 5 proposed fixes (ranked by impact)

1. **Rewrite CONSTITUTION.md** — it contradicts agents.md/security.md/pipeline.md on `.aloop/output/` and names files that don't exist (`process-requests.ts`). §1.4, §5.
2. **Align session-status enum** between daemon.md and api.md. §1.2.
3. **Write VISION.md** — nothing answers "what is aloop" in the spec directory. §6.
4. **Pick a shim LOC number** (150 or 400) and reference it once. §1.1.
5. **Decide `aloopd.sock` in v1** — devcontainer story depends on it. §1.6.
