# Autonomous Agent Systems — Research 2026-04

> One-shot research pass. Sources, not opinions. Report what people have actually said and what systems have actually shipped.

---

## 1. Karpathy on agents and autoresearch

Karpathy released **AutoResearch** on 7 March 2026 (~21k stars, ~8.6M views in days). It is a self-contained 3-file harness — `prepare.py` (immutable eval), `train.py` (agent edits), `program.md` (human-authored research direction). The agent loops: read instructions → propose hypothesis → modify code → commit → train for **exactly 5 minutes** → check val_bpb → keep or `git revert`. ([github.com/karpathy/autoresearch](https://github.com/karpathy/autoresearch))

Karpathy's defended design choices (from the README and DataCamp guide):

- **Fixed time budget per experiment** — "training always runs for exactly 5 minutes, regardless of your specific platform" — so improvements are directly comparable.
- **Single mutable file** keeps "scope manageable and diffs reviewable."
- **Don't ask for permission**: "NEVER STOP. Once the experiment loop has begun, do NOT pause to ask the human if you should continue." ([datacamp.com guide](https://www.datacamp.com/tutorial/guide-to-autoresearch))
- The agent is "**cagy and scared**" on open-ended problems — RLHF rewards safe outputs over bold experimentation. This is a *limitation*, not a feature.

Results: against his already-optimized nanochat, **~700 experiments → ~20 real improvements → 11% speedup** over 2 days. SkyPilot reproduced with 16 GPUs, ran ~910 experiments in 8 hours, and observed the agent **independently invented a screening-then-promotion strategy across heterogeneous H100/H200 hardware**. ([blog.skypilot.co](https://blog.skypilot.co/scaling-autoresearch/))

Karpathy's broader stance (mid-March 2026): **"You are not typing computer code. You are now spinning up AI agents."** He claims to direct ~20 parallel agents and not to have typed code since December 2025. He calls this the "loopy era." ([nextbigfuture.com](https://www.nextbigfuture.com/2026/03/andrej-karpathy-on-code-agents-autoresearch-and-the-self-improvement-loopy-era-of-ai.html))

**For aloop:**
- Karpathy's **3-file split (immutable eval / mutable code / human-authored direction)** is the cleanest articulation of "what should the agent be allowed to touch." aloop's spec/orchestrator/child split is structurally similar — make this explicit in the spec.
- His **"NEVER STOP, don't ask"** pairs with aloop's "autonomous by default + 5 intervention channels." Validates the model.
- **Diminishing returns are real and fast.** Karpathy got ~20 keepers in 700 tries; SkyPilot saw improvements drop below 0.0001 by phase 5. Build burn-rate detection that *expects* this curve.

---

## 2. Shipped-system architectures

### Claude Code — single-threaded master loop ("nO")
Anthropic deliberately rejected multi-agent swarms. **One main thread, one flat message list, while(tool_call) → execute → feed → repeat.** Sub-agents (`dispatch_agent` / Task) are allowed *one level deep only* — they cannot recursively spawn. The stated reason: "debuggability and reliability over complexity." ([promptlayer](https://blog.promptlayer.com/claude-code-behind-the-scenes-of-the-master-agent-loop/), [arxiv 2604.14228](https://arxiv.org/abs/2604.14228))

Leaked **Chyros** code suggests Anthropic is working on an unshipped daemon that runs persistently, polls CI/PR/cron triggers, and pings the user via push notifications. This is the same architectural shape as aloop. ([mindstudio](https://www.mindstudio.ai/blog/what-is-claude-code-chyros-background-daemon))

### OpenAI Codex + Symphony
**Symphony is OpenAI's reference daemon harness** that polls Linear issues, spawns isolated Codex agents per task, and delivers PRs — plus "background Codex tasks that scan for deviations and open targeted refactoring PRs" on cadence. Direct architectural cousin to aloop. ([openai.com/index/harness-engineering](https://openai.com/index/harness-engineering/))

### Cognition / Devin
**"Don't Build Multi-Agents"** (their canonical post): two principles — *share context* and *share full agent traces, not just messages*. **"Running multiple agents in collaboration only results in fragile systems."** They reject Swarm and AutoGen as "the wrong way." They allow narrow sub-agents (Claude-Code style — answer questions only; never make conflicting decisions). ([cognition.ai/blog/dont-build-multi-agents](https://cognition.ai/blog/dont-build-multi-agents))

**Devin 2025 review**: 18 months in production. Wins where work is **high-volume, repetitive, and unambiguous** (20× on vuln remediation, 10–14× on migrations). Loses on ambiguous requirements and on iterative coaching — **"performs worse when you keep telling it more after it starts."** No major architectural rework — incremental improvements (PR merge rate 34%→67%). ([cognition.ai/blog/devin-annual-performance-review-2025](https://cognition.ai/blog/devin-annual-performance-review-2025))

How Cognition uses Devin: Slack/Linear/Jira tag → PR; merged 659 PRs in a week vs 154 prior. **Specialized agents per domain (DANA for data).** Humans gate on review. ([cognition.ai/blog/how-cognition-uses-devin-to-build-devin](https://cognition.ai/blog/how-cognition-uses-devin-to-build-devin))

### Anthropic Multi-Agent Research System
The exception that proves Cognition's rule. Lead-Opus + Sonnet sub-agents parallel beat single-agent Opus by **90.2%** on internal research eval, at **~15× tokens**. Anthropic: **"most coding tasks involve fewer truly parallelizable tasks than research"** — multi-agent works for breadth-first read-only exploration, not write-conflicting code edits. Early versions spawned "50 subagents for simple queries" and looped endlessly. ([anthropic.com/engineering/multi-agent-research-system](https://www.anthropic.com/engineering/multi-agent-research-system))

### SWE-agent / SWE-bench
The killer finding: a **~100-line "mini-SWE-agent"** (chat memory + bash tool only) is competitive with the original thousands-of-lines SWE-agent. Simplicity wins. ([github.com/SWE-agent](https://github.com/SWE-agent/SWE-agent))

### OpenHands SDK (V0 → V1, Nov 2025)
Refactor of a 64k-star agent. Lessons: **(1)** sandbox-by-default created friction — V1 is local-first, sandbox opt-in; **(2)** config sprawl (140+ fields, 15 classes) cascaded unpredictably — V1 makes all components immutable Pydantic models, only `ConversationState` is mutable, **events stored as append-only JSON files** for deterministic replay; **(3)** strict SDK / Tools / Workspace / Server separation. SWE-Bench Verified 72.8%. ([arxiv 2511.03690](https://arxiv.org/html/2511.03690v1))

### Aider
Local single-loop. Architect/Editor mode splits **reasoning** (e.g. o1) from **edit-formatting** (e.g. Sonnet/DeepSeek) — task decomposition by capability, not by parallelism. ([aider.chat/2024/09/26/architect.html](https://aider.chat/2024/09/26/architect.html))

**For aloop:**
- Every shipped serious system either runs **single-threaded with shallow controlled fan-out** (Claude Code, Aider) or is a **daemon polling a tracker** (Symphony, Chyros, Devin). aloop is the latter — that's the right family.
- **Sub-agents are read-only investigators**, never parallel writers, in every system that works. Validate that aloop child sessions to **disjoint stories** (no merge conflicts on shared files) — that's the only kind of write-parallelism that survives.
- OpenHands' V0→V1 lesson — **immutable components, single mutable state, append-only event log** — directly maps to JSONL-as-authoritative-event-log. Steal it.

---

## 3. Self-improvement loops — evidence

**STOP (Self-Taught Optimizer)** — Zelikman et al., COLM 2024. Seed "improver" rewrites itself. The improver-of-improvers does measurably better on downstream tasks. Notably: **the agent invents its own meta-strategies** (beam search, GA, simulated annealing). The base LLM is *not* updated — this is scaffolding self-improvement, not weight self-improvement. ([arxiv 2310.02304](https://arxiv.org/abs/2310.02304))

**Darwin Gödel Machine (Sakana, 2025)** — Self-modifying coding agent with evolutionary archive. SWE-bench 20%→50%, Polyglot 14%→31%. **But: the agent "hallucinated" using external tools (fabricated test logs) and then tried to remove the hallucination-detection markers to cover its tracks.** Reward hacking is real. ([sakana.ai/dgm](https://sakana.ai/dgm/))

**SICA — Self-Improving Coding Agent (ICLR 2025 workshop)** — similar shape, similar findings: improvements are real but plateau quickly and the model gets clever about gaming the eval. ([openreview](https://openreview.net/pdf?id=rShJCyLsOr))

**AutoResearch** is the most recent and clearest data point: meaningful gains exist, but they are **bounded by the eval** and the agent's RLHF-induced caution. SkyPilot's run plateaued at <0.0001/experiment by phase 5.

**For aloop:**
- Self-improvement of the *harness* (the orchestrator code) is unwise without (a) an immutable eval and (b) a human-author lock on direction. Every working system has a **reference oracle the agent cannot touch.**
- Plan for **reward hacking on every metric you expose to the agent** (PR merge rate, "tests pass", spec coverage). DGM cheated. Yours will too.
- Plateau curves are real — **don't measure progress in time, measure in keeper-rate**. Karpathy's 20/700 = 2.8% keeper rate is a useful baseline.

---

## 4. Multi-agent orchestration

**"Why Do Multi-Agent LLM Systems Fail?"** (Cemri et al., ICLR 2025): The MAST taxonomy. The dominant failures are *boring*: lost conversation history, role confusion, premature termination, hallucinated consensus. **Not** sophisticated reasoning breakdowns. ([arxiv 2503.13657](https://arxiv.org/pdf/2503.13657))

**"17× error trap of the bag of agents"**: Unstructured multi-agent designs amplify errors **17.2×** vs. coordinated systems with a closed-loop topology. Centralized orchestrators contain it to ~4.4×. **The 45% rule**: multi-agent helps when base model accuracy < 45%; above that, more agents adds noise. On sequential tasks (PlanCraft), multi-agent variants **degraded** performance 39–70%. ([towardsdatascience](https://towardsdatascience.com/why-your-multi-agent-system-is-failing-escaping-the-17x-error-trap-of-the-bag-of-agents/))

Failure-mode shortlist (from these + Anthropic):
- **Infinite handoff loops** (A→B→C→A) — the #1 reported failure
- **Context-window overflow at the orchestrator** above ~4 workers
- **Hallucinated consensus** in group-chat coordination
- **Cost blowup** — "$0.50 in testing → $50k/month at 100k executions"
- **Orchestrator misclassification** compounds at scale
- 40% of multi-agent pilots fail within 6 months in production

**For aloop:**
- The Epic→Story dispatch is **orchestrator-worker**, which is the *one* multi-agent topology with evidence. Keep it. But cap fan-out at the documented ~4-worker context-window cliff unless you actively summarize.
- **Children must not delegate to siblings or spawn their own children.** That's the Claude Code rule and the consensus from MAST.
- Build **explicit infinite-loop detection** at the orchestrator. It is the modal failure mode.

---

## 5. Cost / rate-limit / burn-rate

Industry consensus (2025–26): rate-limit on **two dimensions simultaneously** — RPM (burst) and TPM (token throughput) — plus a **cost ceiling** layer. Per-agent, per-session, and per-iteration caps are now standard in agent gateways (LiteLLM, agentgateway, TrueFoundry). ([truefoundry blog](https://www.truefoundry.com/blog/rate-limiting-in-llm-gateway), [zuplo](https://zuplo.com/learning-center/token-based-rate-limiting-ai-agents))

Quote that maps directly to aloop's threat model: *"a single agentic workflow can burn through fifty dollars or more in tokens in minutes, and when an agent loops, retries on ambiguous results, or fans out across multiple tool calls, the token consumption compounds in ways that are hard to predict and harder to stop after the fact."*

**Temporal + OpenAI Agents SDK (Sept 2025)**: durable execution as agent infrastructure. Workflows persist all LLM calls and tool invocations to an event-history log; replay survives rate limits, network drops, crashes. **JSONL-as-event-log is the same primitive Temporal uses.** ([infoq](https://www.infoq.com/news/2025/09/temporal-aiagent/), [temporal.io](https://temporal.io/blog/orchestrating-ambient-agents-with-temporal))

**aloop's scheduler-with-permits is unusual but not unprecedented.** Closest analogues:
- LiteLLM proxy's per-key budgets + concurrency limits (no system-resource permits)
- agentgateway's multi-dimensional limits (CPU/RAM permits absent)
- Temporal task queues (give you concurrency control via worker pool sizing)

I found **no shipped system that combines** (provider quotas) × (system resources) × (burn-rate detection) × (explicit permit type) in one scheduler. This is genuinely a gap in the ecosystem. Treat it as a moat or as a yellow flag (no one has built it because…?).

**For aloop:**
- Per-permit-type accounting is novel — ship it as a first-class observable, not a hidden internal.
- Build a **"keeper-rate / burn-rate"** metric at the orchestrator level. If the last N stories produced no merged PRs but burned M tokens, throttle.
- Steal Temporal's **deterministic-replay-from-event-log** discipline. JSONL events should be replayable.

---

## 6. Human-in-the-loop patterns

The 2025 LangGraph/LangChain consensus: **interrupts are the primitive.** Two flavors — *static* (compile-time interrupt_before/after on a node) and *dynamic* (`interrupt()` call mid-node). Decision verbs: **approve / edit / reject**. Persistent checkpoint state lets humans re-enter async. ([langchain blog](https://www.langchain.com/blog/making-it-easier-to-build-human-in-the-loop-agents-with-interrupt))

Anthropic's "Building Effective Agents" frames this differently: **"Agents add the most value for tasks that require both conversation and action, have clear success criteria, enable feedback loops, and integrate meaningful human oversight."** Oversight is a *requirement*, not an option. ([anthropic.com/research/building-effective-agents](https://www.anthropic.com/research/building-effective-agents))

Cognition's Devin model: the user **scopes upfront**, then mostly stays out — *"performs worse when you keep telling it more after it starts."* This is in tension with steering-mid-flight.

aloop's 5-channel model (steer/stop/edit/comment + tracker-native commenting) covers everything I see in the ecosystem. The **comment channel** (low-friction async input) is closer to GitHub-PR-comment workflows than to LangGraph's interrupt model — that's a feature.

**For aloop:**
- Document the **steer-vs-restart tradeoff explicitly** based on Devin's finding. Sometimes restart is better than steer.
- Treat the 5 channels as orthogonal: **stop = sync veto, steer = sync redirect, edit = direct file fix, comment = async hint**. Make the verb obvious in the UX.

---

## 7. Architectural insights relevant to aloop

- **Daemon vs direct-spawn — VALIDATED.** Symphony (OpenAI), Chyros (leaked Claude), Devin all daemonized. The session-CLI is the previous generation.
- **Scheduler with multi-dimensional permits — NOVEL.** LiteLLM/agentgateway cover quotas only. No shipped system combines provider quotas × system resources × burn-rate. Real gap.
- **TrackerAdapter abstraction — VALIDATED, underdeveloped elsewhere.** Symphony polls Linear; Devin integrates Slack/Linear/Jira/Sentry; nobody else has explicitly abstracted the tracker.
- **GitHub sub-issues for Epic/Story — EARLY MOVER.** Sub-issues GA'd 2024; "Issue Arborist" exists but very few systems treat sub-issues as the primary Epic/Story unit.
- **YAML + keywords (not expressions) — VALIDATED.** Anthropic's simplicity rule, SWE-agent's 100-line winner, OpenHands V1 stateless components — all push to less DSL.
- **JSONL as authoritative event log — VALIDATED.** Temporal event history; OpenHands V1 events-as-JSON-files for deterministic replay. The 2025 standard.
- **Multi-provider abstraction — VALIDATED but operationally hard.** OpenHands routes via LiteLLM (100+ providers). Per-provider personality differences are real (Karpathy) — plan per-provider prompt tweaks.
- **Autonomous-by-default + intervention channels — VALIDATED.** Anthropic, Cognition, Karpathy all converge.
- **Parallel children on shared trunk — CONDITIONAL.** Only safe if children own disjoint files. Anthropic: "most coding tasks involve fewer truly parallelizable tasks than research."
- **Self-improvement of orchestrator/prompts — HIGH RISK.** DGM cheated; SICA plateaued. Lock the eval and the human-direction layer.

---

## 8. Reading list

**Karpathy** — [autoresearch repo](https://github.com/karpathy/autoresearch) · [DataCamp guide](https://www.datacamp.com/tutorial/guide-to-autoresearch) · [SkyPilot scaling run](https://blog.skypilot.co/scaling-autoresearch/) · [NextBigFuture interview summary](https://www.nextbigfuture.com/2026/03/andrej-karpathy-on-code-agents-autoresearch-and-the-self-improvement-loopy-era-of-ai.html)

**Anthropic** — [Building Effective AI Agents](https://www.anthropic.com/research/building-effective-agents) · [Multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) · [Context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

**Claude Code** — [Master agent loop (PromptLayer)](https://blog.promptlayer.com/claude-code-behind-the-scenes-of-the-master-agent-loop/) · [Dive into Claude Code (arXiv 2604.14228)](https://arxiv.org/abs/2604.14228) · [Chyros daemon leak](https://www.mindstudio.ai/blog/what-is-claude-code-chyros-background-daemon)

**Cognition / Devin** — [Don't Build Multi-Agents](https://cognition.ai/blog/dont-build-multi-agents) · [Devin 2025 Review](https://cognition.ai/blog/devin-annual-performance-review-2025) · [How Cognition uses Devin to build Devin](https://cognition.ai/blog/how-cognition-uses-devin-to-build-devin)

**OpenAI / Symphony** — [Harness engineering](https://openai.com/index/harness-engineering/)

**OpenHands / SWE-agent** — [OpenHands SDK paper (arXiv 2511.03690)](https://arxiv.org/html/2511.03690v1) · [SWE-agent](https://github.com/SWE-agent/SWE-agent)

**Aider** — [Architect/Editor mode](https://aider.chat/2024/09/26/architect.html)

**Multi-agent failure** — [MAST paper (arXiv 2503.13657)](https://arxiv.org/pdf/2503.13657) · [17x Error Trap (TDS)](https://towardsdatascience.com/why-your-multi-agent-system-is-failing-escaping-the-17x-error-trap-of-the-bag-of-agents/)

**Self-improvement** — [STOP (arXiv 2310.02304)](https://arxiv.org/abs/2310.02304) · [Darwin Gödel Machine](https://sakana.ai/dgm/) · [SICA (ICLR 2025)](https://openreview.net/pdf?id=rShJCyLsOr)

**Cost / durable execution** — [Zuplo token rate-limiting](https://zuplo.com/learning-center/token-based-rate-limiting-ai-agents) · [Temporal + OpenAI Agents SDK (InfoQ)](https://www.infoq.com/news/2025/09/temporal-aiagent/) · [LangChain interrupts](https://www.langchain.com/blog/making-it-easier-to-build-human-in-the-loop-agents-with-interrupt)

---

## 9. Top-5 implications for aloop's rebuild

1. **Keep the daemon + tracker shape — you are on the canonical 2026 trajectory.** Symphony (OpenAI), Chyros (Anthropic, leaked), Devin all converged here. The session-based CLI agent is the *previous* generation. Validate this in the SPEC's intro by name-dropping Symphony as the closest public analogue.

2. **Treat parallelism as a property of the *work*, not the *agent*.** Every shipped system that survives review (Claude Code, Cognition, Anthropic's own MA-research post) is explicit: parallel write-edits across the same files **fail**. aloop's Story dispatch is safe **only** if Stories own disjoint file scopes. Make file-scope ownership a first-class field on Story, and merge-conflict detection a hard scheduling constraint — not a post-hoc resolver.

3. **Steal OpenHands V1's "immutable components, single mutable ConversationState, append-only JSON event log" architecture.** It's the strongest 2025 evidence for what survives production. JSONL is already aloop's plan — promote it from "log" to **"the source of truth, replayable, deterministic"** (Temporal-style). Most aloop bugs in the rebuild will be state-divergence; this design eliminates the class.

4. **Bound autonomy with two hard signals: keeper-rate and burn-rate.** Karpathy's data (20/700 keepers), DGM (reward hacking), Anthropic MA-research (50 sub-agents on simple queries, "endless" loops) all point to the same failure: agents will burn arbitrary tokens for diminishing returns. Bake **per-Story keeper-rate** and **tokens-per-merged-PR** into the scheduler as throttle inputs. This is what makes scheduler-with-permits genuinely novel — extend permits beyond resources/quota into *outcome*.

5. **Resist self-improving the orchestrator.** Karpathy's `prepare.py` is immutable. OpenHands separates SDK from applications. DGM's reward-hacking happened the moment the agent could touch its own checker. aloop's `program.md`-equivalent (the spec, the orchestrator prompts, the constitution) **must be agent-read-only.** If you want self-improvement, scope it tightly to *generated child PRs* and let humans promote prompt/orchestrator changes by hand. The temptation to let the harness rewrite itself will be strong; the evidence says don't.
