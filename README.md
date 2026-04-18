# aloop

> Self-hosted, multi-provider autonomous development harness that turns a spec into merged code without continuous human supervision.

**Status:** rebuild in progress on branch `next`. Pre-rebuild code lived under `aloop/` on `master`; it is retired. The new architecture is a single daemon (`aloopd`) with a typed API, a scheduler-with-permits, tracker-agnostic Epic/Story/Task work items, and a workflow catalog per Story type.

## Where to start

- **[VISION.md](VISION.md)** — the product: who it's for, what it does, why it exists.
- **[CONSTITUTION.md](CONSTITUTION.md)** — non-negotiable invariants. Read before contributing.
- **[DELIVERY_PLAN.md](DELIVERY_PLAN.md)** — twelve milestones from spec to shipped v1.
- **[docs/spec/](docs/spec/)** — 20 reference docs covering architecture, daemon, API, pipeline, providers, trackers, orchestrator, agents, security, workflows, metrics, self-improvement, learning, setup, devcontainer.
- **[docs/research/](docs/research/)** — outside research that informed the rebuild (Karpathy AutoResearch, Anthropic, Cognition, OpenHands, etc.).

## Repo layout

```
packages/
  core/                   @aloop/core — the daemon (aloopd)
docs/
  spec/                   reference docs (invariants, contracts)
  research/               external research notes
  DESIGN_BRIEF.md         dashboard visual design (for M11)
VISION.md                 product vision
CONSTITUTION.md           non-negotiable invariants
DELIVERY_PLAN.md          v1 milestones
```

## Development

Requires [Bun](https://bun.sh) ≥ 1.3.

```bash
bun install
bun test                         # run all package tests
bun x tsc -p packages/core/tsconfig.json   # typecheck
```

Run the daemon locally:

```bash
ALOOP_HOME=/tmp/aloop ALOOP_PORT=7777 bun run packages/core/bin/aloopd.ts
curl http://127.0.0.1:7777/v1/daemon/health
```

## Current milestone

**M1 — daemon skeleton + health.** HTTP + unix socket, `GET /v1/daemon/health`, SSE scaffold, singleton PID lock, graceful shutdown. 17 tests green. Commit `a329ab23a`.

Next: **M2 — state store + event log + drift detection** (SQLite via `bun:sqlite`, JSONL per session, projector, Welford, CUSUM, replay).

## Contributing

- Read CONSTITUTION.md first.
- Every change ships with a test (§V.19 — TDD mandatory).
- No change may touch the oracle layer (spec, constitution, orchestrator prompts, metric definitions). See `docs/spec/self-improvement.md` §IX.
- Work items are tracked via GitHub issues labeled `delivery/M<N>` per `DELIVERY_PLAN.md`.

## License

TBD.
