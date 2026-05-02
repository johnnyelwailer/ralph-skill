# Learning

> **Reference document.** How aloop accumulates evidence about its own performance over time and turns that evidence into improvements — without crossing into Level-4 self-rewriting. The catalog of methodologies considered, the v1 minimum that makes future learning possible, and the explicit deferrals. Hard rules live in CONSTITUTION.md. Work items live in GitHub issues.
>
> Distinct from `metrics.md` (what we measure) and `self-improvement.md` (the four-level framework). This file is the **methodology layer**: given metrics + self-improvement bounds, *how* does the system learn what to change?

## Table of contents

- The problem
- Why Karpathy AutoResearch doesn't apply (here)
- The right shape: continuous structured experimentation
- Methodology catalog
- Budgeted benchmark mode (existing-primitives only)
- Automatic model optimization
- v1 minimum (must ship)
- v1.5 candidates (after first telemetry)
- v2+ candidates (after months of production)
- Explicit non-goals
- Cheat resistance per methodology
- Invariants

---

## The problem

The metrics that actually matter for aloop's value — PR merge rate, tokens per merged PR, per-gate review pass rate, code-quality trend — are precisely the ones that don't fit a tight optimization loop:

- **Slow feedback** — outcomes take hours to days per Story.
- **High variance** — every Story is unique; can't run "the same Story" under two configs.
- **Many confounders** — Story difficulty, team velocity, model quality drift, third-party flakiness all move the metric.
- **Ethical constraint** — we don't want to A/B test "is this PR good enough to merge" by intentionally producing bad PRs.

Yet these are exactly what an autonomous system must improve, or it stagnates and burns budget. The four-level framework in `self-improvement.md` says the *what* is bounded; this document says the *how* is structured experimentation, slow-horizon, methodology-disciplined.

## Why Karpathy AutoResearch doesn't apply (here)

AutoResearch (Karpathy, March 2026) loops at minutes-per-experiment with a fixed eval (`val_bpb` after exactly 5 minutes of training). Works because:
- The eval is fast and deterministic.
- The mutable surface is one file.
- 700 experiments in 2 days is feasible.

aloop's macro-metrics (merge rate, burn rate, code quality) cannot be evaluated in minutes. A single Story is hours of work and one data point. AutoResearch is the wrong tool for them.

AutoResearch IS the right tool for narrow, fast-eval problems within a Story's scope (flaky test stabilization, perf micro-optimization, coverage on a file). Those are covered by the `perf-opt` workflow in `workflows.md` and listed as Level-3 forward-compat in `self-improvement.md`. They are not the focus of this document.

It is also the right mental model for incubation `experiment_loop` research when the project can name:

- a human-owned research protocol
- a narrow mutable surface
- an immutable oracle/eval
- a fixed budget per attempt
- a daemon-computed metric and keep/reject rule

See `docs/research/research-systems-2026.md` and `incubation.md` section Experiment loops.

This document is about the harder problem: **learning what to change about the project's configuration and prompts so that future Stories produce better outcomes — measured over weeks of real production work, not minutes of synthetic experiment.**

## The right shape: continuous structured experimentation

The pattern is closer to MLOps / industrial A/B testing than to a tight optimization loop:

| Property | AutoResearch | Continuous experimentation |
|---|---|---|
| Cycle time | minutes | days–weeks |
| Eval | synthetic benchmark | real Story outcomes |
| Mutable surface | one file | project config + project prompts |
| Decision gate | agent commits/reverts | human merges a CR |
| Cheat resistance | immutable eval | daemon-computed metrics + statistical-significance gate + variant tagging |
| Sample requirements | hundreds | tens to hundreds of Stories |
| Time horizon | hours | weeks to months |

Each Story IS an experiment if we tag it correctly. The variant_id label on every Story-level metric is the entire experimental machinery; statistical analysis turns variance into signal; CR workflow keeps humans in the loop on changes.

## Methodology catalog

Grouped by what they address. For each: what it does, where it slots in aloop's four-level framework, maturity, libraries.

### A. Sample-efficient selection among discrete variants

- **Multi-armed bandits (UCB, Thompson sampling).** Treat each project-config variant as an arm; allocate Stories based on past outcomes; explore vs. exploit. Vastly more efficient than fixed 50/50 A/B. Level 3 (proposes a "lock-in" CR after enough evidence). Library: ~50 LOC TS, no dependency.
- **Population-based training (PBT — DeepMind).** Run N variants concurrently. Periodically kill the worst, copy + mutate the best. Level 3. Overkill until throughput is high.
- **Bayesian hierarchical models.** Model `outcome ~ story_difficulty + variant + noise` to disentangle confounders. Level 3 analytical layer. Library: Stan / PyMC, heavy. Defer.

### B. Continuous parameter tuning

- **Bayesian optimization (BO).** Builds a probabilistic model of `config → outcome` and picks the next experiment to maximize information gain. Level 2 (operates inside `daemon.yml` bounds). Library: `optuna`, `bayesian-optimization`.
- **Hyperband / ASHA.** Successive halving with early stopping. Run many trials briefly, kill underperformers, double budget for survivors. Level 2/3. Useful for trying many provider chains briefly.
- **Closed-loop control (PID).** Setpoint + feedback for stable single-knob single-metric problems. Level 2. ~30 LOC.

### C. Prompt evolution (project layer only — never aloop core)

- **DSPy (Stanford).** Prompts as compilable programs; teleprompters optimize them against a metric. Level 3 IF restricted to project's `.aloop/prompts/` (project layer). Mature, has shipped, has gotchas.
- **TextGrad (Stanford).** "Gradient descent through text." Less mature than DSPy. Level 3. Defer to v2.
- **OPRO (DeepMind).** LLM as the optimizer over discrete prompt space. Surprisingly effective; no library needed. Level 3. Direct map to orchestrator's prompt-optimizer workflow.
- **Promptbreeder (DeepMind).** Genetic algorithm over prompts. Level 3. High variance; prefer OPRO.

### D. Rigorous experimentation

- **Statsig / GrowthBook patterns.** Sample sizing (CUPED, sequential testing), variance reduction, multiple-comparison corrections. Methodology, not necessarily the platform. Bake into the analysis layer.
- **Causal inference (DoWhy, EconML, causalimpact).** Beyond correlation. Important when ready; heavy machinery.
- **Counterfactual / off-policy evaluation.** Estimate "what would have happened" from historical data. Useful when running parallel variants is expensive.

### E. Safe rollout

- **Canary releases.** New config rolls out to small fraction of Stories first; observe; expand or rollback. **Required for any optimizer-proposed change.** Level 3 mechanism.
- **Feature flags / kill switches.** Per-variant on/off without rollback. Already implicit in `aloop providers overrides`.
- **Shadow mode.** Run new config in parallel without committing its work. Compare gate scores before promotion. Expensive (double cost) but safe.

### F. Drift / anomaly detection

- **CUSUM, EWMA, Bayesian changepoint detection.** Online algorithms for detecting when a metric distribution shifts. **Required for Level-1 self-healing.** ~20 LOC for CUSUM.
- **Welford's online variance.** Single-pass running mean and variance, numerically stable. **Required foundation.** ~10 LOC.

### G. Meta-patterns

- **Constitutional AI iteration (Anthropic pattern).** Constitution itself iterated by red-team exercises that try to break the system. Findings file CRs against CONSTITUTION (Level 3, human-merged). Makes Section IX of CONSTITUTION a living document while preserving agent-read-only invariant.
- **Reward modeling from human review.** When humans review PRs, capture qualitative judgments. Train (or prompt) a reward model. Powerful but requires consistent human review data. v2.

## Budgeted benchmark mode (existing-primitives only)

There is one accelerator that fits aloop's operating model without introducing a new optimization subsystem: **budgeted benchmark mode**.

Idea: spend a small fixed weekly budget on a few carefully chosen, real, benchmarkable tasks. Run the same task shape under a small set of variants, pick the winner for that task, and keep the resulting evidence for future routing.

This produces two kinds of value:

- **Immediate value** — the benchmarked task itself can land from the best candidate rather than from the first acceptable one.
- **Slow learning value** — over weeks, the system accumulates evidence about which variant tends to win for a given agent type and task family.

### Why this mode exists

The default learning loop in this document is intentionally slow-horizon: every Story contributes one data point. That is the right foundation.

But some task families are common, bounded, and expensive enough to justify a little extra measurement:

- frontend component work
- test-authoring tasks
- bounded refactors
- contract-focused backend slices

For these, a small amount of duplicated work can pay for itself by improving both the current outcome and future routing.

### Constraint: v1 must reuse existing primitives

This mode is deliberately **not** a new daemon subsystem in v1. No dedicated benchmark runner, no benchmark database, no benchmark-only API, no special scheduler path.

It is composed from existing primitives:

| Need | Existing primitive |
|---|---|
| select the task shape | ordinary Story labels + metadata + orchestrator refinement |
| choose variants | existing `provider_chain`, `model`, and `config_variant_id` fields |
| run the work | ordinary child sessions and ordinary workflows |
| evaluate quality | ordinary proof/review/finalizer agents plus project prompts |
| keep evidence | existing Story metadata, child-session history, change sets, and `metric_aggregates` grouped by `variant_id` |
| keep cost bounded | existing cost metrics + project policy on how many benchmark Stories may be dispatched per week |

### Execution model

Benchmark mode is expressed as a small group of **ordinary Stories** that all represent the same bounded task, with shared benchmark metadata and different variants.

Each benchmark candidate:

- uses the same `file_scope`
- uses the same selected workflow the canonical task would have used
- differs only in variant choice (`config_variant_id`, provider/model, or project-layer prompt hash)
- produces the same normal artifacts: commits, proof outputs, review outputs, and change set

One important consequence falls directly out of the current trunk-safety model:

- **Benchmark candidates run serially in v1.**

Why: benchmark candidates for the same task necessarily share `file_scope.owned`, and the scheduler's overlap gate already denies concurrent Stories with overlapping ownership. That rule is correct and should not be weakened just to make benchmarking easier. Under current primitives, benchmark runs compare alternatives **one after another**, each from the same `agent/trunk` base, not in parallel.

This is acceptable because benchmark mode is explicitly slow-budgeted rather than throughput-maximizing.

### Task selection rules

Only benchmark tasks that are:

- bounded enough that duplicate execution cost is acceptable
- common enough that the result is likely to generalize
- reviewable by artifacts and rubrics, not only by taste
- uncertain enough that variant choice plausibly matters

Avoid benchmarking:

- giant or highly ambiguous Stories
- one-off migrations with no recurring shape
- tasks whose quality cannot be judged except by long-horizon production fallout

### Evaluation stack

Benchmark evaluation should stay boring and layered:

1. **Objective checks first** — tests, lint, typecheck, screenshots, perf captures, accessibility checks, coverage deltas, contract checks.
2. **Workflow-native review artifacts second** — proof, review, final-review, final-qa, or any project-specific finalizer already in the chosen workflow.
3. **Agent-type-specific rubric third** — captured in project prompts or Story metadata, not in daemon code.
4. **Human tie-break only when needed** — close scores, conflicting artifacts, or high-stakes tasks.

Different specialized agents care about different rubrics:

- **testing** — coverage improvement, flake resistance, usefulness of assertions, bug-finding quality
- **builder** — spec coverage, correctness, maintainability, review findings
- **frontend builder** — responsiveness, accessibility, composability, theming consistency, visual correctness

### Winner policy

Exactly one benchmark candidate may become the winner for a benchmark group.

- The winner proceeds through the ordinary approval and merge path.
- Non-winning candidates are closed or rejected as ordinary work items; their artifacts remain part of the evidence trail.
- The benchmark group is valuable even when no candidate is good enough to merge: that result still teaches the routing layer that the tested variants underperformed on this task family.

### What this mode is not

- Not a replacement for variant tagging on all Stories.
- Not a license to weaken `file_scope` overlap protections.
- Not a prompt optimizer.
- Not an automatic self-merging learning loop.
- Not a reason to add benchmark-specific code before the basic evidence substrate exists.

### Future primitives, only if later automation justifies them

No new runtime primitive is required for the initial mode above.

If later automation and UI support are worth the code, keep the additions minimal:

1. **Dedicated benchmark-budget enforcement** — a scheduler/accounting primitive that reserves a weekly budget bucket for benchmark-tagged Stories rather than relying on project policy.
2. **Benchmark result API/dashboard surface** — read-only aggregation over existing Story/session data so humans can inspect win rate, cost, and confidence by task family.
3. **Isolated benchmark sandboxes** — only if true parallel same-task eval becomes worth the complexity. Without such a primitive, duplicate candidates remain serial by design.

## Automatic model optimization

Automatic model optimization is the higher-level version of variant learning: decide which provider/model/effort settings should be tried, canaried, benchmarked, or proposed as new project defaults.

This is necessary because model quality, pricing, latency, context windows, and toolchain reliability now drift faster than normal project release cycles. A static provider chain will become stale. But the optimizer must be evidence-weighted: **external model intelligence is a prior, local Story history is the authority**.

See `docs/research/model-optimization-2026.md` for the current external research pass.

### Evidence layers

| Layer | Examples | How it is used |
|---|---|---|
| Local production outcomes | merge rate, review pass rate, cost per merged PR, fallthrough success, retries, human review outcomes | Primary routing evidence and lock-in justification |
| Local budgeted benchmarks | serial same-task candidates under different provider/model variants | Strong evidence for a task family when duplicate cost is justified |
| External benchmark intelligence | Artificial Analysis, official model cards, SWE-bench/Terminal-Bench/LiveCodeBench-style public results, pricing, context, latency, open-weight availability, hosting route | Seeds candidate variants and priors |
| User/operator reports | YouTube head-to-heads, Reddit threads, blogs, public coding-contest repos | Watchlist signal and failure-mode discovery |

External reports are intentionally below local evidence. A leaderboard can identify that `claude/opus@4.7`, `codex/gpt-5.5-high`, `gemini/pro@3.1`, `opencode/openrouter/kimi@2.6`, an open-weight coder route, or another current model deserves evaluation. It cannot prove that model is best value for this project, this workflow phase, this repo, and this toolchain.

### Research run shape

Model landscape research reuses incubation research primitives; it is not a new daemon subsystem.

- One-shot scans use `ResearchRun.mode = "source_synthesis"`.
- Recurring model watch uses `ResearchMonitor` with `mode = "monitor_tick"`, backed by daemon triggers.
- The source plan may include benchmark aggregators, official release notes/model cards, public papers, provider pricing pages, reproducible coding-agent comparisons, and selected user-report sources.
- The output is a synthesis artifact plus `ModelCandidateRecord`-style metadata: model ref, provider route, availability class (closed hosted, open-weight hosted, open-weight local/self-hosted), capabilities, context window, price snapshot, latency/throughput snapshot, hardware/quantization route where relevant, public benchmark notes, user-report notes, source IDs, freshness, confidence, and recommended local evaluation.

The default model watch cadence is **biweekly** for active projects. High-spend or fast-moving workspaces may choose weekly; quiet or low-budget workspaces may choose monthly. The monitor may also have event triggers for model-catalog changes, benchmark-source updates, provider pricing changes, local cost/performance regressions, or provider health drift. Each tick compares against the previous snapshot and reports only material deltas: new model releases, version bumps for models already in use, benchmark movement, pricing changes, context/capability changes, open-weight availability, hosting-route changes, provider availability, and user-report signals with reproducible artifacts.

Promotion targets stay ordinary:

- create a candidate `config_variant_id`
- schedule a budgeted benchmark group
- canary a variant at a small permit percentage
- file a CR changing project provider defaults
- file a follow-up to add missing adapter/model-map support

### Continuous reevaluation policy

Model optimization is useful during setup, but it is more valuable as continuous research. Setup may seed the first provider chain and create the recurring model watch; after that, the monitor keeps the model map fresh without waiting for a human to rerun setup.

Each monitor tick classifies recommendations into three buckets:

| Recommendation | Example | Required validation |
|---|---|---|
| **Patch/version upgrade** | A chain already uses `claude/opus`; `claude/opus@4.8` replaces `@4.7` with better benchmark value and no capability loss | Small canary or direct CR when provider compatibility, price, context, and local risk policy pass |
| **Capability-specific swap** | Use a model with stronger frontend-design evidence for `frontend_builder`, or a cheaper high-throughput model for extraction | Budgeted benchmark or canary on that task family |
| **Cost-down substitution** | Replace a frontier default with a cheaper proprietary or open-weight route for extraction, test scaffolding, simple refactors, or other bounded work | Canary with quality floor plus cost/latency comparison |
| **New route exploration** | Add a newly released model/provider route not used by the project | Candidate variant plus benchmark group before any default change |

Patch/version upgrades are intentionally lighter than new route swaps. If the project already uses an unpinned track like `claude/opus`, the adapter's model map may resolve to the latest compatible version at permit time. If the project pins `claude/opus@4.7`, the monitor files a CR or canary proposal to move the pin. The proposal must include the old/new resolved model, price delta, benchmark delta, capability delta, deployment/route delta, and rollback condition.

### Routing policy

The optimizer may propose exploration, not silently exploit.

1. New external candidate appears, or an existing model materially improves.
2. Research run records candidate evidence and confidence.
3. Orchestrator proposes a canary or budgeted benchmark when the model maps to a real task family.
4. Daemon-computed local metrics accumulate by `variant_id`, `provider_ref`, `model_id`, workflow phase, and task family.
5. Only after enough local evidence does the optimizer propose a lock-in CR.

This preserves the self-improvement boundary: model optimization is Level 3 when it changes project config defaults, Level 2 only when it allocates traffic inside pre-approved canary bounds, and never Level 4.

### Task-family routing

The optimizer must avoid global "best model" conclusions. It should learn the cheapest reliable route separately for:

- planning / architecture
- builder implementation
- frontend visual work
- tests and QA
- review / critique
- research/source synthesis
- long-context repository analysis
- fast classification/extraction

A valid recommendation is "prefer Gemini for long-context research but keep Codex/GPT for implementation" or "canary Kimi on cheap bounded refactors." A weak recommendation is "replace the default provider chain because model X tops a public leaderboard."

Capability-specific routing should be represented in workflow phase/provider-chain data, not as hidden scheduler behavior. For example, a frontend workflow can canary a model only for `frontend_builder`, while review and test phases keep their existing chains.

The desired end state is a portfolio: frontier models where they earn their cost, cheaper proprietary models where they clear the quality bar, and open-weight hosted/local routes where they improve value, privacy, throughput, or provider diversity.

### Guardrails

- External scores cannot directly change provider order.
- Any provider/model lock-in goes through CR review.
- Candidate canaries must have explicit budget and rollback thresholds.
- Direct version upgrades are allowed only for compatible replacements inside an already-approved provider/model family and must be auditable.
- Open-weight and local/self-hosted routes must record hardware, quantization, context, and hosting route because those are part of the model's observed behavior and cost.
- Local metrics are daemon-computed from events; the optimizer cannot emit its own score.
- User reports without artifacts are watchlist signals, not ranking data.
- Provider/toolchain failures count against the resolved model route, even if the base model looks strong on API-only benchmarks.

## v1 minimum (must ship)

Foundations without which no future learning is possible. Build these in v1; do not build the optimizer layer.

| Component | Why required | Estimated LOC |
|---|---|---|
| `Story.metadata.config_variant_id` | Every Story tagged with the config variant in use at dispatch time. Without this, no experiment is reconstructible. | ~no LOC, schema field |
| Resolved provider/model metadata on turns | Outcomes must be attributable to the exact provider route, model, and reasoning/effort setting used. Provider-only evidence is too coarse for model optimization. | adapter/session metadata |
| `metric_aggregates` projection grouped by `variant_id`, `provider_ref`, `model_id`, task family, and workflow phase | Outcomes accumulate by variant and model route; foundation for all later analysis. | Already in `metrics.md`, extended labels |
| Welford online stats + CUSUM drift detection | Daemon detects metric shifts in real time; feeds Level-1 `orch_diagnose`. | ~30 LOC |
| Canary-aware permit allocation | Scheduler can grant `K%` of permits to a flagged variant for safe rollout. | ~40 LOC in scheduler |
| Variant-comparison dashboard panel | Humans can see merge rate / burn rate / gate pass rate per variant. | dashboard work, post-MVP |

These primitives mean: when v1.5 work begins, the data is already there, the safety mechanisms are already there, and the analysis layer can be added without restructuring.

## v1.5 candidates (after first telemetry)

Once v1 has produced enough Story-outcome data per variant (rule of thumb: 50+ Stories per variant), the autonomous optimizer layer becomes viable.

| Candidate | What it adds | Risk profile |
|---|---|---|
| **Thompson sampling over discrete variants** | First real autonomous tuner. Picks among project-config variants based on accumulated outcomes; proposes lock-in CRs at high-confidence. | Low — sampling is well-understood; CR review keeps humans in loop |
| **External-model intelligence monitor** | Recurring research run over benchmark sources, model releases, pricing, and reproducible user reports. Proposes local canaries/benchmark groups for promising candidates. | Low-medium — external data is noisy; local evidence remains authoritative |
| **OPRO-style prompt optimizer for project-layer prompts** | Iterates project's own prompts (in `.aloop/prompts/`) against measured outcomes. Proposes new drafts via CR. | Medium — prompt drift is real; canary + CR mitigate |
| **Statsig methodology layer** | Sample sizing, peeking corrections, sequential testing baked into the optimizer's reasoning prompts. | Low — methodology, not infrastructure |

## v2+ candidates (after months of production)

When the project has years (not weeks) of accumulated data and there's a clear case for added complexity:

- **Bayesian optimization** for continuous knob tuning within `daemon.yml` bounds. Level 2. Adds dependency.
- **Constitutional red-team workflow.** Periodic adversarial Story injection that tries to find policy gaps; findings file CRs against CONSTITUTION. Level 3.
- **DSPy or TextGrad** for prompt optimization if OPRO has plateaued. Library dependencies.
- **Causal inference layer** for proper confounder handling. Heavy; only when statisticians demand it.
- **Reward modeling** from accumulated human review data. Requires data hygiene investment.

## Explicit non-goals

The methodologies below are deliberately out of scope. Listing them so they don't drift back in via cargo-cult:

- **Population-based training.** Aloop's throughput is too low for PBT to pay off vs. simpler bandit selection.
- **MLflow / W&B / experiment-tracking platforms.** SQLite + JSONL covers the same need. The discipline is what matters.
- **Reinforcement learning frameworks.** No clear scalar reward to optimize end-to-end; cheaper methods cover the addressable problems.
- **Evolutionary search over prompts (Promptbreeder, etc.).** High variance and high cost; OPRO covers the same use case more efficiently.
- **Self-rewriting harness code.** Level 4. Always prohibited.

## Cheat resistance per methodology

Every methodology that crosses Level 2 or 3 must satisfy three criteria:

1. **Daemon-computed metrics only.** The metric the optimizer reads is computed by the daemon's projector from events, not by the optimizer itself or any agent it dispatches. (See `metrics.md` section Emission discipline.)
2. **Human-gated decision boundary.** The optimizer's output is a proposal — a CR, a tuning request, a draft prompt — never an applied change. The daemon enforces that the optimizer cannot merge its own CR or apply its own tuning beyond bounds.
3. **DGM test entry.** Every new optimizer capability has an entry in `_dgm-tests.md`: capability, what it can touch, cheat case, prevention, detection metric. (See `self-improvement.md` section The DGM test.)

If any of the three is missing, the capability does not ship. No exceptions.

## Invariants

1. **Tagging is non-negotiable.** Every Story carries `config_variant_id`. Without it, no learning. v1-required.
2. **Experiments are real Stories, not synthetic.** No "test fixtures" running through the system to evaluate configs. The system learns from production work or it doesn't learn.
3. **The optimizer never bypasses the CR workflow.** Lock-in changes go through tracker review like any other spec amendment.
4. **Methodology is documented before automation.** A bandit, BO, or OPRO loop in code requires a corresponding section in this doc explaining the math, the assumptions, and the cheat-prevention.
5. **v1 ships the data substrate; v1.5+ ships the analysis layer.** Don't reverse this order. An optimizer without data is a hallucinator.
6. **Statistical significance is a gate, not a suggestion.** Optimizer proposals carry the evidence (effect size, sample size, confidence interval); the CR is rejectable on insufficient evidence alone.
7. **Budgeted benchmark mode reuses Story/workflow primitives.** No benchmark-only runner or sidecar subsystem is introduced before the existing evidence substrate is working.
8. **Benchmark duplicates do not bypass trunk-safety rules.** Under the current shared-trunk model, same-task candidates remain serial unless a future isolated-sandbox primitive is explicitly added.
9. **External model research is a prior, not an authority.** Public benchmarks and user reports may trigger local evaluation, but project routing changes require local evidence or human override.
