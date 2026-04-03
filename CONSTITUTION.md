# Constitution — Non-Negotiable Invariants

These rules are enforced at every stage of the pipeline. Violating any rule
means the PR gets rejected. If an issue's scope conflicts with a rule, flag
it — do not implement the violation.

---

## Architecture

1. **loop.sh/loop.ps1 are dumb runners.** They iterate phases, invoke providers, and write status/logs. No business logic, no GH calls, no convention-file processing. No new functions unless explicitly authorized in the issue.
2. **Inner loop / runtime separation.** The loop may run in a container where the aloop CLI is unavailable. All host-side operations (GH, steering, dashboard, request processing) belong in the runtime (`aloop` CLI / `process-requests.ts`), never in the loop scripts.
3. **The loop never exits mid-cycle.** Cycles always run to completion. Only at the cycle boundary does the loop check `allTasksMarkedDone`.
4. **Agents are untrusted.** The aloop runtime is the single trust boundary. Agents never call GH APIs, network endpoints, the `gh` CLI, or the `aloop` CLI directly. All external operations are mediated by the runtime — agents only express intent, the runtime decides what to execute.
5. **All side effects flow through defined contracts.** Agents write results to `.aloop/output/` (filesystem baseline) or via MCP tools (preferred when available). The runtime bridges/processes results into `requests/`. `queue/*.md` (runtime → agent) delivers prompts. Every feature must work with every provider (claude, gemini, opencode, codex, copilot) — MCP is supported by all of them.
6. **100% data-driven pipeline.** No hardcoded paths, constants, prompt names, or phase sequences in code. The loop knows nothing about which prompts it runs — it reads `loop-plan.json`. The orchestrator runtime knows nothing about specific agents — it reacts to well-defined events. Prompts register triggers for events. Everything is configurable via `pipeline.yml` and `loop-plan.json`. Full decoupling, fully data-driven.

## Design Principles

7. **Small files.** Target < 150 LOC per file. If a file grows beyond that, split it. Prefer many small, focused modules over few large ones.
8. **Separation of concerns.** Each module/function does one thing. Don't mix orchestration with business logic, UI with data fetching, or parsing with side effects.
9. **Composability.** Build small, reusable pieces that compose. Prefer pure functions over stateful classes. Prefer composition over inheritance.
10. **Reusability.** Extract shared logic into utilities. Don't duplicate — if two modules do similar things, factor out the common part.
11. **Test everything.** Every feature needs tests. Every bug fix needs a regression test. No PR without test coverage for the changed behavior.
12. **One issue, one concern.** A child loop implements exactly what its issue describes. Do not bundle unrelated changes, spec rewrites, or cross-cutting refactors.

## Code Quality

13. **No dead code.** Don't leave commented-out code, unused imports, or unreachable branches. Delete it.
14. **No fabricated data.** Never invent token counts, cost values, metrics, or version numbers. If the data isn't available, say so.
15. **No hardcoded values.** Thresholds, intervals, timeouts, paths, and constants must come from config, not magic numbers in code.
16. **QA agents never read source code.** They test exclusively through CLI commands, HTTP endpoints, and browser interaction.
17. **Validate at boundaries, trust internally.** Validate user input and external API responses. Don't over-validate between internal modules.

## Scope Control

18. **Respect file ownership.** Issues should specify which files are in-scope. Don't modify files outside your scope without justification.
19. **Don't gold-plate.** Implement what the issue asks for. Don't add extra features or configurability beyond the scope.
20. **Incremental cleanup is encouraged.** When touching a file for your issue, you MAY also: extract functions to reduce file size toward the 150 LOC target, improve separation of concerns, remove dead code, and add missing types. Keep cleanup commits separate from feature commits. Don't refactor files you're not already modifying for your issue.
21. **Flag large out-of-scope problems.** If you find a major issue outside your scope (e.g., a 5000-line file that needs splitting), file a new issue for it — don't attempt the full refactor in your PR.
