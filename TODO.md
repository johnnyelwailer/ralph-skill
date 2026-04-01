# Issue #114: Responsive layout: touch targets, tap equivalents & accessibility audit

## Tasks

### Up Next

- [x] [review] **Gate 1 / CONSTITUTION Rule 12 — RESOLVED**: Reverted `bb8fce584` (loop.sh model default change, out-of-scope for issue #114). Filed dedicated issue #284 for the fix: https://github.com/johnnyelwailer/ralph-skill/issues/284 [reviewed: gates 1-9 pass]

### Spec Review — APPROVED (2026-04-01, re-confirmed 2026-04-01, re-confirmed 2026-04-01 post-docs-e2c994432, re-confirmed 2026-04-01 final-review, re-confirmed 2026-04-01 post-final-qa, re-confirmed 2026-04-01 final-review post-final-qa, re-confirmed 2026-04-01 post-fixture-event, re-confirmed 2026-04-01 final-review post-fixture-event, re-confirmed 2026-04-01 post-fixture-timestamp-event) [reviewed: gates 1-9 pass]

All 9 SPEC-ADDENDUM.md §Dashboard Responsiveness acceptance criteria verified PASS:
- AC1: No horizontal scroll at 320px — PASS (Playwright QA_COVERAGE, multiple commits)
- AC2: Sidebar → hamburger below 640px — PASS (`AppView.tsx:366` `lg:hidden` hamburger; QA_COVERAGE)
- AC3: Steer input accessible at all breakpoints — PASS (QA_COVERAGE: visible at 320/375/768/1920px)
- AC4: Tap targets >= 44x44px on mobile — PASS (`min-h-[44px] min-w-[44px]` throughout; 0 small buttons at 320/375px)
- AC5: Session list scrollable at 375px — PASS (ScrollArea in mobile drawer; QA_COVERAGE)
- AC6: Ctrl+B / hamburger at tablet — PASS (P2 fix applied: `lg:hidden` hamburger + `hidden lg:flex` desktop sidebar)
- AC7: Desktop layout unchanged — PASS (2-column at 1440px confirmed; QA_COVERAGE)
- AC8: No hover-only interactions — PASS (HoverCard tap-toggle via `useIsTouchDevice`; Tooltip tap support; 158 unit tests)
- AC9: Lighthouse mobile accessibility >= 90 — PASS (score 94/100; QA_LOG 2026-04-01)

Non-AC spec body requirements also satisfied: swipe-right gesture (`AppView.tsx:1009-1028`; e2e verified) and long-press context menu (`SessionCard.tsx:31-41` + `useLongPress` hook). No P1/P2 gaps found. Issue #114 complete.

**Re-confirmed 2026-04-01 (spec-review agent):** Independent re-verification of all 9 ACs against implementation and QA evidence. All criteria remain PASS. Implementation cross-checked: swipe handler at `AppView.tsx:1009-1028`, long-press at `SessionCard.tsx:31-41`, hamburger breakpoint `lg:hidden` at `AppView.tsx:366`, desktop sidebar `hidden lg:flex` at `AppView.tsx:1329`. Lighthouse 94/100 in QA_LOG.md. No new gaps found.

**Re-confirmed 2026-04-01 (spec-review agent, triggered by docs event):** Post-docs-sync re-verification. Most recent commit `37fe49717` is docs-only (README + FRONTEND.md sync); no implementation changes since last review. SPEC-ADDENDUM.md §Dashboard Responsiveness AC checkboxes (lines 237-245) now all `[x]` — previously P3 cosmetic, now resolved. All 9 ACs still PASS. No new gaps found. Issue #114 complete.

**Re-confirmed 2026-04-01 (spec-review agent, triggered by docs event, commit e2c994432):** Docs-only commit — `FRONTEND.md` documents `parseTodoProgress` cross-module import (`AppView.tsx:25` imports from `../../src/lib/parseTodoProgress`). No implementation changes. Import confirmed present and accurate. All 9 ACs remain PASS. No new gaps. Issue #114 complete.

**Re-confirmed 2026-04-01 (spec-review agent, triggered by docs event, commit a31de3106):** Chore/QA-only commit — final-qa pass recorded in `QA_COVERAGE.md` and `QA_LOG.md`. No implementation changes since last review (`a866696bd`). Working directory deltas are e2e fixture files only (not in scope). All 9 ACs remain PASS. SPEC-ADDENDUM.md §Dashboard Responsiveness AC checkboxes all `[x]`. No new gaps. Issue #114 complete.

**Re-confirmed 2026-04-01 (spec-review agent, triggered by fixture/docs event, HEAD adc2b48e9):** No implementation changes since last review. Working directory deltas are e2e fixture stubs (`workdir/SPEC.md`, `EXTRA.md`, `RESEARCH.md` — placeholder content only) and npm log files. All 9 ACs remain PASS. No new gaps. Issue #114 complete.

### Completed
- [x] [spec-gap] **spec-gap analysis: no discrepancies found — spec fully fulfilled** (2026-04-01, re-confirmed 2026-04-01, re-confirmed 2026-04-01 post-final-qa, re-confirmed 2026-04-01 post-fixture-event HEAD b0c620595). Fourth independent pass: no implementation changes since `adc2b48e9` (intervening commits are chore/review/qa only; working-dir deltas are e2e fixture stubs not in scope). Key markers confirmed present: `AppView.tsx:366` `lg:hidden` hamburger, `AppView.tsx:1329` `hidden lg:flex` sidebar, `useIsTouchDevice`+`useLongPress` hooks, `min-h-[44px]` in 11 files. SPEC-ADDENDUM.md §Dashboard Responsiveness all 9 AC checkboxes `[x]`. Zero new gaps.
- [x] [spec-gap] **spec-gap analysis: no discrepancies found — spec fully fulfilled** (2026-04-01, re-confirmed 2026-04-01). Second independent pass: verified all 9 ACs remain PASS, all `[spec-gap]` items resolved, no new implementation changes since last analysis (HEAD `86b0932a0` is chore-only). Swipe handler at `AppView.tsx:1012-1028`, long-press at `SessionCard.tsx:31-41`, hamburger `lg:hidden` at `AppView.tsx:366`, desktop sidebar `hidden lg:flex` at `AppView.tsx:1329`, ScrollArea in mobile drawer, `useIsTouchDevice` in hover-card/tooltip, `useLongPress` hook — all confirmed present. Zero new gaps.
- [x] [spec-gap] **spec-gap analysis: no P1/P2 discrepancies found — spec fully fulfilled** (2026-04-01, superseded above). All 9 SPEC-ADDENDUM.md §Dashboard Responsiveness ACs verified PASS in spec doc and QA_COVERAGE.md. All previous `[spec-gap]` items resolved. One P3 cosmetic: `QA_COVERAGE.md:48` has stale entry referencing loop.sh `opus` default that was reverted (`d38ccab86`) — out-of-scope for issue #114, already tracked in Gate 1 RESOLVED. No action needed.
- [x] [spec-gap] **P3** — Unit test suite not re-verified at HEAD (`11c26afe6`). Last passing entry in `QA_COVERAGE.md` is at `9db0a33` (several commits prior). Intervening commits are docs/chore-only — low regression risk, but verification chain is incomplete. Fixed: ran `npm test` at HEAD — 158 tests pass (21 test files); QA_COVERAGE.md updated.
- [x] [spec-gap] **P3** — `SPEC-ADDENDUM.md` §Dashboard Responsiveness acceptance criteria checkboxes (lines 237-245) are all still `[ ]` unchecked, but all 9 criteria are verified PASS in `QA_COVERAGE.md` (Lighthouse 94/100, all layout/tap-target/hover tests PASS). Cosmetic only — code is correct, spec docs are stale. No P1/P2 blockers. spec-gap analysis: no P1/P2 discrepancies found — spec fully fulfilled for issue #114 scope.
- [x] [review] **Gates 6+7 — RESOLVED**: `98e474ce6` tablet breakpoint fix verified. `e2e/proof.spec.ts` 5/5 PASS at 768×1024 (`ce703290b`). Hamburger 44×44px visible; `.hidden.lg:flex` sidebar null bounding box. QA_COVERAGE.md + QA_LOG.md document evidence. Gate 7 bounding-box requirement satisfied.
- [x] [spec-gap] **P2 (in-scope)** — Fix tablet breakpoint to match spec. SPEC-ADDENDUM.md §Dashboard Responsiveness (line 214) defines tablet (640-1024px) as "Sidebar is collapsible (hidden by default, toggled via Ctrl+B / hamburger)". Fixed:
  - `AppView.tsx:366`: `md:hidden` → `lg:hidden` (hamburger persists through tablet).
  - `AppView.tsx:1329`: `hidden sm:flex` → `hidden lg:flex` (desktop sidebar only at lg+).
  - `e2e/proof.spec.ts:136-147`: updated to assert hamburger IS visible and sidebar is hidden at 768px.
- [x] [spec-gap] **P3** — `QA_COVERAGE.md:17` showed swipe gesture as FAIL/"not implemented". Fixed: `QA_COVERAGE.md` updated at commit `98e474ce` (2026-04-01) with PASS entry — false negative corrected; `AppView.tsx:1009-1028` implements touchstart/touchend handlers, `e2e/proof.spec.ts:103-134` verifies behavior. Confirmed in commit `11c26afe6`.
- [x] Run Lighthouse mobile accessibility audit and verify AC9 — score **94/100** (threshold: >= 90). Recorded in QA_LOG.md (2026-04-01 session). AC9 now explicitly verified. One P3 cosmetic finding (`button-name` in footer) does not affect pass/fail.
- [x] Implement responsive layout (SPEC-ADDENDUM.md §Dashboard Responsiveness) — 158 unit tests passing, review PASS. AC9 (Lighthouse score) explicitly verified: 94/100.
- [x] Playwright touch-event test for swipe-to-open sidebar — `e2e/proof.spec.ts:103-134` already implements the test: dispatches `touchstart`+`touchend` from left edge (clientX=5→80) and asserts `.fixed.inset-0.z-40` overlay becomes visible. QA_LOG false negative ("swipe NOT implemented") was a DOM attribute query limitation, not a missing implementation. `AppView.tsx:1014-1028` implements the handlers; `proof.spec.ts:103` verifies the behavior.
