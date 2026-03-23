# Sub-Spec: Issue #152 — Extract custom React hooks from AppView.tsx

## Objective

Extract SSE connection, session state, and steering logic from `AppView.tsx` into dedicated custom hooks under `src/hooks/`. This reduces the `App` component (~350 LOC of hook logic inline) to pure wiring, and makes each concern independently testable.

## Architectural Context

`AppView.tsx` is the monolithic dashboard view (~2525 LOC). The `App` export at the bottom contains all runtime state: SSE lifecycle, session selection, steer/stop/resume API calls, and UI-level state (sidebar, command palette). The hooks layer (`src/hooks/`) already exists with `useCost`, `useLongPress`, and `useIsTouchDevice` as precedents for the pattern.

Key structural facts:
- `DashboardState`, `SessionSummary`, and related types are defined in `AppView.tsx`. The new hooks import these types from `AppView.tsx` (no separate types file needed for this issue).
- `latestQaCoverageRefreshSignal` is a private helper in `AppView.tsx` called inside the SSE handler to derive a QA refresh key. `useSSE` must accept an `onStateUpdate` callback so the `App` component can continue calling this function and updating `qaCoverageRefreshKey`.
- Theme detection is **not** in `AppView.tsx` — it is handled by an inline script in `index.html` that sets `document.documentElement.classList` before first paint to avoid FOUC. There is no theme state or toggle in the current React tree.

## Scope

### Create `src/hooks/useSSE.ts`
- Extract the `useEffect` block at ~line 2230 from `App`
- Parameters: `selectedSessionId: string | null`, `onStateUpdate: (state: DashboardState) => void`
- Handles `/events` EventSource connection with exponential backoff reconnect (1s → max 30s)
- Listens to `state` and `heartbeat` SSE event types
- Fetches `/api/state` for initial load (using AbortController)
- Returns `{ connectionStatus: ConnectionStatus, loading: boolean, loadError: string | null }`
- The `onStateUpdate` callback is called for both the initial fetch and SSE `state` events — the `App` component uses it to update `state` and derive `qaCoverageRefreshKey`

### Create `src/hooks/useSession.ts`
- Extract `selectedSessionId` state, `selectSession` callback (~line 2218), and `sessions` useMemo (~line 2308) from `App`
- Initialises `selectedSessionId` from `window.location.search` (existing behavior)
- `selectSession` updates URL via `window.history.replaceState` (existing behavior)
- Parameters: `state: DashboardState | null`
- Returns `{ selectedSessionId, selectSession, sessions, currentSession }`
- Active vs older session grouping logic lives entirely inside this hook (the `sessions` memo)

### Create `src/hooks/useSteering.ts`
- Extract `handleSteer`, `handleStop`, `handleStopSession`, `handleResume` from `App` (~lines 2382–2431)
- Extract the state: `steerInstruction`, `steerSubmitting`, `stopSubmitting`, `resumeSubmitting`
- POSTs to `/api/steer`, `/api/stop`, `/api/resume` (existing behavior, no changes)
- Returns `{ steerInstruction, setSteerInstruction, steerSubmitting, stopSubmitting, resumeSubmitting, handleSteer, handleStop, handleStopSession, handleResume }`
- `handleStopSession` depends on `selectSession` — accept it as a parameter or via a `onSelectSession` callback argument
- **No steering history tracking** — this does not exist in AppView.tsx and must NOT be added (Constitution rule #19: don't gold-plate)

### Do NOT create `src/hooks/useTheme.ts`
- Theme detection is handled in `index.html` via an inline script (applies `dark` class to `<html>` before React renders). There is no theme state or toggle in the React tree. Creating a `useTheme` hook would add new functionality, not extract existing logic — this violates Constitution rule #19. **Remove this deliverable from scope.**

### Update `AppView.tsx`
- Replace inline state/effects/callbacks with calls to the three new hooks
- Wire return values into the component render and child component props
- The `App` component body should shrink by ~200–250 LOC

## Out of Scope

- `index.html` — must NOT be modified (theme detection belongs outside React; Constitution rule #18)
- `aloop/cli/dashboard/src/App.tsx` — re-exports only; must NOT be modified unless a new hook export is needed
- `loop.sh` / `loop.ps1` — Constitution rule #1, no business logic
- Any files outside `aloop/cli/dashboard/src/` — Constitution rule #18
- `DashboardState` and shared type definitions — keep in `AppView.tsx`; do not create a separate types file (that is a separate refactor)
- Steering history tracking — not in current code; adding it would violate Constitution rule #19
- `useTheme` hook — not an extraction; creating it adds new functionality (Constitution rule #19)

## Constraints

- **Constitution rule #7**: Target <150 LOC per file. The issue's <200 LOC limit is acceptable as an outer bound, but each hook should aim for <150 LOC.
- **Constitution rule #8**: Each hook does exactly one thing. Do not mix concerns across hooks.
- **Constitution rule #11**: Each new hook file must have a corresponding test file (`useSSE.test.ts`, `useSession.test.ts`, `useSteering.test.ts`). Tests must exercise the hook's primary behaviors.
- **Constitution rule #12**: Only implement what the issue describes. Hooks replace existing behavior; they do not add new behaviors.
- **Constitution rule #19**: Do not add steering history, theme toggling, or any other enhancement beyond direct extraction.
- **TypeScript**: `npm run type-check` must pass after changes.
- **Existing tests must pass**: `App.test.tsx` and `App.coverage.test.ts` import from `AppView.tsx` — the exported symbols must remain unchanged.
- The `onStateUpdate` callback pattern for `useSSE` avoids coupling the hook to `latestQaCoverageRefreshSignal`, keeping the hook pure and the `App` component in control of derived state.

## Acceptance Criteria

- [ ] `src/hooks/useSSE.ts` exists, <200 LOC, handles connect/reconnect/heartbeat, calls `onStateUpdate` on initial fetch and SSE state events
- [ ] `src/hooks/useSession.ts` exists, <200 LOC, manages `selectedSessionId`, `selectSession`, and `sessions` grouping logic
- [ ] `src/hooks/useSteering.ts` exists, <200 LOC, handles steer/stop/resume API calls with loading state
- [ ] `src/hooks/useSSE.test.ts` exists and tests: initial fetch called, SSE connection opened, reconnect triggered on error, `onStateUpdate` called on state event
- [ ] `src/hooks/useSession.test.ts` exists and tests: initial session from URL, `selectSession` updates URL, `sessions` grouping from active/recent state
- [ ] `src/hooks/useSteering.test.ts` exists and tests: `handleSteer` posts to `/api/steer`, `handleStop` posts to `/api/stop`, `handleResume` posts to `/api/resume`
- [ ] `AppView.tsx` `App` component uses the three hooks instead of inline state/effects
- [ ] All existing tests in `App.test.tsx` and `App.coverage.test.ts` pass unchanged
- [ ] `npm run type-check` passes
- [ ] No `useTheme` hook is created

## Files

- `aloop/cli/dashboard/src/AppView.tsx` (modify)
- `aloop/cli/dashboard/src/hooks/useSSE.ts` (create)
- `aloop/cli/dashboard/src/hooks/useSSE.test.ts` (create)
- `aloop/cli/dashboard/src/hooks/useSession.ts` (create)
- `aloop/cli/dashboard/src/hooks/useSession.test.ts` (create)
- `aloop/cli/dashboard/src/hooks/useSteering.ts` (create)
- `aloop/cli/dashboard/src/hooks/useSteering.test.ts` (create)

## Aloop Metadata
- Parent Epic: #29
- Labels: `aloop/sub-issue`, `aloop/needs-refine`

**Wave:** 1
**Dependencies:** none
