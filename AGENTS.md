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

Every PR should ask:

- Does this enforce a constitution rule, or only document it?
- Can a user observe the behavior from CLI/API/dashboard?
- Does the test prove the pieces work together?
- Did this add hidden defaults, hardcoded paths, or magic thresholds?
- Did this make files/packages larger when they should split?

TDD is mandatory. Write the failing test for the product behavior first, then implement the smallest code that makes it pass.

## Ambiguity

If a requirement is unclear and the wrong choice would shape product behavior, stop and ask. If the choice is local and reversible, choose the simplest option and document the assumption in the PR.
