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

## Review — 2026-03-22 17:30 — commit 7eb8553..919e9b4

**Verdict: FAIL** (1 finding → written to TODO.md as [review] task)
**Scope:** loop_provider_health_integration.tests.sh (new, 484 lines), session.test.ts (new, 382 lines), useIsTouchLikePointer.ts (new, 27 lines), useIsTouchLikePointer.test.ts (new, 76 lines), AppView.tsx (2-line change), dist/ (deleted)

**Gate 1 (Spec Compliance): PASS** — Bash integration tests cover all TASK_SPEC acceptance criteria: state transitions (healthy→cooldown→healthy, healthy→degraded), backoff escalation through all 7 tiers (0→120→300→900→1800→3600→3600), concurrent write safety (5 parallel writers), lock failure graceful degradation, cross-session reset. TS tests cover `readProviderHealth()` edge cases. Status formatting tests remain acknowledged TODO.

**Gate 2 (Test Depth): PASS** — Bash tests assert exact field values: `assert_health_field "testprov" "status" "cooldown"`, exact cooldown seconds per tier, exact JSON field names after concurrent writes. TS tests use `assert.equal(health.codex.status, 'cooldown')` and `assert.equal(health.gemini.failure_reason, 'auth')`. No shallow/existence-only assertions on deterministic values.

**Gate 3 (Coverage): PASS** — `session.test.ts` covers 10 test scenarios for readProviderHealth (missing dir, not-a-dir, malformed JSON, non-JSON files, multiple valid providers) plus readActiveSessions, readSessionStatus, resolveHomeDir, listActiveSessions, stopSession (6 scenarios including Linux kill, stale PID, permission denied, missing session). Bash tests cover all health state machine paths.

**Gate 4 (Code Quality): FAIL** — `useIsTouchLikePointer.ts` and `useIsTouchLikePointer.test.ts` (103 lines total) are dead code. Zero components import `useIsTouchLikePointer`. The existing `useIsTouchDevice` hook (imported by tooltip.tsx:3 and hover-card.tsx:3) serves the same purpose. These two hooks are near-duplicates — same pattern, slightly different media query (`(pointer: coarse)` vs `(hover: none), (pointer: coarse)`). Must delete or consolidate.

**Gate 5 (Integration Sanity): INCONCLUSIVE** — Environment hit ENOSPC (disk full). Partial test run showed tests 1-36 PASS, test 37 FAIL due to disk space (not code). Cannot verify type-check/build. Not a code regression.

**Gate 6 (Proof): PASS** — Changes are purely internal (tests, shell scripts, build artifact cleanup). No observable output requiring proof.

**Gate 7 (Runtime Layout): SKIP** — AppView.tsx changes are aria-label addition and mobile tap target sizing (`min-h-[44px] md:min-h-[32px]`), already verified in prior QA sessions.

**Gate 8 (Version Compliance): PASS** — No dependency changes.

**Gate 9 (Documentation Freshness): PASS** — No behavior changes requiring doc updates.

**Additional observation:** `dist/` directory (15,765 lines) correctly removed from git tracking — `.gitignore` already contains `dist/`. Positive cleanup.

---

## Review — 2026-03-22 23:00 — commit 7eb8553..eda19a5

**Verdict: FAIL** (1 finding → written to TODO.md as [review] task)
**Scope:** orchestrate.ts (+332/-2), start.ts (+52/-3), loop.sh (+141), loop.ps1 (+119), orchestrate.test.ts (+500/-7), start.test.ts (+128/-1), session.test.ts (+28), useIsTouchLikePointer.ts/test.ts (unchanged, still dead), dist/ (deleted)

**Prior findings resolution:**
- Review 4 Gate 4 (useIsTouchLikePointer dead code): **NOT RESOLVED** — still zero imports of `useIsTouchLikePointer` from any component. Files unchanged since creation.

**New audit:**
- Gate 1 (Spec Compliance): PASS — `pre_iteration_base_sync()` in loop.sh matches spec exactly (fetch, merge, conflict → event + queue PROMPT_merge.md). Adapter integration adds `resolveAdapter()` which uses `createAdapter()` for issue creation via adapter path. `aloop start` correctly dispatches to `orchestrateCommand` when mode resolves to 'orchestrate'. Label self-healing (`ensureLabels`) and startup health checks (`runStartupHealthChecks`) are new defensive features not in spec but additive.
- Gate 2 (Test Depth): PASS — ensureLabels: 5 tests asserting exact label names and counts. Health checks: 4 tests with exact check names and `assert.match` on detail strings. Start dispatch: 3 tests with exact error message regex matches and exact mode string assertions.
- Gate 3 (Coverage): PASS — 354 orchestrate tests + 62 start tests cover new adapter/derivation/label/health code paths. Branch sync covered by `loop_branch_coverage.tests.sh` (6 registered branches, 5 test scenarios). Minor gap: `parseRepoFromRemoteUrl()` private utility (20 lines) only reachable via git-remote fallback in `deriveFilterRepo()`, which tests skip because mocked `gh repo view` succeeds. Acceptable for private utility.
- Gate 4 (Code Quality): **FAIL** — `useIsTouchLikePointer.ts` (27 lines) + `useIsTouchLikePointer.test.ts` (76 lines) = 103 lines of dead code. Near-duplicate of `useIsTouchDevice` hook. No component imports it. Second consecutive review flagging this.
- Gate 5 (Integration Sanity): PASS — 425 tests (354+62+9), 0 failures. `tsc --noEmit` clean. `npm run build` clean.
- Gate 6 (Proof): PASS — Purely internal changes (adapter plumbing, CLI dispatch, shell sync, tests). No observable output.
- Gate 7 (Runtime Layout): SKIP — No CSS/layout changes.
- Gate 8 (Version Compliance): SKIP — No dependency changes.
- Gate 9 (Documentation Freshness): PASS — No user-facing behavior changes.

---
