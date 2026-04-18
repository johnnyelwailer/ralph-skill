# @aloop/core

The aloop daemon (`aloopd`) and its local primitives.

## Development

```bash
bun install            # from repo root
bun test packages/core/tests
bun x tsc -p packages/core/tsconfig.json
```

Start the daemon locally:

```bash
ALOOP_HOME=/tmp/aloop ALOOP_PORT=7777 bun run packages/core/bin/aloopd.ts
```

## Current scope (M1)

- HTTP listener on `127.0.0.1:<port>`
- Unix socket at `~/.aloop/aloopd.sock` (or `$ALOOP_HOME/aloopd.sock`)
- `GET /v1/daemon/health` — canonical v1 shape (`{_v, status, version, uptime_seconds}`)
- `GET /v1/events/echo` — SSE scaffold proving the transport works
- Singleton PID lock at `~/.aloop/aloopd.pid`
- Graceful shutdown on SIGINT/SIGTERM

See [docs/DELIVERY_PLAN.md](../../docs/DELIVERY_PLAN.md) for what ships in each milestone.
