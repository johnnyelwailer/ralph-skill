# Sub-Spec: Issue #153 — Extract shared UI components from AppView.tsx

## Objective

Extract small, reusable UI components from `AppView.tsx` into `src/components/shared/`. `AppView.tsx` is 2525 LOC — far beyond the 150 LOC limit (Constitution rule 7). Extracting these components is a prerequisite for further decomposition of that file.

## Architectural Context

`AppView.tsx` is the monolithic UI entry point (~2525 lines). It defines all types, helpers, config maps, and UI components inline. `App.tsx` is a thin re-export shim that proxies exports from `AppView.tsx` — its public API must not break.

**Existing components** (already defined inline in `AppView.tsx`, to be moved):
- `PhaseBadge` (line 437) — depends on `phaseColors` map (lines 415–420)
- `StatusDot` (line 454) — depends on `STATUS_DOT_CONFIG` (line 444), uses `Tooltip` from `@/components/ui/tooltip`
- `ConnectionIndicator` (line 477) — uses `Tooltip`, lucide icons (`Zap`, `Loader2`, `AlertTriangle`)
- `ElapsedTimer` (line 496) — depends on `formatSecs()` exported from `AppView.tsx`
- `ImageLightbox` (line 1829) — self-contained overlay with keyboard handler
- `CommandPalette` (line 2134) — depends on `StatusDot` and `PhaseBadge` (both being extracted), uses `SessionSummary` type from AppView

**New components** (no existing React component — rendering logic is inline at call sites):
- `AnsiRenderer` — wraps `renderAnsiToHtml()`. **Critical**: `renderAnsiToHtml`, `parseAnsiSegments`, `rgbStr`, `PALETTE_256`, and `stripAnsi` are currently all defined in `AppView.tsx` (lines 29–150), NOT in `lib/ansi.ts` (that file does not exist). The implementation must create `src/lib/ansi.ts` to hold this logic, then `AnsiRenderer.tsx` imports from it. AppView.tsx must continue to re-export these symbols to avoid breaking `App.tsx` and `App.test.tsx`.
- `MarkdownRenderer` — thin wrapper around `marked.parse()`, handles sanitization. No existing React component for it; `marked` is already a dependency.

**Dependency graph for the new components**:
```
AnsiRenderer       → src/lib/ansi.ts (new), react
MarkdownRenderer   → marked
ElapsedTimer       → formatSecs (imported from AppView.tsx or moved to a shared util)
StatusDot          → STATUS_DOT_CONFIG (move with component), @/components/ui/tooltip
PhaseBadge         → phaseColors map (move with component)
ConnectionIndicator→ @/components/ui/tooltip, lucide-react
ImageLightbox      → (self-contained)
CommandPalette     → StatusDot, PhaseBadge (both from shared/), SessionSummary type, cmdk, lucide-react
```

**Types**: `SessionSummary` and `ConnectionStatus` are defined in AppView.tsx and used by CommandPalette/ConnectionIndicator. These types must remain in AppView.tsx (or be extracted to a types file — not in scope for this issue). New components import from `../../AppView` or `../..AppView` as needed.

## Scope

### Create `src/lib/ansi.ts`
Extract all ANSI logic from AppView.tsx (lines 29–150): `STRIP_ANSI_RE`, `stripAnsi`, `PALETTE_256`, `rgbStr`, `AnsiStyle`, `parseAnsiSegments`, `renderAnsiToHtml`. Export all of them.

### Create components under `src/components/shared/`

- **`AnsiRenderer.tsx`** — `<AnsiRenderer text={string} gfm? breaks? />` — renders ANSI+markdown using `renderAnsiToHtml()` from `../../lib/ansi`. Sets `dangerouslySetInnerHTML`.
- **`MarkdownRenderer.tsx`** — `<MarkdownRenderer content={string} />` — renders markdown via `marked.parse()`. Sets `dangerouslySetInnerHTML`.
- **`ElapsedTimer.tsx`** — `<ElapsedTimer since={string} />` — live-updating elapsed display (1s interval). Imports `formatSecs` from AppView.tsx.
- **`CommandPalette.tsx`** — `<CommandPalette open onClose sessions onSelectSession onStop />` — Ctrl+K overlay using `cmdk`. Imports `StatusDot` and `PhaseBadge` from this same `shared/` directory.
- **`StatusDot.tsx`** — `<StatusDot status onClose? className? />` — colored status dot with tooltip. Move `STATUS_DOT_CONFIG` into this file.
- **`PhaseBadge.tsx`** — `<PhaseBadge phase small? />` — phase badge with colors. Move `phaseColors` map into this file.
- **`ConnectionIndicator.tsx`** — `<ConnectionIndicator status />` — SSE status icon+label with tooltip.
- **`ImageLightbox.tsx`** — `<ImageLightbox src alt onClose />` — fullscreen overlay, Escape to close.

### Update `AppView.tsx`
- Remove inline definitions of all 8 components above (and of `STATUS_DOT_CONFIG`, `phaseColors`).
- Add imports from `@/components/shared/` for each extracted component.
- Extract ANSI logic into `src/lib/ansi.ts`; in AppView.tsx replace with re-exports: `export { stripAnsi, rgbStr, parseAnsiSegments, renderAnsiToHtml } from './lib/ansi'` — these symbols are re-exported in `App.tsx` and tested in `App.test.tsx`.
- Do not remove or rename any currently-exported symbols from AppView.tsx.

## Out of Scope

- **`App.tsx`** — must NOT be modified. It is a stable re-export shim; any needed new re-exports belong in AppView.tsx (Constitution rule 18).
- **`App.test.tsx`** — must NOT be modified. All existing imports from `./AppView` must continue to resolve (Constitution rule 18).
- **`src/components/ui/*`** — shadcn/ui primitives; do not touch (Constitution rule 18).
- **Other AppView.tsx components** (`Sidebar`, `ActivityPanel`, `HealthPanel`, `App`, `Header`, `Footer`, `DocsPanel`, `LogEntryRow`, `ArtifactComparisonDialog`, `QACoverageBadge`) — decomposition of these is future work, not in scope (Constitution rule 12).
- **Helper functions** (`formatSecs`, `formatTime`, `parseLogLine`, etc.) — do not move these out of AppView.tsx in this issue (Constitution rules 12, 19).

## Constraints

- **Constitution rule 7**: Each new file must be <150 LOC.
- **Constitution rule 8**: Components accept props only — no internal data fetching, no API calls.
- **Constitution rule 12**: One concern per issue. Do not decompose AppView.tsx further than listed here.
- **Constitution rule 13**: No dead code or unused imports after refactor.
- **Constitution rule 19**: Do not add features, configurability, or extra props beyond what the inline originals had.
- **Public export surface**: `App.tsx` re-exports `stripAnsi`, `rgbStr`, `parseAnsiSegments`, `renderAnsiToHtml` and others from AppView.tsx. These must continue to be exported from AppView.tsx after the refactor (via re-export from `./lib/ansi`).
- **`lucide-react`** is already installed — use it for icons. No inline SVGs.
- **`cmdk`** is already installed — `CommandPalette` must use it.
- **`marked`** is already installed — `MarkdownRenderer` must use it.
- Do not use Tailwind classes that are not already present in the codebase.

## Acceptance Criteria

- [ ] `src/lib/ansi.ts` exists and exports: `stripAnsi`, `rgbStr`, `AnsiStyle`, `parseAnsiSegments`, `renderAnsiToHtml`
- [ ] Each of the 8 `src/components/shared/*.tsx` files exists and is <150 LOC
- [ ] Each shared component accepts only props (no `fetch`, no `useState` over remote data, no direct API calls) — exception: `ElapsedTimer` may use `useState`/`useEffect` for the timer
- [ ] AppView.tsx no longer contains the inline definitions of the 8 extracted components or `STATUS_DOT_CONFIG` / `phaseColors` (verified by `grep`)
- [ ] AppView.tsx still exports: `stripAnsi`, `rgbStr`, `parseAnsiSegments`, `renderAnsiToHtml` (re-exported from `./lib/ansi`)
- [ ] `App.tsx` is unchanged
- [ ] `npm run type-check` passes with zero errors
- [ ] All existing tests pass (`npm run test`)
- [ ] No inline SVGs introduced — lucide-react icons only

## Files

**Create:**
- `aloop/cli/dashboard/src/lib/ansi.ts`
- `aloop/cli/dashboard/src/components/shared/AnsiRenderer.tsx`
- `aloop/cli/dashboard/src/components/shared/MarkdownRenderer.tsx`
- `aloop/cli/dashboard/src/components/shared/ElapsedTimer.tsx`
- `aloop/cli/dashboard/src/components/shared/CommandPalette.tsx`
- `aloop/cli/dashboard/src/components/shared/StatusDot.tsx`
- `aloop/cli/dashboard/src/components/shared/PhaseBadge.tsx`
- `aloop/cli/dashboard/src/components/shared/ConnectionIndicator.tsx`
- `aloop/cli/dashboard/src/components/shared/ImageLightbox.tsx`

**Modify:**
- `aloop/cli/dashboard/src/AppView.tsx`

**Do NOT modify:**
- `aloop/cli/dashboard/src/App.tsx`
- `aloop/cli/dashboard/src/App.test.tsx`
- `aloop/cli/dashboard/src/components/ui/*`

## Aloop Metadata
- Parent Epic: #29
- Labels: `aloop/sub-issue`, `aloop/needs-refine`

**Wave:** 1
**Dependencies:** none
