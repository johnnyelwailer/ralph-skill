# Sub-Spec: Issue #105 — Unified `aloop start` dispatch + CLI help simplification

## Objective

Make `aloop start` the single entry point that dispatches to either loop mode or orchestrate mode based on project config, and simplify the CLI help surface to 6 user-facing commands.

## Architectural Context

### Current state

- `aloop/cli/src/commands/start.ts` — implements `startCommand` with dependency injection via `StartDeps`. Contains `resolveConfiguredStartMode()` (line 382–394) which already reads `mode` from project config via `parseAloopConfig()`. It already handles `mode: orchestrate` — but currently **throws an error** telling the user to use `aloop orchestrate` directly. The `mode` field ends up in `parsed.values.mode` (a plain string scalar). `start.ts` is already large; keep new logic minimal.
- `aloop/cli/src/commands/orchestrate.ts` — massive file (~1500+ LOC), contains `orchestrateCommand` as its exported entry point and `OrchestrateDeps`/`DispatchDeps` interfaces. Has `OrchestrateCommandOptions.resume?: string` for session resumption. The file must not grow further — extract `launchOrchestrator()` into a new focused module.
- `aloop/cli/src/index.ts` — registers all commands via Commander.js. Already uses `{ hidden: true }` in command options (see `debug-env` command at line 191–195). Currently 206 LOC.
- `claude/commands/aloop/start.md` — `/aloop:start` skill, loop-only documentation.

### Engine dispatch model

`aloop start` must resolve an **engine** (`loop` | `orchestrate`) before doing any mode/session work:

1. CLI flag `--mode orchestrate` or `--mode loop` → engine override
2. Project config `mode: orchestrate` (or `mode: loop`) → engine from config
3. Default → `loop`

There is a **type conflict**: the existing `--mode` flag accepts `LoopMode` values (`plan | build | review | plan-build | plan-build-review | single`). The values `loop` and `orchestrate` are engine selectors, not loop phases. Resolution: `resolveConfiguredStartMode()` already maps `loop` → `plan-build-review` and throws on `orchestrate`. The implementation must instead return a typed engine sentinel (e.g. `'orchestrate'`) that causes `startCommand` to early-exit into orchestrator dispatch **before** any loop-specific setup runs. The existing `LoopMode` type does not change; engine detection is a pre-flight step.

### Orchestrator launch extraction

`orchestrate.ts` exports `orchestrateCommand` which is the full scan-loop entry point. For dispatch from `start`, what's needed is a **thin launch wrapper** that accepts `OrchestrateCommandOptions` and calls the same underlying logic. Extract this as `launchOrchestrator(options: OrchestrateCommandOptions, deps?: OrchestrateDeps): Promise<void>` into a new file `aloop/cli/src/lib/orchestrate-launch.ts`. Both `orchestrate.ts` (`orchestrateCommand`) and `start.ts` (`startCommand` in orchestrate mode) then call this shared function. This satisfies Rule 10 (reusability) and Rule 7 (small files).

### Resume for orchestrator sessions

`aloop start <session-id> --launch resume` must detect whether the target session is a loop or orchestrator session. The `SessionMeta` interface (line 440–456 in start.ts) has a `mode` field but no engine marker. Add an optional `engine?: 'loop' | 'orchestrate'` field to `SessionMeta` and write it when creating an orchestrator session via `aloop start`. For existing orchestrator sessions (missing `engine` field), fall back to detecting `mode === 'orchestrate'` in meta.

### CLI help hiding

Commander.js `.command('name', { hidden: true })` syntax already works in this codebase (see `debug-env`). Apply it to internal commands. For `--help --all`, Commander does not support this natively. Implement as a dedicated subcommand: `aloop help --all` (not `aloop --help --all`, which Commander intercepts before action handlers). The `help` command generates full output by iterating `program.commands` including hidden ones.

## Scope

### Files in-scope for modification

- `aloop/cli/src/commands/start.ts` — add engine detection (pre-flight before loop setup), call `launchOrchestrator()` for orchestrate mode, add `engine` field to `SessionMeta`, update `resolveConfiguredStartMode` to return orchestrate sentinel instead of throwing
- `aloop/cli/src/commands/orchestrate.ts` — extract `launchOrchestrator()` call site; `orchestrateCommand` delegates to the new shared function
- `aloop/cli/src/lib/orchestrate-launch.ts` — **new file** — exports `launchOrchestrator(options, deps?)` shared by both start and orchestrate commands
- `aloop/cli/src/index.ts` — mark internal commands hidden, add `help` subcommand with `--all` flag
- `claude/commands/aloop/start.md` — update skill for dual-mode and `--mode` flag
- Test files for each modified command (existing `.test.ts` files)

## Out of Scope

- `loop.sh` / `loop.ps1` — Constitution Rule 1: dumb runners, no new logic
- `aloop/cli/src/commands/process-requests.ts` — Constitution Rule 12: one concern per issue
- `aloop/cli/src/commands/setup.ts` — not related to dispatch
- Any server-side files, dashboard assets, or prompt files
- Refactoring `orchestrate.ts` beyond extracting the launch function — Rule 12 and Rule 19
- Adding new features to the skill beyond documenting the dual-mode behavior

## Constraints

- **Rule 1**: Do not modify loop.sh/loop.ps1.
- **Rule 2**: All host-side operations (including orchestrator launch) belong in the CLI runtime, not in loop scripts.
- **Rule 7**: `orchestrate-launch.ts` must be < 150 LOC. `start.ts` must not grow disproportionately — the engine-detection pre-flight should be a focused helper function.
- **Rule 8**: Engine selection logic lives in one place (pre-flight in `startCommand`), not scattered.
- **Rule 10**: `launchOrchestrator()` is the single shared function — no duplication between `orchestrateCommand` and `startCommand`.
- **Rule 11**: Every new path needs test coverage. The engine-dispatch pre-flight, the orchestrate-mode dispatch, the hidden-command registration, and the `help --all` command all need tests.
- **Rule 13**: Remove the current error throw in `resolveConfiguredStartMode` for `orchestrate` — don't leave it as dead code.
- **Rule 15**: No hardcoded engine names in conditionals — use the existing `Set`-based pattern already present in start.ts.
- **Rule 18**: Do not modify files outside the scope list.
- **Rule 19**: Don't add configurability beyond what's needed (e.g. no `--engine` alias if `--mode` covers the use case).

### `--mode` flag design constraint

The `--mode` values `loop` and `orchestrate` are engine selectors; `plan`, `build`, `review`, `plan-build`, `plan-build-review`, `single` are loop phase selectors. The implementation must not confuse them. Engine detection must happen before `assertLoopMode()` / `resolveModeFromFlags()` are called. If `--mode orchestrate` is provided, skip all loop-mode resolution and go straight to orchestrate dispatch.

### `--max` flag mapping

The `start.md` skill maps `--max <n>` → `--max-iterations <n>`. In orchestrate dispatch, `--max-iterations` maps to `OrchestrateCommandOptions.maxIterations`. The `--concurrency` flag (not currently on `aloop start`) must be added to `StartCommandOptions` and forwarded to the orchestrator only when engine is orchestrate.

## Acceptance Criteria

- [ ] `aloop start` with `mode: orchestrate` in project config (`~/.aloop/projects/<hash>/config.yml`) launches the orchestrator scan loop (calls the same logic as `aloop orchestrate`)
- [ ] `aloop start --mode loop` when project config has `mode: orchestrate` launches loop mode (plan-build-review), not the orchestrator
- [ ] `aloop start --mode orchestrate` when project config has `mode: loop` launches the orchestrator
- [ ] `aloop orchestrate` still works directly and produces identical behavior to `aloop start --mode orchestrate` (backwards compatible)
- [ ] `aloop start <session-id> --launch resume` for an orchestrator session (one with `engine: orchestrate` or `mode: orchestrate` in meta.json) resumes the orchestrator
- [ ] `aloop start <session-id> --launch resume` for a loop session continues to behave as before
- [ ] Default `aloop --help` shows only: `setup`, `start`, `status`, `steer`, `stop`, `dashboard` (6 commands)
- [ ] `aloop help --all` shows all registered commands including hidden ones
- [ ] Hidden commands (`resolve`, `discover`, `scaffold`, `process-requests`, `devcontainer-verify`, `active`, `update`) do not appear in default `aloop --help` but still execute normally when invoked directly
- [ ] `/aloop:start` skill (`claude/commands/aloop/start.md`) documents `--mode loop` and `--mode orchestrate`, maps `--max <n>` → `--max-iterations <n>` for both modes
- [ ] All new code paths have test coverage in the relevant `.test.ts` files
- [ ] `orchestrate-launch.ts` is < 150 LOC

## Labels
`aloop/sub-issue`, `aloop/needs-refine`

**Wave:** 1
**Dependencies:** none
