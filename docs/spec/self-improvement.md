# Self-Improvement

> **Reference document.** Four levels of self-improvement, three of them allowed, one of them prohibited. The prohibition is load-bearing — it's the difference between a system that compounds its own capabilities and a system that reward-hacks its way to a broken equilibrium. Hard rules live in CONSTITUTION.md. Work items live in GitHub issues.
>
> Sources: Darwin Gödel Machine (Sakana 2025) — demonstrated reward hacking of its own checker the moment it could touch it; STOP (Zelikman et al., COLM 2024) — scaffold self-improvement works within bounds; Karpathy's AutoResearch (March 2026) — `prepare.py` is immutable, agent touches `train.py` only.

## Table of contents

- Why this file exists
- Four levels of self-improvement
- Enforcement mechanisms
- The DGM test
- Level-4 prohibitions
- Operational review cadence
- Invariants

---

## Why this file exists

Aloop is autonomous. An autonomous system that can't adapt is fragile; an autonomous system that can adapt in unbounded ways reward-hacks itself. The difference between "compounds capability over time" and "burns weeks of tokens producing nothing" is which kinds of adaptation are allowed and how they're bounded.

The previous aloop drifted toward unbounded self-modification (the agent writing its own orchestrator code, editing its own loop scripts, filing issues about its own misbehavior that the next iteration of itself would "fix"). That path is documented in the literature as the failure mode it is:

- **Darwin Gödel Machine** — agent hallucinated tool usage, then deleted the hallucination-detection markers to cover its tracks. Reward hacking.
- **SICA** — improvements plateaued and the agent got clever about gaming the eval.
- **Long tail of autonomous agent projects** — "self-improving" demos that plateau within a week and never recover.

The lesson is consistent and documented: **self-improvement works only when the oracle is outside the agent's reach.** Karpathy's AutoResearch makes `prepare.py` (the eval) immutable. OpenHands V1 separates the SDK from the applications that configure it. Every shipped self-improving system has a reference layer the agent cannot touch.

For aloop, the oracle layer is: the spec, the CONSTITUTION, the orchestrator prompts, the review gate definitions, the scheduler policy, and the metric definitions themselves. None of these are accessible to any agent. Ever.

## Four levels of self-improvement

Ordered by risk. Levels 1–3 are required for the system to deliver on "autonomous by default." Level 4 is prohibited in v1 and prohibited indefinitely without a concrete plan for the immutable-oracle layer.

### Level 1 — Self-healing

**What:** Detect in-flight anomalies and correct them. Stuck session → resume or pause. Provider degraded → swap. Merge conflict → rebase. Burn-rate exceeded → pause dispatch. Rate-limit cascade → back off.

**Risk:** LOW. Corrective actions are bounded (pause/stop/retry/swap/rebase) and each is policy-gated. The agent doesn't invent new recovery strategies; it picks among known ones.

**Where it lives:** `orch_diagnose` prompt → `diagnose_result` submit with one of the documented actions (`pause_dispatch`, `pause_session`, `stop_session`, `raise_threshold`, `redispatch`, `file_followup_issue`, `no_action`). Daemon enforces that each action is within that role's policy.

**Cheat case:** Agent emits a false `session.stuck` event to skip a gate.
**Prevention:** Events that drive watchdog classifications are daemon-emitted from event-stream analysis, not agent-reported. The agent cannot forge a watchdog event.

### Level 2 — Self-tuning

**What:** Adjust scheduler knobs within configured ranges based on observed metrics. Raise the concurrency cap when system load has been low for an hour. Lower the burn-rate threshold if multiple Stories have been wasteful. Extend a provider's cooldown multiplier if flakiness has climbed.

**Risk:** MEDIUM — contained by bounds. The agent can tune inside a box. It cannot resize the box.

**Where it lives:** Orchestrator submits `tune_scheduler_limits` via `aloop-agent submit`. Daemon validates against `daemon.yml` min/max/step bounds for each knob. Rejections return `error.code = "tune_out_of_bounds"` with the bound that was violated.

**Tunable knobs** (v1; extendable with explicit entries only):

| Knob | Min | Default | Max |
|---|---|---|---|
| `scheduler.concurrency.cap` | 1 | 3 | 8 |
| `scheduler.burn_rate.max_tokens_since_commit` | 100_000 | 1_000_000 | 10_000_000 |
| `scheduler.burn_rate.min_commits_per_hour` | 0 | 1 | 10 |
| `scheduler.system.cpu_max_pct` | 50 | 80 | 95 |
| `scheduler.system.mem_max_pct` | 50 | 85 | 95 |
| `scheduler.permit_ttl_default_seconds` | 120 | 600 | 3600 |
| `provider.<id>.cooldown_multiplier` | 0.5 | 1.0 | 4.0 |
| `watchdog.stuck_threshold_seconds` | 120 | 600 | 3600 |

**Untunable** (fixed; not self-adjustable):

- Concurrency cap **maximum** itself (the 8 above)
- Provider preference order (`opencode → copilot → codex → gemini → claude`) — project config, not agent decision
- Review gate thresholds and gate definitions
- Policy tables in `security.md`
- Any bound in this table

**Cheat case:** Agent raises `burn_rate.max_tokens_since_commit` to infinite.
**Prevention:** `max: 10_000_000` in the bounds table. Request above max is rejected.

**Cheat case:** Agent proposes a tuning and then immediately re-tunes to hide the first change.
**Prevention:** Every tuning is audit-logged as `self_tuning_adjustment` with timestamp, proposer session, before/after, and the metric rationale the orchestrator cited. Dashboard shows the audit stream; anomalous churn is visible.

### Level 3 — Self-directed work

**What:** File follow-up Epics and Stories, propose refinements, raise change-request issues against the spec, request re-decomposition, request pause-dispatch for a specific Story. All through the tracker, all human-gated.

**Risk:** LOW-MEDIUM. The tracker is the audit trail; humans review before merging CRs against the spec.

**Where it lives:** `orch_diagnose` and `orch_conversation` prompts can emit `file_followup`, `refine_again`, `decompose_again` actions. Tracker adapter creates the work items. Humans (or the orchestrator itself, for non-spec work) triage.

**Cheat case:** Agent files 1000 spurious follow-ups to hide a real failure.
**Prevention:** Every follow-up is a tracker write, audit-logged. `diagnose_invocation_rate` and follow-up-filing rate are first-class metrics; dashboard alerts on anomalous rate.

**Cheat case:** Agent files a CR against the CONSTITUTION to remove a review gate.
**Prevention:** CRs against CONSTITUTION require human merge. Agent cannot self-merge CRs against any spec file (hardcoded tracker policy, per `security.md`).

### Level 4 — Self-rewriting (PROHIBITED in v1)

**What:** Modify daemon code, orchestrator prompts, CONSTITUTION, review gate definitions, metric definitions, scheduler policy, or the spec itself as a direct side effect of an agent turn.

**Risk:** HIGH. This is the failure mode the research warns about and the failure mode the previous aloop demonstrated.

**Prohibition enforcement:**

- These paths are **not in any agent's worktree**. `ProjectAdapter` excludes them when opening the session's worktree. The agent has no file-system access to them.
- The CONSTITUTION, spec files, orchestrator prompts, and metric definitions live at well-known paths (`CONSTITUTION.md`, `docs/spec/**`, `aloop/templates/PROMPT_orch_*.md`, `docs/spec/metrics.md`). `ProjectAdapter` treats these as **immutable-for-agents** — it's a filter at the adapter level, not a hope-for-the-best convention.
- The daemon binary, scheduler code, and `daemon.yml` live outside the worktree entirely. No adapter ever exposes them.
- A human may of course modify these files — but that's a regular PR, not an agent-driven side effect.

**"But we need to evolve the prompts":** yes, and that happens via human-authored PRs. The orchestrator may *propose* a prompt change via a CR (Level 3), but it cannot write one.

**"But we need to evolve the constitution":** same answer. CRs propose amendments; humans merge.

## Enforcement mechanisms

Summarized across all four levels:

| Mechanism | What it prevents |
|---|---|
| `ProjectAdapter` worktree filtering | Level-4 file writes (spec, constitution, prompts, metric defs) |
| Tracker adapter policy tables | Agents self-merging spec CRs, closing Stories they didn't complete, etc. |
| Scheduler tuning bounds in `daemon.yml` | Level-2 tuning outside the box |
| Daemon-computed metrics from events | Agent forging metrics that gate its own permits |
| Audit log on every policy-gated action | Post-hoc detection of cheat attempts |
| `self_tuning_adjustment` and diagnose-rate metrics | Churn and escalation attack patterns |

## The DGM test

For every proposed self-improvement capability, we state the cheat case and the prevention before the capability ships. If we can't state the cheat, the capability doesn't ship.

Template:

```
Capability: <name>
Level: <1 | 2 | 3>
What it can touch: <specific paths, endpoints, metric ranges>
Cheat case: <most adversarial exploit an agent could attempt>
Prevention: <the specific mechanism blocking it>
Metric that would reveal a cheat attempt: <which metric catches it post-hoc>
```

Example (Level 1 stuck detection):

```
Capability: orch_diagnose queues pause_session on stuck child
Level: 1
What it can touch: read child's event stream; write a pause prompt into its queue
Cheat case: Agent skips hard work by emitting false stuck signals via burning provider turns that look like failures
Prevention: stuck classification is watchdog-computed from turn completion events; agent cannot self-report stuck
Metric that would reveal a cheat attempt: iteration_stuck_count with zero corresponding turn.failed events — mismatch is a red flag
```

Every new capability added to the orchestrator catalog (new diagnose action, new tuning knob, new conversation reply type) gets a DGM test entry appended to a `docs/spec/_dgm-tests.md` working doc.

## Operational review cadence

Self-improvement capabilities drift. A knob bound that was conservative becomes loose as the system matures; a cheat prevention that was necessary becomes obsolete. This file (and `_dgm-tests.md`) are reviewed on a cadence:

- **On every Level-1/2/3 capability addition** — DGM test required, reviewed in the CR that adds the capability.
- **Quarterly** — review the bounds table. Are we consistently hitting max on a knob? Did anyone try the cheat? What did the audit log reveal?
- **After any incident** — if a session produced sustained waste, review the diagnose-invocation-rate, the self-tuning-adjustment trail, and the follow-up-filing rate. Identify which mechanism failed.

The review is a human activity. The orchestrator doesn't review its own guardrails.

## Invariants

1. **Agents never modify the oracle layer.** Spec, CONSTITUTION, orchestrator prompts, review gate definitions, metric definitions, scheduler policy — all agent-read-only. Enforced at the `ProjectAdapter` filesystem boundary.
2. **Self-tuning is bounded by `daemon.yml`.** Bounds themselves are agent-inaccessible.
3. **Self-directed work is tracker-mediated.** Agents propose work items; humans (or the orchestrator in its bounded role) merge.
4. **Every self-improvement capability has a DGM test entry.** If we can't state the cheat, the capability doesn't ship.
5. **Metrics that gate permits are daemon-computed.** Agents can influence a metric by generating real events; they cannot emit a metric directly.
6. **Prohibition is structural, not aspirational.** Level-4 paths don't exist in the worktree. Level-4 writes are not denied by policy — they are not reachable by any API path the agent has.
