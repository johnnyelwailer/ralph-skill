# Project TODO

## Current Phase: Phase 1 — spec-compliant ESM CLI + install shims

### In Progress
- [x] Create `aloop/cli/aloop.mjs` entry point + `aloop/cli/lib/project.mjs` + `aloop/cli/lib/config.mjs` as zero-dependency native ESM (no TypeScript, no esbuild, no commander). This is the foundational blocker: prompts/commands already reference `node ~/.aloop/cli/aloop.mjs` but the runtime ships `dist/index.js`, breaking `/aloop:setup` and `/aloop:start`. (P0)
- [ ] [review] Gate 1: SPEC acceptance criterion "aloop resolve gives clear error for unconfigured project" is unmet — `aloop resolve --project-root /unscaffolded` exits 0 and returns `config_exists: false` with no stderr error. Either exit non-zero when `config_exists` is false, or document and test the chosen behavior explicitly. (priority: high)
- [ ] [review] Gate 2: `aloop.mjs.test.mjs` text-mode test (lines 51-57) uses only `assert.match(result.stdout, /Project:/)` and `assert.match(result.stdout, /Project config:/)` — shallow truthy checks that pass even for garbage output. Rewrite to assert specific project name, root path, and config path values in the output. (priority: high)
- [ ] [review] Gate 2: `config.test.mjs` has only 1 happy-path test; missing: `parseScalar` with `false`/`null`/negative integers, `unquote` with double-quoted strings, comment-only lines, empty list body (empty-string fallback), and `readYamlFile` is completely untested (0% coverage — both the file-not-found `null` return and success paths). (priority: high)
- [ ] [review] Gate 2: `aloop.mjs.test.mjs` has no error-path tests: `--output invalid` exit-1 behavior, `--project-root` as trailing arg with no value, and `discover`/`scaffold` when `dist/index.js` is absent (should exit 1 with stderr message). (priority: high)
- [ ] [review] Gate 3: `aloop/cli/lib/project.mjs` has 0% direct branch coverage — `resolveHomeDir`, `resolveProjectRoot` (git-not-found fallback), `getProjectHash`, and `getDefaultProvider` (missing-config fallback to 'claude') are only exercised indirectly via CLI integration tests. Add a `project.test.mjs` unit test file covering each exported function and their failure branches. (priority: high)
- [ ] [review] Gate 3: `aloop.mjs` `runDistCommand` branch is untested (no dist present scenario) and `--help`/`-h` flag branch is untested; both are reachable code paths with 0% coverage. (priority: medium)

### Up Next
- [x] Add install-time CLI shims: `aloop.cmd` (Windows) and POSIX `aloop` shell wrapper that both invoke `~/.aloop/cli/aloop.mjs`; update `install.ps1` to create shims and update `install.tests.ps1` to verify shim existence and executability. (P0)
- [ ] Wire `aloop/cli/aloop.mjs` `discover` and `scaffold` subcommands to match the existing TypeScript logic in `aloop/cli/src/commands/discover.ts` and `scaffold.ts` — ensure JSON output schema matches `setup-discovery.ps1` output, then delete `setup-discovery.ps1`. (P1)
- [ ] Implement `aloop status`, `aloop active`, and `aloop stop <session-id>` subcommands in `aloop/cli/aloop.mjs` (read `~/.aloop/sessions/*/status.json` + `active.json`, signal PIDs); wire into `claude/commands/aloop/status.md`, `stop.md`, and copilot prompt equivalents. (P1)
- [ ] Implement provider health subsystem in `aloop/bin/loop.ps1`: per-provider `~/.aloop/health/<provider>.json` files, failure classification (rate_limit/timeout/auth/unknown), exponential cooldown table (2/5/15/30/60 min), file-locking with 5-retry backoff, and round-robin skip/sleep logic when all providers are unavailable. (P1)
- [ ] Expose provider health in observability: add `provider_cooldown`, `provider_recovered`, `provider_degraded`, `health_lock_failed` events to `log.jsonl`; surface provider health table in `claude/commands/aloop/status.md` and `copilot/prompts/aloop-status.prompt.md`; include in dashboard SSE state events. (P2)
- [ ] Enforce mandatory final review gate in `loop.ps1` `plan-build-review` mode: add `$script:allTasksMarkedDone` and `$script:forceReviewNext` flags; in `Check-AllTasksComplete` branch during build, set flags instead of `exit 0`; in `Resolve-IterationMode` return `'review'` when `$script:forceReviewNext` is set; steering clears `forceReviewNext`; log `tasks_marked_complete`, `final_review_approved`, `final_review_rejected`. (P1)
- [ ] Add/adjust tests in `install.tests.ps1` for: CLI shim existence and invocability, `aloop resolve/discover/scaffold/status/active/stop` output contracts, provider health state transitions and lock-failure graceful degradation, and final-review-gate state machine (all-tasks-done → forced review → exit or reopen). (P1)
- [x] [review gate] Add automated check (e.g., in `install.tests.ps1`) that every command/prompt doc's CLI invocation path matches the actual installed entrypoint, so future prompt edits cannot silently break `/aloop:setup` or `/aloop:start`. (P2)
- [ ] Run Phase 0–3 acceptance verification sweep from SPEC.md: `grep -ri "ralph"` zero-hit check across non-spec files, install smoke test, and all Phase 1–3 acceptance criteria. Update TODO completion states. (P2)

### Completed
- [x] Renamed repo paths using `git mv` (`aloop/` tree and `claude/{commands,skills}/aloop`), updated `$skillName` so install scripts/tests resolve correctly.
- [x] Implemented baseline Node CLI command surface for `resolve`, `discover`, `scaffold`, and `dashboard` (currently under `aloop/cli/src` as TypeScript; to be superseded by `aloop.mjs` ESM in P0).
- [x] Installer runtime target is `~/.aloop/` for config/bin/templates/CLI payload copy; no remaining legacy-name references in `install.ps1` or `install.tests.ps1`.
- [x] Copilot prompt filenames are `aloop-*.prompt.md`; claude commands live under `claude/commands/aloop/`.
- [x] Command/prompt docs (`setup.md`, `start.md`, copilot equivalents) already reference `node ~/.aloop/cli/aloop.mjs` as the canonical fallback invocation (per spec Phase 1 design).
