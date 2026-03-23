# Sub-Spec: Issue #156 — Extract health, progress, steering, and artifact components from AppView.tsx

## Objective

Extract remaining domain components from `AppView.tsx` into `src/components/health/`, `src/components/progress/`, `src/components/steering/`, and `src/components/artifacts/`. `AppView.tsx` is ~2500 LOC, violating constitution rule 7 (< 150 LOC). This issue is one phase of its decomposition.

## Architectural Context

`AppView.tsx` currently contains:
- All domain components inline (HealthPanel, Footer/SteerInput, ArtifactComparisonDialog, progress bar)
- Shared types: `ProviderHealth`, `ArtifactEntry`, `ManifestPayload` (lines 233–240, 217–231)
- Utility functions: `deriveProviderHealth()` (line 670), `formatTokenCount()` (line 535), `findBaselineIterations()` (line 1846), `artifactUrl()` (line 548), `isImageArtifact()` (line 544)

**Current state of `src/components/progress/`:** `CostDisplay.tsx` is **already implemented** and tested. Do not recreate it.

**`src/lib/format.ts` does not exist.** `deriveProviderHealth()` and `formatTokenCount()` live in `AppView.tsx` and must be extracted to `src/lib/format.ts` as part of this work so health and progress components can import them without a circular dependency.

**`src/types.ts` does not exist.** The `ProviderHealth`, `ArtifactEntry`, and `ManifestPayload` interfaces live in `AppView.tsx`. They must be extracted to `src/types.ts` so the new domain components can import them without importing from AppView.

**`useSteering` hook does not exist.** Steering state (`steerInstruction`, `steerSubmitting`) and `handleSteer()` (calls `POST /api/steer`) currently live in the root `Dashboard` component. A `useSteering` hook must be created at `src/hooks/useSteering.ts` to encapsulate this logic.

**`SteerHistory` data source:** There is no dedicated history API. Past steering instructions appear in `docs['STEERING.md']`. `SteerHistory` should parse this markdown string into timestamped entries (e.g., lines matching a recognisable format, or present the raw STEERING.md content in a scrollable list). It receives `steeringDoc: string` as a prop.

**`ArtifactViewer` source:** Artifacts are currently rendered inline in `LogEntryRow`'s expanded section (lines 1725–1813 of AppView.tsx) as an icon + filename list with lightbox/comparison triggers. `ArtifactViewer` wraps this artifact list within a single `ManifestPayload`. It receives `artifacts: ManifestPayload` and callbacks for `onLightbox` and `onCompare`.

**`IterationProgress` source:** The progress bar is in the `Header` component (lines 1116–1120 of AppView.tsx) — `<Progress value={progressPercent}>` driven by `tasksCompleted/tasksTotal` from `parseTodoProgress()`. Extract this as a standalone component accepting `completed: number`, `total: number`, `phaseColor?: string`.

**`CycleIndicator` source:** There is no existing cycle-step visual; `currentPhase` is shown only as a text badge (`PhaseBadge`). `CycleIndicator` is a new visual component that highlights the active step in the pipeline sequence (e.g., plan → build → review). It receives `currentPhase: string` and `phases: string[]` as props.

## Scope

### New shared modules (must create)
- **`src/types.ts`** — Export `ProviderHealth`, `ArtifactEntry`, `ManifestPayload` interfaces (moved from AppView.tsx)
- **`src/lib/format.ts`** — Export `deriveProviderHealth()`, `formatTokenCount()`, `findBaselineIterations()`, `artifactUrl()`, `isImageArtifact()`, `IMAGE_EXT` (moved from AppView.tsx)
- **`src/hooks/useSteering.ts`** — `useSteering()` hook: manages `instruction` state, `submitting` state, `send()` function (calls `POST /api/steer`)

### Health components (`src/components/health/`)
- **`HealthIndicator.tsx`** — Single provider row: status icon (green/orange/red/grey), name, status label, cooldown countdown, last-seen timestamp. Extracts the `<div>` per-provider row from `HealthPanel` in AppView.tsx (lines 1402–1433).
- **`ProviderHealth.tsx`** — List of `HealthIndicator` rows inside a `ScrollArea`. Replaces `HealthPanel()` in AppView.tsx. Imports `ProviderHealth` type from `src/types.ts` and `deriveProviderHealth` from `src/lib/format.ts`.

### Progress components (`src/components/progress/`)
- **`IterationProgress.tsx`** — Progress bar: `completed/total` todos as a Radix `Progress` primitive + percentage label. Replaces the inline progress bar in `Header`. Props: `completed: number`, `total: number`, `phaseColor?: string`.
- **`CycleIndicator.tsx`** — Step-indicator: highlights active phase in an ordered phase list. Props: `currentPhase: string`, `phases: string[]`. New visual only — no API calls.
- `CostDisplay.tsx` — **already implemented**, no changes needed.

### Steering components (`src/components/steering/`)
- **`SteerInput.tsx`** — Textarea + Send button (Enter to submit). Consumes `useSteering` hook internally. No stop/resume buttons (those stay in `Footer`).
- **`SteerHistory.tsx`** — Scrollable list of past steering entries parsed from `steeringDoc: string` prop (STEERING.md content). Shows each entry with timestamp if parseable, otherwise renders the raw markdown.

### Artifact components (`src/components/artifacts/`)
- **`ArtifactViewer.tsx`** — Renders the artifact list for a single `ManifestPayload`: icon per artifact, click handlers for lightbox (`onLightbox`) and comparison (`onCompare`). Extracts from `LogEntryRow`'s artifact section. Props: `artifacts: ManifestPayload`, `allManifests: ManifestPayload[]`, `onLightbox: (src: string) => void`, `onCompare: (artifact: ArtifactEntry, iteration: number) => void`.
- **`ComparisonWidget.tsx`** — Full-screen comparison overlay (side-by-side / slider / diff-overlay modes). Extracts `ArtifactComparisonDialog()` from AppView.tsx (lines 1855–2067). Props unchanged.

### Update `AppView.tsx`
- Replace `HealthPanel()` with `<ProviderHealth>` import.
- Replace inline progress bar in `Header` with `<IterationProgress>`.
- Replace `Footer`'s inline textarea/send with `<SteerInput>`.
- Replace `ArtifactComparisonDialog()` with `<ComparisonWidget>`.
- Replace artifact list in `LogEntryRow` with `<ArtifactViewer>`.
- Update all type imports to come from `src/types.ts`.
- Update all utility imports to come from `src/lib/format.ts`.
- Remove moved declarations from AppView.tsx; keep only what remains unique to AppView.

## Out of Scope

- `src/components/ui/**` — shadcn primitives; must not be modified (rule 18: respect file ownership).
- `loop.sh` / `loop.ps1` — dumb runners; no UI changes touch them (rule 1).
- `src/hooks/useCost.ts`, `src/hooks/useLongPress.ts`, `src/hooks/useIsTouchDevice.ts` — unrelated hooks; do not modify (rule 12: one issue, one concern).
- `src/components/progress/CostDisplay.tsx` — already implemented and tested; do not modify unless strictly required to fix an import path.
- `aloop/cli/dashboard/src/lib/parseTodoProgress.ts` — upstream of `IterationProgress` data; do not modify (rule 20: flag, don't fix, out-of-scope issues).
- Backend / server files — host-side only (rule 2).

## Constraints

- **Rule 7 (< 150 LOC):** Every new file must stay under 150 lines. If a component nears this limit during implementation, split it further.
- **Rule 8 (separation of concerns):** `HealthIndicator` owns one provider row; `ProviderHealth` owns the list. `SteerInput` owns the textarea + send; `Footer` continues to own stop/resume buttons. Do not collapse these.
- **Rule 11 (test everything):** Each new component needs at least a render test. `useSteering` hook needs a test for send + error path. `src/lib/format.ts` exports need unit tests (or confirm existing `deriveProviderHealth` coverage transfers).
- **Rule 13 (no dead code):** After moving types and utilities to `src/types.ts` and `src/lib/format.ts`, remove the original declarations from AppView.tsx.
- **Rule 14 (no fabricated data):** `CycleIndicator` must derive phase order from runtime data or a passed-in `phases` prop — do not hardcode `['plan', 'build', 'review']` in the component.
- **Rule 15 (no hardcoded values):** Cooldown countdown logic in `HealthIndicator` must not hardcode refresh intervals; use derived values from props.
- **Circular imports:** New components must NOT import from `AppView.tsx`. All shared types and helpers must be in `src/types.ts` or `src/lib/format.ts` first.

## Acceptance Criteria

- [ ] `src/types.ts` exists and exports `ProviderHealth`, `ArtifactEntry`, `ManifestPayload`; AppView.tsx no longer defines these interfaces locally.
- [ ] `src/lib/format.ts` exists and exports `deriveProviderHealth`, `formatTokenCount`, `findBaselineIterations`, `artifactUrl`, `isImageArtifact`; AppView.tsx no longer defines these functions locally.
- [ ] `src/hooks/useSteering.ts` exists; `steerInstruction` state and `handleSteer` are removed from the root `Dashboard` component.
- [ ] `HealthIndicator.tsx` renders status icon (green for healthy, orange for cooldown, red for failed, grey for unknown) — verified by test.
- [ ] `ProviderHealth.tsx` renders an empty-state message when `providers` array is empty.
- [ ] `IterationProgress.tsx` renders a `<Progress>` element with correct `value` and a `{percent}%` text label.
- [ ] `CycleIndicator.tsx` highlights the active phase given `currentPhase` prop — verified by test.
- [ ] `SteerInput.tsx` submits on Enter keypress and disables the Send button while `submitting`.
- [ ] `SteerHistory.tsx` renders without crashing when `steeringDoc` is an empty string.
- [ ] `ArtifactViewer.tsx` calls `onLightbox` for image artifacts and `onCompare` when a baseline exists.
- [ ] `ComparisonWidget.tsx` renders all three mode tabs (side-by-side, slider, diff-overlay) and closes on Escape.
- [ ] `AppView.tsx` imports the new components; the moved types/functions no longer appear as local declarations.
- [ ] Each new `.tsx` file is < 150 LOC.
- [ ] `npm run type-check` passes with zero errors.
- [ ] All existing tests pass (`npm test`).

## Files

### Create
- `aloop/cli/dashboard/src/types.ts`
- `aloop/cli/dashboard/src/lib/format.ts`
- `aloop/cli/dashboard/src/hooks/useSteering.ts`
- `aloop/cli/dashboard/src/components/health/HealthIndicator.tsx`
- `aloop/cli/dashboard/src/components/health/ProviderHealth.tsx`
- `aloop/cli/dashboard/src/components/progress/IterationProgress.tsx`
- `aloop/cli/dashboard/src/components/progress/CycleIndicator.tsx`
- `aloop/cli/dashboard/src/components/steering/SteerInput.tsx`
- `aloop/cli/dashboard/src/components/steering/SteerHistory.tsx`
- `aloop/cli/dashboard/src/components/artifacts/ArtifactViewer.tsx`
- `aloop/cli/dashboard/src/components/artifacts/ComparisonWidget.tsx`
- Test files colocated with each new component/hook

### Modify
- `aloop/cli/dashboard/src/AppView.tsx` — replace inline components, remove moved type/function declarations

### Already done (do not recreate)
- `aloop/cli/dashboard/src/components/progress/CostDisplay.tsx` ✓
- `aloop/cli/dashboard/src/components/progress/CostDisplay.test.tsx` ✓

## Aloop Metadata
- Parent Epic: #29
- Labels: `aloop/sub-issue`

**Wave:** 1
**Dependencies:** none
