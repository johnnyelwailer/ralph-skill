# Sub-Spec: Issue #105 — Unified `aloop start` dispatch + CLI help simplification

## Objective

Make `aloop start` the single entry point that dispatches to either loop mode or orchestrate mode based on project config, and simplify the CLI help surface to 6 user-facing commands.

## Scope

### Unified Start Dispatch
- Read `mode` from project config (`~/.aloop/projects/<hash>/config.yml`)
- When `mode: orchestrate`, import and call orchestrator launch logic from `orchestrate.ts` instead of spawning loop.sh
- `aloop start --mode loop` overrides orchestrate config → forces plan-build-review
- `aloop start --mode orchestrate` overrides loop config → forces orchestrator
- Flag mapping: `--max` → `--max-iterations` (loop) or `--max-scans` (orchestrate), `--concurrency` forwarded to orchestrator
- `aloop start <session-id> --launch resume` works for both modes by reading `meta.json` mode field
- Ensure `aloop orchestrate` still works directly (backwards compat, delegates to shared logic)

### CLI Help Simplification
- Mark internal commands (`resolve`, `discover`, `scaffold`, `process-requests`, `devcontainer-verify`, `active`, `update`) as hidden in Commander.js (`.hideHelp()` or equivalent)
- Default `aloop --help` shows only: `setup`, `start`, `status`, `steer`, `stop`, `dashboard`
- Add `aloop --help --all` or `aloop help --all` to show all commands including hidden ones

### Skill Update
- Update `/aloop:start` skill (`claude/commands/aloop/start.md`) to document both modes and pass `--mode` when needed

## Files
- `aloop/cli/src/commands/start.ts` — add mode-based dispatch logic
- `aloop/cli/src/commands/orchestrate.ts` — extract reusable launch function
- `aloop/cli/src/index.ts` — hide internal commands, add `--all` flag
- `claude/commands/aloop/start.md` — update skill for dual-mode

## Acceptance Criteria
- [ ] `aloop start` with `mode: orchestrate` in project config launches orchestrator
- [ ] `aloop start --mode loop` overrides orchestrate config
- [ ] `aloop orchestrate` still works directly (backwards compatible)
- [ ] `/aloop:start` skill works for both modes
- [ ] Default `aloop --help` shows only 6 user-facing commands
- [ ] `aloop --help --all` shows everything
- [ ] `aloop start <session-id> --launch resume` works for orchestrator sessions

## Labels
`aloop/sub-issue`, `aloop/needs-refine`
