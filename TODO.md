# Issue #164: Orchestrator fills /tmp disk with V8 code cache — need NODE_COMPILE_CACHE cleanup

## Tasks

- [x] Set NODE_COMPILE_CACHE for queue-prompt dispatch children — the one-shot child spawn at orchestrate.ts:4742 passes `{ ...deps.dispatchDeps.env }` without setting NODE_COMPILE_CACHE, so these children write V8 cache to default /tmp. Add `NODE_COMPILE_CACHE: path.join(agentSessionDir, '.v8-cache')` to the env (matching the main child dispatch pattern at line 2998)

- [ ] Add disk space check before dispatch — add a function that checks available space on the /tmp filesystem (via `node:fs` `statfs`/`statvfs` or shelling out to `df`). If free space is below a threshold (e.g., 500MB), skip dispatching new children and log a warning. Integrate into the dispatch gate in `runOrchestratorScanPass` alongside the existing budget pause check

- [ ] Add periodic V8 cache pruning for in-progress children — in process-requests.ts Phase 2d (or a new phase), iterate over in-progress child sessions and prune their `.v8-cache` directories if they exceed a size threshold (e.g., 50MB). V8 code cache files are safe to delete while the process runs; Node.js will regenerate them on next cold start. This prevents unbounded growth during long-running children

- [ ] Clean up orphaned V8 cache from dead children — in the Phase 2d cleanup section, also check for child sessions where the PID is no longer alive (process exited without reaching merged/failed). Remove their `.v8-cache` directories. This handles the crash/kill scenario where normal cleanup never runs

- [ ] Add tests for NODE_COMPILE_CACHE in child dispatch — add test coverage verifying that: (a) main child dispatch sets NODE_COMPILE_CACHE to per-session .v8-cache path, (b) queue-prompt dispatch also sets it, (c) disk space check returns correct gate behavior, (d) V8 cache pruning logic works for in-progress and orphaned sessions

## Spec-Gap Analysis

- [ ] [spec-gap/P2] SPEC.md does not document V8 cache management or disk space gating — SPEC.md has zero references to NODE_COMPILE_CACHE, per-session `.v8-cache` directories, or the disk space dispatch gate. The implementation sets `NODE_COMPILE_CACHE` at `orchestrate.ts:2998` and `orchestrate.ts:4748`, and `process-requests.ts:327` cleans up V8 cache for completed children. **Suggested fix:** Add a section to SPEC.md (near the orchestrator dispatch docs) documenting: (a) per-session V8 cache directory strategy, (b) cleanup lifecycle (Phase 2d), (c) planned disk space gating for dispatch
