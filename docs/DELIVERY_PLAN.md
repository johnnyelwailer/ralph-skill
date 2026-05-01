# Delivery Plan — v1

> How the spec becomes working code. Twelve milestones, each with a concrete deliverable, a test that proves it, and a clear unlock. Not a timeline — a dependency graph.

Spec is on branch `next`. Code lands on `next` (for now); a future `main` merge comes when v1 is green end-to-end.

---

## Ordering principles

1. **Foundations first.** State, events, scheduler — everything else depends on these being correct.
2. **Vertical slice before horizontal breadth.** One provider + one workflow + one tracker end-to-end beats five providers half-built.
3. **TDD is per CONSTITUTION §V.19.** Every milestone ships with tests; a milestone isn't done until its test passes on a clean clone.
4. **Each milestone should unlock the next.** If M5 doesn't visibly unlock something in M6, the plan is wrong.
5. **User-observable behavior is the acceptance.** Not "code compiles" — "you can run command X and see result Y."

## Setup delivery note

The new setup architecture is **cross-cutting**, not one isolated milestone. It lands in layers:

- **M3** provides the project registry, `setup_pending` lifecycle, and compile/readiness foundations.
- **M5/M6** provide provider execution and long-lived daemon-run workflow substrate that setup-side agents reuse.
- **M9** provides the orchestrator/child-loop machinery that setup can reuse under the hood for background research, setup-side judgment, and initial decomposition handoff.
- **M11** provides the dashboard shell over the same setup API.
- **M12** is the first full end-to-end proof that the whole setup experience works on a real project.

This means "setup" should not be treated as a thin preflight script in the implementation plan. The user-facing command stays `aloop setup`, but the underlying capabilities arrive incrementally across these milestones.

## Incubation delivery note

Incubation is also cross-cutting, but it must stay thinner than setup in v1.

- **M2** provides the event/state substrate for durable incubation items, research runs, and proposal history.
- **M4/M5** provide scheduler-permitted provider execution for non-mutating research runs.
- **M7/M8** should expose the `/v1/composer` and `/v1/incubation` APIs plus artifact/comment plumbing needed for conversational kickoff, capture, and research evidence.
- **M9** consumes promoted Epics/Stories/steering through the normal orchestrator path; it must not read raw incubation items as backlog.
- **M11** provides the always-ready composer, inbox, research queue, proposal review, mobile capture path, and promotion controls in the dashboard/workstation.

The v1 bar is not a full personal knowledge-management system. It is composer-led durable capture, bounded research, source provenance, lightweight monitors, reviewable synthesis, and explicit promotion into the existing aloop subsystems.

AutoResearch-style `experiment_loop` mode is a v1.5 candidate unless a narrow local benchmark use case appears earlier. It requires immutable-oracle enforcement, attempt ledgers, metric extraction, and plateau detection; those are not necessary for the first capture/research/monitor slice.

Active outreach and surveys are a later layer unless implemented as manual-export artifacts only. Any adapter that sends messages, publishes surveys, or purchases panel responses needs explicit security policy and audit coverage before it ships.

## Sandboxing note

Sandboxing is the broader execution concept; the project devcontainer is only the first shipped backend.

- v1 uses host execution plus the project devcontainer as the practical local sandbox path.
- A later execution milestone should adopt `sandbox-core` as the abstraction layer for sandbox lifecycle, exec, streaming, and file transfer.
- That future change is intended to unlock server deployment where each loop/session can run in its own offloaded sandbox without changing the daemon API or orchestration model.

---

## M1 — Scaffolding + daemon skeleton + health

**Deliverable:**
- Bun TypeScript workspace at repo root; existing `aloop/` left as-is (archived in place).
- `packages/core/` with build + test scripts.
- `aloopd` binary: HTTP on 127.0.0.1:7777, unix socket at `~/.aloop/aloopd.sock`, PID lock at `~/.aloop/aloopd.pid`.
- `GET /v1/daemon/health` returning `{status, version, uptime_seconds, _v: 1}` over both transports.
- SSE echo endpoint wired so the infrastructure is proven (not a real event bus yet).
- CI: lint, typecheck, test on push.

**Test:** `bun test` green on clean clone. `aloopd start` → `curl http://127.0.0.1:7777/v1/daemon/health` returns valid JSON. Same query over unix socket.

**Non-goals:** real event bus, SQLite, any other endpoint, install scripts.

**Unlocks:** M2 — somewhere to actually put state.

---

## M2 — State store + event log + drift detection

**Deliverable:**
- `StateStore` interface + SQLite impl (`bun:sqlite` native, no dep).
- Schema migrations runner (version column, idempotent, one-way).
- `EventStore` interface + JSONL-per-session impl with `fsync` on write.
- Projector: given an event, updates relevant SQLite projections.
- Welford online mean/variance (~10 LOC, tested for numerical stability).
- CUSUM changepoint detector (~30 LOC, tested against synthetic shifts).
- Replay: JSONL read → projector → SQLite rebuilt bit-identical.

**Test:** write N events, corrupt SQLite, restart daemon, replay reconstructs state exactly. CUSUM triggers on a known shift in synthetic data.

**Non-goals:** projects, sessions, permits — none of those tables yet.

**Unlocks:** everything state-dependent.

---

## M3 — Workspace/project registry + config + compile step

**Deliverable:**
- `POST /v1/workspaces`, `GET /v1/workspaces`, workspace/project membership endpoints.
- `POST /v1/projects`, `GET /v1/projects`, `GET /v1/projects/:id`, `PATCH`, `DELETE`.
- Workspace registry table in SQLite plus workspace-project membership table.
- Project registry table in SQLite with `status: setup_pending | ready | archived`.
- Config loader for `daemon.yml`, `~/.aloop/overrides.yml`, per-project `aloop/config.yml` and `aloop/pipeline.yml`.
- Compile step: `pipeline.yml` → `loop-plan.json`. Only YAML reader in system.
- `POST /v1/daemon/reload` re-reads config files; non-listener settings apply to next permit.

**Test:** create a workspace, register two projects into it, edit one project's `pipeline.yml`, hot-reload, verify new `loop-plan.json` matches expected. Invalid pipeline.yml fails compile with a precise error.

**Non-goals:** interactive setup interview, setup-side background research, and tracker-backed setup handoff; scheduler integration.

**Unlocks:** sessions can now be configured.

---

## M4 — Scheduler + permits + overrides

**Deliverable:**
- `POST/DELETE /v1/scheduler/permits`, `GET /v1/scheduler/permits`, `PUT /v1/scheduler/limits`.
- Five permit gates composed: concurrency, system (CPU/mem/load), provider (stub — M5 populates real quota), burn-rate, overrides.
- Permit durable in SQLite; TTL + expiry sweep watchdog job.
- `PUT /v1/providers/overrides` live-applied at grant time; persisted to `~/.aloop/overrides.yml`.
- `scheduler.permit.{grant,deny,release,expired}` events.

**Test:** request permits beyond concurrency cap → denied with correct reason. Set deny override, try to acquire → denied. Expire TTL → reclaimed. Replay JSONL reconstructs permit state.

**Non-goals:** real burn-rate (needs usage data from M5); provider-quota probes.

**Unlocks:** sessions can be gated; scheduler behavior is demonstrable independently.

---

## M5 — First provider adapter (opencode) + `aloop-agent` + environment hardening

**Deliverable:**
- `ProviderAdapter` interface + opencode adapter (`sendTurn` async generator, emits `AgentChunk` types).
- Provider registry + health FSM.
- `aloop-agent` binary: `submit`, `todo` (add/complete/dequeue/list/all-done), `list-types`.
- `AUTH_HANDLE` system — per-session short-lived token, verified on every call.
- Environment sanitization: `CLAUDECODE` unset, `PATH` hardened, secrets stripped.
- Rate-limiting (100 req/min token bucket, exit 22 on throttle).

**Test:** spawn opencode with a trivial prompt, receive final text + usage chunks, store both in session JSONL. `aloop-agent submit` validates against schema; bad payload → exit 10.

**Non-goals:** other 4 providers, chain fallthrough, quota probes.

**Unlocks:** real turns can run.

---

## M6 — Session runner + first workflow (quick-fix) + shims

**Deliverable:**
- `POST /v1/sessions`, `GET`, `DELETE`, `/steer`, `/events` SSE, `/log`, `/resume`.
- Session runner: loads `loop-plan.json`, runs turns end-to-end:
  1. Check queue → 2. Pick cycle/finalizer position → 3. Acquire permit → 4. Invoke provider → 5. Persist result → 6. Advance.
- Cycle + finalizer + queue semantics per `loop-invariants.md`.
- `quick-fix.yaml` workflow shipped in `aloop/workflows/`.
- `loop.sh` shim (<150 LOC): lock + invoke runner over unix socket + exit.
- `loop.ps1` parity.

**Test:** launch a session with the quick-fix workflow and opencode provider on a trivial repo. Session runs plan→build→review, emits events live over SSE, ends with `status=completed` or `failed`. JSONL replay reconstructs session state.

**Non-goals:** other workflows, parallel sessions, tracker integration.

**Unlocks:** **first vertical slice works end-to-end.** Everything after is horizontal breadth.

---

## M7 — Daemon work-item projections + builtin tracker adapter + first orchestrator slice

**Deliverable:**
- `TrackerAdapter` interface.
- Daemon work-item projection tables in SQLite for adapter-normalized Epics, Stories, comments, change sets, and tracker event cursors.
- Builtin adapter: minimum offline Epic/Story/change-set adapter, with work items as JSON files under `<project>/.aloop/tracker/`, append-only `events.jsonl`, branch-based change sets.
- `aloop tracker ...` CLI proxy (generic).
- Minimal `orchestrator.yaml` workflow — supports decompose + dispatch only (no review/diagnose yet).
- Orchestrator session of kind `orchestrator` with basic decomposition against a small test spec.

**Test:** run orchestrator against a 3-story test spec → builtin tracker creates 3 work items → daemon projection reflects normalized work items → orchestrator dispatches 3 child sessions serially → each runs quick-fix → work items close. Fully offline.

**Non-goals:** GitHub, parallel dispatch, full orchestrator prompt set, review/merge flow.

**Unlocks:** orchestration is real; adapters work; multi-session is proven.

---

## M8 — GitHub tracker adapter + policy enforcement + audit

**Deliverable:**
- GitHub `TrackerAdapter`: GraphQL reads (Issue + subIssues + subIssuesSummary), REST writes (`POST /sub_issues`, `DELETE /sub_issue`, `PATCH /priority`), webhook subscription for `sub_issues` event + polling reconciliation.
- Hardcoded policy tables from `security.md` enforced in the adapter; policy.granted/denied events audited.
- `aloop gh` subcommand surface for debugging.
- `gh auth status` health check on startup.

**Test:** register a test repo, decompose a tiny spec, orchestrator creates Epic + Story via native sub-issues, agent attempting `pr-merge` from child role → denied with audit log entry. Webhook drop → reconciliation via poll produces synthetic event.

**Non-goals:** full orchestrator flow (M9); other tracker adapters.

**Unlocks:** production-grade tracker integration.

---

## M9 — Full orchestrator workflow + parallel dispatch + file-scope enforcement

**Deliverable:**
- Full orchestrator prompt set: `orch_product_analyst`, `orch_decompose`, `orch_refine`, `orch_sub_decompose`, `orch_estimate`, `orch_dispatch`, `orch_review`, `orch_resolver`, `orch_diagnose`, `orch_conversation`.
- Parallel child dispatch via scheduler permits.
- `file_scope.owned` enforcement at dispatch: overlap with in-flight Stories → permit denied.
- Epic/Story conversation flow: `comment.created` (source=human) → `triggers.user_comment` → `PROMPT_orch_conversation.md`.
- Self-healing via `orch_diagnose` actions (`pause_session`, `redispatch`, `file_followup`, `raise_threshold`).
- Reuse of the same orchestrator/child-loop substrate for setup-side background research and `setup_decompose` handoff, with a different setup-agent catalog rather than a separate engine.
- `agent/trunk` branch management.

**Test:** decompose a multi-epic spec → refine → dispatch 3 parallel children on disjoint file scopes → review → merge to `agent/trunk`. Deliberately comment on an Epic mid-flight → orchestrator replies + takes action. Deliberately dispatch overlapping scopes → second dispatch denied.

**Non-goals:** all 9 workflows; polish; dashboard.

**Unlocks:** autonomous-orchestrated delivery works end-to-end.

---

## M10 — Remaining providers + chain fallthrough + quota probes

**Deliverable:**
- `ProviderAdapter` impls: copilot, codex, gemini, claude.
- Chain grammar (`provider[/track][@version]`) resolved at permit grant.
- Per-turn fallthrough: scheduler iterates chain on classified failures.
- Quota probe: claude (Anthropic API usage), gemini (Google quota endpoint). Backoff fallback for adapters without probes.
- Cost aggregation by session + Story + Epic populated.

**Test:** run a session with chain `[fake-rate-limited, opencode]` → first provider rate-limits → seamless fallthrough to opencode → turn succeeds. Claude chain under quota exhaustion → cooldown honors real reset time.

**Non-goals:** dashboard visualizations of chain; advanced routing.

**Unlocks:** multi-provider parallel — the core promise — is live.

---

## M11 — Dashboard rehab (minimum viable)

**Deliverable:**
- Existing React/Vite dashboard rewired to consume v1 API only.
- Always-ready scoped multimodal composer that can capture typed or spoken intent, links, screenshots, voice notes, documents, and logs; delegate to scoped specialist subagents; create incubation items; start lightweight research; explain status; and observe launched daemon jobs without owning hidden state.
- Panels: session list (grouped by project), session detail with live event tail, provider health, scheduler permits, cost + keeper-rate, metric comparison by `variant_id`.
- Basic setup-run shell: active setup runs, current stage/progress, current question set, background research status, and chapter/document summaries via the same setup API used by the CLI.
- Steering box, stop button, override editor.
- Ability to resume a setup run, answer structured questions, and leave comments on setup chapters/documents from the dashboard.
- Auth in place for future tunneling (bearer token, off by default for localhost).

**Test:** launch dashboard, watch M9's parallel-dispatch scenario in real-time, then resume a setup run and answer a structured question without leaving the dashboard. Kill a session via the dashboard — daemon confirms stop. Override a provider live → in-flight turn unaffected, next grant respects it.

**Non-goals:** design polish, transcript-only UX, or the final rich chapter-review UI for every setup stage; Storybook.

**Unlocks:** aloop is operable by humans in the loop.

---

## M12 — Remaining workflows + agent roster + install + release

**Deliverable:**
- Remaining shipped workflows: `plan-build-review`, `frontend-slice`, `backend-slice`, `fullstack-slice`, `refactor`, `migration`, `docs-only`, `security-fix`, `perf-opt`.
- Agent prompt set complete: `plan`, `build`, `qa`, `review`, `proof`, `spec-gap`, `docs`, `spec-review`, `final-review`, `final-qa`, `frontend`, `backend`, `fullstack`, `refactor` (builder), `migration` (builder), `docs-generator`, plus orchestrator-side from M9.
- Subagent catalog installed for opencode projects.
- `aloop install` / `aloop uninstall` for systemd / launchd / NSSM.
- End-to-end smoke test against one real multi-provider project.
- v1.0.0 tag on `next`; PR `next` → `master`.

**Test:** fresh machine → clone → `aloop install` → `aloop setup` a real project through the discovery-driven interview until no ambiguities remain → orchestrate a small spec → get merged PRs. Uninstall cleanly.

**Non-goals:** v1.5 (learning optimizer, AutoResearch, constitutional red-team) — those wait for production data.

**Unlocks:** v1 shipped.

---

## What's not in this plan

Deferred to v1.5+ per `learning.md` and `self-improvement.md`:

- Thompson sampling optimizer, OPRO prompt evolution, DSPy/TextGrad
- Bayesian optimization for continuous knobs
- Constitutional red-team workflow
- AutoResearch for narrow deterministic-eval problems
- Task mirroring implementations (capability flag is in the interface; no adapter ships one)
- Telegram bot, Chat bots, IDE plugins
- Remote deployment (control plane + worker fleet)
- GitLab / Linear / Jira tracker adapters
- Causal inference / OPE / reward modeling

These have reference docs. They don't have milestones until v1 is shipped and telemetry informs priorities.

---

## Progress convention

Each milestone lives as a tracked work item on GH with matching label `delivery/M<N>`. A milestone is done when:

1. All its deliverables are committed.
2. Its test passes on a clean clone, documented with the command in the milestone's issue.
3. Its unlock is demonstrably available (screenshot, CLI transcript, or SSE capture in the issue).
4. The spec changes needed to close gaps discovered during the milestone are merged (no "I'll update the spec later").

Re-ordering is allowed if a dependency is wrong. Adding milestones requires a CR. Deleting a milestone requires CR + human sign-off; the scope doesn't disappear, it moves.

---

## Where we are

- **Spec**: 15 commits on `next`. 20 reference docs + 3 working docs. Substantially complete for v1.
- **Code**: none. This plan kicks off M1.
- **Next action after this plan is merged**: M1 — scaffolding + daemon skeleton + health. TDD, one commit per coherent test-green unit.
