# Review Log

## Review — 2026-03-30 — commits 92c3928d1..6c905ff21

**Verdict: FAIL** (2 findings → written to TODO.md as [review] tasks)
**Scope:** `DocsPanel.test.tsx`, `MainPanel.test.tsx`, `e2e/story-screenshots.spec.ts`, `playwright.stories.config.ts`, `proof-artifacts/*.png`

### Prior findings resolved

All 3 prior review tasks (commit 2ee29f8f1) are resolved:
- ✓ `MainPanel.test.tsx:82-84` — collapse button now clicked via `getByLabelText('Collapse activity panel')`, asserts `setActivityCollapsed(true)` — concrete value
- ✓ `DocsPanel.test.tsx:55-58` — `userEvent.click` + `data-state="active"` assertion on clicked tab — specific and behavioral
- ✓ `DocsPanel.test.tsx:75-78` — health tab clicked by accessible name, `data-state="active"` asserted after click — correct
- ✓ Gate 6 screenshots: 23 story screenshots captured by Playwright at 1280×720, committed to `proof-artifacts/`

### Findings

**Gate 3: DocsPanel.tsx 85.71% branch coverage (< 90%)** — The test fixes improved assertion depth but did not add the missing test for the `useEffect` reset branch at line 37 (`setActiveTab(defaultTab)` when `activeTab` becomes invalid after re-render). The QA log at commit 538bfeb42 confirms 85.71% unchanged. Escalated to `[review]` priority.

**Gate 4: `playwright.stories.config.ts:6`** — `const artifactDir = path.resolve(currentDir, '..', '..', '..')` is defined but never referenced in the `defineConfig` export. The actual artifact path is computed inside `story-screenshots.spec.ts`. This unused variable is dead code (Constitution rule 13).

### Gate 7 observation

Layout screenshots verified visually:
- `mainpanel-default.png`: Documents (left) + Activity (right) side-by-side at correct Y alignment ✓
- `mainpanel-activitycollapsed.png`: Activity collapses to thin vertical strip, Documents expands to full width ✓
- `docspanel-emptydocs.png`: Empty docs → Health tab rendered as sole tab with "No provider data yet." ✓
- `sidebar-collapsed.png`: Sidebar collapses to icon strip (expand icon + status dots) ✓

---

## Review — 2026-03-30 — commits 827043500..67fa4d5a3

**Verdict: FAIL** (2 findings → written to TODO.md as [review] tasks)
**Scope:** `DocsPanel.test.tsx`, `playwright.stories.config.ts`

### Prior findings resolved

- ✓ Gate 3: DocsPanel.tsx `useEffect` reset branch now covered — `resets activeTab to defaultTab when active tab is removed from docs` (lines 103-124) rerenders with TODO.md removed and asserts SPEC tab becomes active via `data-state`. 95.23% branch coverage confirmed by QA.
- ✗ Gate 4: `playwright.stories.config.ts` — `artifactDir` was deleted but renamed to `currentDir`; dead code persists.

### Findings

**Gate 2: `DocsPanel.test.tsx:145-160`** — `switches to overflow tab via dropdown menu` performs the interaction (clicks overflow button, waits for EXTRA menuitem, clicks EXTRA) but has no post-click assertion. The tab switch is entirely unverified. A broken `onSelect` handler would not cause this test to fail.

**Gate 4: `playwright.stories.config.ts:1-2,5`** — The prior Gate 4 fix renamed `artifactDir` to `currentDir` without deleting it. All three lines remain dead code: `import path from 'node:path'` (line 1), `import { fileURLToPath } from 'node:url'` (line 2), and `const currentDir = path.dirname(fileURLToPath(import.meta.url))` (line 5). None are referenced in `defineConfig`. Violates Constitution rule 13. QA log at iter 59 independently confirms this.

---

## Review — 2026-03-30 — commits 4187d269c..13d5ec377

**Verdict: FAIL** (1 finding → written to TODO.md as [review] task)
**Scope:** `DocsPanel.test.tsx`, `playwright.stories.config.ts`, `Sidebar.test.tsx`

### Prior findings resolved

- ✓ Gate 2: `DocsPanel.test.tsx:145-160` — overflow tab now asserted via `waitFor(() => expect(screen.getByRole('tabpanel')).toHaveTextContent('Extra content'))` — behavioral and concrete ✓
- ✓ Gate 4: `playwright.stories.config.ts:1-2,5` — all dead imports (`path`, `fileURLToPath`, `currentDir`) removed; only `defineConfig` import remains ✓
- ✓ Gate 3 (QA-backed): Sidebar.tsx coverage raised from 78.46% to 95.38% by 24 new tests; context menu position, stop/kill/copy actions, Escape dismiss, older sessions toggle, cost fetch URL assertion, collapsed dot clicks all have concrete behavioral assertions ✓

### Findings

**Gate 2: `Sidebar.test.tsx` — 4 cost API branch tests are shallow** — `handles cost API returning opencode_unavailable error`, `handles cost API returning string total_usd`, `handles cost API returning non-number non-string total_usd`, and `handles cost API fetch rejection` all terminate with `expect(mockFetch).toHaveBeenCalled()`. This assertion is identical regardless of which branch runs — a broken `setCostUnavailable(true)` call or a removed `parseFloat` would not cause any of these tests to fail. SessionCard renders "Cost: unavailable" (line 91) and `$X.XXXX` (lines 78/92) based on these state values. After expanding the "Older" collapsible, these rendered values are assertable. 1 `[review]` task written to TODO.md.

---

## Review — 2026-03-30 — commits 13d5ec377..43467a137

**Verdict: FAIL** (6 findings → written to TODO.md as [review] tasks)
**Scope:** `Sidebar.test.tsx`, `Header.tsx`, `Header.test.tsx`, `Header.stories.tsx`, `AppView.tsx`

### Prior findings resolved

- ✓ Gate 2: `Sidebar.test.tsx` cost API branch tests now assert rendered output — `opencode_unavailable` → tooltip `'Cost: unavailable'`; string `'2.50'` → `$2.5000` in card; `null` and rejection → tooltip without `'Cost:'`. All 4 tests open "Older" section and click session cards; assertions are concrete and behavioral.

### Findings

**Gate 2: `Header.test.tsx:94-97`** — `renders connection indicator` only asserts that `data-testid="session-header-grid"` (outer container div) is in the document. A broken `<ConnectionIndicator />` would not fail this test. Existence check anti-pattern.

**Gate 2: `Header.test.tsx:135-139`** — `renders elapsed timer when startedAt is provided` asserts `expect(screen.getAllByText(/\d/).length).toBeGreaterThan(0)`. This matches any digit anywhere on the page (iteration counter, progress %, timestamps). ElapsedTimer could be completely absent and this test still passes. Truthy/existence anti-pattern.

**Gate 2: `Header.test.tsx:141-149`** — `renders session cost in hover card` hovers over the iter span and asserts `'Session cost:'` label exists but never checks the rendered dollar value. `sessionCost: 2.5` should produce `$2.5000` in the hover card — the `toFixed(4)` formatting is completely unverified.

**Gate 3: `Header.tsx` branch coverage 87.61%** — below the ≥90% threshold for new modules. Uncovered branches: line 130 (non-string `f.status` → `'UNTESTED'` fallback in `parseQACoveragePayload`), line 211 (`stuckCount > 0` conditional class), line 227 (`avgDuration && sessionCost > 0` separator), line 275 (empty `updatedAt` while not loading).

**Gate 4: `Header.tsx:14`** — `str` imported from `@/lib/activityLogHelpers` but never referenced in the file. Dead import (Constitution rule 13).

**Gate 4: `Header.test.tsx:8-10`** — `vi.mock('@/hooks/useCost', ...)` mocks a hook that Header.tsx does not use (all cost values arrive as props). Dead mock.

### Gate 6 note

Header.stories.tsx adds 7 stories; none are in `e2e/story-screenshots.spec.ts` and no proof screenshots were committed. Already tracked as `[qa/P1]` in TODO.md. QA confirmed 6/7 stories render correctly.

---

## Review — 2026-03-30 — commits 58ce14427..e57f2e15d

**Verdict: FAIL** (0 new tasks — Gate 3 task already in TODO.md)
**Scope:** `Header.test.tsx`, `Header.tsx`

### Prior findings resolved

- ✓ Gate 2: `Header.test.tsx:92` — `renders connection indicator` now asserts `getByText('Live')`; `ConnectionIndicator` renders the literal text "Live" for 'connected' status (confirmed `StatusDot.tsx:44`) — concrete behavioral check
- ✓ Gate 2: `Header.test.tsx:134` — `renders elapsed timer` now filters `getAllByText(/\d+s/)` for elements matching `/^\d+[smh](\s\d+s)?$/`; a broken/absent ElapsedTimer would not produce this pattern — meaningful improvement (minor flakiness risk if elapsed lands exactly on a minute boundary, but not a false-positive risk)
- ✓ Gate 2: `Header.test.tsx:145` — `renders session cost in hover card` now asserts `getByText('$2.5000')` — verifies `toFixed(4)` formatting concretely
- ✓ Gate 4: `Header.tsx` — dead `str` import removed; `isRecord` is the only import from `activityLogHelpers` and is used in `parseQACoveragePayload`
- ✓ Gate 4: `Header.test.tsx` — dead `vi.mock('@/hooks/useCost', ...)` removed; Header.tsx takes cost as props, never imported this hook

### Findings

**Gate 3: `Header.tsx` branch coverage 87.61% (persists)** — No new branch coverage tests were added in this iteration. The test-strengthening commits improved assertion depth on existing tests only. Coverage report from QA (commit 55caec1a1) confirms unchanged at 87.61%. Uncovered branches remain: line 43 (`f.status` non-string → `'UNTESTED'`), line 211 (`stuckCount > 0` red class), line 227 (`avgDuration && sessionCost > 0` separator), line 275 (empty `updatedAt` while not loading). Task already in TODO.md as `[ ] [review] Gate 3`.

---

## Review — 2026-03-30 — commits c59f2d417..879e90588

**Verdict: FAIL** (1 finding → written to TODO.md as [review] task)
**Scope:** `Header.test.tsx`, `e2e/story-screenshots.spec.ts`

### Prior findings resolved

- ✓ Gate 3: `Header.tsx` branch coverage raised from 87.61% to 90.26% — 4 new tests added:
  - `shows stuck count with red styling when stuckCount > 0` — hovers iter span, asserts `getByText('3').toHaveClass('text-red-500')` — concrete class assertion
  - `renders stats span without separator when sessionCost is 0` — asserts exact text `'~2m 30s/iter'` with no separator — covers line 227 false branch
  - `renders empty updated-at when not loading and updatedAt is empty` — asserts `toHaveTextContent('')` via testid — covers line 275 falsy `updatedAt` branch
  - `uses UNTESTED status when feature status is not a string` — clicks expanded badge, asserts `'UNTESTED'` text — covers line 43 non-string status branch; concrete and behavioral
- ✓ Gate 2: All 4 new tests have specific, concrete value assertions — no toBeDefined/truthy anti-patterns

### Findings

**Gate 5: `e2e/story-screenshots.spec.ts:53`** — `{ id: 'layout-header--qa-badge-default', file: 'header-qabadgedefault.png' }` was added to the stories array knowing the story renders an empty `#storybook-root`. The spec asserts `await expect(storyRoot).not.toBeEmpty({ timeout: 15_000 })`, which times out for this story. QA iter 63 confirms: 29/30 Playwright tests pass, test 30 (`screenshot: header-qabadgedefault.png`) fails. The e2e suite now reports a persistent FAIL on every run. Adding a known-broken story to the spec without a `test.skip` guard embeds a CI failure. 1 `[review]` task written to TODO.md.

---
