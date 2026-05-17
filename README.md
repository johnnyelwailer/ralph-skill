# aloop

> Durable, server-backed, multi-provider autonomous development and incubation system with a central voice-capable multimodal composer that delegates to scoped agents and turns captured intent into researched, specified, tracked, reviewed, and merged code without continuous human supervision.

**Status:** rebuild in progress on branch `next`. Pre-rebuild code lived under `aloop/` on `master`; it is retired. The new architecture is a durable control plane (`aloopd`) with a typed API, scheduler permits, worker leases, tracker-agnostic Epic/Story/Task work items, primitive-backed incubation/research views, and a workflow catalog per Story type.

## Where to start

- **[docs/VISION.md](docs/VISION.md)** — the product: who it's for, what it does, why it exists.
- **[docs/CONSTITUTION.md](docs/CONSTITUTION.md)** — non-negotiable invariants. Read before contributing.
- **[docs/DELIVERY_PLAN.md](docs/DELIVERY_PLAN.md)** — twelve milestones from spec to shipped v1.
- **[AGENTS.md](AGENTS.md)** — working instructions for coding agents in this repo.
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
AGENTS.md                 coding-agent instructions for this repo
```

## Development

Requires [Bun](https://bun.sh) ≥ 1.3.

```bash
bun install
bun test                         # run all package tests
bun --filter '*' typecheck       # typecheck all workspace packages
```

Run the control plane locally:

```bash
ALOOP_HOME=/tmp/aloop ALOOP_PORT=7777 bun run packages/daemon/bin/aloopd.ts
curl http://127.0.0.1:7777/v1/daemon/health
```

## Current state

The rebuild has a bootable daemon and many primitives, but v1 is not product-functional until the core vertical slice runs end-to-end:

```text
setup project -> mark ready -> start session -> acquire permit -> run provider turn -> stream/log events -> validate -> update tracker/session -> continue or stop
```

Current implementation work should prioritize making those gears turn together before adding breadth. A package, route, adapter, or dashboard panel is not done merely because its unit tests pass; it must connect to the user-visible setup-to-maintenance path.

## Contributing

- Read [docs/CONSTITUTION.md](docs/CONSTITUTION.md) first.
- Read [AGENTS.md](AGENTS.md) before agent-driven implementation.
- Every change ships with a test (§V.19 — TDD mandatory).
- No change may touch the oracle layer (spec, constitution, orchestrator prompts, metric definitions). See `docs/spec/self-improvement.md` §IX.
- Work items are tracked via GitHub issues labeled `delivery/M<N>` per [docs/DELIVERY_PLAN.md](docs/DELIVERY_PLAN.md).

## License

TBD.
