# Constitution — Non-Negotiable Invariants

These rules are enforced at every stage of the pipeline. Violating any rule means the PR gets rejected. If an issue's scope conflicts with a rule, flag it — do not implement the violation.

The constitution is law. Specs describe the system; this document constrains it.

---

## I. Trust & Boundary

1. **Aloop is autonomous by default.** No attended / supervised / tier-switch modes. The orchestrator decomposes, dispatches, reviews, merges, and self-heals without waiting for human approval. Humans intervene through five always-available channels — steer, stop, edit Epic/Story, edit Task, comment on Epic/Story — none of which pause the loop.
2. **Agents are untrusted.** `aloopd` (the daemon) is the single trust anchor. Agents never call tracker APIs, provider APIs, network endpoints, tracker CLIs (`gh`, `glab`, etc.), or the `aloop` CLI directly. They express intent through `aloop-agent submit` / `aloop-agent todo`; the daemon decides what gets executed and under what policy.
3. **Every action flows through the v1 API.** CLI, dashboard, shims, bots, scripts are all API clients. There are no privileged paths, no side channels, no "drop a file and hope." If the dashboard can do X, every other client can do X, because X is an endpoint.
4. **Policy is hardcoded in the daemon, not in config.** The `aloop gh` / tracker-adapter policy tables live in source. A config file cannot relax them. There is no "dev mode" that bypasses policy.
5. **Agents run in scoped sandboxes.** The daemon sanitizes the provider CLI's environment (`CLAUDECODE`, `PATH`, secrets) before spawning. Agents see only their session's worktree, their `AUTH_HANDLE`, and their declared tools.
6. **Humans always win.** A session is always stoppable, an Epic/Story is always editable, a comment on an Epic/Story is always read. Nothing an agent does — and no configuration choice — can strip these channels.

## II. Architecture

5. **The shims stay tiny. `loop.sh` and `loop.ps1` target <150 LOC each and must shrink, never grow.** They are lock+invoke clients. Any PR that touches a shim must reduce its LOC. New behavior that looks loop-shaped lives in the daemon.
6. **The daemon is single-host in v1, but the seams allow distribution.** State behind `StateStore`, events behind `EventStore`, sandboxed turn execution behind `SandboxAdapter`, worktrees behind `ProjectAdapter`. Every v1 implementation has exactly one impl; every seam survives v2 decomposition.
7. **The core runtime is small. Target <2,000 LOC core, <800 LOC per extension, <150 LOC per file.** Growth is a design smell. Split or move before adding.
8. **One process owns concurrency.** The scheduler is the single authority over what runs when. Every turn — standalone, orchestrator, child — acquires a permit before provider invocation. No bypasses, not even for single-session local runs.
9. **Tracker is an abstraction.** GitHub is one `TrackerAdapter` among many; `builtin` is a first-class offline alternative. Orchestrator prompts are tracker-agnostic (`WorkItem`, `Epic`, `Story`, `ChangeSet`). No `gh`-specific terms leak upstream of the adapter.
10. **Provider is an abstraction.** Five shipped adapters (OpenCode, Copilot, Codex, Gemini, Claude) implement one `ProviderAdapter` interface. The chain grammar (`provider[/track][@version]`) and mandatory per-turn fallthrough are universal; round-robin is an authoring pattern at the workflow level, never a runtime mode.
## III. Data-Driven

11. **100% data-driven pipeline.** No hardcoded paths, prompt names, thresholds, intervals, phase sequences, or agent rosters in code. Pipelines live in `pipeline.yml`; providers in `providers.yml`; daemon settings in `daemon.yml`; project defaults in `aloop/config.yml`. The code reads these; it never encodes them.
12. **Pipeline YAML is composition only, never logic.** Keywords (`onFailure: retry`, `trigger: merge_conflict`) are data. No expressions, no conditionals, no loops in YAML. If a workflow needs logic, it becomes a typed primitive in the daemon.
13. **The compile step is the only YAML reader.** The shim and the daemon's runtime consume compiled `loop-plan.json`. If something needs pipeline knowledge at runtime, it routes through compile.
14. **Silent fallbacks are forbidden.** If a config value is missing and the code has no documented default, startup fails loud. Hidden defaults are bugs.

## IV. Observability & Resilience

15. **JSONL is the authoritative event log.** Per-session `log.jsonl` is the truth. SQLite is a queryable projection. On corruption or schema change, SQLite is rebuildable from JSONL. JSONL is never rebuildable from SQLite.
16. **Every state change emits a structured event.** If it's not observable, it shouldn't have happened. Every observable change is replayable via SSE `Last-Event-ID`.
17. **Sessions are replayable.** A daemon crash, an upgrade, a graceful stop — any interruption — leaves the session resumable. State reconstructs from JSONL and the scheduler's durable permit table. No in-process state is load-bearing across restarts.
18. **Ready means ready.** Projects are not marked `ready` until every setup verification gate passes. Sessions never start against unready projects. No implicit promotion, no manual override via magic env var.

## V. Design Principles

19. **TDD is mandatory.** Primitives get unit tests before implementation. Workflows get integration tests with mocked primitives. No PR lands without test coverage of the changed behavior.
20. **Separation of concerns.** Each module does one thing. Orchestration ≠ business logic ≠ persistence ≠ UI ≠ parsing ≠ side effects.
21. **Composability over inheritance.** Build small, reusable pieces. Prefer pure functions. Prefer data pipelines over state machines scattered across classes.
22. **No dead code, no fabricated data.** Delete commented-out code. Never invent token counts, costs, metrics, or version numbers — if data isn't available, say so.
23. **Validate at boundaries, trust internally.** Validate user input and external API responses. Don't over-validate between internal modules.

## VI. Scope Control

24. **One Story, one child session, one concern.** A child session implements what its Story describes. No bundled refactors, unrelated spec updates, or cross-cutting cleanup.
25. **Don't gold-plate.** Implement what the Story asks for. No extra configurability, no hypothetical-future abstractions, no "while I'm here" features.
26. **Incremental cleanup is allowed when you're already there.** If you're modifying a file for your Story, you MAY extract functions toward the 150-LOC target, improve separation of concerns, remove dead code, and add missing types. Keep cleanup commits separate from feature commits. Do not refactor files you aren't otherwise touching.
27. **Flag out-of-scope problems; don't fix them.** Big issues outside your Story (a 5,000-LOC file that needs splitting, a broken subsystem you stumbled on) get a new Story filed. You don't expand the one in your hand.

## VII. Testing Discipline

28. **QA agents never read source code.** They test exclusively through CLI commands, HTTP endpoints, and browser interaction. This is how we know the spec is met, not just the implementation.
29. **Test depth is enforced.** No shallow assertions (`toBeDefined`, `toBeTruthy` as the only check). Concrete values, exact outputs, real fixtures. The review gate catches slop.
30. **Coverage floors apply.** Configured thresholds for branch coverage on touched files and new modules. Drops in coverage are review-blocking.
31. **Deployable PRs need clickable previews by default.** Setup-generated project constitutions require every previewable PR / change set to carry a verified deployment or preview URL before review approval, unless setup recorded an explicit opt-out or the Story is not externally previewable.

## VIII. Budget & Resources

32. **Burn-rate safety is absolute.** A session that exceeds the tokens-per-commit threshold is denied new permits. The scheduler emits an event; the orchestrator's diagnose workflow decides next steps. No session can spend unbounded tokens without producing work.
33. **Budget caps are enforced, not monitored.** At the cap, the scheduler refuses permits for new children. The orchestrator pauses dispatch. No "I'll stop after this one more."

## IX. Self-Improvement (the Oracle Layer)

34. **The oracle layer is agent-read-only.** The spec (`docs/spec/**`), this CONSTITUTION, the orchestrator prompts (`aloop/templates/PROMPT_orch_*.md`), the review gate definitions, the metric catalog, and the scheduler policy are never modified by any agent turn. This is enforced structurally by `ProjectAdapter` — those paths are not in any agent's worktree. The prohibition is not a policy decision made at runtime; it is a path that doesn't exist for the agent.
35. **Self-tuning is bounded.** Agents may adjust scheduler knobs only within the `daemon.yml` min/max ranges listed in `docs/spec/self-improvement.md` §Level 2. The bounds themselves are agent-inaccessible (they live outside any worktree). Requests outside bounds are rejected.
36. **Metrics that gate permits are daemon-computed.** No agent emits a metric value that gates its own permits. Agents produce events; the daemon's projector computes metrics from events. This is the DGM-resistance rule — the Darwin Gödel Machine experiment demonstrated that any agent path to its own evaluation metric results in reward hacking.
37. **Every self-improvement capability has a documented cheat case.** Before a new diagnose action, tuning knob, or self-directed capability ships, the DGM test entry is written: capability, what it touches, the most adversarial exploit an agent could attempt, and the structural mechanism that blocks it. If the cheat cannot be stated, the capability does not ship. See `docs/spec/self-improvement.md` §The DGM test.
38. **Self-improvement is scoped at four levels. Level 4 is prohibited.** Self-healing (L1), self-tuning (L2), and self-directed follow-up work (L3) are required for autonomous operation. Self-rewriting of the harness, orchestrator prompts, constitution, or spec (L4) is prohibited in v1 and prohibited indefinitely unless a concrete immutable-oracle architecture is proposed and accepted via CR. The previous aloop drifted into L4 and burned weeks of tokens producing nothing.

---

## Amendment

The constitution is a living document. Changes go through the Change Request workflow (`aloop/change-request` on the tracker): file the amendment, refine it, review it, merge it like any other spec update. Changes to the constitution take effect on the next compile of every project using it.

Amendments require explicit human sign-off. The orchestrator cannot propose constitutional amendments on its own behalf; it can file a CR observing a pattern and suggesting one, but a human approves.
