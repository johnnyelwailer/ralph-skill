## Summary

- Adds `.github/workflows/ci.yml` GitHub Actions workflow that runs dashboard unit tests (vitest) on every PR and push to `master`/`agent/trunk`
- Creates 6 missing `.test.tsx` files for dashboard components (CollapsedSidebar, SidebarContextMenu, ActivityPanel, ArtifactComparisonHeader, DiffOverlayView, SideBySideView)
- Creates 13 missing `.stories.tsx` files for dashboard components (all export ≥2 named stories)
- Fixes TypeScript errors in ActivityPanel.test.tsx and Sidebar.test.tsx so `npm run type-check` passes clean
- Documents three previously undocumented CLI flags: `aloop start --in-place`, `aloop status --watch`, `aloop setup --non-interactive`

## Files Changed

- `.github/workflows/ci.yml` — new CI workflow: Node 22, `npm ci` + `npm test` in `aloop/cli/dashboard`
- `aloop/cli/dashboard/src/components/layout/CollapsedSidebar.test.tsx` — new unit tests
- `aloop/cli/dashboard/src/components/layout/CollapsedSidebar.stories.tsx` — new Storybook stories
- `aloop/cli/dashboard/src/components/layout/SidebarContextMenu.test.tsx` — new unit tests
- `aloop/cli/dashboard/src/components/layout/SidebarContextMenu.stories.tsx` — new Storybook stories
- `aloop/cli/dashboard/src/components/layout/ResponsiveLayout.stories.tsx` — new Storybook stories
- `aloop/cli/dashboard/src/components/session/ActivityPanel.test.tsx` — new unit tests; TS fix: `iterationStartedAt` in baseProps
- `aloop/cli/dashboard/src/components/session/ActivityPanel.stories.tsx` — new Storybook stories
- `aloop/cli/dashboard/src/components/session/ArtifactComparisonHeader.test.tsx` — new unit tests
- `aloop/cli/dashboard/src/components/session/ArtifactComparisonDialog.stories.tsx` — new Storybook stories
- `aloop/cli/dashboard/src/components/session/ArtifactComparisonHeader.stories.tsx` — new Storybook stories
- `aloop/cli/dashboard/src/components/session/DiffOverlayView.test.tsx` — new unit tests
- `aloop/cli/dashboard/src/components/session/DiffOverlayView.stories.tsx` — new Storybook stories
- `aloop/cli/dashboard/src/components/session/ImageLightbox.stories.tsx` — new Storybook stories
- `aloop/cli/dashboard/src/components/session/LogEntryExpandedDetails.stories.tsx` — new Storybook stories
- `aloop/cli/dashboard/src/components/session/LogEntryRow.stories.tsx` — new Storybook stories
- `aloop/cli/dashboard/src/components/session/SideBySideView.test.tsx` — new unit tests
- `aloop/cli/dashboard/src/components/session/SideBySideView.stories.tsx` — new Storybook stories
- `aloop/cli/dashboard/src/components/session/SliderView.stories.tsx` — new Storybook stories
- `aloop/cli/dashboard/src/components/shared/QACoverageBadge.test.tsx` — new unit tests (93.93% branch coverage)
- `aloop/cli/dashboard/src/components/shared/QACoverageBadge.stories.tsx` — new Storybook stories
- `aloop/cli/dashboard/src/components/layout/Sidebar.test.tsx` — TS fix: add `afterEach` to vitest imports
- `README.md` — correct CLI flag example, add missing stories list, fix OpenCode agent model IDs, fix Storybook component list (remove non-existent AppShell, add ArtifactViewer/ProviderHealth/CostDisplay), complete finalizer agent prose to all 6 agents, add PROMPT_spec-review.md/PROMPT_final-qa.md/PROMPT_final-review.md to template list

## Verification

- [x] `.github/workflows/ci.yml` created — triggers on push + PR to `master` and `agent/trunk`, Node 22, `npm ci`, `npm test` (vitest run) in `aloop/cli/dashboard` — verified by reading the file
- [x] Every non-ui component in `components/` has a `.test.tsx` file (28 total, `ui/` excluded per SPEC-ADDENDUM) — verified by file listing
- [x] Every non-ui component in `components/` has a `.stories.tsx` file (28 total, all export ≥2 named stories) — verified by grep
- [x] `npm run type-check` passes with zero errors — verified by running in `aloop/cli`
- [x] All 632 tests pass — verified per build commit message and QA session
- [x] No browser install required (jsdom configured, no Playwright in CI) — verified by reading ci.yml and vitest.config.ts
- [x] README finalizer prose lists all 6 agents (Spec-gap, Docs, Spec-review, Final-review, Final-qa, Proof) — verified at lines 22–28
- [x] README template list includes PROMPT_spec-review.md, PROMPT_final-qa.md, PROMPT_final-review.md — verified at lines 246–248
- [x] `--in-place`, `--watch`, `--non-interactive` flags documented — verified against SPEC lines 913, 1243, 946 and CLI source `start.ts:783`, `status.ts:102`, `setup.ts:127-128`

## Proof Artifacts

- No screenshots needed — purely internal test infrastructure and CI workflow changes
- Test output: see CI (vitest run)
