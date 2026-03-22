# Constitution — Non-Negotiable Invariants

These rules are enforced at every stage of the pipeline. Violating any rule
means the PR gets rejected. If an issue's scope conflicts with a rule, flag
it — do not implement the violation.

---

## Architecture

1. **loop.sh/loop.ps1 are dumb runners.** They iterate phases, invoke providers, and write status/logs. No business logic, no GH calls, no convention-file processing. No new functions unless explicitly authorized in the issue.
2. **Inner loop / runtime separation.** The loop may run in a container where the aloop CLI is unavailable. All host-side operations (GH, steering, dashboard, request processing) belong in the runtime (`aloop` CLI / `process-requests.ts`), never in the loop scripts.
3. **The loop never exits mid-cycle.** Cycles always run to completion. Only at the cycle boundary does the loop check `allTasksMarkedDone`.
4. **Agents are untrusted.** The aloop CLI is the single trust boundary. Agents never call GH APIs, network endpoints, or the `gh` CLI directly.
5. **All side effects flow through request files.** `requests/*.json` (agent → runtime) and `queue/*.md` (runtime → agent) are the only channel for external operations.

## Design Principles

6. **Small files.** Target < 150 LOC per file. If a file grows beyond that, split it. Prefer many small, focused modules over few large ones.
7. **Separation of concerns.** Each module/function does one thing. Don't mix orchestration with business logic, UI with data fetching, or parsing with side effects.
8. **Composability.** Build small, reusable pieces that compose. Prefer pure functions over stateful classes. Prefer composition over inheritance.
9. **Reusability.** Extract shared logic into utilities. Don't duplicate — if two modules do similar things, factor out the common part.
10. **Test everything.** Every feature needs tests. Every bug fix needs a regression test. No PR without test coverage for the changed behavior.
11. **One issue, one concern.** A child loop implements exactly what its issue describes. Do not bundle unrelated changes, spec rewrites, or cross-cutting refactors.

## Code Quality

12. **No dead code.** Don't leave commented-out code, unused imports, or unreachable branches. Delete it.
13. **No fabricated data.** Never invent token counts, cost values, metrics, or version numbers. If the data isn't available, say so.
14. **QA agents never read source code.** They test exclusively through CLI commands, HTTP endpoints, and browser interaction.
15. **Validate at boundaries, trust internally.** Validate user input and external API responses. Don't over-validate between internal modules.

## Scope Control

16. **Respect file ownership.** Issues should specify which files are in-scope. Don't modify files outside your scope without justification.
17. **Don't gold-plate.** Implement what the issue asks for. Don't add extra features, configurability, or "improvements" beyond the scope.
18. **Flag, don't fix, out-of-scope problems.** If you find an issue outside your scope, file it — don't fix it in your PR.
