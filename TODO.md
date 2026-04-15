# Issue #6: `aloop start`/`setup` UX: CLI Consolidation, Auto-Monitoring & ZDR Configuration

## Tasks

### In Progress

### Up Next

- [ ] [qa/P1] Dashboard type-check: 4 TS2769 regressions in App.coverage.test.ts — `sessionCost` now required in Sidebar props but test doesn't pass it (line 636); `TooltipProvider` now requires `children` but tests pass `{}` (lines 636, 674, 695). Previous pre-existing set had 3 TS2769 errors (different lines/content); these are new regressions from component extraction. Fix: update App.coverage.test.ts to pass `sessionCost` to Sidebar and `children` to TooltipProvider wrappers. Tested at iter 28, commit 3b2d16df. (priority: high)

- [x] [review] Fix ArtifactViewer imports (F3) — `ArtifactViewer.tsx` and `ArtifactViewer.test.tsx` import types via `../../AppView`; change `type ArtifactEntry`/`type ManifestPayload` to import from `@/lib/types`, `isImageArtifact`/`artifactUrl` from `@/lib/format`; `findBaselineIterations`/`LogEntryRow` stay in AppView for now

- [ ] [review] Add test coverage for 5 untested `format.ts` functions (F1) — add to `format.test.ts`: `formatTime`, `formatTimeShort`, `extractIterationUsage` (null/NaN/zero-cost branches), `parseManifest` (nested parsing + conditionals), `parseQACoveragePayload` (PASS/FAIL/UNTESTED normalization); also add `parseLogLine` branches: error events, verdict events, commitHash path, filesChanged array (priority: high)

- [ ] [review] Split `format.ts` (347 LOC) into ≤150 LOC modules (F2) — extract to: `format-time.ts` (formatTime, formatTimeShort, formatSecs, formatDuration, formatDateKey, relativeTime, parseDurationSeconds, computeAvgDuration), `format-parse.ts` (parseLogLine, parseManifest, parseQACoveragePayload), `format-session.ts` (extractIterationUsage, formatTokenCount, deriveProviderHealth, isRecord, str, numStr, toSession, slugify, SIGNIFICANT_EVENTS); update all imports in format.ts, AppView.tsx, format.test.ts; keep format.ts as re-export barrel if needed (priority: high)

- [ ] Add `ui_variant_exploration` to `aloop setup` and `meta.json` — estimate from `discovery.spec_complexity` (enabled when `workstream_count ≥ 2` or `estimated_issue_count ≥ 3`); add as interactive prompt step in `setupCommandWithDeps` (confirm/override boolean); display in confirmation summary; pass to `scaffoldWorkspace`; write `ui_variant_exploration: true|false` to config; in `startCommandWithDeps` read `ui_variant_exploration` from project config and include in `meta.json` write (priority: high)

- [ ] [qa/P2] aloop start: no staleness warning when version.json commit differs from repo HEAD — spec says "warns when installed commit differs from repo HEAD"; code is implemented in start.ts (lines 669-698) but QA test failed at iter 28; likely cause: `dist/index.js` not rebuilt after start.ts change; fix: rebuild CLI (`npm run build` in aloop/cli) and retest by writing `{"commit":"abc12345","installed_at":"2026-01-01T00:00:00Z"}` to version.json and running `aloop start`. (priority: medium)

- [ ] [qa/P2] aloop setup non-interactive: no --data-privacy flag — spec says "non-interactive mode: all options as flags"; setup.ts internals support `dataPrivacy` param but CLI command definition in index.ts (lines 43-54) is missing `--data-privacy` option registration; fix: add `.option('data-privacy', { choices: ['private', 'public'] })` to setup command yargs definition in index.ts. (priority: medium)

- [x] [review] Revert SPEC.md to HEAD — staged modification gutted spec from 4086 → 40 lines (WT-1); run `git restore HEAD -- SPEC.md` (priority: critical)

### Completed

- [x] `aloop start` — single command handles resolve, session ID, session dir + prompts copy, git worktree, meta.json write, active.json registration, loop script launch (background)
- [x] `aloop start` — dashboard auto-launch on random available port + browser open (Windows: `Start-Process`, macOS: `open`, Linux: `xdg-open`)
- [x] `aloop start` — fallback to terminal window with `aloop status --watch` when browser open fails
- [x] `aloop start` — `on_start: { monitor: dashboard|terminal|none, auto_open: true|false }` config reads from project and global config.yml
- [x] `aloop start` — `--launch resume` reuses existing session dir/worktree/branch, re-launches loop without new branch
- [x] `aloop start` — `version.json` staleness check at startup; warns when installed commit differs from repo HEAD
- [x] `aloop update` — writes `version.json` with `commit` and `installed_at` after copying files from repo
- [x] loop.sh — logs `runtime_commit` and `runtime_installed_at` in `session_start` event from `version.json`
- [x] `/aloop:start` — thin delegate at `claude/commands/aloop/start.md` that calls `aloop start [flags]`
- [x] `aloop setup` — interactive mode with discover → spec → providers → mode recommendation → ZDR → devcontainer auth strategy → confirmation summary
- [x] `aloop setup` — scope/complexity analysis recommends loop vs orchestrator; user can override
- [x] `aloop setup` — ZDR warnings for Anthropic/Google/OpenAI/Copilot providers when `data_privacy: private`
- [x] `aloop setup` — `zdr_enabled: true` and `data_classification: private` stored in config under `privacy_policy` section
- [x] `aloop setup` — devcontainer auth strategy choice (mount-first default, env-first, env-only) shown in summary with per-provider method
- [x] `aloop setup` — non-interactive mode with all options as flags, `--mode loop|orchestrate`
- [x] `/aloop:setup` and `/aloop:dashboard` — agent command files exist for Claude (`claude/commands/aloop/setup.md`, `claude/commands/aloop/dashboard.md`)
- [x] `/aloop:setup` and `/aloop:dashboard` — agent command files exist for Copilot (`copilot/prompts/aloop-setup.prompt.md`, `copilot/prompts/aloop-dashboard.prompt.md`)
- [x] `aloop-dashboard.prompt.md` — exists in `copilot/prompts/`
- [x] Dashboard lib extraction — `lib/ansi.ts` (118 LOC), `lib/format.ts`, `lib/types.ts` (123 LOC) extracted from AppView with backward-compat re-exports
- [x] `lib/ansi.test.ts` — 23 tests pass including exact RGB assertion for 256-colour palette index 196
- [x] Storybook 8 infrastructure — `npm run build-storybook` succeeds; `.storybook/main.ts` + `preview.tsx` exist with Tailwind+dark mode decorator

### Deferred

- [~] Split `start.ts` (1155 LOC) into focused modules — Constitution Rule 7 requires <150 LOC; this file is in scope for issue #6 but at 1155 lines the split is a significant cross-cutting refactor; flag as new issue rather than bundling here per Constitution Rule 21
- [~] Split `setup.ts` (305 LOC) into focused modules — minor oversize; acceptable for now given limited touch surface; will be cleaner after `ui_variant_exploration` is added; flag for future cleanup
