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
