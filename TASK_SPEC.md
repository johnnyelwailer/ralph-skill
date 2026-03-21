# Sub-Spec: Issue #81 — Skill file parity — `/aloop:start` and `/aloop:setup` for dual mode

## Objective

Update the Claude Code command files and GitHub Copilot prompt files so that `/aloop:start` and `/aloop:setup` correctly describe and invoke dual-mode behavior (loop and orchestrate).

## Current State

`claude/commands/aloop/start.md` and `copilot/prompts/aloop-start.prompt.md` exist but may not document that `aloop start` can now dispatch to orchestrate mode based on config. Similarly, `setup.md` may not fully describe the dual-mode recommendation flow.

## Requirements

- Update `claude/commands/aloop/start.md`:
  - Document that `aloop start` reads mode from config
  - `--mode loop` or `--mode orchestrate` overrides config
  - When orchestrate: flags like `--plan`, `--build`, `--review` are ignored
  - Resume works for both modes
- Update `copilot/prompts/aloop-start.prompt.md` with equivalent information
- Update `claude/commands/aloop/setup.md`:
  - Document mode recommendation based on scope analysis
  - ZDR configuration flow
  - OpenCode agent scaffolding when opencode enabled
- Update `copilot/prompts/aloop-setup.prompt.md` similarly
- Verify `/aloop:dashboard` command file exists and is current (already exists)

## Inputs

- `claude/commands/aloop/start.md`, `setup.md`
- `copilot/prompts/aloop-start.prompt.md`, `aloop-setup.prompt.md`

## Outputs

- Skill files accurately describe dual-mode start and setup behavior
- Users invoking `/aloop:start` get correct guidance for both modes

## Acceptance Criteria

- [x] `/aloop:start` skill works identically for both modes
- [ ] `/aloop:setup` skill documents mode recommendation and ZDR
- [ ] Copilot prompts match Claude command files
- [ ] No stale references to "use `aloop orchestrate` directly"

## Files

- `claude/commands/aloop/start.md`
- `claude/commands/aloop/setup.md`
- `copilot/prompts/aloop-start.prompt.md`
- `copilot/prompts/aloop-setup.prompt.md`
