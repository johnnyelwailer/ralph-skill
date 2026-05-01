# Metrics

> **Reference document.** The canonical catalog of metrics aloop emits, stores, exposes, and consumes. Metrics are load-bearing: self-healing can't detect anomalies without them, self-tuning can't close a loop without them, the orchestrator can't gate decisions without them. Hard rules live in CONSTITUTION.md. Work items live in GitHub issues.
>
> "Good metrics are hard to get, but good metrics are key. A complex autonomous system must self-heal and self-improve — and metrics are the connective tissue."

## Table of contents

- Role of metrics
- Emission discipline (DGM-resistant)
- Metric types
- Metric dimensions and slices
- Canonical catalog
- Storage
- Exposure
- Consumption
- Retention
- Invariants

---

## Role of metrics

Metrics serve four consumers, in order of load-bearing importance:

1. **Scheduler gates** — permit grant/deny decisions read real-time metric state (burn rate, keeper rate, provider quota, permit denial cascades).
2. **Orchestrator self-healing** — the `orch_diagnose` prompt reads recent metric history to decide on pause / redispatch / file-followup / raise-threshold actions.
3. **Orchestrator self-tuning** — the orchestrator adjusts bounded knobs (`PUT /v1/scheduler/limits`) based on observed metrics. Bounds live in `daemon.yml` and are agent-inaccessible (see `self-improvement.md`).
4. **Humans** — dashboard panels, Prometheus exposition, alerting on rate-of-change.

Every metric in the catalog has a named consumer. Metrics without consumers are prohibited — if we can't say who reads it, we don't emit it.

## Emission discipline (DGM-resistant)

**Metrics the scheduler reads are daemon-computed from events, never agent-reported.** This is the single most important rule in this file.

Why: the Darwin Gödel Machine self-improving agent reward-hacked its own checker the moment it could touch it. SICA plateaued then got clever about gaming the eval. The lesson: never let an agent self-emit the metric that gates its own permits.

Concrete consequences:

- Agents produce **events** (via `aloop-agent submit` or provider chunks). The daemon's event pipeline computes metrics from those events.
- The agent cannot forge a metric value directly. It can only cause one by generating real events — and those are audited, replayable, and traceable.
- Projections (the SQLite tables the scheduler reads) are written by the daemon's projector, never by any agent path.
- Even the orchestrator — which reads metrics to decide — cannot write metric rows. It calls `PUT /v1/scheduler/limits` with a tuning intent; the daemon's policy decides whether the intent is accepted.

Metrics that flow the other way (agent consumes; daemon produces) are fine: the orchestrator reading `keeper_rate` is intended behavior. What's forbidden is the inverse.

## Metric types

| Type | Shape | Example |
|---|---|---|
| **Counter** | monotonically increasing integer | `permits_denied_total{gate=burn_rate}` |
| **Gauge** | point-in-time value | `sessions_running_count` |
| **Histogram** | distribution (buckets) | `turn_duration_seconds` |
| **Rate** | counter-derived per-time | `tokens_per_minute{session=s_abc}` |
| **Ratio** | derived from two counters | `keeper_rate = merged_prs / dispatched_stories` |

Ratios and rates are computed on read, not written. Keeping them derived prevents skew on restart.

## Metric dimensions and slices

The catalog below names metrics; most dashboard and learning questions are answered by grouping those metrics over a bounded set of dimensions.

Allowed high-cardinality dimensions are deliberately limited:

| Dimension | Examples | Why it exists |
|---|---|---|
| `scope` | global, workspace, project, orchestrator, epic, story, session, loop/phase | Lets the dashboard move from fleet health to one loop without changing metric definitions |
| `provider_route` | requested provider ref, resolved provider id, resolved model id, reasoning effort | Needed for model/provider evaluation |
| `deployment_route` | closed hosted, open-weight hosted, open-weight local/self-hosted, hardware/quantization bucket | Needed to compare true cost/performance for open-weight and self-hosted routes |
| `work_shape` | workflow, workflow phase, task family, story complexity tier, file-scope size bucket | Separates frontend work from refactors, review from build, small tasks from large tasks |
| `quality_context` | spec quality tier, ambiguity count bucket, validation baseline, sensitivity hint | Helps explain outcomes without pretending the model alone caused them |
| `outcome` | merged, rejected, changes requested, abandoned, failed, blocked | Common funnel vocabulary for work results |
| `time_window` | last 24h, 7d, 30d, all-time aggregate | Keeps dashboards responsive and comparisons honest |

Cardinality guardrails:

- `session_id`, `story_ref`, and `change_set_ref` are allowed on object-detail endpoints, not global Prometheus counters.
- Freeform labels, raw file paths, reviewer usernames, and tracker URLs are not metric labels. They stay in events and detail records.
- For model comparison, `model_id` must be paired with task family/workflow phase. A global model ranking is allowed as a dashboard summary, but optimizer decisions must use task-family slices.
- Spec-quality dimensions are explanatory/contextual. They can guide investigation and routing proposals, but they are not proof of causality.

## Canonical catalog

Organized by consumer. Each metric names its type, source events, storage table, and consumers.

### Scheduler gate inputs

These are read on **every permit acquire**. Keep them cheap and indexed.

| Metric | Type | Source events | Storage | Consumer |
|---|---|---|---|---|
| `burn_rate.tokens_per_merged_pr` | Rate | `usage`, `change_set.merged` | `session_metrics` | Burn-rate gate |
| `burn_rate.tokens_since_last_commit` | Gauge | `usage`, `commit` | `session_metrics` | Burn-rate gate |
| `keeper_rate` | Ratio | `session.created kind=child`, `change_set.merged` | `orchestrator_metrics` | Burn-rate gate (orchestrator) |
| `permit_denial_rate` | Rate | `scheduler.permit.deny` | `scheduler_metrics` | Overrides gate (cascade detection) |
| `provider_quota_utilization` | Gauge (0-1) | `provider.quota` | `provider_metrics` | Provider gate |
| `system_cpu_pct`, `system_mem_pct`, `system_load` | Gauge | OS probe (daemon) | `system_metrics` | System gate |
| `concurrency_in_flight` | Gauge | `scheduler.permit.grant/release` | `scheduler_metrics` | Concurrency gate |

Burn-rate specifically: tokens-per-merged-PR is the key signal. Karpathy's AutoResearch data — 20 keepers per 700 experiments (~2.8% keeper rate) — is a useful baseline. aloop's threshold default: deny permits when `burn_rate.tokens_since_last_commit > daemon.yml.scheduler.burn_rate.max_tokens_since_commit` (default 1,000,000 tokens, configurable min 100k / max 10M).

### Session health

Read by orchestrator diagnose + watchdog.

| Metric | Type | Source events | Consumer |
|---|---|---|---|
| `turn_success_rate` | Ratio | `turn.completed`, `turn.failed` | Orchestrator, diagnose |
| `iteration_stuck_count` | Gauge | consecutive `turn.failed` | Watchdog, diagnose |
| `phase_retry_exhaustion_rate` | Rate | `phase_retry_exhausted` | Diagnose |
| `cycle_advance_rate` | Rate | `cyclePosition` changes | Diagnose |
| `queue_depth` | Gauge | queue file inventory | Diagnose |
| `session_events_per_hour` | Rate | all session events | Watchdog (stuck detector) |

### Orchestrator health

| Metric | Type | Source | Consumer |
|---|---|---|---|
| `cross_session_merge_conflict_rate` | Rate | `change_set.conflict` | Orchestrator scheduler (file-scope enforcement feedback) |
| `review_gate_pass_rate` | Ratio, per gate | `review_result` | Diagnose, dashboard |
| `decompose_to_merge_latency_p50/p95` | Histogram | `work_item.created kind=story`, `change_set.merged` | Dashboard, diagnose |
| `dispatch_to_first_review_latency_p50/p95` | Histogram | `session.created kind=child`, `change_set.review_submitted` | Dashboard, diagnose |
| `review_to_merge_latency_p50/p95` | Histogram | `change_set.review_submitted verdict=approved`, `change_set.merged` | Dashboard, diagnose |
| `change_request_rework_latency_p50/p95` | Histogram | `change_set.review_submitted verdict=changes_requested`, next `change_set.updated` or `review_result` | Dashboard, diagnose |
| `comment_response_latency_p50/p95` | Histogram | `comment.created source=human`, `comment.created source=aloop` (reply) | Dashboard — tracks how long humans wait for the orchestrator to respond |
| `diagnose_invocation_rate` | Rate | `orch_diagnose` queued | Dashboard (if this rises, something is wrong) |
| `self_tuning_adjustment_rate` | Rate | `PUT /v1/scheduler/limits` accepted | Dashboard (audit trail for Level-2 self-improvement) |

### Work outcomes and review quality

These metrics answer whether generated work is accepted, rejected, revised, merged, or abandoned. They are grouped by `project_id`, `variant_id`, `provider_route`, `workflow`, `workflow_phase`, `task_family`, `story_complexity`, `spec_quality_tier`, and time window.

| Metric | Type | Source | Consumer |
|---|---|---|---|
| `change_set_approval_rate` | Ratio | `change_set.review_submitted verdict=approved`, all submitted reviews | Dashboard, model optimizer |
| `change_set_changes_requested_rate` | Ratio | `change_set.review_submitted verdict=changes_requested`, all submitted reviews | Dashboard, diagnose |
| `change_set_rejection_rate` | Ratio | `review_result verdict=rejected` or tracker equivalent, all reviewed change sets | Dashboard, model optimizer |
| `change_set_merge_rate` | Ratio | `change_set.merged`, `change_set.opened` | Dashboard, model optimizer |
| `review_rounds_per_merged_change_p50/p95` | Histogram | `change_set.review_submitted`, `change_set.merged` | Dashboard |
| `review_finding_count_by_gate` | Histogram | `review_result.findings[]` grouped by gate/category/severity | Dashboard, prompt/config optimizer |
| `human_override_rate` | Ratio | human review verdict differs from agent review verdict | Dashboard, learning |
| `post_merge_followup_rate` | Ratio | follow-up Story/Epic linked to merged change, `change_set.merged` | Dashboard, learning |

Review verdict vocabulary is intentionally small: `approved`, `changes_requested`, `rejected`, `commented`, `stale`, `superseded`. Tracker-native states map into that vocabulary in the adapter projection.

### Spec and decomposition quality

These are not "blame the spec" metrics. They are context signals that explain why a model, workflow, or prompt may be struggling.

| Metric | Type | Source | Consumer |
|---|---|---|---|
| `spec_ambiguity_count` | Gauge | setup ambiguity records, `refine_result`, `consistency_result` | Dashboard, setup, learning |
| `story_refinement_rework_rate` | Ratio | Story moved from dispatchable/refined back to `needs_refinement` | Dashboard, orchestrator diagnose |
| `pre_dispatch_stale_rate` | Ratio | `consistency_result verdict=stale`, consistency checks | Dashboard, diagnose |
| `spec_to_story_churn_rate` | Rate | Story scope/status/file-scope changed after initial refinement | Dashboard, learning |
| `acceptance_criteria_completeness` | Gauge/tier | `refine_result` DoR fields present and validation refs named | Dashboard, learning |
| `validation_baseline_strength` | Gauge/tier | setup validation command discovery and historical pass/fail coverage | Dashboard, learning |

Recommended `spec_quality_tier` projection:

| Tier | Meaning |
|---|---|
| `strong` | Acceptance criteria, validation commands, file scope, and constraints are explicit |
| `adequate` | Enough to dispatch, but some assumptions or weak validation remain |
| `weak` | Dispatchable only with exploratory/draft framing or high review strictness |
| `blocked` | Not dispatchable without clarification |

### Cost

| Metric | Type | Source | Consumer |
|---|---|---|---|
| `cost_per_story` | Gauge | `usage` chunks, grouped by session's `issue` | Dashboard, orchestrator |
| `cost_per_epic` | Gauge | roll-up across Stories under an Epic | Dashboard |
| `cost_per_research_run` | Gauge | `usage` chunks, grouped by `research_run_id` | Dashboard, incubation proposal review |
| `cost_per_merged_pr` | Gauge | cost summed from dispatch → merge | Burn-rate gate |
| `daily_cost_total` | Counter (reset daily) | `usage.cost_usd` | Budget gate |
| `daily_cost_vs_cap` | Ratio | daily_cost_total / daily_cap from project config | Budget gate (starts denying at 80%) |

### Incubation

| Metric | Type | Source | Consumer |
|---|---|---|---|
| `incubation_capture_count` | Counter | `incubation.item.changed state=captured` | Dashboard |
| `incubation_research_completion_rate` | Ratio | `incubation.research.update` | Dashboard, diagnose |
| `incubation_promotion_rate` | Ratio | `incubation.proposal.changed state=applied`, `incubation.item.changed state=captured` | Dashboard |
| `incubation_time_to_promotion_p50/p95` | Histogram | `incubation.item.changed`, `incubation.proposal.changed state=applied` | Dashboard |
| `incubation_source_count_by_kind` | Counter | `incubation.source.recorded` | Dashboard |
| `incubation_experiment_attempt_count` | Counter | `incubation.experiment.recorded` | Dashboard, budget review |
| `incubation_experiment_keeper_rate` | Ratio | `incubation.experiment.recorded keep=true/false` | Dashboard, plateau detection |
| `incubation_experiment_metric_delta` | Gauge | `incubation.experiment.recorded` | Dashboard, plateau detection |
| `incubation_monitor_alert_rate` | Rate | `incubation.monitor.update alert=true` | Dashboard |
| `incubation_monitor_cost_per_period` | Gauge | `usage.cost_usd`, grouped by `monitor_id` and period | Dashboard, budget review |
| `incubation_outreach_approval_count` | Counter | `incubation.outreach.changed state=approved` | Dashboard, audit |
| `incubation_outreach_response_count` | Counter | `incubation.outreach.changed response_recorded` | Dashboard |

Incubation metrics are ordinary event projections. Source connectors, monitors, outreach records, and experiment attempts emit events; the existing projector computes metrics. Agents do not report scores that gate their own research or attempts.

### Provider health

| Metric | Type | Source | Consumer |
|---|---|---|---|
| `provider_cooldown_remaining_seconds` | Gauge | `provider.health` transitions | Provider gate |
| `provider_failure_classification_total{class,provider}` | Counter | `error` chunks | Dashboard, diagnose |
| `provider_fallthrough_position_success` | Histogram | which chain position actually worked | Dashboard (chain-quality signal) |
| `provider_quota_headroom` | Gauge | `provider.quota` | Dispatcher (prefer headroom) |
| `provider_consecutive_failures` | Gauge | `provider.health` | Backoff compute |

### Provider and model outcome learning

These are read by the learning layer and dashboard, not on every permit acquire. They are grouped by bounded labels: `project_id`, `variant_id`, `provider_ref`, `resolved_provider_id`, `model_id`, `reasoning_effort`, `deployment_route`, `workflow_phase`, `task_family`, `story_complexity`, and `spec_quality_tier`.

| Metric | Type | Source | Consumer |
|---|---|---|---|
| `model_merge_rate` | Ratio | `session.created kind=child`, `change_set.merged` | Model optimizer, dashboard |
| `model_approval_rate` | Ratio | `change_set.review_submitted verdict=approved`, all submitted reviews | Model optimizer, dashboard |
| `model_changes_requested_rate` | Ratio | `change_set.review_submitted verdict=changes_requested`, all submitted reviews | Model optimizer, dashboard |
| `model_review_gate_pass_rate` | Ratio | `review_result` | Model optimizer, dashboard |
| `model_cost_per_merged_pr` | Gauge | `usage`, `change_set.merged` | Model optimizer, budget review |
| `model_cost_per_approved_change` | Gauge | `usage`, `change_set.review_submitted verdict=approved` | Model optimizer, dashboard |
| `model_tokens_per_merged_pr` | Gauge | `usage`, `change_set.merged` | Burn-rate analysis, model optimizer |
| `model_value_score` | Derived | quality floor + approval/merge rate + cost/latency normalized within task family | Dashboard, model optimizer |
| `model_turn_success_rate` | Ratio | `turn.completed`, `turn.failed` | Model optimizer, diagnose |
| `model_fallthrough_success_position` | Histogram | provider-chain resolution + `turn.completed` | Model optimizer, dashboard |
| `model_latency_to_first_chunk_p50/p95` | Histogram | `agent.chunk`, provider timing | Model optimizer, dashboard |
| `model_review_rounds_to_merge_p50/p95` | Histogram | `change_set.review_submitted`, `change_set.merged` | Model optimizer, dashboard |
| `model_external_candidate_count` | Counter | `model_intelligence.candidate_recorded` | Dashboard, model-watch review |

Model outcome metrics require turn metadata to record both the requested provider reference and the resolved route/model. For example, `opencode/openrouter/kimi@2.6` and `opencode/openrouter/deepseek@v4-pro` must not collapse into one `opencode` bucket. Provider/toolchain failures are attributed to the resolved route because the operator experiences the route, not an abstract base model.

## Storage

Three-layer storage, aligned with the daemon's split of authoritative log vs queryable state (see `daemon.md`):

1. **Events** — per-session, setup-run, and incubation-item JSONL (`log.jsonl`). The authoritative raw stream. Replayable.
2. **Projections** — SQLite tables under `db.sqlite`:
   - `session_metrics(session_id, metric_name, value, updated_at)` — current values
   - `scheduler_metrics`, `provider_metrics`, `system_metrics`, `orchestrator_metrics` — per-topic projection tables
   - `metric_history(metric_name, labels, value, timestamp)` — time-series ring buffer (bounded; see Retention)
3. **Materialized views** — for histograms and ratios, periodically computed from events or projections, stored in `metric_aggregates` with explicit `window_start`/`window_end`.

Rebuildability: on schema migration or corruption, **projections are reconstructible from events** by re-running the projector. Events are never reconstructible from projections. If they diverge, events win.

## Exposure

Four exposure channels, all reading the same underlying storage:

1. **Prometheus** — `GET /v1/metrics`. Text exposition format. Cardinality-bounded (no per-session labels on counters; per-session metrics exposed via the session endpoint instead).
2. **Per-session** — `GET /v1/sessions/:id/metrics`. Returns current values for that session's metrics.
3. **SSE** — events on the global bus with topic `metrics.change` when a projection value crosses a configured threshold. Not per-second ticks (those were in an earlier draft and were dropped — Prometheus scraping covers the same need without bus traffic).
4. **Dashboard** — consumes `GET /v1/metrics` + `/v1/sessions/:id/metrics` + `metrics.change` SSE events. No privileged dashboard-only metric endpoint.

## Consumption

### Scheduler permit gates

Every permit acquire reads a small, indexed set of metrics. Target: <1ms per gate check, no metric over 100µs to evaluate. If a gate's metric becomes expensive, cache its value in a projection column.

### Orchestrator diagnose

`PROMPT_orch_diagnose.md` receives a structured payload including:

- Recent `metrics.change` events on the session being diagnosed
- Current values for session-level metrics above
- Comparable baselines (prior N successful Stories)
- Project's configured thresholds

The prompt does **not** receive raw events — those are too noisy and too large. It receives the curated metric view. Prompts reading raw events is a red flag for a project where the orchestrator ended up re-implementing the projector.

### Self-tuning

The orchestrator may submit `tune_scheduler_limits` via `aloop-agent submit` with a proposed adjustment to any bounded knob (`burn_rate.max_tokens_since_commit`, `concurrency.cap`, `provider.<id>.cooldown_multiplier`, etc.). The daemon validates against `daemon.yml` min/max bounds and either applies or rejects with `error.code = "tune_out_of_bounds"`. Every accepted tuning emits `self_tuning_adjustment` for the audit trail.

See `self-improvement.md` for the authoritative list of tunable knobs and their bounds.

### Humans

Dashboard shows live panels (`cost_today`, `sessions_running`, `keeper_rate`, `burn_rate_per_session`). External tooling (Grafana, etc.) scrapes `/v1/metrics` at its own cadence. No bus polling required for routine human viewing.

## Retention

Per-session metrics: retained as long as the session's JSONL (governed by `daemon.yml`'s `retention.completed_sessions_days`, default 30).

Project-level time-series (`metric_history`): bounded ring buffer, 30 days by default, configurable per project. When the buffer fills, oldest entries drop; aggregates (`metric_aggregates`) cover longer windows with lower resolution.

Daemon-level metrics (resource usage, permit counters): 7 days of time-series by default.

## Invariants

1. **Daemon-computed, not agent-reported.** Metrics that gate permits are daemon-written from events. No agent-emit path for them.
2. **Every metric has a consumer.** If no one reads it, it isn't emitted.
3. **Projections rebuildable from events.** SQLite is a view; JSONL is truth.
4. **Scheduler reads are indexed.** Permit acquisition latency dominated by the slowest gate; gates stay <1ms on the metric read.
5. **No silent metrics.** Every scheduler gate denial includes the metric value that triggered it in the denial payload; the `orch_diagnose` prompt always receives the metric view that informed the decision. No decisions without visible rationale.
6. **Bounds are read-only to agents.** Thresholds live in `daemon.yml` under `~/.aloop/`; agents can propose tuning within bounds but cannot read or modify the bounds themselves.
