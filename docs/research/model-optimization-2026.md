# Model Optimization - 2026 Research Note

> Focused research pass for automatic model optimization. Checked 2026-05-01. Scope: how aloop should blend external model intelligence with its own historical Story outcomes.

---

## Summary

Automatic model optimization should be a routing and proposal layer, not a leaderboard follower.

External benchmarks are useful because model quality, price, latency, context windows, and deployment options now change monthly and sometimes weekly. They should seed candidate variants, update priors, and trigger small canaries or benchmark groups. They should not directly rewrite the runtime provider chain. Aloop's own daemon-computed Story outcomes remain the authority for project routing decisions.

The right shape is:

1. **Local production evidence** - merge rate, review pass rate, cost per merged PR, fallthrough success, retries, and human review outcomes grouped by provider/model/config variant.
2. **External benchmark intelligence** - Artificial Analysis, official model cards, SWE-bench/Terminal-Bench/LiveCodeBench-style public results, pricing, context, latency, open-weight availability, hosting routes, and capability metadata.
3. **Operator/user reports** - YouTube head-to-heads, Reddit threads, blogs, public coding-contest repos, and self-hosting reports, treated as low-confidence qualitative signals unless they publish prompts, code, logs, judging criteria, and hardware/provider route.

This maps cleanly to existing aloop research primitives: `source_synthesis` for setup-time or ad hoc model scans, daemon triggers for time/event scheduling, `monitor_tick` for recurring model-landscape updates, and budgeted benchmark mode for local validation.

## Current External Signals

Artificial Analysis is a useful source because it tracks intelligence, price, speed, latency, context window, and provider endpoints in one place. Its methodology page says it benchmarks quality, performance, and price, and that performance is measured as customer-experienced end-to-end behavior rather than maximum hardware capability.

The important signal is not only which model tops a frontier leaderboard. The useful signal is the **Pareto frontier** for each task family: quality versus price, latency, context, reliability, privacy/deployment constraints, and adapter/toolchain behavior.

As of late April 2026, the model landscape illustrates why a portfolio is needed:

- Frontier closed models may win on hard reasoning, planning, review, or broad agentic benchmarks, but are often not the best value for routine extraction, simple edits, or high-volume test generation.
- Mid-tier or smaller proprietary models can be the right default for cheap fast tasks when their local approval/merge rate stays close to frontier models.
- Open-weight and open-available routes such as Kimi, DeepSeek, Qwen, GLM, Llama, Mistral, and similar families can be excellent candidates when price, throughput, self-hosting, privacy, or provider diversity matters.
- Open-weight evaluation must include the route, not just the base model: hosted API, OpenRouter route, local GPU, quantization, context length, tool support, and hardware can materially change quality, latency, and cost.

User reports add a separate signal. A December 2025 Ars/Tom's Hardware Minesweeper coding-agent comparison found Codex strongest on that specific web-game task, Claude second, Mistral lower, and Gemini CLI failing to produce a playable result. A May 2026 Reddit-linked coding contest report claimed Kimi K2.6 beat GPT-5.5, Claude, Gemini, and Grok on one real-time game challenge and linked the generated-code repo. These are not statistically reliable, but they are valuable hypothesis generators because they reveal workload-specific behavior that generic benchmarks miss, especially for open-weight or cheaper routes that may not dominate general leaderboards.

An arXiv March 2026 empirical study of Claude Code, Codex, and Gemini CLI bug reports is also relevant: it found many observed failures in coding tools are integration, configuration, command-execution, and tool-invocation failures. That argues for measuring the whole provider/toolchain path, not just the base model.

## Implications For Aloop

### 1. Separate model intelligence from routing authority

External research may produce a `ModelCandidateRecord`, but the scheduler must not consume external scores directly. The optimizer may propose:

- add a model to a candidate provider chain
- run a canary percentage
- create a budgeted benchmark group
- file a CR changing project provider defaults
- upgrade a pinned model to a newer compatible version inside an already-used provider/model family
- add a cheap/open-weight route for a narrow task family where expected value is better than frontier defaults
- denylist a model only when combined with local failures or explicit operator policy

It may not silently reorder the canonical chain.

### 2. Optimize a portfolio, not a champion

The target state is a model portfolio:

| Slot | Typical requirement | Candidate class |
|---|---|---|
| hard planning / architecture | high reasoning quality, long-context robustness | frontier closed or strongest open-weight route |
| implementation builder | reliable tool use, high approval rate, acceptable cost | frontier or high-value coding-specialized model |
| frontend design | visual/design judgment, screenshots, CSS/UI fluency | task-proven model, not necessarily global leader |
| test generation / extraction | throughput, low cost, adequate correctness | cheap proprietary or open-weight route |
| review / critique | strictness, reasoning, low false approval rate | strongest local performer for review gates |
| source synthesis | context, citation discipline, browsing/source handling | research-strong model/route |

The optimizer should prefer the cheapest route that clears the quality bar for that slot. Expensive frontier models are reserved for phases where they measurably improve merge rate, review quality, rework latency, or human override rate.

### 3. Track resolved model, not just provider

Provider-level metrics are not enough. `opencode/openrouter/kimi@2.6`, `opencode/local/qwen-coder@...`, `codex/gpt-5.5-high`, and `claude/opus@4.7` need separate evidence because cost, quality, speed, hosting route, and failure modes can diverge inside one provider family.

Each session/turn should retain:

- requested provider reference
- resolved provider id
- resolved model id
- reasoning/effort setting when applicable
- endpoint/provider route when distinct from model creator
- model availability class: closed hosted, open-weight hosted, open-weight local/self-hosted
- hardware/quantization/context route when local or open-weight
- context window and pricing snapshot if known at dispatch time

### 4. Use external evidence as a prior

External evidence should bias exploration, not decide exploitation. A model with strong external scores and no local data can earn a small canary or a benchmark slot. A model with strong local outcomes can remain preferred even if a generic leaderboard ranks it lower.

Recommended source weights:

| Source class | Role | Weight |
|---|---|---|
| Local daemon metrics | Routing authority | Highest |
| Local budgeted benchmark groups | Strong local evidence for a task family | High |
| Official/public benchmark suites | Candidate prior for quality/value/context | Medium |
| Price, hosting, and open-weight availability | Candidate prior for economics/privacy/throughput | Medium |
| Reproducible user reports with code/logs | Candidate prior and failure-mode discovery | Low-medium |
| Anecdotal posts/videos without artifacts | Watchlist signal only | Low |

### 5. Preserve task-family specificity

There is no single "best model." Routing should group evidence by task family and workflow phase:

- planning / architecture
- builder implementation
- frontend visual work
- tests and QA
- review / critique
- research/source synthesis
- long-context repository analysis
- fast classification/extraction

The optimizer should propose variants like "use a research-strong model for long-context source synthesis, a high-value coding model for implementation, and a cheap open-weight route for extraction/test scaffolding" rather than global replacement.

### 6. Run model intelligence continuously

Setup is the first useful time to choose models, but it should not be the last. Active projects should have a recurring model-intelligence monitor, biweekly by default, that compares the current provider/model map against new releases, benchmark movement, pricing changes, context/capability changes, provider availability, and reproducible user reports. The same monitor can also fire early from event triggers: model-catalog changes, benchmark-source deltas, provider pricing updates, local cost/performance regressions, or provider health drift.

Each tick should classify findings:

- **Patch/version upgrade** - same provider/model family, newer compatible version, no known capability loss. Example: a project pinned to `claude/opus@4.7` receives a proposal to canary or CR-upgrade to `@4.8`.
- **Capability-specific swap** - better value for one task family, such as frontend design, long-context research, review, extraction, or test generation.
- **Cost-down substitution** - cheaper proprietary or open-weight route matches local quality within an acceptable margin for a narrow task family.
- **New route exploration** - a new provider or model route whose benchmarks justify local testing but not default use.
- **No material change** - record the snapshot and do nothing.

Patch/version upgrades can be lighter-weight than new route exploration, but still need an auditable old/new model, price delta, capability delta, benchmark delta, route/deployment delta, and rollback condition.

### 7. Reuse research concepts already in the spec

The model watch process is an incubation monitor:

```ts
type ModelIntelligenceRun = ResearchRun & {
  mode: "source_synthesis" | "monitor_tick";
  question: "What provider/model changes should aloop evaluate for this workspace?";
  source_plan: ResearchSourcePlan;
};
```

The output is a synthesis artifact plus candidate records. Promotion targets are ordinary spec/config CRs, benchmark groups, or canary variants. No new "model scout daemon" is needed before the research/run substrate exists.

## Sources

- Artificial Analysis LLM Leaderboard: https://artificialanalysis.ai/leaderboards/models
- Artificial Analysis Benchmarking Methodology: https://artificialanalysis.ai/methodology
- Artificial Analysis: Opus 4.7 - Everything you need to know: https://artificialanalysis.ai/articles/opus-4-7-everything-you-need-to-know/
- Artificial Analysis GPT-5.5 model page: https://artificialanalysis.ai/models/gpt-5-5
- arXiv: Engineering Pitfalls in AI Coding Tools: https://arxiv.org/abs/2603.20847
- Tom's Hardware summary of Ars Technica Minesweeper coding-agent test: https://www.tomshardware.com/tech-industry/artificial-intelligence/turns-out-ai-can-actually-build-competent-minesweeper-clones-four-ai-coding-agents-put-to-the-test-reveal-openais-codex-as-the-best-while-googles-gemini-cli-as-the-worst
- Reddit user coding-contest report for Kimi K2.6: https://www.reddit.com/r/kimi/comments/1t0fsur/kimi_k26_just_beat_claude_gpt55_and_gemini_in_a/
