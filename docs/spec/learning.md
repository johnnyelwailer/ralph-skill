# Learning

> **Reference document.** How aloop accumulates evidence about its own performance over time and turns that evidence into improvements — without crossing into Level-4 self-rewriting. The catalog of methodologies considered, the v1 minimum that makes future learning possible, and the explicit deferrals. Hard rules live in CONSTITUTION.md. Work items live in GitHub issues.
>
> Distinct from `metrics.md` (what we measure) and `self-improvement.md` (the four-level framework). This file is the **methodology layer**: given metrics + self-improvement bounds, *how* does the system learn what to change?

## Table of contents

- The problem
- Why Karpathy AutoResearch doesn't apply (here)
- The right shape: continuous structured experimentation
- Methodology catalog
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

## v1 minimum (must ship)

Foundations without which no future learning is possible. Build these in v1; do not build the optimizer layer.

| Component | Why required | Estimated LOC |
|---|---|---|
| `Story.metadata.config_variant_id` | Every Story tagged with the config variant in use at dispatch time. Without this, no experiment is reconstructible. | ~no LOC, schema field |
| `metric_aggregates` projection grouped by `variant_id` | Outcomes accumulate by variant; foundation for all later analysis. | Already in `metrics.md` |
| Welford online stats + CUSUM drift detection | Daemon detects metric shifts in real time; feeds Level-1 `orch_diagnose`. | ~30 LOC |
| Canary-aware permit allocation | Scheduler can grant `K%` of permits to a flagged variant for safe rollout. | ~40 LOC in scheduler |
| Variant-comparison dashboard panel | Humans can see merge rate / burn rate / gate pass rate per variant. | dashboard work, post-MVP |

These four primitives mean: when v1.5 work begins, the data is already there, the safety mechanisms are already there, and the analysis layer can be added without restructuring.

## v1.5 candidates (after first telemetry)

Once v1 has produced enough Story-outcome data per variant (rule of thumb: 50+ Stories per variant), the autonomous optimizer layer becomes viable.

| Candidate | What it adds | Risk profile |
|---|---|---|
| **Thompson sampling over discrete variants** | First real autonomous tuner. Picks among project-config variants based on accumulated outcomes; proposes lock-in CRs at high-confidence. | Low — sampling is well-understood; CR review keeps humans in loop |
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

1. **Daemon-computed metrics only.** The metric the optimizer reads is computed by the daemon's projector from events, not by the optimizer itself or any agent it dispatches. (See `metrics.md` §Emission discipline.)
2. **Human-gated decision boundary.** The optimizer's output is a proposal — a CR, a tuning request, a draft prompt — never an applied change. The daemon enforces that the optimizer cannot merge its own CR or apply its own tuning beyond bounds.
3. **DGM test entry.** Every new optimizer capability has an entry in `_dgm-tests.md`: capability, what it can touch, cheat case, prevention, detection metric. (See `self-improvement.md` §The DGM test.)

If any of the three is missing, the capability does not ship. No exceptions.

## Invariants

1. **Tagging is non-negotiable.** Every Story carries `config_variant_id`. Without it, no learning. v1-required.
2. **Experiments are real Stories, not synthetic.** No "test fixtures" running through the system to evaluate configs. The system learns from production work or it doesn't learn.
3. **The optimizer never bypasses the CR workflow.** Lock-in changes go through tracker review like any other spec amendment.
4. **Methodology is documented before automation.** A bandit, BO, or OPRO loop in code requires a corresponding section in this doc explaining the math, the assumptions, and the cheat-prevention.
5. **v1 ships the data substrate; v1.5+ ships the analysis layer.** Don't reverse this order. An optimizer without data is a hallucinator.
6. **Statistical significance is a gate, not a suggestion.** Optimizer proposals carry the evidence (effect size, sample size, confidence interval); the CR is rejectable on insufficient evidence alone.
