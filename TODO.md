# Issue #164: Orchestrator fills /tmp disk with V8 code cache — need NODE_COMPILE_CACHE cleanup

## Tasks

### In Progress

- [ ] [review] Gate 4 (Bug): `computeFreeBytesFromStatfs` at `orchestrate.ts:264` returns `null` when disk is 100% full (`bavail=0` → `freeBytes=0n` → `<= 0n` → `null`). Since `getTmpFreeBytes` returns `null` and the dispatch gate checks `freeBytes !== null`, a full disk **bypasses** the gate — the exact scenario it exists to prevent. Fix: change `freeBytes <= 0n` to `freeBytes < 0n` (or guard `blockSize === 0n` separately), so 0 free bytes returns `0` and correctly triggers the threshold check. (priority: high)

- [ ] [review] Gate 4: `dispatchChildLoops` at `orchestrate.ts:3101-3106` silently zeros the dispatch list when /tmp is low on space — no log event is emitted. By contrast, `runOrchestratorScanPass` at `orchestrate.ts:5201-5208` correctly logs `scan_dispatch_paused_tmp_low_space`. Add equivalent logging to the `dispatchChildLoops` path so operators can diagnose why children aren't being dispatched. (priority: medium)

- [x] Add disk space check before dispatch — add a function that checks available space on the /tmp filesystem (via `node:fs` `statfs`). If free space is below a threshold (e.g., 500MB), skip dispatching new children and log a warning. Integrate into the dispatch gate in `runOrchestratorScanPass` (in `dispatchChildLoops`) alongside the existing budget pause and slot availability checks. Location: `orchestrate.ts` near `availableSlots()`/`filterByHostCapabilities()`

- [x] Add periodic V8 cache pruning for in-progress children — in process-requests.ts Phase 2d (or a new phase), iterate over in-progress child sessions and prune their `.v8-cache` directories if they exceed a size threshold (e.g., 50MB). V8 code cache files are safe to delete while the process runs; Node.js will regenerate them on next cold start. This prevents unbounded growth during long-running children

- [ ] Clean up orphaned V8 cache from dead children — Phase 2d currently only cleans `.v8-cache` for `merged`/`failed` children (process-requests.ts:327-344). Extend to also detect children whose PID is no longer alive (process exited without reaching merged/failed state) and remove their `.v8-cache` directories. This handles the crash/kill scenario where normal cleanup never runs. **QA re-test (iter 18):** Confirmed — issue-81 session (173152) is in `stopped` state with 48MB V8 cache still present. All other stopped sessions (154, 183, 84, 91) were cleaned correctly. The `stopped` state is not covered by the existing cleanup path.

### Up Next

- [ ] Add tests for NODE_COMPILE_CACHE in child dispatch — add test coverage verifying that: (a) main child dispatch (`launchChildLoop`) sets NODE_COMPILE_CACHE to per-session .v8-cache path, (b) queue-prompt dispatch (`dispatchQueuePrompt`) also sets it, (c) disk space check returns correct gate behavior, (d) V8 cache pruning logic works for in-progress and orphaned sessions. Note: no process-requests.test.ts exists yet — tests for (c)/(d) will need a new test file or integration into orchestrate.test.ts

### Completed

- [x] Set NODE_COMPILE_CACHE for queue-prompt dispatch children — verified at orchestrate.ts:4748 (matches main child dispatch at line 2998). Commit 219bddf

## Spec-Gap Analysis

- [ ] [spec-gap/P2] SPEC.md does not document V8 cache management or disk space gating — SPEC.md has zero references to NODE_COMPILE_CACHE, per-session `.v8-cache` directories, or the disk space dispatch gate. The implementation sets `NODE_COMPILE_CACHE` at `orchestrate.ts:2998` and `orchestrate.ts:4748`, and `process-requests.ts:327` cleans up V8 cache for completed children. **Suggested fix:** Add a section to SPEC.md (near the orchestrator dispatch docs) documenting: (a) per-session V8 cache directory strategy, (b) cleanup lifecycle (Phase 2d), (c) planned disk space gating for dispatch
