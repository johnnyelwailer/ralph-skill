# Issue #6: Dashboard Component Decomposition + Storybook

## Current Phase: Decompose AppView.tsx + Add Storybook

### In Progress

- [ ] [review] Gate 2: `ansi.test.ts:105` — `expect(segs[0].style.fg).toBeDefined()` is a shallow existence check; rewrite to assert the exact RGB value (e.g. `'215,0,0'` for palette index 196) so a broken colour lookup would actually fail the test. (priority: high)
- [ ] [review] Gate 3: `format.ts` exports `formatTime`, `formatTimeShort`, `extractIterationUsage`, `parseManifest`, and `parseQACoveragePayload` — none of these have any tests in `format.test.ts`. Add dedicated `describe` blocks for each, covering at minimum: happy path with concrete value assertions, empty/null input, and the key error branches (e.g. `extractIterationUsage` with `NaN` cost, zero cost, null input; `parseManifest` with null manifest; `parseQACoveragePayload` with each status value). (priority: high)
- [ ] [review] Gate 3: `format.test.ts` — `parseLogLine` tests cover only the happy path (JSON event) and plain text; add tests for: error event (isError=true, resultDetail from `reason`/`error`/`exit_code`), verdict event (resultDetail from `verdict`), iteration with `commitHash` (resultDetail truncated to 7 chars), and `filesChanged` array parsing. (priority: high)
- [ ] [review] Constitution Rule 7: `src/lib/format.ts` is 347 LOC — more than double the 150 LOC target. Split into focused modules (e.g. `lib/session.ts` for `toSession`; `lib/log.ts` for `parseLogLine`/`SIGNIFICANT_EVENTS`/`deriveProviderHealth`; `lib/time.ts` for time-formatting helpers; keep `format.ts` for remaining record/artifact/cost helpers). Each split file must stay under 150 LOC. (priority: high)

### Up Next

- [x] Extract utility modules: `src/lib/ansi.ts`, `src/lib/format.ts`, `src/lib/types.ts` from AppView.tsx — move ANSI parsing/rendering, format helpers, and shared type/interface declarations out of the monolith. Add `ansi.test.ts` and `format.test.ts` (no UI deps, pure functions). (priority: critical, foundational)

- [ ] Extract leaf components: `HealthIndicator.tsx`, `LogEntry.tsx`, `CostDisplay.tsx` (already exists — verify it uses types.ts), `ElapsedTimer.tsx` — each <150 LOC, with `.test.tsx` (Testing Library) and `.stories.tsx` (Storybook, 2–3 stories per component). (priority: critical)

- [ ] Extract composite components: `ActivityLog.tsx`, `SessionCard.tsx`, `SessionList.tsx`, `ProviderHealth.tsx`, `SteerInput.tsx` — each <150 LOC, with `.test.tsx` and `.stories.tsx`. (priority: high)

- [ ] Extract layout components: `Sidebar.tsx`, `MainPanel.tsx`, `DocsPanel.tsx`, `AppShell.tsx` — each <150 LOC, with `.test.tsx` and `.stories.tsx`. (priority: high)

- [ ] Reduce `AppView.tsx` to <100 LOC layout shell that only imports and composes extracted components. Verify all existing tests continue to pass. (priority: high)

- [ ] Add `.stories.tsx` files for already-extracted components that are missing stories: `CostDisplay.stories.tsx`, `ArtifactViewer.stories.tsx`, `ResponsiveLayout.stories.tsx`. At least 2–3 stories per component covering key visual states. (priority: high)

- [ ] Playwright screenshot regression: capture before/after screenshots verifying the dashboard renders identically after refactor. Add to `e2e/` or document in `e2e/proof.spec.ts`. (priority: medium)

- [ ] Verify no source file in `dashboard/src/` exceeds 200 LOC (excluding `ui/` Radix primitives). Fix any violations. (priority: medium)

### Completed

- [x] Storybook 8 infrastructure: `.storybook/main.ts` + `.storybook/preview.tsx` configured with `@storybook/react-vite`, global decorator applying Tailwind + dark mode, `npm run storybook` / `build-storybook` scripts in package.json.
- [x] `CostDisplay.tsx` extracted to `components/progress/` with `.test.tsx`
- [x] `ArtifactViewer.tsx` extracted to `components/artifacts/` with `.test.tsx`
- [x] `ResponsiveLayout.tsx` extracted to `components/layout/` with `.test.tsx`
