# Sub-Spec: Issue #160 — Add component tests for all extracted components

## Objective

Add comprehensive unit test coverage for all modules extracted from `AppView.tsx` as part of epic #29 — covering extracted lib utilities, hooks, and business-logic components. Also expand the vitest coverage configuration to track all source files.

## Architectural Context

`AppView.tsx` is currently a monolithic file (~1200+ LOC) containing ANSI rendering utilities, formatting helpers, data-transform functions, React hooks, and all UI components. Epic #29 extracts these into discrete modules. This issue adds test files for those extracted modules.

**Current state (before this issue):**
- `App.test.tsx` — unit tests for all business logic functions, importing from `./AppView`
- `components/progress/CostDisplay.test.tsx` ✓ — already tested
- `components/ui/tooltip.test.tsx`, `hover-card.test.tsx` ✓ — already tested
- `hooks/useCost.test.ts`, `useIsTouchDevice.test.ts`, `useLongPress.test.ts` ✓ — already tested
- `vitest.config.ts` coverage — only tracks 5 files

**After epic #29 extraction, this issue adds:**
- Test files collocated with each extracted module
- Migrated tests from `App.test.tsx` into the appropriate extracted module test file
- Expanded vitest coverage config

**Layer ownership:** Dashboard frontend only (`aloop/cli/dashboard/src/`). No CLI src, no loop scripts, no runtime changes.

## Dependencies

**This issue BLOCKS on epic #29 extraction sub-issues.** The following modules must exist before their test files can be created:
- `lib/ansi.ts` — ANSI strip/parse/render utilities (currently in AppView.tsx lines ~27–200)
- `lib/format.ts` — formatting, parsing, and type-guard functions (currently in AppView.tsx)
- `hooks/useSSE.ts` — SSE connection lifecycle hook
- `hooks/useSession.ts` — session selection, grouping, filtering hook
- `hooks/useSteering.ts` — steer/stop/resume API calls hook
- `hooks/useTheme.ts` — theme detection and toggle hook
- All components under `src/components/` produced by extraction

The vitest config expansion (see Scope) can proceed independently of extraction.

## Scope

### Vitest config (no extraction dependency)
- `aloop/cli/dashboard/vitest.config.ts` — expand coverage `include` from 5 hardcoded files to `src/**/*.{ts,tsx}` (excluding test files, main.tsx, test-setup.ts, index.css)

### Migrate tests out of App.test.tsx (after extraction)
The existing tests in `App.test.tsx` import utilities directly from `./AppView`. Once extraction is complete, move each test suite to the collocated test file for its module:
- `lib/ansi.test.ts` — `stripAnsi`, `parseAnsiSegments`, `renderAnsiToHtml` tests
- `lib/format.test.ts` — `parseLogLine`, `extractModelFromOutput`, `parseDurationSeconds`, `computeAvgDuration`, `deriveProviderHealth`, `numStr`, `toSession`, `formatSecs`, `formatDuration`, `relativeTime`, `slugify`, `parseManifest`, `findBaselineIterations`, `artifactUrl`, `isImageArtifact` tests
- Update imports in `App.test.tsx` to point to new locations; keep only integration/render-level tests in `App.test.tsx`

### New hook tests (after extraction)
- `hooks/useSSE.test.ts` — connection lifecycle (opens, receives events), reconnect logic, heartbeat handling; mock `EventSource` in jsdom
- `hooks/useSession.test.ts` — session selection, grouping by project, filtering by state; mock SSE data
- `hooks/useSteering.test.ts` — steer/stop/resume API fetch calls; mock `fetch`
- `hooks/useTheme.test.ts` — `prefers-color-scheme` detection, toggle between light/dark, localStorage persistence

### New component tests (after extraction, one file per component)
For each component extracted from `AppView.tsx` into `src/components/**/*.tsx`:
- Render with representative prop combinations
- Verify key DOM output (text, ARIA roles, class names for state)
- User interactions: click handlers, expand/collapse, keyboard events via `fireEvent`
- Edge cases: empty/null data, error states, loading states
- Use `@testing-library/react` with `screen`, `fireEvent`, `waitFor`

**Do NOT add tests for shadcn/Radix UI primitive wrappers** (`components/ui/button.tsx`, `card.tsx`, `collapsible.tsx`, `command.tsx`, `dropdown-menu.tsx`, `progress.tsx`, `resizable.tsx`, `scroll-area.tsx`, `tabs.tsx`, `textarea.tsx`, `sonner.tsx`) — these are thin re-export wrappers with no custom logic. Tests for tooltip and hover-card already exist because they contain custom touch/accessibility logic.

## Out of Scope

- `aloop/cli/src/**` — CLI runtime, not dashboard (Rule 18)
- `loop.sh`, `loop.ps1` — loop runner scripts (Constitution Rule 1)
- `src/main.tsx` — entry point only, no testable logic
- `src/lib/utils.ts` — single-line `cn()` re-export, no logic to test
- `src/AppView.tsx` — do not add tests directly to the monolith; extraction must happen first (Rule 12: one concern per issue)
- Any extraction of code from `AppView.tsx` — that is epic #29's scope (Rule 20: flag, don't fix)
- E2E tests (`e2e/`) — separate concern, separate tooling

## Constraints

- **Constitution Rule 11** — Every extracted feature needs tests. Test files must be created for every new module produced by epic #29.
- **Constitution Rule 12** — This issue covers only test authorship, not code extraction. If extraction is incomplete, this issue is blocked — do not perform extraction here.
- **Constitution Rule 7** — Test files must stay < 150 LOC each. Split into multiple describe blocks or files if a module has many functions.
- **Constitution Rule 8** — Do not mix utility tests with hook tests with component tests. One test file per source file.
- **Constitution Rule 19** — Do not add extra test utilities, shared fixtures, or test helpers beyond what is needed. Each test file is self-contained.
- `useSSE` must mock `EventSource` via `vi.stubGlobal('EventSource', ...)` — jsdom does not implement it.
- `useSteering` must mock `fetch` via `vi.stubGlobal('fetch', ...)` — do not hit real network.
- All new tests must pass with `npm run test` (vitest) with zero failures.

## Acceptance Criteria

- [ ] `vitest.config.ts` coverage `include` is `['src/**/*.{ts,tsx}']` (excluding test/setup files) — verifiable by reading the config
- [ ] `App.test.tsx` no longer imports utility functions from `./AppView`; all utility tests live in their extracted module's test file
- [ ] `lib/ansi.test.ts` exists and tests `stripAnsi`, `parseAnsiSegments`, `renderAnsiToHtml` with SGR codes (bold, fg/bg 16/256-color, reset)
- [ ] `lib/format.test.ts` exists and tests all exported format/parse/type-guard functions (min 1 passing test per exported function)
- [ ] `hooks/useSSE.test.ts` exists and tests: initial connection, message dispatch, reconnect on error, cleanup on unmount
- [ ] `hooks/useSession.test.ts` exists and tests: session grouping by project, active/inactive filtering, session selection state
- [ ] `hooks/useSteering.test.ts` exists and tests: steer API call shape, stop API call shape, error handling
- [ ] `hooks/useTheme.test.ts` exists and tests: default theme from `prefers-color-scheme`, toggle, persistence
- [ ] Every component file in `src/components/` (excluding `components/ui/` primitives) has a collocated `.test.tsx` file
- [ ] `npm run test` passes with zero failures
- [ ] No decrease in overall test coverage percentage (vitest `--coverage`)

## Files

**Modify (no extraction dependency):**
- `aloop/cli/dashboard/vitest.config.ts`

**Modify (after extraction):**
- `aloop/cli/dashboard/src/App.test.tsx` — remove utility test suites, keep integration-level render tests

**Create (after extraction, alongside extracted modules):**
- `aloop/cli/dashboard/src/lib/ansi.test.ts`
- `aloop/cli/dashboard/src/lib/format.test.ts`
- `aloop/cli/dashboard/src/hooks/useSSE.test.ts`
- `aloop/cli/dashboard/src/hooks/useSession.test.ts`
- `aloop/cli/dashboard/src/hooks/useSteering.test.ts`
- `aloop/cli/dashboard/src/hooks/useTheme.test.ts`
- One `.test.tsx` per extracted business-logic component in `src/components/`

## Aloop Metadata
- Parent Epic: #29
- Labels: `aloop/sub-issue`, `aloop/needs-refine`

**Wave:** 2 (after epic #29 extraction sub-issues complete)
**Dependencies:** Epic #29 extraction sub-issues (lib/ansi, lib/format, hooks, components)

