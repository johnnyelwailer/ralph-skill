# Aloop — Vision

**Aloop is a self-hosted, multi-provider autonomous development harness that turns a specification into merged code without continuous human supervision.**

You write a spec. Aloop decomposes it into trackable Epics and Stories, dispatches parallel agent sessions against them, reviews their work against hard quality gates, merges approved changes into an agent-owned trunk branch, and surfaces everything through a real-time dashboard. You promote that trunk to your mainline when you're satisfied.

## Who it's for

- **Solo builders and small teams** who want a pipeline that can advance a codebase while they do other work.
- **Researchers and operators** experimenting with autonomous development at scale — multiple providers, multiple projects, running 24/7.
- **Teams with strong spec discipline** who want a system that respects the spec and a constitution over individual agent cleverness.
- **Self-hosters** who want local-first tooling with their own keys, their own machine, and their own tracker.

## What it's not

- Not a replacement for your IDE. Not an interactive coding assistant (Claude Code, Cursor, aider already do that well).
- Not a SaaS. v1 runs on your machine; later versions may run as a hosted backend, but your keys and your repo stay yours.
- Not a general-purpose agent framework. Aloop is narrow by design: it automates the development cycle, nothing else.
- Not a replacement for thinking. It still needs a well-written spec, a real CONSTITUTION, and someone reviewing what lands.

## What makes it different

1. **Multi-provider parallel dispatch is the core promise.** Not "add another provider later" — the chain grammar (`provider[/track][@version]`), the per-turn fallthrough, the scheduler's quota-aware gating, and the cross-session load balancing are baked into the spec. One session can run Claude while the next runs OpenCode while a third runs Codex, all under one budget and one permit authority.
2. **A scheduler that's actually in charge.** Every turn — standalone, orchestrator, child — acquires a permit before it runs. Concurrency caps are enforced, not hoped for. Burn-rate safety stops sessions that spend tokens without producing commits. Provider quotas are queried (where providers expose them) and cooldowns are real.
3. **Self-healing through prompts, not daemons.** When something goes wrong, the orchestrator runs a diagnose prompt that decides what to do — pause a session, raise a threshold, file a follow-up, try a different provider. Intelligent over scripted.
4. **Tracker-agnostic from day one.** GitHub is the shipped adapter (with native sub-issues). The built-in file-based tracker needs zero external dependencies. GitLab, Linear, Jira adapters are future slots — no rewrite required.
5. **Observable and resumable.** Every state change emits a structured event. JSONL per session is the authoritative log. SSE streams to the dashboard. The daemon crashes, restarts, and resumes. Sessions survive upgrades.
6. **One API, many clients.** CLI, dashboard, Telegram bot, future integrations all consume the same v1 HTTP+SSE contract. No privileged paths. What you can do from the dashboard you can do from curl.
7. **A lean core held in check by a constitution.** Core runtime target: under 2,000 LOC. Extensions under 800. Shims under 150. Files under 150. The constitution is what keeps the rebuild from turning into what the rebuild was rebuilding.

## What "aloop is working" looks like

A good day on aloop:

- You open the dashboard. Three child sessions are running in parallel across three different providers, each on its own Story, each in its own worktree. Two just merged. One is in review. The orchestrator session is scanning for what to dispatch next.
- Live cost and burn-rate panels show you're at 40% of today's budget. One provider is in a 20-minute cooldown; the scheduler rerouted work to the others. No alerts.
- You drop a steering instruction into the active Story: "Prefer the patch approach over the rewrite approach for this module." The next turn picks it up.
- When you come back an hour later, five more Stories are merged. The orchestrator filed one follow-up Epic for scope the decomposer underestimated. Nothing is stuck. Nothing is on fire.

A bad day on aloop (and how it handles it):

- An adversarial model update doubles token usage per turn. Burn-rate gate trips. The orchestrator queues a diagnose prompt. It decides to pause dispatch and file a follow-up issue. No cost runaway, no CPU pinning, no 1,462 failure cascade.
- A provider returns a 429 with no reset time. The scheduler backs off exponentially, caps at an hour, keeps work flowing through the other providers in the chain.
- The daemon crashes. Systemd restarts it. On startup, interrupted sessions are flagged; the scheduler reclaims in-flight permits; the dashboard reconnects via SSE `Last-Event-ID`; work resumes.

## What "aloop is done" means

"Done" is the wrong word for a living product, but here's what v1 completion looks like:

- All five providers (OpenCode, Copilot, Codex, Gemini, Claude) as first-class adapters with streaming, quota, and fallthrough.
- Two tracker adapters (GitHub + builtin) with feature parity for the orchestrator's minimum viable flow.
- Multi-project daemon with a stable v1 API.
- Scheduler with permit-based gating, real quota probes, burn-rate safety, live overrides.
- Orchestrator session with Epic → Story decomposition, parallel dispatch, quality gates, merge-to-trunk, intelligent diagnose.
- Rehabilitated React dashboard consuming only the v1 API.
- Setup skill + runtime producing CONSTITUTION.md + validated project in one flow.
- Full TDD coverage of primitives, workflows, and engine.
- Constitution invariants green across all LOC budgets.

Beyond v1: remote/distributed deployment (control plane + worker fleet), additional tracker adapters (GitLab, Linear), additional provider adapters, richer dashboard, Telegram bot, public dashboard with tunnel auth.

## Autonomy and human control

There are **no autonomy tiers**. Aloop is autonomous end-to-end by default: decompose → refine → dispatch → build → review → merge → diagnose, without waiting for approval. The product only makes sense at that level — anything less is Claude Code with extra steps.

Humans always have five intervention channels, available at any time without stopping the loop:

1. **Steer** — push an instruction into a running session's queue.
2. **Stop** — end a session (graceful or force).
3. **Edit Epic / Story** — change scope, re-label, re-order; orchestrator reads on next scan.
4. **Edit Task** — add, remove, reprioritize tasks inside a child session's `aloop-agent todo` store.
5. **Comment on Epic / Story** — first-class input. The orchestrator reads human comments, responds, takes action (reply, edit scope, re-decompose, pause dispatch, inject steering into a child, file a follow-up).

The autonomous loop and the human channels run concurrently. If you walk away, the loop runs. If you come back, the loop doesn't know the difference — your edits and comments land as events, just like everything else.

## Principles that go beyond the code

- **The loop must shrink.** Any growth in the shim is a design failure routed into the daemon instead.
- **The constitution governs.** A rule that doesn't get enforced is a lie. If we can't enforce it, we drop it.
- **Data-driven or not at all.** If a value is used at runtime, it comes from config. Magic numbers in code are bugs waiting to surface.
- **Agents are untrusted.** They express intent; the daemon executes under policy. No exceptions, no dev-mode bypasses.
- **One API.** If the dashboard can do it and the CLI can't, the API is missing an endpoint. Fix the API.
- **Boring where it matters.** Databases, queues, schedulers, worktrees — the boring infrastructure — must be boringly correct. Exotic is for prompts, not primitives.
- **Visible over magic.** Everything a user sees has a matching event in the log. Everything a user changes emits a notification. State that isn't observable shouldn't exist.
- **Ready means ready.** A project isn't ready until the setup readiness gate passes. Sessions don't start against unready projects. No "it'll probably work."

This is the mountain. The docs in `docs/spec/` describe the paths. The CONSTITUTION says which cliffs we don't jump off. Everything else is implementation.
