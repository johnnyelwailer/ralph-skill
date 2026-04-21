# @aloop/core

Shared aloop runtime primitives: compile logic, event contracts, and statistical helpers.

## Development

```bash
bun install            # from repo root
bun test
bun x tsc -p packages/core/tsconfig.json
```

## Current scope

- `compile/*` — pipeline parsing and compile into `loop-plan.json`
- `events/*` — authoritative event envelope + store interface
- `stats/*` — Welford and CUSUM primitives

Daemon composition and persistence now live in `@aloop/daemon` and `@aloop/state-sqlite`.
