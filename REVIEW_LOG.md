# Review Log

## Review — 2026-04-14 17:35 — commit 553d9449..234ecc41

**Verdict: FAIL** (4 findings → written to TODO.md as [review] tasks)
**Scope:** `src/components/layout/Header.tsx`, `src/components/layout/Footer.tsx`, `src/components/layout/DocsPanel.tsx`, `src/components/layout/DocsPanel.test.tsx`, `src/lib/log.ts`, `src/lib/ansi.ts`, `src/lib/formatters.ts`, `src/App.coverage.test.ts`, `TODO.md`

**Build summary:** Header, Footer, DocsPanel components extracted from AppView.tsx; utility functions extracted to lib/; QA found and fixed 3 test failures and 5 type errors. All 243 tests pass, type-check clean.

**Gate 5 — PASS:** `vitest run` → 23 test files, 243 tests, all pass. `tsc --noEmit` → clean.
**Gate 8 — PASS:** react 18.3.1, tailwindcss 3.4.14, typescript 5.6.3, vitest 4.1.0 all match VERSIONS.md.
**Gate 9 — PASS:** No user-facing docs changed; internal refactoring only.
**Gate 1 — PASS (partial):** Extracted Footer, Header, DocsPanel match spec. Remaining extractions (AppShell, MainPanel, hooks, Sidebar, ActivityPanel) correctly tracked in "Up Next".

- **Gate 3 FAIL:** `DocsPanel.tsx` is a new module requiring ≥90% branch coverage. `DocContent` wide-mode layout path (lines 126–137) untested. `HealthPanel` cooldown/failed/unknown status branches untested — only 'healthy' covered. Wrote `[review]` task.

- **Gate 4 FAIL:** `lib/log.ts` is 381 LOC. Created in this build (commit 8df30426). Violates spec acceptance criterion #2 ("no source file >200 LOC excl. ui/") and Constitution Rule 7. QA agent caught DocsPanel.tsx at 204 LOC and Header.tsx at 385 LOC but missed log.ts. Wrote `[review]` task.

- **Gate 4 FAIL (minor):** `HealthPanel` in `DocsPanel.tsx` duplicates the cooldown-remaining IIFE at lines ~179 and ~195. Extract to `remainingSecs` variable. Wrote `[review]` task.

- **Gate 7 FAIL:** Header, Footer, DocsPanel are layout components. No Playwright browser verification was run. Spec says "Dashboard renders identically before and after refactor." Gate 7 is a mandatory fail without browser evidence. Wrote `[review]` task.

## Review — 2026-04-14 17:48 — commit 015e65b6..3aabbd0c

**Verdict: FAIL** (3 prior findings unresolved; 1 prior finding resolved)
**Scope:** `src/components/layout/DocsPanel.test.tsx` (new branch coverage tests)

**Build summary:** Commit 70094e0f added 8 new tests to DocsPanel.test.tsx covering DocContent wide mode and all HealthPanel status branches. All 250 tests pass (7 more than prior review due to new tests), type-check clean.

**Gate 5 — PASS:** `vitest run` → 23 test files, 250 tests, all pass. `tsc --noEmit` → clean.
**Gate 8 — PASS:** No dependency changes in this iteration.
**Gate 9 — PASS:** No user-facing docs changed.

- **Gate 3 — PASS (resolved):** DocsPanel branch coverage gaps closed. New tests cover: `DocContent` with `wide=true` + SPEC file (sticky sidebar layout path), `DocContent` with `wide=true` + non-SPEC file (no TOC path), `HealthPanel` cooldown with future `cooldownUntil` (time-remaining display), cooldown with past `cooldownUntil` (ending… label), `status='failed'`, `status='unknown'`. All 15 DocsPanel tests pass.

- **Gate 4 FAIL (persists):** `lib/log.ts` is 381 LOC — unchanged since prior review. Spec acceptance criterion #2 and Constitution Rule 7 require ≤200 LOC. Split into `log-types.ts`, `log-parse.ts`, `log-session.ts` as directed in TODO.md.

- **Gate 4 FAIL (persists):** Duplicate cooldown IIFE in `DocsPanel.tsx` — unchanged. `Math.max(0, Math.floor((new Date(p.cooldownUntil).getTime() - Date.now()) / 1000))` appears at line 179 and again inline at line 195. Extract to `remainingSecs` variable before the JSX return.

- **Gate 7 FAIL (persists):** No Playwright/browser verification performed. Spec acceptance criterion: "Dashboard renders identically before and after refactor." Gate 7 is a mandatory fail without browser evidence for layout extractions (Header, Footer, DocsPanel).

**Carried defects (not new this iteration):** `DocsPanel.tsx` 204 LOC (QA P1 open), `Header.tsx` 385 LOC (Up Next task).

## Review — 2026-04-14 17:58 — commit d9498aa3

**Verdict: FAIL** (2 prior findings unresolved; 2 prior findings resolved)
**Scope:** `src/components/layout/DocsPanel.tsx` (IIFE fix + LOC trim to 199)

**Build summary:** Commit d9498aa3 extracted duplicate cooldown IIFE to `remainingSecs` variable and trimmed DocsPanel.tsx to 199 LOC. All 250 tests pass, type-check clean.

**Gate 5 — PASS:** `vitest run` → 23 test files, 250 tests, all pass. `tsc --noEmit` → clean.

- **Gate 4 (DocsPanel IIFE) — PASS (resolved):** `remainingSecs` computed once at line 164, reused at lines 177 and 189. Duplicate IIFE eliminated. `DocsPanel.tsx` is 199 LOC — within ≤200 limit. Both QA P1 tasks (IIFE and LOC trim) are closed.

- **Gate 4 (log.ts LOC) — FAIL (persists):** `src/lib/log.ts` is 381 LOC — unchanged since commit 8df30426. Violates spec criterion #2 and Constitution Rule 7. Must split into `log-types.ts`, `log-parse.ts`, `log-session.ts` per TODO.md.

- **Gate 7 — FAIL (persists):** No Playwright/browser verification performed. Spec acceptance criterion: "Dashboard renders identically before and after refactor." Gate 7 is a mandatory fail without browser evidence for layout extractions (Header, Footer, DocsPanel).

---
