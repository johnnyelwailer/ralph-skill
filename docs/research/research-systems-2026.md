# Research Systems - 2026 Survey

> Focused research pass for aloop incubation. Scope: existing agentic research products and experimental research harnesses, especially Karpathy's AutoResearch. Checked 2026-05-01. Sources are primary/official where possible.

---

## Summary

The market has split into two useful patterns:

1. **Source-grounded research assistants** - OpenAI Deep Research, Gemini Deep Research, Claude Research, NotebookLM, Elicit. These gather sources, reason over them, and produce cited reports.
2. **Fixed-oracle experiment loops** - Karpathy AutoResearch and SkyPilot's scaling variant. These repeatedly modify a bounded mutable surface, run a fixed-budget experiment, keep winners, and revert losers.

Aloop's incubation layer needs both patterns, but under different contracts:

- `source_synthesis` for cited reports and market scans
- `monitor_tick` for repeated source synthesis over time
- `outreach_analysis` for survey/interview response analysis
- `experiment_loop` for AutoResearch-style active experimentation with an immutable oracle

The key design requirement is to model **research protocol** explicitly: source policy, mutable surface, oracle/eval, budget, cadence, and promotion path. "Research" is not one thing.

## Existing Systems

### Karpathy AutoResearch

AutoResearch is the cleanest small example of autonomous experimentation. The repo is deliberately small: `prepare.py` is fixed/evaluation/data prep, `train.py` is the single mutable file, and `program.md` is human-authored direction for the agent. Training runs on a fixed 5-minute wall-clock budget and optimizes `val_bpb` (validation bits per byte). The README explicitly calls out single-file mutation, fixed time budget, and self-contained dependencies as design choices.

Source: [karpathy/autoresearch README](https://github.com/karpathy/autoresearch/blob/master/README.md)

Important pattern:

```text
human direction      program.md        mutable by human
immutable oracle     prepare.py        not modified by agent
mutable surface      train.py          modified by agent
fixed eval           5-minute run      comparable experiments
metric               val_bpb           lower is better
decision             keep/revert       based on oracle result
```

This is not "web research." It is a **closed experimental loop**. It works because the eval is cheap, deterministic enough, hard to fake, and outside the agent's mutable surface.

### SkyPilot Scaling AutoResearch

SkyPilot extended AutoResearch from one GPU/sequential experiments to a GPU-cluster setting. Their run used 16 GPUs, submitted about 910 experiments over about 8 hours, and shifted strategy from greedy hill-climbing to parallel factorial grids. The agent also discovered heterogeneous hardware effects and developed a screen-on-H100 / validate-on-H200 pattern.

Source: [SkyPilot: Scaling Karpathy's Autoresearch](https://blog.skypilot.co/scaling-autoresearch/)

Important pattern:

- parallelism helps when experiments are independent and share an immutable eval
- hardware/environment must be recorded as part of the result
- result rankings may not transfer across hardware
- diminishing returns appear quickly and should trigger stop/pivot logic
- infrastructure access changes research strategy, not just throughput

For aloop, this maps to a future `experiment_loop` mode, not to normal Story dispatch. It needs explicit experiment budgets, immutable eval artifacts, environment labels, and stop conditions.

### OpenAI Deep Research

OpenAI Deep Research is a long-running web research agent. It can take 5-30 minutes, search/analyze/synthesize many online sources, attach files/spreadsheets as context, show progress/sources, and produce documented reports. The February 2026 update added app/MCP connections, restricting searches to trusted sites, real-time progress tracking, and interrupt/refine behavior.

Source: [OpenAI: Introducing deep research](https://openai.com/index/introducing-deep-research/)

Important pattern:

- research is asynchronous and may take tens of minutes
- progress and source trail are first-class UX
- trusted-source restriction matters for enterprise use
- user can refine mid-run
- final output is a report, not a mutation

For aloop, this validates `ResearchRun` as a durable object with events, source records, and interruption/refinement.

### Gemini Deep Research

Gemini Deep Research emphasizes a visible research plan, web/Workspace source selection, iterative search/browse/reasoning, and synthesis into multi-page reports. Google describes challenges around multi-step planning, long-running inference, error recovery, and context management; their answer includes an asynchronous task manager and shared state.

Source: [Gemini Deep Research overview](https://gemini.google/overview/deep-research/)

Important pattern:

- plan review before execution improves control
- user-selected source sets reduce accidental overreach
- asynchronous task state is necessary for long-running research
- context grows over hundreds of pages and needs RAG/state management

For aloop, this supports `source_plan`, monitor state, and daemon-owned resumability.

### Claude Research and Anthropic Multi-Agent Research

Claude Research searches the web and connected Workspace context, runs multiple searches that build on each other, and produces citations. Anthropic's engineering writeup for their multi-agent research system says research is well-suited to parallel subagents because it is open-ended and breadth-first. Their internal eval found the multi-agent system beat single-agent Claude Opus 4 by 90.2%, but with high token cost: multi-agent systems used about 15x the tokens of chat interactions. They also warn that most coding tasks are less parallelizable than research.

Sources: [Claude Research announcement](https://claude.com/blog/research), [Anthropic multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)

Important pattern:

- read-heavy research benefits from parallel subagents
- coding/write-heavy work usually does not
- token budget is the main performance lever and the main cost risk
- subagents should compress findings for a lead researcher

For aloop, incubation research may use parallel source lanes. Implementation sessions still require file-scope isolation.

### NotebookLM

NotebookLM is source-first rather than open-ended chat-first. It has explicit source limits, imports sources from web/Drive, supports audio transcription, lets users select source subsets, and can import Deep Research reports plus source lists. It also requires manual re-sync for some Drive sources and discards Deep Research results not imported.

Source: [NotebookLM Help: Add or discover sources](https://support.google.com/notebooklm/answer/16215270)

Important pattern:

- source objects are first-class
- imported source sets are user-curated
- generated transcripts are stored as sources
- not every discovery becomes durable unless imported

For aloop, source records and artifact import decisions should be explicit, not hidden in a transcript.

### Elicit

Elicit is specialized for academic literature. Its source coverage is explicit: Semantic Scholar, OpenAlex, PubMed, and ClinicalTrials.gov, with daily/weekly update notes and known exclusions such as books, dissertations, patents, and non-academic publications.

Source: [Elicit's source for papers](https://support.elicit.com/en/articles/553025)

Important pattern:

- research quality depends on corpus coverage
- coverage limitations should be visible in the product
- domain-specific source connectors can be much better than generic web search

For aloop, `source_plan.allowed_kinds` should eventually map to concrete connectors with declared coverage, freshness, and limitations.

### Deep Research Survey

The 2025 survey frames autonomous research agents as a pipeline with four core stages: planning, question development, web exploration, and report generation.

Source: [Deep Research: A Survey of Autonomous Research Agents](https://arxiv.org/abs/2508.12752)

Important pattern:

- "research" is a pipeline, not a single model call
- question development is a separate phase from initial planning
- exploration and reporting have different failure modes

For aloop, `ResearchRun` should expose phase/progress, not just status.

## Implications For Aloop

### 1. Add `ResearchRun.mode`

The current incubation model should distinguish:

| Mode | Pattern | Output |
|---|---|---|
| `source_synthesis` | Deep Research / Claude / Gemini | cited findings and proposal candidates |
| `monitor_tick` | recurring market/ecosystem tracking | delta digest, alert, or no-change record |
| `outreach_analysis` | survey/interview response analysis | anonymized summary and proposal candidates |
| `experiment_loop` | AutoResearch | experiment ledger, best candidate, rejected attempts |

### 2. Add research protocols

Every non-trivial research run should have a protocol:

- question
- source plan or experiment plan
- budget
- allowed tools/connectors
- stopping condition
- output format
- promotion targets
- human approval requirements

For AutoResearch-like loops:

- immutable oracle/eval artifact
- mutable surface
- fixed budget per attempt
- metric
- keep/revert rule
- environment labels
- plateau detection

### 3. Keep source research and experiment loops separate

Source-grounded research produces **claims with provenance**.

Experiment loops produce **candidates measured by an oracle**.

They can inform each other, but they need separate schemas. Mixing them into one generic `ResearchRun` would hide the most important correctness constraints.

### 4. Make monitors bounded

Existing products mostly do one-shot research. Aloop's differentiator can be long-running monitors, but only if bounded:

- cadence
- max cost per period
- source plan
- alert conditions
- stop condition
- no-change records

### 5. Treat source coverage as product surface

Elicit and NotebookLM show that source coverage/selection is part of the user's trust model. Aloop should show:

- what source kinds were allowed
- what connectors were used
- what was denied or unavailable
- which claims came from which sources
- which sources were imported vs discarded

### 6. Use parallelism selectively

Anthropic's research system validates parallel subagents for breadth-first read-heavy research. SkyPilot validates parallel experiment batches when attempts are independent and oracle-scored. Neither validates parallel unrestricted code edits.

Rule:

- parallelize source lanes and independent experiments
- serialize or file-scope-isolate write work

### 7. Preserve human-owned direction

AutoResearch's `program.md` is human-authored direction. In aloop, the equivalent is the incubation item/protocol/proposal. Agents can recommend revisions, but changing the research direction should be explicit and reviewable.

## Spec Changes Suggested

- `ResearchRun.mode`
- `ResearchProtocol` or protocol fields on runs/monitors
- `ExperimentPlan` for AutoResearch-style loops
- phase/progress fields for research runs
- source connector coverage/limitation records
- monitor plateau/no-change metrics
- UI surfaces for protocol, source coverage, experiment ledger, and best/worst attempts

## Sources

- [karpathy/autoresearch README](https://github.com/karpathy/autoresearch/blob/master/README.md)
- [SkyPilot: Scaling Karpathy's Autoresearch](https://blog.skypilot.co/scaling-autoresearch/)
- [OpenAI: Introducing deep research](https://openai.com/index/introducing-deep-research/)
- [Gemini Deep Research overview](https://gemini.google/overview/deep-research/)
- [Claude Research announcement](https://claude.com/blog/research)
- [Anthropic: How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
- [NotebookLM Help: Add or discover sources](https://support.google.com/notebooklm/answer/16215270)
- [Elicit's source for papers](https://support.elicit.com/en/articles/553025)
- [Deep Research: A Survey of Autonomous Research Agents](https://arxiv.org/abs/2508.12752)
