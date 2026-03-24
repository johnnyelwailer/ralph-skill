# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| Storybook main config (.storybook/main.ts) | 2026-03-21 | 758e84e | PASS | Correct framework, stories glob, and addons |
| Storybook preview config (.storybook/preview.ts) | 2026-03-21 | 758e84e | PASS | Dark mode decorator, TooltipProvider wrapper, Tailwind CSS import |
| npm run storybook (dev server) | 2026-03-21 | 758e84e | PASS | Launches successfully; minor addon-essentials version mismatch warning |
| npx storybook build (static output) | 2026-03-21 | 758e84e | PASS | Produces storybook-static/ with all assets; "no story files" warning expected (stories not yet created) |
| Tailwind CSS integration | 2026-03-21 | 758e84e | PASS | index.css has @tailwind directives and CSS custom properties |
| VERSIONS.md Storybook version (Gate 8) | 2026-03-24 | 44db1b40 | PASS | Line 71 correctly shows `@storybook/* | 10.x` |
| SPEC-ADDENDUM.md Storybook 10 references (Gate 9) | 2026-03-24 | 44db1b40 | PASS | Line 139: "Storybook 10", line 176: "Storybook 10 is configured" |
| Unit test suite (151 tests / 19 files) | 2026-03-24 | 44db1b40 | PASS | 151 passed, 0 failures; vitest run --run |
| Storybook build with component stories | 2026-03-24 | 44db1b40 | PASS | Build succeeds; 21 stories present (9 ArtifactViewer, 5 ProviderHealth, 7 CostDisplay) |
| ProviderHealth component visual render (AllHealthy) | 2026-03-24 | 44db1b40 | PASS | Renders correctly via HTTP: green dots, "healthy" labels for claude/gemini/opencode |
| ProviderHealth component visual render (AllFailed) | 2026-03-24 | 44db1b40 | PASS | Renders correctly via HTTP: red X icons, "failed" labels for claude/gemini |
| CostDisplay component visual render (NoBudgetCap) | 2026-03-24 | 44db1b40 | PASS | Renders correctly: "SPEND $1.23" card with no budget bar |
| ArtifactViewer component visual render (SingleImage) | 2026-03-24 | 44db1b40 | PASS | Renders correctly: "1 artifact" with filename and description |
| Proof screenshots validity (Gate 6) | 2026-03-24 | 44db1b40 | FAIL | All 8 story screenshots are identical "Not found" pages (MD5: 99b13def98aa849306b4f00e23948c59). Proof agent used file:// URLs; must use HTTP server. Bug filed: [qa/P1] in TODO.md |
