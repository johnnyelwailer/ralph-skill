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
| Proof screenshots validity (Gate 6) | 2026-03-24 | 6227a03c | FAIL | Still unfixed: all 8 story screenshots in proof-artifacts/ are identical "Not found" pages (MD5: 99b13def98aa849306b4f00e23948c59). P1 bug open in TODO.md. Re-tested at iter 3. |
