# TODO — Issue #164: V8 Cache / /tmp Disk Management

### Completed

- [x] Set NODE_COMPILE_CACHE for child processes
- [x] Add disk space check before dispatch
- [x] Add periodic V8 cache pruning for in-progress children
- [x] Write status.json at orchestrator startup
- [x] Payload validation and idempotency guards
- [x] [review] Gate 4 (Bug): `computeFreeBytesFromStatfs` returns `null` when disk is 100% full (`bavail=0` → `freeBytes=0n` → `<= 0n` → `null`), bypassing the dispatch gate. Fixed: changed `freeBytes <= 0n` to `freeBytes < 0n` so 0 free bytes returns `0` and correctly triggers the threshold check.
- [x] [review] Gate 4: `dispatchChildLoops` silently zeros the dispatch list when /tmp is low on space — no log event. Fixed: added `pausedTmpLowSpace` field to `DispatchResult` so callers can observe and log the pause reason.
