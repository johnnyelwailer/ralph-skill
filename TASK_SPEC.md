# Sub-Spec: Issue #151 — Extract shared types, constants, and utility modules from AppView.tsx

## Objective

Extract all shared TypeScript interfaces, constants, and utility functions from the monolithic `AppView.tsx` (2525 lines) into focused modules under `lib/`. This reduces coupling, enables targeted testing, and brings every file under the 150 LOC limit mandated by Constitution Rule 7.

## Architectural Context

`AppView.tsx` is a 2525-line React module that currently mixes four distinct concerns:
- ANSI terminal rendering (pure utility)
- Shared TypeScript types (data contracts)
- Formatting / time utilities (pure functions)
- Log parsing and data-extraction logic (pure functions)
- React components (~2000 lines of JSX)

`App.tsx` is a thin re-export facade over `AppView.tsx` and must not be changed. Tests in both `App.test.tsx` (imports from `./AppView` directly) and `App.coverage.test.ts` (imports from `./App`) must pass without modification. Because `App.test.tsx` imports directly from `./AppView`, `AppView.tsx` must continue to re-export every symbol it currently exports after the extraction.

The existing `src/lib/utils.ts` contains only the `cn()` Tailwind helper and is unrelated to this work.

## Scope

### Create `src/lib/types.ts`
Extract the following *shared* interfaces and type definitions (those referenced across module boundaries or in test assertions):
- `SessionStatus`, `ArtifactManifest`, `DashboardState`, `SessionSummary`, `LogEntry`, `FileChange`, `ArtifactEntry`, `ManifestPayload`, `ProviderHealth`, `IterationUsage`

**Do NOT include** `ConnectionStatus` (component-local, used only by `ConnectionIndicator` and `App` state), `ComparisonMode` (component-local, used only by `ArtifactComparisonDialog`), `QACoverageFeature`, `QACoverageViewData`, or `CostSessionResponse` — these are AppView-internal and must stay in `AppView.tsx`.

### Create `src/lib/ansi.ts`
Extract ANSI terminal rendering utilities:
- `AnsiStyle` interface (must be exported — it appears in `parseAnsiSegments` return type)
- `PALETTE_256` constant
- `stripAnsi()`, `rgbStr()`, `parseAnsiSegments()`, `renderAnsiToHtml()`

### Create `src/lib/format.ts`
Extract pure time/string formatting functions only:
- `formatTime()`, `formatTimeShort()`, `formatSecs()`, `formatDuration()`, `formatDateKey()`, `relativeTime()`, `formatTokenCount()`, `slugify()`

### Create `src/lib/parse.ts`
Extract log parsing and data-extraction functions:
- `SIGNIFICANT_EVENTS` constant
- `parseLogLine()`, `extractModelFromOutput()`, `parseDurationSeconds()`, `computeAvgDuration()`, `deriveProviderHealth()`, `parseManifest()`, `findBaselineIterations()`, `extractIterationUsage()`

`parse.ts` depends on types from `types.ts` — import from there, not from `AppView.tsx`.

### Create `src/lib/session.ts`
Extract session data utilities:
- `IMAGE_EXT` constant
- `isRecord()`, `str()`, `numStr()`, `toSession()`, `isImageArtifact()`, `artifactUrl()`

`session.ts` depends on `SessionSummary` from `types.ts`.

### Update `AppView.tsx`
- Replace all extracted definitions with `import` statements from the new modules
- Re-export every previously-exported symbol so `App.test.tsx` (which imports from `./AppView`) continues to work without modification
- Component-local types (`ConnectionStatus`, `ComparisonMode`, `QACoverageFeature`, `QACoverageViewData`, `CostSessionResponse`) remain in `AppView.tsx`

## Out of Scope

- `aloop/cli/dashboard/src/App.tsx` — must NOT be modified (Constitution Rule 18: file ownership; it is the public API façade)
- `aloop/cli/dashboard/src/App.test.tsx` — must NOT be modified (tests must pass as-is)
- `aloop/cli/dashboard/src/App.coverage.test.ts` — must NOT be modified
- `aloop/cli/dashboard/src/lib/utils.ts` — unrelated utility, must NOT be touched
- Any component under `src/components/` — no changes to component files
- `loop.sh`, `loop.ps1`, any runtime files — Constitution Rules 1–2 prohibit dashboard extraction from touching the runtime/loop layer

## Constraints

- **Rule 7 (Small files):** Every new file must be < 150 LOC. This is why `format.ts` and parsing logic are split into separate modules — a single `format.ts` containing all listed functions would exceed 150 LOC. If any module approaches 150 LOC during implementation, split further before submitting.
- **Rule 8 (Separation of concerns):** Each new module has exactly one concern: types, ANSI rendering, time/string formatting, log parsing, or session data mapping.
- **Rule 12 (One issue, one concern):** This issue covers only the extraction refactor. Do not fix bugs, change logic, or add features in the extracted code.
- **Rule 13 (No dead code):** Remove extracted definitions from `AppView.tsx`; keep only the re-export lines.
- **Rule 18 (Respect file ownership):** Only `AppView.tsx` and the new `lib/` files are in scope.
- **Rule 19 (Don't gold-plate):** No new abstractions, wrappers, or index barrel files beyond what is listed here.
- **Re-export requirement:** `AppView.tsx` must re-export all extracted symbols so that `App.test.tsx` (which does `import { ... } from './AppView'`) continues to work without any changes.

## Acceptance Criteria

- [ ] `src/lib/types.ts` exists and contains exactly the listed shared interfaces; does NOT contain `ConnectionStatus`, `ComparisonMode`, `QACoverageFeature`, `QACoverageViewData`, or `CostSessionResponse`
- [ ] `src/lib/ansi.ts` exists; contains `AnsiStyle` (exported), `PALETTE_256`, `stripAnsi`, `rgbStr`, `parseAnsiSegments`, `renderAnsiToHtml`; is < 150 LOC
- [ ] `src/lib/format.ts` exists; contains only the 8 time/string formatting functions listed; is < 150 LOC
- [ ] `src/lib/parse.ts` exists; contains `SIGNIFICANT_EVENTS` and the 8 parsing/extraction functions listed; is < 150 LOC
- [ ] `src/lib/session.ts` exists; contains `IMAGE_EXT`, `isRecord`, `str`, `numStr`, `toSession`, `isImageArtifact`, `artifactUrl`; is < 150 LOC
- [ ] `AppView.tsx` re-exports all previously-exported symbols (verified by diffing the export surface before and after)
- [ ] `AppView.tsx` contains no duplicate definitions of any extracted symbol
- [ ] `App.test.tsx` is unmodified and all its tests pass
- [ ] `App.coverage.test.ts` is unmodified and all its tests pass
- [ ] `App.tsx` is unmodified
- [ ] `npm run type-check` passes
- [ ] No runtime regressions

## Files

### Modify
- `aloop/cli/dashboard/src/AppView.tsx`

### Create
- `aloop/cli/dashboard/src/lib/types.ts`
- `aloop/cli/dashboard/src/lib/ansi.ts`
- `aloop/cli/dashboard/src/lib/format.ts`
- `aloop/cli/dashboard/src/lib/parse.ts`
- `aloop/cli/dashboard/src/lib/session.ts`

### Must NOT be modified
- `aloop/cli/dashboard/src/App.tsx`
- `aloop/cli/dashboard/src/App.test.tsx`
- `aloop/cli/dashboard/src/App.coverage.test.ts`
- `aloop/cli/dashboard/src/lib/utils.ts`

## Aloop Metadata
- Parent Epic: #29
- Labels: `aloop/sub-issue`, `aloop/needs-refine`

**Wave:** 1
**Dependencies:** none
