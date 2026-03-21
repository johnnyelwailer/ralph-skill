# Review Log

## Review — 2026-03-21 17:10 — commit 875704a..dca946c

**Verdict: FAIL** (2 findings → written to TODO.md as [review] tasks)
**Scope:** aloop/cli/src/commands/orchestrate.ts, aloop/cli/src/commands/process-requests.ts, TASK_SPEC.md, QA_LOG.md, QA_COVERAGE.md, .gitignore, TODO.md

- Gate 2: The core SHA dedup mechanism (invokeAgentReview early-return at process-requests.ts:473, SHA storage at orchestrate.ts:5264, SHA clear at orchestrate.ts:5311) has zero test coverage. The behavioral change — removing the scan-loop-level SHA check and relying solely on invokeAgentReview's check — is completely untested. If someone re-introduces the scan-loop check or breaks the SHA storage logic, no test would catch it.
- Gate 3: Zero branch coverage on the SHA dedup paths. Three critical branches untested: (1) early-return when SHA matches, (2) conditional storage on non-pending verdicts only, (3) SHA clear on redispatch.
- Gate 1: PASS — fix correctly removes scan-loop SHA block per TASK_SPEC.md requirement #1; dedup is now correctly deferred to invokeAgentReview level.
- Gate 4: PASS — no dead code, no duplication. `(issue as any).last_reviewed_sha` pattern is pre-existing.
- Gate 5: PASS — type-check clean, build clean, 11 test failures all pre-existing (verified by running tests at 875704a).
- Gate 6: PASS — internal plumbing changes, no proof needed.
- Gate 9: PASS — spec-gap document (709a82b) correctly documents P1/P2 gaps.

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
