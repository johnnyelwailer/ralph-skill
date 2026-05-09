# @aloop/core

Shared aloop runtime primitives: event contracts, context contracts, and statistical helpers.

## Development

```bash
bun install            # from repo root
bun test
bun x tsc -p packages/core/tsconfig.json
```

## Current scope

- `events/*` — authoritative event envelope + store interface
- `context/*` — prompt context provider contracts and registry
- `stats/*` — Welford and CUSUM primitives

Daemon composition and persistence now live in `@aloop/daemon` and `@aloop/state-sqlite`.
