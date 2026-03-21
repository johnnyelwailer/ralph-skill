# Issue #105: Unified `aloop start` dispatch + CLI help simplification

## Current Phase: Implementation

### In Progress

- [x] [review] Gate 4: PR review de-duplication guard dropped during `(as any)` cleanup — the PR lifecycle filter at `orchestrate.ts:5358` (`state.issues.filter(i => i.pr_number !== null && i.state === 'pr_open')`) is missing `&& !i.needs_redispatch`, so issues with `needs_redispatch: true` get re-reviewed AND re-dispatched in the same scan pass. Also add `last_reviewed_sha` as a typed field on `OrchestratorIssue` (currently absent from type at line 75-97) and re-add the SHA-based skip check so PRs aren't re-reviewed when no new commits exist. (priority: high)

- [ ] **Add `--concurrency` option to `start` command definition** — The `start` command in `index.ts:74-88` has no `--concurrency` option. Add `.option('--concurrency <number>', 'Max concurrent child loops (orchestrate mode)')` so users can pass it directly. The `--max` → `--max-scans` mapping already works in `start.ts:747+` but `--concurrency` must also be exposed on the CLI surface. (priority: high)

- [ ] [review] Gate 3: `parseArtifactRemovalTargets` (orchestrate.ts:3213-3261) has no direct unit tests — add tests for: (a) empty/undefined feedback returns null, (b) removal intent with no known artifact files returns null, (c) generic "working artifact" without specific files returns full list, (d) mixed feedback with non-artifact content returns null, (e) exact file mentions return only those files. (priority: medium)

### Up Next

- [ ] **Hide internal commands in CLI help** — In `index.ts`, add `{ hidden: true }` to the command definitions for: `resolve` (line 29), `discover` (line 36), `scaffold` (line 56), `process-requests` (line 177), `devcontainer-verify` (line 138), `active` (line 108), `update` (line 122). This leaves only `setup`, `start`, `status`, `steer`, `stop`, `dashboard` visible in default help.

- [ ] **Add `--all` flag for full help output** — Implement `aloop --help --all` or `aloop help --all` to show all commands including hidden ones. Commander.js supports `configureHelp()` customization — use it to conditionally show hidden commands when `--all` is passed.

- [ ] **Update `/aloop:start` skill for dual-mode** — Update `claude/commands/aloop/start.md` to document `--mode orchestrate` and `--mode loop` flags, that mode defaults to project config, and add `--concurrency` to the flag mapping list. Currently the skill has no mention of orchestrate mode.

- [ ] **Update tests for mode dispatch** — The test at `start.test.ts:1683` already verifies orchestrate mode dispatches correctly. Still needed: (a) test that `--mode loop` overrides orchestrate config, (b) test that `--mode orchestrate` overrides loop config, (c) test for resume detecting orchestrator sessions.

### Completed

- [x] **Unified start dispatch: accept `mode: orchestrate` in config** — `resolveConfiguredStartMode()` in `start.ts:372-384` now accepts `'orchestrate'` and returns it as a valid `StartMode`. The `StartMode` type at line 22 includes `'orchestrate'`.

- [x] **Extract reusable orchestrator launch function from `orchestrate.ts`** — `launchOrchestrator()` exported at `orchestrate.ts:1427+` with proper types (`LaunchOrchestratorOptions`, `LaunchOrchestratorDeps`, `LaunchOrchestratorResult`). Both `start.ts` and `orchestrate.ts` use it.

- [x] **Wire orchestrator dispatch into `startCommandWithDeps`** — `start.ts:747-785` branches on `resolvedMode === 'orchestrate'`, calls `orchestrateCommandWithDeps` then `launchOrchestrator`, maps `--max` to `maxScans` and forwards `--concurrency`.

- [x] **Support `aloop start <session-id> --launch resume` for orchestrator sessions** — Resume logic at `start.ts:799-820+` handles orchestrator sessions, mapping `launchMode === 'resume'` to `orchestratorLaunchMode` at line 755.

- [x] **Ensure `aloop orchestrate` backwards compat** — `orchestrateCommand` at `orchestrate.ts:1361-1425` delegates to the same `launchOrchestrator` function, maintaining full backwards compatibility.

- [x] **Basic orchestrate mode dispatch test** — Test at `start.test.ts:1683-1752` verifies orchestrate mode dispatches correctly with mapped `--max` → `maxScans` and `--concurrency` forwarding.
