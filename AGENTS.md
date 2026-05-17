# Agent Instructions

Work caveman simple: small problems, concrete examples, no vague architecture smoke.

## First Read

Before changing code, read these in order:

1. [docs/CONSTITUTION.md](docs/CONSTITUTION.md) — law. If code and constitution disagree, flag it.
2. [docs/VISION.md](docs/VISION.md) — product shape and user experience.
3. [docs/ROADMAP_PRIORITIZATION.md](docs/ROADMAP_PRIORITIZATION.md) — what matters first.
4. [docs/DELIVERY_PLAN.md](docs/DELIVERY_PLAN.md) — milestone dependency graph.

Do not assume `CONSTITUTION.md` exists at repo root. The repo constitution lives at `docs/CONSTITUTION.md`. Project-generated target repos may later have their own root `CONSTITUTION.md`; this repo does not.

## Product Focus

Build gears that turn together. A change is valuable when a user can run it through the product path:

```text
setup project -> mark ready -> start session -> acquire permit -> run provider turn -> stream/log events -> validate -> update tracker/session -> continue or stop
```

Loose pieces are not enough. Examples:

- Bad: add provider adapter tests, but no session can invoke the adapter.
- Bad: add dashboard widgets, but the API route returns placeholder data.
- Bad: add scheduler limits, but real turns bypass permits.
- Good: one smoke path creates a ready project, starts one session, runs one fake provider turn, writes `log.jsonl`, and exposes the result through API/SSE.

Prefer one thin vertical slice over five broad half-built systems.

## Constitution Enforcement

Hard rule: autonomous agents MUST NOT modify `docs/`. They may read docs, cite docs, and file code TODOs that say a docs decision is needed, but they must not edit, create, delete, format, or move files under `docs/`. Docs changes require an explicit human request in an attended session.

Every PR should ask:

- Does this enforce a constitution rule, or only document it?
- Can a user observe the behavior from CLI/API/dashboard?
- Does the test prove the pieces work together?
- Did this add hidden defaults, hardcoded paths, or magic thresholds?
- Did this make files/packages larger when they should split?

TDD is mandatory. Write the failing test for the product behavior first, then implement the smallest code that makes it pass.

## Ambiguity

Autonomous agents should not stall waiting for a human answer. If a requirement is unclear:

- Record the ambiguity in code with a concrete `TODO(decision): ...` that names the decision still needed.
- Keep moving with the smallest reversible implementation.
- When two or more variants are plausible and cheap to support, build the variants behind explicit config/feature toggles.
- Prefer data-driven toggles over branching code paths hidden in the runtime.
- Add tests for each supported variant and for the default.
- Push final product choice to a later Story or human decision, but leave the system runnable.

Example: if the open question is `local sandbox` vs `hosted sandbox`, do not block the session runner. Build the `SandboxAdapter` seam, ship one default fake/local adapter for the vertical slice, and leave the hosted adapter as a toggled implementation path or follow-up TODO.
