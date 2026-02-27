# Project TODO

## Current Phase: Phase 2 cleanup → Phase 3 CLI subcommands → Loop hardening

### In Progress
- [x] Add concrete `discover` test assertions: recursive `.csproj` language detection, `docs/*.md` candidate inclusion, dedup, and limit behavior in `aloop/cli/aloop.mjs.test.mjs` (line 106 only checks it's an array). (P0)
- [x] Raise branch coverage for `aloop/cli/lib/discover.mjs` to ≥80%: add targeted tests for `.sln`/recursive `.csproj` detection, docs-directory candidate handling, and uncovered edge branches. Run with `node --test --experimental-test-coverage aloop/cli/aloop.mjs.test.mjs`. (P0)

### Up Next
- [x] Remove the legacy `setup-discovery.ps1` line from `README.md` (line 197: "Legacy discovery + scaffold script (being replaced by aloop CLI)") since the file is already deleted. (P0)
- [ ] Expand CLI test coverage: error paths (`--output` invalid value, missing required arg values, help flag), stronger text-output assertions, and direct unit tests for `lib/project.mjs` and `lib/config.mjs` branches. (P1)
- [ ] Implement `aloop status`, `aloop active`, and `aloop stop <session-id>` in `aloop/cli/aloop.mjs` (or new `lib/status.mjs`) with JSON/text outputs reading `~/.aloop/active.json` and session `status.json`; include provider health summary from `~/.aloop/health/<provider>.json`. (P1)
- [ ] Add `/aloop:status` and `/aloop:stop` command/prompt stubs in `claude/commands/` and `copilot/prompts/` that delegate to `aloop status` / `aloop stop` CLI with `node ~/.aloop/cli/aloop.mjs` fallback. (P1)
- [ ] Add provider health subsystem to `aloop/bin/loop.ps1`: per-provider files at `~/.aloop/health/<provider>.json`, failure classification (rate_limit / auth / timeout / concurrent_cap / unknown), exponential backoff cooldown table (2/5/15/30/60 min caps), exclusive file-lock with 5-attempt retry, and round-robin skip/sleep when all providers unavailable. (P1)
- [ ] Add health observability to `loop.ps1`: log `provider_cooldown`, `provider_recovered`, `provider_degraded`, `health_lock_failed`, `all_providers_unavailable` to `log.jsonl`; include provider health in dashboard SSE payloads. (P1)
- [ ] Enforce mandatory final review gate in `loop.ps1` for `plan-build-review` mode: add `$script:allTasksMarkedDone` and `$script:forceReviewNext` flags; in build completion check set flags instead of `exit 0`; in `Resolve-IterationMode` return `'review'` when flag set; steering clears the flag; log `tasks_marked_complete`, `final_review_approved`, `final_review_rejected`. (P1)
- [ ] Add focused tests for new `loop.ps1` invariants: forced final review state machine, cooldown progression, lock-failure graceful degradation, steering precedence over `forceReviewNext`. (P1)
- [ ] Run full SPEC acceptance sweep (Phase 0–3 + global health/review-gate sections): verify zero non-spec "ralph" hits, install smoke test passes, and update SPEC.md acceptance checkboxes based on measured results. (P2)

### Completed
- [x] Core rename to `aloop` paths/commands is in place across runtime tree (`aloop/`), Claude commands, Copilot prompts, and installer destinations. Zero legacy-name references in .ps1/.sh/.yml/.mjs files.
- [x] `install.ps1` targets `~/.aloop/` and creates CLI shims (`~/.aloop/bin/aloop.cmd` and `~/.aloop/bin/aloop`).
- [x] Native ESM entrypoint exists at `aloop/cli/aloop.mjs` with `resolve` implemented via `.mjs` libs.
- [x] `aloop resolve` unconfigured-project contract implemented (`config_exists=false`) with tests for JSON and text outputs.
- [x] `lib/discover.mjs` and `lib/scaffold.mjs` implemented as native `.mjs` modules; `discover` handles recursive `.csproj`, `.sln`, and `docs/*.md` candidates.
- [x] `setup-discovery.ps1` deleted; `discover`/`scaffold` delegation in `aloop.mjs` uses native `.mjs` modules only.
- [x] `install.tests.ps1` updated — no legacy `setup-discovery.ps1` references remain.
- [x] Setup/start docs use `aloop resolve|discover|scaffold` with `node ~/.aloop/cli/aloop.mjs ...` fallback paths.
- [x] Command/prompt entrypoint consistency checks are present in `install.tests.ps1`.
