# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| Storybook main config (.storybook/main.ts) | 2026-03-21 | 758e84e | PASS | Correct framework, stories glob, and addons |
| Storybook preview config (.storybook/preview.ts) | 2026-03-21 | 758e84e | PASS | Dark mode decorator, TooltipProvider wrapper, Tailwind CSS import |
| npm run storybook (dev server) | 2026-03-21 | 758e84e | PASS | Launches successfully; minor addon-essentials version mismatch warning |
| npx storybook build (static output) | 2026-03-21 | 758e84e | PASS | Produces storybook-static/ with all assets; "no story files" warning expected (stories not yet created) |
| Tailwind CSS integration | 2026-03-21 | 758e84e | PASS | index.css has @tailwind directives and CSS custom properties |
| VERSIONS.md Storybook version (Gate 8) | 2026-03-24 | 6227a03c | PASS | Line 71 correctly shows `@storybook/* | 10.x` |
| SPEC-ADDENDUM.md Storybook 10 references (Gate 9) | 2026-03-24 | 6227a03c | PASS | Line 139: "Storybook 10", line 176: "Storybook 10 is configured" |
| REVIEW_LOG.md b0cf335a PASS entry (Gate 4) | 2026-03-24 | 6227a03c | PASS | b0cf335a PASS entry correctly prepended as first entry (2026-03-21, commit 3492a61..a182934) |
| Unit test suite (151 tests / 19 files) | 2026-03-24 | 6227a03c | PASS | 151 passed, 0 failures; vitest run --run |
| Storybook build with component stories | 2026-03-24 | 6227a03c | PASS | Build succeeds; 60 stories present (9 ArtifactViewer, 5 ProviderHealth, 7 CostDisplay + 39 UI stories) |
| ProviderHealth component visual render (AllHealthy) | 2026-03-24 | 6227a03c | PASS | Renders correctly via HTTP: green dots, "healthy" labels for claude/gemini/opencode |
| ProviderHealth component visual render (AllFailed) | 2026-03-24 | 6227a03c | PASS | Renders correctly via HTTP: red X icons, "failed" labels for claude/gemini |
| CostDisplay component visual render (NoBudgetCap) | 2026-03-24 | 6227a03c | PASS | Renders correctly: "SPEND $1.23" card with no budget bar |
| CostDisplay component visual render (WithBudgetCritical) | 2026-03-24 | 6227a03c | PASS | Renders correctly: "$9.50 / $10.00" with red progress bar at 95%, warnings shown |
| ArtifactViewer component visual render (SingleImage) | 2026-03-24 | 6227a03c | PASS | Renders correctly: "1 artifact" with filename and description |
| ArtifactViewer component visual render (WithDiffBadgeCritical) | 2026-03-24 | 6227a03c | PASS | Renders correctly: "1 artifact" with critical (red) badge on filename |
| Proof screenshots validity (Gate 6) | 2026-03-24 | 24974eb2 | PASS | Fixed in bf6a7427: all 9 screenshots now unique (6-17KB each), proof-manifest.json present in session artifacts dir. Re-tested at iter 4. |
| lib/ansi.ts extraction | 2026-03-24 | 24974eb2 | PASS | lib/ansi.ts exports stripAnsi, PALETTE_256, rgbStr, parseAnsiSegments, renderAnsiToHtml, AnsiStyle; AppView.tsx imports correctly; 38 unit tests pass |
| Unit test suite (189 tests / 20 files) | 2026-03-24 | 24974eb2 | PASS | 189 passed, 0 failures (38 new ansi.test.ts tests included); vitest run --run |
| Production vite build post-ansi-extraction | 2026-03-24 | 24974eb2 | PASS | vite build succeeds; 462KB JS bundle, no TypeScript errors |
| Storybook build post-ansi-extraction | 2026-03-24 | 24974eb2 | PASS | 60 stories build successfully; no regressions from ansi extraction |
| lib/format.ts extraction | 2026-03-24 | acb8fb08 | PASS | All 8 functions extracted (formatTime, formatTimeShort, formatSecs, formatDuration, formatDateKey, relativeTime, formatTokenCount, parseDurationSeconds); no inline definitions remain in AppView.tsx; backward-compat re-exports present |
| formatHelpers.test.tsx (lib/format import) | 2026-03-24 | acb8fb08 | PASS | 14 tests pass importing from lib/format; no regressions |
| Unit test suite (189 tests / 20 files) post-format-extraction | 2026-03-24 | acb8fb08 | PASS | 189 passed, 0 failures; vitest run --run |
| TypeScript compilation post-format-extraction | 2026-03-24 | acb8fb08 | PASS | tsc --noEmit: no errors |
| Production vite build post-format-extraction | 2026-03-24 | acb8fb08 | PASS | vite build succeeds; 462KB JS bundle |
| Storybook build post-format-extraction | 2026-03-24 | acb8fb08 | PASS | 60 stories build successfully; no regressions from format extraction |
| lib/format.test.ts coverage (Gate 3) | 2026-03-24 | e0b19b91 | PASS | 41 tests covering all 8 exported functions; all tests pass (230 total); each function has happy path + edge cases |
| lib/types.ts extraction | 2026-03-24 | f71b9968 | PASS | 13 types extracted (SessionStatus, ArtifactManifest, DashboardState, SessionSummary, FileChange, LogEntry, ArtifactEntry, ManifestPayload, QACoverageFeature, QACoverageViewData, CostSessionResponse, ConnectionStatus, IterationUsage); AppView.tsx imports and re-exports all; AnsiStyle stays in lib/ansi.ts (extracted previously) |
| Unit test suite (230 tests / 21 files) | 2026-03-24 | f71b9968 | PASS | 230 passed, 0 failures (+41 format.test.ts tests vs prior 189); vitest run --run |
| TypeScript compilation post-types-extraction | 2026-03-24 | f71b9968 | PASS | tsc --noEmit: no errors |
| Production vite build post-types-extraction | 2026-03-24 | f71b9968 | PASS | vite build succeeds; 462KB JS bundle, no regressions |
| Storybook build post-types-extraction | 2026-03-24 | f71b9968 | PASS | 60 stories build successfully; no regressions from types extraction |
| lib/format.test.ts strengthened assertions (Gate 2 re-test) | 2026-03-24 | 94f217ae | PASS | formatTime/formatTimeShort use toMatch(/\d{1,2}:\d{2}/); formatSecs(-5) uses toBe('-1m'); 41 tests pass |
| shared/ElapsedTimer.tsx extraction | 2026-03-24 | 94f217ae | PASS | ElapsedTimer.tsx + ElapsedTimer.test.tsx + ElapsedTimer.stories.tsx present; AppView imports from @/components/shared/ElapsedTimer; no inline definition remains; 7 unit tests pass |
| Unit test suite (237 tests / 22 files) | 2026-03-24 | 94f217ae | PASS | 237 passed, 0 failures (+7 ElapsedTimer tests vs prior 230); vitest run --run |
| TypeScript compilation post-ElapsedTimer-extraction | 2026-03-24 | 94f217ae | PASS | tsc --noEmit: no errors |
| Production vite build post-ElapsedTimer-extraction | 2026-03-24 | 94f217ae | PASS | vite build succeeds; 462KB JS bundle, no regressions |
| Storybook build post-ElapsedTimer-extraction | 2026-03-24 | 94f217ae | PASS | 63 stories build successfully (+3 ElapsedTimer: JustStarted, NinetySeconds, TwoMinutes) |
