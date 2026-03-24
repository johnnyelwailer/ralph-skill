# TODO

## Current Phase: Bug Fixes

### Up Next

- [x] [review/high] Hide `help` command and fix test: `index.ts` line 191 — `.command('help')` is registered without `{ hidden: true }`, so `aloop --help` shows 7 commands (including `help`) instead of the spec-required 6 (setup, start, status, steer, stop, dashboard). Fix: add `{ hidden: true }` to the `help` command registration. Also add `assert.doesNotMatch(result.stdout, /^\s+help\b/m)` to `index.test.ts:39-57` — the test title claims "only 6" but the assertion does not enforce it. [reviewed: gates 1-9 pass]

- [x] [qa/P2] Add `engine: 'orchestrate'` to meta.json in `orchestrate-launch.ts`: the `meta` object written at line 106–110 of `orchestrate-launch.ts` omits the `engine` field. TASK_SPEC §Resume requires `engine?: 'loop' | 'orchestrate'` and says to write it when creating an orchestrator session. The `SessionMeta` interface in `start.ts` already has the field and `isOrchestratorSession()` checks `meta.engine === 'orchestrate'` — but new orchestrator sessions created via `launchOrchestrator()` never set it, so resume detection falls back to `mode === 'orchestrate'` (which works, but the field is missing from the written file). Still failing at iter 2.

- [x] [qa/P2] `aloop start <session-id> --launch resume` warns "Failed to create worktree" for orchestrator sessions: when resuming, the code tries to create a new git worktree for the session branch, but the branch `aloop/orchestrator-XXXX` already exists from the initial start. This results in `Warnings: - Failed to create worktree: fatal: a branch named '...' already exists` printed to stdout on every resume. Reproduced 100% of the time. Fix: on resume, detect that the branch already exists and skip worktree creation (reuse the existing one). Tested at iter 2.

- [ ] [qa/P2] `aloop --help --all` does not show hidden commands: the spec acceptance criterion says `aloop --help --all` should show all commands including hidden ones. Only `aloop help --all` (subcommand form) works — `aloop --help --all` still shows only the 6 user-facing commands. Fix: add an `--all` option to the root program that triggers full help output. Tested at iter 2.

### Completed

- [x] Extract `launchOrchestrator()` into `aloop/cli/src/lib/orchestrate-launch.ts` (< 150 LOC) — file exists at 137 LOC
- [x] `orchestrateCommand` in `orchestrate.ts` delegates to shared `launchOrchestrator()` function
- [x] Engine dispatch in `startCommand`: `resolvedMode === 'orchestrate'` early-exits to orchestrator path before loop setup
- [x] `resolveConfiguredStartMode()` returns `'orchestrate'` sentinel instead of throwing
- [x] `aloop start --mode orchestrate` and `--mode loop` overrides work
- [x] `aloop start <session-id> --launch resume` detects orchestrator sessions via `isOrchestratorSession()` and delegates to `launchOrchestrator()`
- [x] `SessionMeta` interface has `engine?: 'loop' | 'orchestrate'` field; loop sessions write `engine: 'loop'`
- [x] Internal commands hidden: `resolve`, `discover`, `scaffold`, `process-requests`, `devcontainer`, `devcontainer-verify`, `active`, `update`, `orchestrate`, `gh`, `debug-env`
- [x] `aloop help --all` subcommand added, shows all commands including hidden ones
- [x] `--concurrency` flag added to `aloop start` and forwarded to orchestrator dispatch
- [x] `/aloop:start` skill (`claude/commands/aloop/start.md`) documents `--mode loop`, `--mode orchestrate`, `--max <n>` → `--max-iterations <n>`, and dual-mode behavior
