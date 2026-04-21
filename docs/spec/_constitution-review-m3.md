# Constitution review — M3 (Stages A–C)

Audit of `packages/core/src/` against `docs/CONSTITUTION.md`.
Reviewed at the M3-A/B/C milestone (~3000 LOC TS, 147 tests passing). Deferred provider, scheduler, and tracker rules are flagged N/A.

## Per-rule verdicts

### I. Trust & Boundary

- **§I.1 autonomous-by-default.** N/A — no orchestrator yet.
- **§I.2 agents are untrusted.** N/A — no agent surface yet.
- **§I.3 every action through v1 API.** PASS. The router (`server/router.ts`) is the only entry; HTTP and unix-socket transports share the same `makeFetchHandler` (`server/router.ts:14`), so there is structurally one code path.
- **§I.4 policy hardcoded in daemon, not config.** PASS (advisory). Nothing relaxable yet. Worth re-checking when overrides apply at permit grant time in M4.
- **§I.5 scoped sandboxes / env sanitization.** N/A — no provider invocation. Surface check: `process.env` is touched only in `paths.ts:12` (read of `ALOOP_HOME`) and `bin/aloopd.ts:4` (`ALOOP_PORT`). No spawn of provider subprocesses today, so no env-leak risk yet.
- **§I.6 humans always win.** PASS. SIGINT/SIGTERM handlers in `bin/aloopd.ts:18-30` call `daemon.stop()` which unwinds HTTP, socket, DB, and PID lock (`daemon/start.ts:71-76`). PID lock takeover handles unclean shutdown (`daemon/lock.ts:21-23`). No infinite-loop or unkillable surface yet.

### II. Architecture

- **§II.5 shims tiny.** N/A — no shims in this package; old shims live under `aloop/`.
- **§II.6 single-host, distribution-friendly seams.** PASS. `EventStore` interface (`events/store.ts:13`), `Projector` interface (`state/projector.ts:16`), `ProjectRegistry` is the typed repo surface — each has one impl today. No leaked Bun-isms in the seams.
- **§II.7 <2k core, <800 per ext, <150 per file.** **CONCERN.** Files over 150 LOC under `packages/core/src/`:
  - `config/daemon.ts` — **381** (worst by far)
  - `compile/pipeline.ts` — **318**
  - `routes/projects.ts` — **208**
  - `state/projects.ts` — **207**
  Tests intentionally excluded; the rule reads as src files. Total core src ~2.1k (close to the 2k cap with M4–M9 still pending). **Fix:** split `config/daemon.ts` into `config/daemon-types.ts`, `config/daemon-defaults.ts`, `config/daemon-merge.ts`, `config/daemon-fields.ts` (the 90-line block of field validators is the obvious extraction). Split `compile/pipeline.ts` into `compile/parse.ts` (the validators) and `compile/compile.ts` (`compilePipeline`). `routes/projects.ts` and `state/projects.ts` can be split per-handler / per-method but are less urgent.
- **§II.8 single concurrency authority.** N/A pre-M4.
- **§II.9 tracker abstraction.** N/A.
- **§II.10 provider abstraction.** N/A.

### III. Data-Driven

- **§III.11 no hardcoded paths/thresholds/intervals.** **CONCERN.** Three real instances:
  - `daemon/start.ts:30-31` — `port ?? 7777` and `hostname ?? "127.0.0.1"`. The shipped `loadDaemonConfig` is never wired into `startDaemon`, so the daemon ignores `daemon.yml`. The defaults are duplicated in `config/daemon.ts:54-58` and `daemon/start.ts:30-31`, which is exactly the smell the rule prohibits.
  - `server/http.ts:17` — second copy of the `127.0.0.1` default. Same root cause.
  - `bin/aloopd.ts:4` — `ALOOP_PORT ?? "7777"`. Bypasses config entirely.
  **Fix:** `startDaemon` should accept (or load) a `DaemonConfig`. Defaults live exactly once in `DAEMON_DEFAULTS`. M3 stage C nominally shipped the loader; integrating it into start is the missing wire. (The DELIVERY_PLAN M3 entry calls out `POST /v1/daemon/reload` — the absence of even read-side integration suggests this gap is by design, but it should be filed as a story before M4 wires the scheduler against the same defaults a third time.)
- **§III.12 YAML composition only, never logic.** PASS. `compile/pipeline.ts` validators reject expressions / unknowns; transitions are typed enums.
- **§III.13 compile is the only YAML reader.** PASS. `config/yaml.ts` (a thin `yaml` wrapper) and `compile/pipeline.ts` are the only `parse(...)` callsites; the runtime types in `compile/types.ts` describe `LoopPlan`, which is JSON.
- **§III.14 silent fallbacks forbidden.** PASS for config — every `??` in `config/daemon.ts` lines up with a documented field in `DAEMON_DEFAULTS` and the doc-comment at the top. PASS (advisory) for `compile/pipeline.ts:87 ` (`repeat ?? 1`), :104 (`finalizer ?? []`), :105 (`triggers ?? {}`) — all match documented optional fields in `compile/types.ts`. CONCERN-adjacent: the `start.ts:30-32` fallbacks above are *undocumented* defaults (port/hostname/dbPath), which are the textbook "hidden default" pattern §III.14 calls bugs.

### IV. Observability & Resilience

- **§IV.15 JSONL authoritative; SQLite projection.** PASS — strongly. `state/projector.ts` is interface-first with the contract spelled out in a comment, `projector.test.ts:73` literally tests "delete projection, replay JSONL, identical state". Excellent. SQLite writes today: schema migrations + `event_counts` (projector-only) + `projects` table. The `projects` table is a CONCERN (advisory) — project lifecycle changes are not currently modelled as events, so the projects projection is *not* derivable from JSONL. M3 spec didn't require it, but the rule says "every observable change is replayable" (§IV.16). Either the project registry should emit events and have a real projector, or it must be documented as a non-projected canonical store (which contradicts §IV.15). **Fix:** either (a) add `project.created/renamed/status_changed/archived` events and project them, or (b) explicitly carve out an "operational state, not session state" exception in metrics.md / daemon.md.
- **§IV.16 every change emits an event.** Same as above — projects don't.
- **§IV.17 sessions replayable.** N/A — no sessions yet.
- **§IV.18 ready means ready.** PASS (advisory). DB CHECK constraint on `migrations/003-projects.sql:11` enforces enum; promotion to `ready` is a single `updateStatus` call with no gating. Will need verification gates wired in setup (M3 D / M5).

### V. Design Principles

- **§V.19 TDD mandatory.** **CONCERN.** Source files without colocated tests:
  - `server/http.ts`, `server/socket.ts`, `server/router.ts` — no `*.test.ts`. Coverage is indirect via `daemon/start.test.ts`. The `makeEchoStream` SSE scaffold (`router.ts:60`) is exercised in one test but the router-level branch table isn't unit-tested.
  - `state/database.ts` — no direct test (covered transitively).
  - `config/yaml.ts` — no direct test.
  - `events/store.ts`, `compile/types.ts` — pure type/interface files, fine.
  - `version.ts`, `index.ts` — re-export entry points, fine.
  **Fix:** add `server/router.test.ts` (small, transport-agnostic) before M4 routes pile on. The rest are acceptable advisory gaps.
- **§V.20 separation of concerns.** PASS. Persistence (`state/projects.ts`) is pure DB; HTTP (`routes/projects.ts`) is pure transport; transport is shared between sockets via `makeFetchHandler`.
- **§V.21 composability over inheritance.** PASS. No class hierarchies. `ProjectRegistry` is a thin class wrapping a DB handle — could even be free functions, but it's fine.
- **§V.22 no dead code, no fabricated data.** PASS — almost. One nit: `compile/pipeline.ts:98` `void phaseIdx;` to silence an unused-variable warning, with a comment explaining future use. Clean. The `EventCountsProjector` is a real projection used by tests. No commented-out code, no fake metric values.
- **§V.23 validate at boundaries.** PASS. YAML parsers and HTTP request bodies validate; internal calls trust types.

### VI. Scope Control

- **§§VI.24–27.** PASS — too early to violate; no orchestrator dispatching stories yet.

### VII. Testing Discipline

- **§VII.28 QA never reads source.** N/A — no QA agent yet. Integration tests in this repo do drive HTTP from the outside (`daemon/start.test.ts`, `routes/projects.test.ts`), which is the right pattern.
- **§VII.29 no shallow assertions.** PASS. Spot-checked: tests assert concrete values (`expect(plan.cycle).toEqual([...])` in `compile/pipeline.test.ts:214`, exact role of replay in `projector.test.ts:73`, exact 409 / 400 / 405 responses in `routes/projects.test.ts`).
- **§VII.30 coverage floors.** N/A — thresholds not configured yet.

### VIII–IX (Budget, Self-improvement)

- **§§VIII.31–32, IX.33–37.** N/A pre-M4/M9.

---

## Top 5 fixes before M4

1. **Wire `loadDaemonConfig` into `startDaemon`.** Eliminates the duplicated `7777`/`127.0.0.1` defaults across `daemon/start.ts:30-31`, `server/http.ts:17`, and `bin/aloopd.ts:4`. Without this, M4 will invariably add a fourth copy of these constants when scheduler config arrives. Fixes the worst §III.11 violation and the §III.14-adjacent silent defaults in one go. (Story scope: ~30 LOC change + 1 test.)

2. **Decide and document the projects projection story.** Either emit `project.*` events + a real projector (preserves §IV.15) or write the carve-out in `docs/spec/metrics.md`. Picking now is cheaper than retrofitting after M4 sessions also become canonical SQLite rows.

3. **Split `config/daemon.ts` (381 LOC) and `compile/pipeline.ts` (318 LOC).** Both are over 2× the §II.7 cap. Suggested split: `daemon-defaults.ts` + `daemon-merge.ts` + `daemon-fields.ts`; `compile/parse.ts` + `compile/compile.ts`. Pure refactor, tests unchanged.

4. **Add `server/router.test.ts`.** Routing logic is currently tested only via fully-booted daemon integration tests; M4 will multiply the route count and the indirection cost. Direct unit tests against `makeFetchHandler` with a stub `RouterDeps` will pay back fast.

5. **Split `routes/projects.ts` (208) and `state/projects.ts` (207).** Less urgent than #3 but both are over the cap and growing. Extract `routes/projects-handlers.ts` (per-method) and `state/projects-queries.ts` (the SELECT branches in `list()` are the natural seam at `state/projects.ts:110-141`).

---

## Summary

**3 CONCERN**, **3 advisory**, rest PASS or N/A. **Worst:** §III.11 — `daemon/start.ts:30-31` and `server/http.ts:17` hardcode `7777`/`127.0.0.1` defaults that duplicate `DAEMON_DEFAULTS.http`. The config loader exists but is not consumed by daemon startup, so `daemon.yml` is currently dead config. Fix this before M4 wires scheduler defaults the same way.
