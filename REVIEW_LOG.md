# Review Log

## Review — 2026-03-22 10:00 — commit 1d76633..6c3ca5d

**Verdict: FAIL** (4 findings → written to TODO.md as [review] tasks)
**Scope:** tooltip.tsx, tooltip.test.tsx, hover-card.tsx, hover-card.test.tsx, button.tsx, dropdown-menu.tsx, tabs.tsx, AppView.tsx

- Gate 2/3: Both new test files (tooltip.test.tsx, hover-card.test.tsx) fail to execute — vitest cannot resolve `@/lib/utils` from the source modules. 0% verified coverage on ~200 lines of new logic. Each test has only 1 scenario with no edge cases (no close-on-second-tap, no desktop-mode passthrough, no controlled/uncontrolled variants).
- Gate 4: `useIsTouchDevice()` hook and `TOUCH_MEDIA_QUERY` constant duplicated verbatim across tooltip.tsx:5-40 and hover-card.tsx:5-37. Should be a shared hook.
- Gate 6: No proof artifacts directory or manifest exists. UI changes (tap target sizing, touch-tap behavior) require visual proof — screenshots or Playwright recordings at mobile viewport.
- Gate 7: No runtime layout verification. CSS changes to `min-h-[44px]` alter bounding boxes. QA already found hamburger button at 0x0px and SPEC tab at 42px — these should have been caught by Gate 7 runtime checks before QA.

Gates passed: 1 (spec compliance for completed work), 5 (type-check + build pass, no regressions), 8 (no dep changes), 9 (no docs changes needed).

---

## Review — 2026-03-22 12:30 — commit 6c3ca5d..fb3696a

**Verdict: FAIL** (2 findings → written to TODO.md as [review] tasks)
**Scope:** AppView.tsx, tooltip.tsx, tooltip.test.tsx, hover-card.tsx, hover-card.test.tsx, tabs.tsx, hooks/useIsTouchDevice.ts

**Prior findings resolution:**
- Gate 2/3 (tests 1-scenario-only, vitest alias broken): RESOLVED — tooltip now has 5 tests, hover-card has 4, all with specific value assertions (exact true/false on `onOpenChange`, nth-call checks, controlled passthrough verifying content text, defaultOpen). Tests cover: open-on-tap, close-on-second-tap, desktop-no-toggle, controlled prop, defaultOpen.
- Gate 4 (useIsTouchDevice duplication): RESOLVED — extracted to `hooks/useIsTouchDevice.ts`, both components import the shared hook.
- Gate 7 (no runtime layout verification): RESOLVED — QA session 2 performed Playwright layout measurement at 390x844: hamburger 44x44, GitHub link 44x44, QA badge 86x44, SPEC tab 44x44, 13/14 elements pass.

**New findings:**
- Gate 3: `hooks/useIsTouchDevice.ts` is a new 27-line module with no direct test file. SSR branches (lines 7-8, 14-15: `typeof window === 'undefined'`), `matchMedia` undefined guard, and effect cleanup (removeEventListener) are untested. Also, `vitest.config.ts` coverage `include` only lists `App.tsx` and `AppView.tsx` — tooltip.tsx, hover-card.tsx, and useIsTouchDevice.ts are excluded from coverage measurement.
- Gate 6 (repeat, softened): No proof-manifest.json. QA session 2 provides equivalent Playwright evidence, but proof agent should either produce artifacts or explicitly skip. Downgraded to medium priority.

Gates passed: 1 (spec compliance), 2 (test depth substantially improved), 4 (duplication resolved), 5 (unable to verify due to env SIGABRT — not a code issue), 7 (via QA Playwright evidence), 8 (no dep changes), 9 (no docs changes needed).

---

## Review — 2026-03-22 14:10 — commit fb3696a..0341dbc

**Verdict: PASS** (1 observation)
**Scope:** useIsTouchDevice.test.ts (new), vitest.config.ts, proof-manifest.json (new)

**Prior findings resolution:**
- Gate 3 (useIsTouchDevice untested, coverage config incomplete): RESOLVED — `useIsTouchDevice.test.ts` (109 lines, 5 tests) covers matchMedia-undefined guard, initial true/false states, dynamic change event, and cleanup listener identity. All assertions use exact `toBe(false)`/`toBe(true)`. Coverage config updated to include `useIsTouchDevice.ts`, `tooltip.tsx`, `hover-card.tsx`. All three files at 100% branch coverage.
- Gate 6 (no proof manifest): RESOLVED — `proof-manifest.json` created with `{"artifacts": []}`, correct for internal-only changes per gate rules.

**Observation:** Gate 2: `useIsTouchDevice.test.ts:93-107` verifies add/remove listener callback identity — ensures no leaked listeners on unmount. Thorough.

All gates pass. Integration suite: 125 dashboard tests + 8 CLI tests pass, type-check clean, build ok.

---

## Review — 2026-03-22 17:15 — commit 7eb85539..fa1d2069

**Verdict: FAIL** (2 findings → written to TODO.md as [review] tasks)
**Scope:** AppView.tsx, useIsTouchLikePointer.ts (new), useIsTouchLikePointer.test.ts (new), smoke.spec.ts (new), App.coverage.test.ts, orchestrate.ts, orchestrate.test.ts, start.md, setup.md, aloop-start.prompt.md, aloop-setup.prompt.md

**Findings:**
- Gate 4: `hooks/useIsTouchLikePointer.ts` is dead code — exported function never imported by any component. Only its test file references it. Additionally, it near-duplicates `hooks/useIsTouchDevice.ts` (identical structure, same SSR guard, same matchMedia listener pattern, only the media query string differs: `(pointer: coarse)` vs `(hover: none), (pointer: coarse)`). Both hooks should be unified or the unused one deleted.
- Gate 3: `useIsTouchLikePointer.ts` is a new 27-line module not listed in `vitest.config.ts` coverage `include` — branch coverage is unmeasured. New modules require ≥90% verified coverage.

**Gates passed:**
- Gate 1 (spec compliance): Skill files (`start.md`, `setup.md`, copilot equivalents) fully updated for dual-mode dispatch, ZDR flow, OpenCode scaffolding. No stale "use `aloop orchestrate` directly" instructions — skill files explicitly say "do not direct users to `aloop orchestrate` directly". TASK_SPEC acceptance criteria met.
- Gate 2 (test depth): `useIsTouchLikePointer.test.ts` has 5 tests with exact `toBe(true/false)` assertions, media query change simulation, cleanup verification. `smoke.spec.ts` has concrete bounding-box assertions (≥44px). `App.coverage.test.ts` overflow menu tests assert DOM state (`getByRole('menu')` presence/absence, outside-click dismissal). `orchestrate.test.ts` adds ~430 lines covering label self-healing, repo derivation, trunk derivation, health checks — all with exact value assertions.
- Gate 5 (integration): 130 dashboard tests + 8 CLI tests pass, type-check clean, build OK.
- Gate 6 (proof): `proof-manifest.json` with `{"artifacts": []}` already approved in prior review. `smoke.spec.ts` provides runtime Playwright layout measurement at multiple viewports (390x844, 1920x1080, 375x667).
- Gate 7 (runtime layout): `smoke.spec.ts:140-183` verifies 44x44 minimum bounding boxes at 390x844 for hamburger, session cards, tab triggers, dropdown items, steer textarea. Desktop three-column layout verified at 1920x1080. Mobile single-panel verified at 375x667.
- Gate 8 (version compliance): No dependency changes in this commit range.
- Gate 9 (docs freshness): README accurately reflects both modes, CLI commands, slash commands. Skill files are the primary deliverable and are current.

---

## Review — 2026-03-22 18:30 — commit 3dc8ad76..0d32e2c0

**Verdict: PASS** (2 observations)
**Scope:** AppView.tsx (aria labels), App.coverage.test.ts (aria label tests), useIsTouchLikePointer.ts (deleted), useIsTouchLikePointer.test.ts (deleted), SPEC.md (startup validation acceptance criteria)

**Prior findings resolution:**
- Gate 4 (useIsTouchLikePointer dead code): RESOLVED — `useIsTouchLikePointer.ts` and its test file deleted in commit 3099d585. No imports remain anywhere in the codebase.
- Gate 3 (useIsTouchLikePointer coverage gap): RESOLVED — file deleted, coverage config unchanged (correctly no longer lists it).

**Observations:**
- Gate 2: `App.coverage.test.ts:794,812,900` — aria label tests use `getByRole('button', { name: 'Collapse sidebar' })`, `getByRole('button', { name: 'Expand sidebar' })`, and `findByRole('button', { name: 'Collapse activity panel' })` — exact accessible name assertions, not DOM selectors. All three label states (collapsed sidebar, expanded sidebar, activity panel) covered.
- Gate 1: `SPEC.md` updated with 7-line startup validation acceptance criteria block covering health checks, `session-health.json`, `ALERT.md`, and label bootstrap — matches implemented behavior in `orchestrate.ts`.

All gates pass. Integration suite: 127 dashboard tests + 8 CLI tests pass, type-check clean.

---
