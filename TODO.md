# Project TODO

## Current Phase: Phase 1 hardening -> Phase 2 CLI migration

### In Progress
- [x] Define and implement `aloop resolve` unconfigured-project contract (`config_exists=false`): either exit non-zero with clear stderr or keep exit 0 and document it explicitly; then add tests for both JSON and text outputs. (P0, blocks Phase 1 acceptance)
- [ ] [review] Gate 2: `aloop/cli/aloop.mjs.test.mjs` discover test only asserts `spec_candidates` is an array (line 106) and does not verify the new parity logic from this iteration; add concrete assertions for recursive `.csproj` language detection and `docs/*.md` candidate inclusion/dedup/limit behavior (priority: high)
- [ ] [review] Gate 3: branch coverage for `aloop/cli/lib/discover.mjs` is 56.52% (`node --test --experimental-test-coverage aloop/cli/aloop.mjs.test.mjs`), below the 80% minimum for touched files; add targeted tests for uncovered branches around `.sln`/recursive `.csproj` detection and docs-directory candidate handling (priority: high)

### Up Next
- [x] Replace `discover` and `scaffold` delegation in `aloop/cli/aloop.mjs` with native `.mjs` modules (`lib/discover.mjs`, `lib/scaffold.mjs`) so setup flow no longer depends on `dist/index.js`. (P0)
- [x] Port remaining discovery/scaffold parity details from `aloop/bin/setup-discovery.ps1` to `.mjs` (schema fields, defaults, provider/model handling), then delete `setup-discovery.ps1`. (P0)
- [ ] Update installer/tests/docs to remove legacy `setup-discovery.ps1` assumptions (`install.tests.ps1`, `README.md`, runtime copy expectations). (P0)
- [ ] Expand CLI test coverage: `aloop.mjs` error paths (`--output` invalid, missing arg values, help paths), stronger text-output assertions, and direct unit tests for `lib/project.mjs` and `lib/config.mjs` branches. (P1)
- [ ] Implement `aloop status`, `aloop active`, and `aloop stop <session-id>` in `aloop/cli/aloop.mjs` (or new `.mjs` libs) with JSON/text outputs based on `~/.aloop/active.json` and session `status.json` metadata. (P1)
- [ ] Wire `/aloop:status` and `/aloop:stop` command/prompt docs to use new CLI subcommands as primary path (with fallback behavior documented). (P1)
- [ ] Add provider health subsystem to `aloop/bin/loop.ps1`: per-provider files under `~/.aloop/health`, failure classification, exponential cooldown, lock retries, and round-robin skip/sleep behavior when providers are unavailable. (P1)
- [ ] Add health observability: log `provider_cooldown`, `provider_recovered`, `provider_degraded`, `health_lock_failed`, and surface provider health in status views/dashboard payloads. (P1)
- [ ] Enforce mandatory final review gate in `loop.ps1` for `plan-build-review`: no build-phase exit on all `[x]`; force review, review decides completion/reopen, and steering precedence is preserved. (P1)
- [ ] Add focused tests for new loop invariants and health behavior (cooldown progression, lock-failure graceful degradation, forced final review state machine). (P1)
- [ ] Run full SPEC acceptance sweep (Phase 0-3 + global sections): verify zero old-brand hits outside spec/planning docs, install smoke test, and update completion checkboxes based on measured results. (P2)

### Completed
- [x] Core rename to `aloop` paths/commands is in place across runtime tree (`aloop/`), Claude commands, Copilot prompts, and installer destinations.
- [x] `install.ps1` targets `~/.aloop/` and creates CLI shims (`~/.aloop/bin/aloop.cmd` and `~/.aloop/bin/aloop`).
- [x] Native ESM entrypoint exists at `aloop/cli/aloop.mjs` with `resolve` implemented via `.mjs` libs.
- [x] Setup/start docs use `aloop resolve|discover|scaffold` with `node ~/.aloop/cli/aloop.mjs ...` fallback paths.
- [x] Command/prompt entrypoint consistency checks are present in `install.tests.ps1`.
