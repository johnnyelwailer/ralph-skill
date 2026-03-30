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
