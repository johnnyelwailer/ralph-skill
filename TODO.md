# Project TODO

## Current Phase: Phase 0 rename + CLI contract alignment

### In Progress

### Up Next
- [x] Update installer naming/registration to `aloop` (`$skillName`, harness destinations, usage text) so slash commands register as `/aloop:*`. (P0)
- [ ] Replace remaining setup-discovery call sites in command/prompt docs with CLI-based flow (`aloop discover` / `aloop scaffold` / `aloop resolve`) and remove duplicated project-hash/runtime-root instructions. (P0)
- [ ] Migrate runtime CLI to spec-required dependency-free ESM layout: add `aloop/cli/aloop.mjs` plus `lib/project.mjs` and `lib/config.mjs`, and remove the TypeScript/esbuild/`commander` dependency path for runtime usage. (P0)
- [ ] Add install-time CLI shims (`aloop.cmd` and POSIX `aloop`) that invoke `~/.aloop/cli/aloop.mjs`, and update installer tests accordingly. (P0)
- [ ] Port `setup-discovery.ps1` behavior into `aloop discover` + `aloop scaffold` with matching JSON schema and prompt-template substitution parity, then delete `setup-discovery.ps1`. (P1)
- [ ] Implement `aloop status`, `aloop active`, and `aloop stop <session-id>` commands (read/update `active.json`, `status.json`, process signaling) and wire docs/prompts to these commands. (P1)
- [ ] Add provider health subsystem in loop runtime: per-provider `~/.aloop/health/<provider>.json`, failure classification, exponential cooldown/degraded handling, and round-robin skip/sleep logic with lock retries. (P1)
- [ ] Expose provider health in observability outputs: `log.jsonl` events (`provider_cooldown`, `provider_recovered`, `provider_degraded`, `health_lock_failed`) plus status/dashboard surface area. (P2)
- [ ] Enforce mandatory final review gate in `plan-build-review`: never exit during build on all `[x]`, force next review, and let review approval be the only completed exit path. (P1)
- [ ] Add/adjust tests for: rename/install smoke checks, CLI command behavior (`resolve/discover/scaffold/status/active/stop`), provider health state transitions/locking, and final-review-gate state machine. (P1)
- [ ] Run acceptance verification sweep from SPEC (including renamed command namespace and `grep` checks scoped to non-spec docs/scripts), then update TODO completion states. (P2)

### Completed
- [x] Renamed repo paths using `git mv` (`aloop/` tree and `claude/{commands,skills}/aloop`), updated `$skillName` so install scripts/tests resolve correctly.
- [x] Implemented baseline Node CLI command surface for `resolve`, `discover`, `scaffold`, and `dashboard` (currently under `aloop/cli/src`).
- [x] Installer runtime target is already `~/.aloop/` for config/bin/templates/CLI payload copy.
- [x] Copilot prompt filenames are already `aloop-*.prompt.md`.
