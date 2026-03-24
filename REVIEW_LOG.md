# Review Log

## Review — 2026-03-21 — commit 3492a61..a182934

**Verdict: PASS** (4 observations)
**Scope:** `.storybook/main.ts`, `.storybook/preview.ts`, `package.json`, `package-lock.json`

- Gate 1 (Spec Compliance): PASS — `main.ts` configures `@storybook/react-vite` framework, stories glob `../src/**/*.stories.@(ts|tsx)`, and both required addons. `preview.ts` imports `index.css` for Tailwind, uses `withThemeByClassName` for dark mode toggle on `html` element, and wraps stories in `TooltipProvider`. All match spec requirements for the completed tasks. Remaining items (button.stories.tsx, storybook build verification) are correctly tracked as incomplete in TODO.md.
- Gate 2 (Test Depth): PASS — No new tests added; changes are pure configuration with no testable logic.
- Gate 3 (Coverage): PASS — Config-only files (no application branches to cover).
- Gate 4 (Code Quality): PASS — Both config files are minimal and clean. `preview.ts` correctly uses `createElement` instead of JSX (file is `.ts`, not `.tsx`). No dead code, no TODOs, no duplication. **Observation:** `@storybook/addon-essentials` is pinned at `^8.6.14` while all other `@storybook/*` packages are at `^8.6.18`, causing a runtime warning. Should be aligned.
- Gate 5 (Integration Sanity): PASS — TS errors and test failures in `App.coverage.test.ts` and `App.test.tsx` pre-exist on master; not introduced by this branch. No source or test files were modified.
- Gate 6 (Proof Verification): PASS — Work is purely internal config (Storybook setup files, package.json). No proof manifests expected; skipping proof is the correct outcome for plumbing work.
- Gate 7 (Runtime Layout): SKIP — No CSS, layout, or visual changes.
- Gate 8 (Version Compliance): PASS — VERSIONS.md declares `@storybook/* | 8.x`. All installed packages are 8.6.x. Minor patch mismatch between addon-essentials (8.6.14) and others (8.6.18) is within tolerance.
- Gate 9 (Documentation Freshness): PASS — Storybook is development infrastructure, not yet user-facing. README documents `aloop` CLI commands, not individual npm scripts. Documentation update appropriate once full feature (including verification story) is complete.

---

## Review — 2026-03-24 — commit 2fbd29ee (reconstructed from TODO.md history)

**Verdict: FAIL** (3 findings → written to TODO.md as [review] tasks)
**Scope:** VERSIONS.md, SPEC-ADDENDUM.md, proof-manifest.json, ProviderHealth/CostDisplay/ArtifactViewer stories

- Gate 6: No visual proof for build cycle that added ProviderHealth, CostDisplay, ArtifactViewer stories — proof agent must capture Storybook screenshots via HTTP
- Gate 8: VERSIONS.md had `@storybook/* | 8.x` but package.json has `^10.3.1` — major version mismatch
- Gate 9: SPEC-ADDENDUM.md referenced "Storybook 8" in two places — outdated

*(Note: This entry reconstructed — REVIEW_LOG.md was deleted in commit 44db1b40 by save-wip agent.)*

---

## Review — 2026-03-24 11:00 — commit 2fbd29ee..39eb5ff1

**Verdict: FAIL** (2 findings → written to TODO.md as [review] tasks)
**Scope:** VERSIONS.md, SPEC-ADDENDUM.md (ea96096e); proof-artifacts/*.png, proof-manifest.json (44db1b40); QA_COVERAGE.md, QA_LOG.md (39eb5ff1)

- Gate 4: REVIEW_LOG.md deleted in commit 44db1b40 (save-wip) and never restored — log is append-only per review protocol; [review] task added to restore it
- Gate 6: All 8 Storybook story screenshots in proof-artifacts/ are identical 5199-byte "Not found" pages (MD5: 99b13def98aa849306b4f00e23948c59). Proof agent used file:// protocol, which returns 404. The [review] and [qa/P1] tasks for this remain open.

**Prior findings resolved:**
- Gate 8: VERSIONS.md now correctly says `@storybook/* | 10.x` — confirmed via diff
- Gate 9: SPEC-ADDENDUM.md updated in both "Storybook 8" locations to "Storybook 10" — confirmed via diff

**Pre-existing:** 25 test failures in orchestrator tests (validateDoR, launchChildLoop, checkPrGates, etc.) predate this issue's scope (present at commit 2fbd29ee); not introduced by this build.

---

## Review — 2026-03-24 12:00 — commit 01aa9798..8223c5b3

**Verdict: PASS** (3 observations)
**Scope:** REVIEW_LOG.md (6227a03c); QA_LOG.md, QA_COVERAGE.md, TODO.md (8223c5b3)

- Gate 1 (Spec Compliance): PASS — REVIEW_LOG.md restoration matches the append-only protocol; QA documentation accurately reflects project work.
- Gate 2 (Test Depth): N/A — no test files changed.
- Gate 3 (Coverage): N/A — no source code changed.
- Gate 4 (Code Quality): PASS — REVIEW_LOG.md `b0cf335a` PASS entry correctly prepended as first entry (lines 1–17); chronological order maintained (2026-03-21 PASS → 2026-03-24 FAIL × 2). Append-only protocol upheld. TODO.md accurately marks Gate 4/8/9 tasks `[x]` resolved and leaves Gate 6 open.
- Gate 5 (Integration Sanity): PASS — QA iter 3 (`8223c5b3`) confirms 151/151 unit tests pass; no regressions.
- Gate 6 (Proof Verification): PASS for this iteration — changes are purely internal meta-files (review log, QA logs, task tracking); skipping proof is the correct outcome per gate rules. **Outstanding inherited finding:** the open `[review] Gate 6 / [qa/P1]` task remains in TODO.md; `proof-artifacts/` still contains 8 identical 5199-byte "Not found" PNGs (confirmed by QA iter 3 and direct ls). Carries forward as highest-priority task.
- Gate 7 (Runtime Layout): SKIP — no UI changes.
- Gate 8 (Version Compliance): PASS — `VERSIONS.md:71` shows `@storybook/* | 10.x`; QA iter 3 re-confirmed.
- Gate 9 (Documentation Freshness): PASS — `SPEC-ADDENDUM.md:139` and `:176` both reference Storybook 10; QA iter 3 re-confirmed.

---

## Review — 2026-03-24 — commit 3319c1a7..1a8595f0

**Verdict: FAIL** (1 finding → written to TODO.md as [review] task)
**Scope:** proof-artifacts/*.png, proof-manifest.json (bf6a7427); lib/ansi.ts, lib/ansi.test.ts, AppView.tsx (24974eb2); QA_LOG.md, QA_COVERAGE.md (1a8595f0)

- Gate 2: `lib/ansi.test.ts` lines 76, 115, 119, 145, 146, 172, 173 — 7 `.toBeTruthy()` checks on ANSI color RGB string values. A broken color mapping (e.g. wrong PALETTE_256 index) would still pass these. Each should assert the exact computed string (e.g. `'187,0,0'` for ANSI 31, `'85,85,85'` for ANSI 90/100).

**Prior findings resolved:**
- Gate 6 / [qa/P1]: proof-artifacts/ now contains 9 unique PNGs (6–17KB), proof-manifest.json has 8 HTTP-Playwright entries — all story screenshots valid (bf6a7427). P1 finding from earlier reviews is closed.

**Observations:**
- Gate 1 (Spec Compliance): PASS — lib/ansi.ts exports all 5 required functions + AnsiStyle type; AppView.tsx:30-31 correctly imports + re-exports (re-export consumed by App.tsx via `import * as view`); formatHelpers.test.tsx:13 updated to import stripAnsi from `./lib/ansi` directly.
- Gate 3 (Coverage): PASS — 39 tests cover all major SGR codes, palette edge cases, style resets, and combined codes; minor gap: unknown mode in 38/48 fallthrough untested but not high risk.
- Gate 4 (Code Quality): PASS — AppView.tsx:31 re-export is not dead code; consumed by App.tsx wildcard import chain.
- Gate 5 (Integration Sanity): PASS — dashboard 189/189 tests pass; 25 CLI failures pre-existing; TS error in process-requests.ts pre-existing.
- Gate 6 (Proof Verification): PASS — see above.
- Gate 8 (Version Compliance): PASS — VERSIONS.md `@storybook/* | 10.x` confirmed.
- Gate 9 (Documentation Freshness): PASS — internal refactor, no user-facing behavior changed.

---

## Review — 2026-03-24 — commit ccc5d5e9..ee566c1f

**Verdict: FAIL** (1 finding → written to TODO.md as [review] task)
**Scope:** lib/ansi.test.ts (c5d8321c); lib/format.ts, AppView.tsx, formatHelpers.test.tsx (acb8fb08); QA_LOG.md, QA_COVERAGE.md (ee566c1f)

- Gate 3: `lib/format.ts` exports 8 functions but has no dedicated test file. `formatHelpers.test.tsx` covers only `formatSecs` (2 tests) and `relativeTime` (1 test). Zero coverage for `formatTime`, `formatTimeShort`, `formatDuration`, `formatDateKey`, `formatTokenCount`, `parseDurationSeconds`. New module threshold is 90%; actual is ~25%. Pattern established by `lib/ansi.ts` → `lib/ansi.test.ts` must be followed.

**Prior findings resolved:**
- Gate 2 (`lib/ansi.test.ts`): all 7 former `.toBeTruthy()` checks replaced with exact `.toBe()` RGB string assertions (e.g. `expect(segments[1].style.fg).toBe('187,0,0')`) — confirmed at c5d8321c. Finding fully closed.

**Observations:**
- Gate 1 (Spec Compliance): PASS — lib/format.ts exports all 8 functions per spec; AppView.tsx imports and re-exports all 8; formatHelpers.test.tsx imports from `./lib/format` directly. Refactor shape is correct.
- Gate 2 (Test Depth): PASS for the tests that exist — `formatSecs` and `relativeTime` use exact `.toBe()` assertions; the problem is missing tests for 6 functions, not shallow assertions on existing tests.
- Gate 4 (Code Quality): PASS — no dead code; 3 consecutive blank lines at AppView.tsx:191-193 are cosmetic artifacts of deletion, not a blocker. No leftover TODOs/FIXMEs.
- Gate 5 (Integration Sanity): PASS — 189/189 dashboard unit tests pass; 25 CLI failures are pre-existing (same set: validateDoR, launchChildLoop, checkPrGates, etc.); TS error in process-requests.ts:402 pre-existing.
- Gate 6 (Proof Verification): PASS — both build commits are purely internal (test assertion fix + lib extraction/refactor); skipping proof is the correct outcome for plumbing work with no observable UI output.
- Gate 7 (Runtime Layout): SKIP — no CSS or visual changes.
- Gate 8 (Version Compliance): PASS — no dependency changes.
- Gate 9 (Documentation Freshness): PASS — no user-facing behavior changed.

---
