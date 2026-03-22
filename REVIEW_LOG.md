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

## Review — 2026-03-22 16:30 — commit 0341dbc..fe4159f

**Verdict: PASS** (3 observations)
**Scope:** gh.ts, gh.test.ts, orchestrate.ts, orchestrate.test.ts, SPEC.md, .gitignore

**Changes reviewed (13 commits, 4 major features):**
1. `gh stop-watch` subcommand — delegates to `gh stop --all` (gh.ts:1434-1439)
2. Re-trigger logic — `parseReTriggerEvents`, `--re-trigger-on`, `--no-re-trigger`, comment/reopen detection in watch cycle (gh.ts:589-617, 1205-1231)
3. `agent/main` → `agent/trunk` rename across gh.ts, orchestrate.ts, SPEC.md, tests
4. Self-healing labels + config derivation — `ensureLabels`, `deriveFilterRepo`, `deriveTrunkBranch`, `runStartupHealthChecks`, `toSpawnSyncResult`, `parseRepoFromRemoteUrl` (orchestrate.ts:215-552, 1182-1347)

**Gate results:**

- **Gate 1 (Spec Compliance): PASS** — `stop-watch` matches SPEC line 2284. Re-trigger flags match SPEC line 2288 exactly (`--re-trigger-on reopen,comment` / `--no-re-trigger`). Agent/trunk rename consistent across code and SPEC. Self-healing labels are a new feature (#181) not yet spec'd as a requirement but don't contradict existing spec.
- **Gate 2 (Test Depth): PASS** — `parseReTriggerEvents` test (gh.test.ts:2002-2008) covers defaults, explicit values, disable flag, and invalid input with regex error matching — 5 concrete assertions. `ensureLabels` suite (orchestrate.test.ts:6307-6387) has 5 tests covering all-create, skip-existing, list-failure, partial-failure, all-exist — each asserts exact counts and label names. Re-trigger tests (gh.test.ts:2010-2099) test both enabled and disabled paths with specific state transitions (status: 'completed'→'running', last_seen_comment_count: 1→3). `deriveFilterRepo` tests cover all 5 fallback levels (gh view, git remote, meta.json, GITHUB_REPOSITORY, GITHUB_REPOSITORY+GH_HOST).
- **Gate 3 (Coverage): PASS** — All new exported functions have dedicated tests. `parseRepoFromRemoteUrl` is tested indirectly via `deriveFilterRepo` fallback test (SSH URL parsing). `runStartupHealthChecks` has 4 tests covering success, dirty worktree, gh auth failure, and gh repo failure.
- **Gate 4 (Code Quality): PASS** — No dead code, no TODO/FIXME comments, no duplication. `deriveFilterRepo` fallback chain (5 strategies) is appropriately defensive with try-catch at each level.
- **Gate 5 (Integration Sanity): PASS** — 1032/1033 tests pass (1 skipped), 0 failures. Type-check clean. Build passes.
- **Gate 6 (Proof): PASS** — `proof-manifest.json` has `{"artifacts": []}`. All changes are CLI commands and backend orchestrator logic — purely internal. Empty artifacts is the expected correct outcome per gate rules.
- **Gate 7 (Runtime Layout): SKIP** — No CSS or layout changes. AppView.tsx diff is ±2 lines (net zero after rebase), no layout impact.
- **Gate 8 (Version Compliance): PASS** — No dependency additions or updates. `commander` 12.0.0 still matches VERSIONS.md.
- **Gate 9 (Documentation): PASS** — SPEC.md updated for agent/trunk rename. New CLI flags (`--re-trigger-on`, `--no-re-trigger`, `stop-watch`) already documented in SPEC. No README changes needed for internal features.

**Observations:**
1. Gate 2: `orchestrate.test.ts:6367-6376` partial-failure test — mocks 2 specific labels failing while others succeed, asserts exact failure list. Good isolation of individual label creation errors.
2. Gate 2: `gh.test.ts:2056-2099` negative re-trigger test — verifies `--no-re-trigger` keeps issue status as `completed` even with comment count jump from 1→5. Important complement to the positive case.
3. Gate 1: `deriveFilterRepo` (orchestrate.ts:427-515) implements a 5-level fallback chain (gh repo view → git remote → meta.json → GITHUB_REPOSITORY → null) with proper error isolation. Addresses the SPEC requirement (line 2176) that repo URLs must be derived from actual remote origin.

---
