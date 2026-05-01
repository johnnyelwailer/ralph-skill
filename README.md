# aloop

> Self-hosted, multi-provider autonomous development harness with a central voice-capable multimodal composer that delegates to scoped agents and turns captured intent into researched, specified, tracked, reviewed, and merged code without continuous human supervision.

**Status:** rebuild in progress on branch `next`. Pre-rebuild code lived under `aloop/` on `master`; it is retired. The new architecture is a single daemon (`aloopd`) with a typed API, a scheduler-with-permits, tracker-agnostic Epic/Story/Task work items, and a workflow catalog per Story type.

## Where to start

- **[docs/VISION.md](docs/VISION.md)** — the product: who it's for, what it does, why it exists.
- **[docs/CONSTITUTION.md](docs/CONSTITUTION.md)** — non-negotiable invariants. Read before contributing.
- **[docs/DELIVERY_PLAN.md](docs/DELIVERY_PLAN.md)** — twelve milestones from spec to shipped v1.
- **[docs/spec/](docs/spec/)** — reference docs covering architecture, daemon, API, incubation, pipeline, providers, trackers, orchestrator, agents, security, workflows, metrics, self-improvement, learning, setup, devcontainer.
- **[docs/research/](docs/research/)** — outside research that informed the rebuild (Karpathy AutoResearch, Deep Research systems, Anthropic, Cognition, OpenHands, etc.).

## Repo layout

```
packages/
  core/                   @aloop/core — shared contracts, compile logic, stats
  daemon/                 @aloop/daemon — aloopd composition, config, HTTP routes
  state-sqlite/           @aloop/state-sqlite — SQLite projections + JSONL event storage
docs/
  VISION.md               product vision
  CONSTITUTION.md         non-negotiable invariants
  DELIVERY_PLAN.md        v1 milestones
  DESIGN_BRIEF.md         dashboard visual design (for M11)
  spec/                   reference docs (invariants, contracts)
  research/               external research notes
```

## Development

Requires [Bun](https://bun.sh) ≥ 1.3.

```bash
bun install
bun test                         # run all package tests
bun --filter '*' typecheck       # typecheck all workspace packages
```

Run the daemon locally:

```bash
ALOOP_HOME=/tmp/aloop ALOOP_PORT=7777 bun run packages/daemon/bin/aloopd.ts
curl http://127.0.0.1:7777/v1/daemon/health
```

## Current milestone

**M4 — scheduler + permits + overrides (in progress).** The repo now includes project CRUD, config reload, pipeline compile, durable scheduler permits, provider overrides, SQLite-backed permit projection, and JSONL-backed daemon events. The current suite is **169 tests green**.

Next: finish the remaining M4 gates and watchdog wiring before moving on to session-runner work.

## Contributing

- Read [docs/CONSTITUTION.md](docs/CONSTITUTION.md) first.
- Every change ships with a test (§V.19 — TDD mandatory).
- No change may touch the oracle layer (spec, constitution, orchestrator prompts, metric definitions). See `docs/spec/self-improvement.md` §IX.
- Work items are tracked via GitHub issues labeled `delivery/M<N>` per [docs/DELIVERY_PLAN.md](docs/DELIVERY_PLAN.md).

## License

TBD.
