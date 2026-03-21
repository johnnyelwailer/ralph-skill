# QA Coverage — Issue #164 (V8 Cache Management)

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| NODE_COMPILE_CACHE set for child dispatch | 2026-03-21 | 41a03c2 | PASS | Env var correctly set to per-session `.v8-cache` dir; verified in running child process |
| Disk space check pauses dispatch | 2026-03-21 | cfedf0e | PASS (partial) | Gate present, not falsely blocking (3.6GB free, threshold 500MB). Cannot verify trigger without filling /tmp |
| V8 cache pruning for in-progress children | 2026-03-21 | 41a03c2 | PASS | All running sessions 40-48MB (below 50MB threshold). Caches bounded vs original 12GB problem |
| V8 cache cleanup for stopped/merged children | 2026-03-21 | 41a03c2 | FAIL | 4/5 stopped sessions cleaned correctly. Issue-81 (stopped state) still has 48MB cache — orphan cleanup not implemented for `stopped` state (known TODO) |
| Orphaned V8 cache from dead children | 2026-03-21 | 41a03c2 | NOT IMPL | Task still open in TODO.md — `stopped` state not covered by cleanup path |
