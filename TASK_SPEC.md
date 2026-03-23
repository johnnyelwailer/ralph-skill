# Sub-Spec: Issue #155 — Extract activity log and iteration components from AppView.tsx

## Objective

Extract the activity log, log entry, and iteration detail components from `AppView.tsx` (currently 2525 LOC) into `src/components/activity/`. This reduces `AppView.tsx` size and gives each piece a focused, testable home.

## Architectural Context

`AppView.tsx` is the monolithic dashboard component. The activity log functionality lives entirely within it:

- `ActivityPanel()` (line 1442) — list of log entries grouped by date, consumes parsed `LogEntry[]`
- `LogEntryRow()` (line 1539) — single row with compact display + expandable detail section
- `ImageLightbox` (line 1829) and `ArtifactComparisonDialog` (line 1855) — used by `LogEntryRow` for artifact interaction

Supporting code also currently embedded in `AppView.tsx` that the new components depend on:
- **Types**: `LogEntry`, `FileChange`, `ArtifactEntry`, `ManifestPayload`, `ArtifactManifest`, `IterationUsage` (lines 156–232, 513–520)
- **Utilities**: `parseLogLine` (361), `parseManifest` (550), `formatDateKey` (335), `formatTimeShort`, `formatDuration`, `relativeTime`, `renderAnsiToHtml` (133), `phaseDotColors` (426), `extractIterationUsage` (521), `formatTokenCount` (535), `isImageArtifact` (544), `artifactUrl` (548), `findBaselineIterations` (1846), `extractModelFromOutput` (572)
- **Sub-components**: `ElapsedTimer` (496) — used by `LogEntryRow`

Note: There is no existing `AnsiRenderer` component. ANSI rendering is done via `renderAnsiToHtml()`. The issue's reference to `AnsiRenderer` means the inline `renderAnsiToHtml()` call in the expanded output section.

The dashboard reads state from a polling API and passes `log: string` and `artifacts: ArtifactManifest[]` down to `ActivityPanel`. No server-side changes are needed.

## Scope

### Create `src/components/activity/types.ts`
- Move `LogEntry`, `FileChange`, `ArtifactEntry`, `ManifestPayload`, `ArtifactManifest`, `IterationUsage` interfaces from `AppView.tsx`
- Export all; import them back in `AppView.tsx` to preserve public API (these are already `export`ed)
- This file is a prerequisite for all other activity components

### Create `src/components/activity/utils.ts`
- Move activity-specific utility functions from `AppView.tsx`: `parseLogLine`, `parseManifest`, `formatDateKey`, `relativeTime`, `phaseDotColors`, `extractIterationUsage`, `formatTokenCount`, `isImageArtifact`, `artifactUrl`, `findBaselineIterations`, `extractModelFromOutput`, `renderAnsiToHtml`, `parseAnsiSegments`, `rgbStr`, `stripAnsi`, `SIGNIFICANT_EVENTS`, `STRIP_ANSI_RE`, `PALETTE_256`
- Export all; import them back in `AppView.tsx`
- This file is a prerequisite for the component files

### Create `src/components/activity/LogEntry.tsx`
- Extract `LogEntryRow()` from `AppView.tsx` (rename to `LogEntry` for export)
- Compact one-liner: timestamp, phase dot, phase label, provider·model, result icon, result detail, message, duration/elapsed
- Expandable/collapsible on click — inline expanded detail (file changes, artifacts, token usage, provider output)
- Imports `ImageLightbox` and `ArtifactComparisonDialog` — these move here from `AppView.tsx`
- Imports `ElapsedTimer` — this moves here from `AppView.tsx`
- Uses types from `./types` and utils from `./utils`

### Create `src/components/activity/ActivityLog.tsx`
- Extract `ActivityPanel()` from `AppView.tsx` (rename to `ActivityLog` for export)
- Renders grouped `LogEntry` list with sticky date headers
- Handles synthetic in-progress entry for running iteration
- Props: `{ log: string; artifacts: ArtifactManifest[]; currentIteration: number | null; currentPhase: string; currentProvider: string; isRunning: boolean; iterationStartedAt?: string }`
- Uses types from `./types` and utils from `./utils`

### Create `src/components/activity/index.ts`
- Re-export `ActivityLog`, `LogEntry` for clean imports

### Update `AppView.tsx`
- Replace `ActivityPanel()`, `LogEntryRow()`, `ImageLightbox`, `ArtifactComparisonDialog`, `ElapsedTimer` with imports from `./components/activity/`
- Replace moved types with imports from `./components/activity/types`
- Replace moved utils with imports from `./components/activity/utils`
- No behavior changes — pure structural refactor

## Out of Scope

- `aloop/cli/dashboard/src/components/ui/` — shadcn UI primitives, must not be modified (rule 18)
- `aloop/cli/dashboard/src/components/progress/` — cost display components, separate concern (rule 12)
- `aloop/cli/dashboard/src/hooks/` — hooks unrelated to this extraction (rule 12)
- `aloop/cli/dashboard/src/App.tsx` — top-level routing, no changes needed (rule 18)
- Any backend/server files — dashboard is frontend-only (rule 2)
- `loop.sh` / `loop.ps1` — loop scripts (constitution rule 1)
- Do NOT redesign the component API or add new props/features (rule 19)
- Do NOT fix unrelated bugs found during extraction (rule 20 — file them separately)

## Constraints

- **Rule 7 (Small files)**: Every new file must be ≤150 LOC. If a component exceeds this, split it further (e.g., the expanded detail section of `LogEntry` may need to be its own `LogEntryDetail.tsx`).
- **Rule 8 (Separation of concerns)**: Types in `types.ts`, utilities in `utils.ts`, components in their own files — no mixing.
- **Rule 11 (Test everything)**: Each new component file needs a corresponding `.test.tsx` file. At minimum: render smoke test, expand/collapse behavior for `LogEntry`, date grouping for `ActivityLog`.
- **Rule 12 (One issue, one concern)**: This is a pure structural extraction. Do not add new features, props, or visual changes.
- **Rule 13 (No dead code)**: After extraction, remove the original function definitions from `AppView.tsx` — do not leave both the original and an import.
- **Rule 18 (Respect file ownership)**: Only the listed files are in-scope. The `AppView.tsx` modifications are limited to removing extracted code and adding imports.
- **`npm run type-check` must pass**: The extraction must preserve all existing TypeScript types exactly. Do not change function signatures.

## Acceptance Criteria

- [ ] `src/components/activity/types.ts` exists and exports all activity-related interfaces
- [ ] `src/components/activity/utils.ts` exists and exports all moved utility functions
- [ ] `src/components/activity/LogEntry.tsx` exists, ≤150 LOC, renders compact row and expandable detail
- [ ] `src/components/activity/ActivityLog.tsx` exists, ≤150 LOC, renders date-grouped entry list
- [ ] `src/components/activity/index.ts` re-exports `ActivityLog` and `LogEntry`
- [ ] `AppView.tsx` no longer contains `LogEntryRow`, `ActivityPanel`, `ImageLightbox`, `ArtifactComparisonDialog`, `ElapsedTimer` function definitions — replaced with imports
- [ ] `AppView.tsx` no longer re-defines moved types and utilities — replaced with imports
- [ ] Log entries expand/collapse on click (existing behavior preserved)
- [ ] Expanded entries show file diffstat, artifact list, token usage, provider output (existing behavior preserved)
- [ ] Activity grouped by date with sticky date headers (existing behavior preserved)
- [ ] ANSI output renders correctly via `renderAnsiToHtml` (existing behavior preserved)
- [ ] Each new component file has a `.test.tsx` with at minimum a render smoke test
- [ ] `npm run type-check` passes
- [ ] All existing tests pass (`npm test`)
- [ ] No behavior change visible in the dashboard UI

## Files

**Create:**
- `aloop/cli/dashboard/src/components/activity/types.ts`
- `aloop/cli/dashboard/src/components/activity/utils.ts`
- `aloop/cli/dashboard/src/components/activity/LogEntry.tsx`
- `aloop/cli/dashboard/src/components/activity/ActivityLog.tsx`
- `aloop/cli/dashboard/src/components/activity/index.ts`
- `aloop/cli/dashboard/src/components/activity/LogEntry.test.tsx`
- `aloop/cli/dashboard/src/components/activity/ActivityLog.test.tsx`

**Modify:**
- `aloop/cli/dashboard/src/AppView.tsx` (remove extracted code, add imports)

## Aloop Metadata
- Parent Epic: #29
- Labels: `aloop/sub-issue`, `aloop/needs-refine`

**Wave:** 1
**Dependencies:** none
