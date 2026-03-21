# Issue #105: Unified `aloop start` dispatch + CLI help simplification

## Current Phase: Implementation

### In Progress

- [x] **Unified start dispatch: accept `mode: orchestrate` in config** — Change `resolveConfiguredStartMode()` in `start.ts` (line 357) to no longer throw on `'orchestrate'`; instead, detect it and dispatch to orchestrator logic. Add a new `'orchestrate'` value to the mode resolution path so `startCommandWithDeps` can branch on it.

### Up Next

- [x] **Extract reusable orchestrator launch function from `orchestrate.ts`** — The `orchestrateCommand` (line 1308) currently does everything: resolve options, call `orchestrateCommandWithDeps`, create worktree, spawn loop.sh. Extract the worktree+spawn+scan-loop launch portion into a shared function (e.g. `launchOrchestrator`) that `start.ts` can also call, so both `aloop start --mode orchestrate` and `aloop orchestrate` use the same path.

- [x] **Wire orchestrator dispatch into `startCommandWithDeps`** — When `resolvedMode` is `'orchestrate'`, call the extracted orchestrator launch function instead of the loop.sh spawn path. Map `--max` to `--max-scans` and forward `--concurrency` if present. Return an appropriate `StartCommandResult` (or a compatible shape).

- [ ] **Add `--concurrency` and `--max` flag mapping to start command** — The spec says `--max` maps to `--max-iterations` (loop) or `--max-scans` (orchestrate). Add `--concurrency <n>` option to the `start` command definition in `index.ts`. Ensure `--max-iterations` is forwarded as `--max-scans` when mode is orchestrate.

- [ ] **Support `aloop start <session-id> --launch resume` for orchestrator sessions** — When resuming, read `meta.json` to detect if the session was an orchestrator session (check for `orchestrator.json` or a mode field). If so, resume via orchestrator logic instead of loop.sh.

- [ ] **Hide internal commands in CLI help** — In `index.ts`, add `{ hidden: true }` to the command definitions for: `resolve`, `discover`, `scaffold`, `process-requests`, `devcontainer-verify`, `active`, `update`. This leaves only `setup`, `start`, `status`, `steer`, `stop`, `dashboard` visible in default help.

- [ ] **Add `--all` flag for full help output** — Implement `aloop --help --all` or `aloop help --all` to show all commands including hidden ones. Commander.js supports `configureHelp()` customization — use it to conditionally show hidden commands when `--all` is passed.

- [ ] **Update `/aloop:start` skill for dual-mode** — Update `claude/commands/aloop/start.md` to document that `--mode orchestrate` and `--mode loop` are valid flags, and that mode defaults to project config. Add `--concurrency` to the flag mapping list.

- [ ] **Update tests for mode dispatch** — Update the existing test at `start.test.ts:1683` that asserts `orchestrate` mode throws. Replace with tests that verify: (a) `mode: orchestrate` in config dispatches to orchestrator, (b) `--mode loop` overrides orchestrate config, (c) `--mode orchestrate` overrides loop config. Add test for resume detecting orchestrator sessions.

- [ ] **Ensure `aloop orchestrate` backwards compat** — Verify that `orchestrateCommand` still works directly after the extraction refactor. The existing `orchestrate` command in `index.ts` should delegate to the same shared launch logic.

### Completed

(none yet)
