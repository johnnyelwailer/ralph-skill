# Review Log

## Review — 2026-03-31 — commits 72b75142f..c409a67f8

**Verdict: FAIL** (2 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/cli/dashboard/src/components/shared/QACoverageBadge.test.tsx` (new), `aloop/cli/dashboard/src/components/layout/Header.test.tsx` (updated), `README.md`, `.github/workflows/ci.yml` (present from prior iterations)

**Prior findings from 72b75142f FAIL review:**
- Finding 1 (Gate 1+3: QACoverageBadge needs dedicated test file): ✅ RESOLVED — `QACoverageBadge.test.tsx` created with 93.93% branch coverage, 13 tests in `QACoverageBadge` component suite + 11 `parseQACoveragePayload` unit tests. All branches covered with concrete value assertions (exact text, className contains 'green'/'yellow'/'red', exact fetch URL).
- Finding 2 (Gate 1: CollapsedSidebar/SidebarContextMenu need .test.tsx files): ✗ NOT RESOLVED
- Finding 3 (Gate 1: All three need .stories.tsx files): ✗ NOT RESOLVED

### Gate 1 (Spec Compliance) — FAIL

**Issue #38 CI workflow (ci.yml):** PASS — all requirements met (SPEC line 1781, 1898): triggers on push+PR to master/agent/trunk, Node 22, npm ci, npm test in aloop/cli/dashboard, vitest runs without browser install.

**SPEC-ADDENDUM Dashboard Architecture ACs remain violated:**
1. `CollapsedSidebar.tsx` has no `.test.tsx` — SPEC-ADDENDUM: "Every component in `components/` has a corresponding `.test.tsx` file."
2. `SidebarContextMenu.tsx` has no `.test.tsx` — same AC.
3. `QACoverageBadge.tsx` has no `.stories.tsx` — SPEC-ADDENDUM: "Every component in `components/` has a corresponding `.stories.tsx` file." (also applies to CollapsedSidebar and SidebarContextMenu).

Note: Coverage for these components is 100% via Sidebar.test.tsx integration paths, but the dedicated test file requirement is an explicit SPEC-ADDENDUM acceptance criterion independent of coverage numbers.

### Gate 2 (Test Depth) — PASS

`QACoverageBadge.test.tsx`: thorough. `parseQACoveragePayload` unit tests assert exact return values (`toEqual({ percentage: null, available: false, features: [] })`). Component tests assert concrete text (`QA 85%`, `QA N/A`), className substrings (`green`, `yellow`, `red`), exact feature row text, and fetch URL construction. All error paths covered (fetch rejection → QA N/A, response.ok=false → no render). No anti-patterns detected.

`Header.test.tsx` line 136-137: `expect(timerEl).toBeTruthy()` for elapsed timer — marginal truthy check, but acceptable given time-formatting non-determinism. Not blocking.

### Gate 3 (Coverage) — PASS

- `QACoverageBadge.tsx`: 93.93% branch ✅ (≥90% threshold for new module)
- `CollapsedSidebar.tsx`: 100% branch (via Sidebar.test.tsx)
- `SidebarContextMenu.tsx`: 100% branch (via Sidebar.test.tsx)

### Gate 4 (Code Quality) — PASS

No dead code, no unused imports in QACoverageBadge.test.tsx or Header.test.tsx. README changes are clean.

### Gate 5 (Integration) — PASS

588 tests pass. Pre-existing type-check error in `Sidebar.test.tsx:240` (`afterEach` not found) is unchanged and not introduced by this build.

### Gate 6 (Proof) — PASS

No proof artifacts expected — purely internal test additions, CI config, and docs updates. Skipping is the correct outcome.

### Gate 7 (Runtime Layout) — N/A

No CSS or layout changes.

### Gate 8 (Version Compliance) — N/A

No dependency changes.

### Gate 9 (Documentation) — PASS

`README.md` updated correctly: `--launch-mode resume` → `--launch resume <session-id>` fix is accurate per CLI behavior. `devcontainer-verify` added to CLI table. Missing stories list expanded with all 13 components lacking stories, grouped by directory — accurate reflection of current state.

---

## Review — 2026-03-31 — commits b0b690d61..9f02c3ba4

**Verdict: FAIL** (1 finding → written to TODO.md as [review] task)
**Scope:** `ActivityPanel.test.tsx` (new), `ArtifactComparisonHeader.test.tsx` (new), `CollapsedSidebar.test.tsx` (new), `CollapsedSidebar.stories.tsx` (new), `SidebarContextMenu.test.tsx` (new), `SidebarContextMenu.stories.tsx` (new), `DiffOverlayView.test.tsx` (new), `DiffOverlayView.stories.tsx` (new), `SideBySideView.test.tsx` (new), `SideBySideView.stories.tsx` (new), `ActivityPanel.stories.tsx` (new), plus 8 additional new story files

**Prior findings from b0b690d61 FAIL review:**
- Finding 2 (Gate 1: CollapsedSidebar/SidebarContextMenu need .test.tsx files): ✅ RESOLVED — both files created with Testing Library tests using concrete value assertions.
- Finding 3 (Gate 1: All three need .stories.tsx files + 10 more): ✅ RESOLVED — all 13 missing story files created, all export ≥2 named stories.

### Gate 1 (Spec Compliance) — PASS

All prior FAIL findings resolved. All 28 non-ui components now have `.test.tsx` and `.stories.tsx` files (SPEC-ADDENDUM line 122–123). CI workflow unchanged and still compliant. 632 tests pass.

### Gate 2 (Test Depth) — PASS

New test files use concrete value assertions throughout:
- `CollapsedSidebar.test.tsx`: asserts specific session IDs, 8-session limit boundary, null ID mapping — concrete.
- `SidebarContextMenu.test.tsx`: asserts exact callback arguments (null vs raw ID), boolean flags, pixel positioning — concrete.
- `ArtifactComparisonHeader.test.tsx`: asserts specific metadata values, tab states, iteration labels — concrete.
- `DiffOverlayView.test.tsx`: asserts default 50% opacity, specific slider values, iteration labels — concrete.
- `SideBySideView.test.tsx`: asserts specific image `src` values, alt text generation — concrete.
- `ActivityPanel.test.tsx` line 82: date header regex `/\d{4}-\d{2}-\d{2}|\w+ \d+/` is marginal (vague shape check) but acceptable by same precedent as `Header.test.tsx` timer truthy check (prior review, accepted due to date format non-determinism). Not blocking.

### Gate 3 (Coverage) — PASS

632 tests pass; all newly tested components had ≥90% branch coverage per prior QA session and spec-review verification.

### Gate 4 (Code Quality) — PASS

No dead code, no unused imports in any of the 19 new files. Story files cleanly export named stories using proper Storybook CSF3 format.

### Gate 5 (Integration) — FAIL

`npm run type-check` reports a new error introduced by this build:
- `src/components/session/ActivityPanel.test.tsx(72,70): error TS2353: Object literal may only specify known properties, and 'iterationStartedAt' does not exist in type 'Partial<{...}>'`
- `ActivityPanel` accepts `iterationStartedAt?: string` but `baseProps` in the test file omits it, so `Partial<typeof baseProps>` doesn't include it. Line 72 passes `iterationStartedAt: undefined` to `renderActivityPanel`, which TypeScript rejects.
- Pre-existing: `Sidebar.test.tsx:240` (`afterEach` not found) — unchanged from prior iterations, not introduced by this build.

### Gate 6 (Proof) — PASS

Purely internal test and story file additions — no observable output requiring proof artifacts. Skipping is correct.

### Gate 7 (Runtime Layout) — N/A

No CSS or layout changes.

### Gate 8 (Version Compliance) — N/A

No dependency changes.

### Gate 9 (Documentation) — PASS

No docs changes needed for test/story additions.

---

## Review — 2026-03-31 — commits a37348513..cc509515c (final review)

**Verdict: PASS** (0 findings)
**Scope:** `aloop/cli/dashboard/src/components/layout/Sidebar.test.tsx`, `aloop/cli/dashboard/src/components/session/ActivityPanel.test.tsx`, `README.md`, `TODO.md` (spec-gap docs)

**Prior findings resolution:**
- Gate 5 FAIL (TS2353 `iterationStartedAt` in ActivityPanel.test.tsx): ✅ RESOLVED — `iterationStartedAt: undefined as string | undefined` added to `baseProps` at line 14; `Partial<typeof baseProps>` now includes it.
- Gate 5 FAIL (TS2304 `afterEach` in Sidebar.test.tsx:240): ✅ RESOLVED — `afterEach` added to vitest import on line 3.
- `npm run type-check` in `aloop/cli` produces zero errors. ✅

### Gate 1 (Spec Compliance) — PASS

TypeScript fixes are directly required by SPEC-ADDENDUM (type-safe test suite). README correction (`gemini-3.1-flash-lite` → `gemini-3.1-flash-lite-preview`) matches actual agent file frontmatter at `.opencode/agents/error-analyst.md` and `vision-reviewer.md` (both declare `model: openrouter/google/gemini-3.1-flash-lite-preview`). Spec-gap TODO entries are documentation-only; they correctly identify P2 issues outside Issue #38's scope.

### Gate 2 (Test Depth) — PASS

No new tests introduced. Existing test logic unchanged — only an import addition and a baseProps property addition. No shallow tests introduced.

### Gate 3 (Coverage) — PASS

No new branches introduced. Coverage unchanged.

### Gate 4 (Code Quality) — PASS

`afterEach` added to imports and IS used (line 240 in Sidebar.test.tsx). `iterationStartedAt: undefined as string | undefined` in baseProps — minimal, no dead code. README diff is 2 lines, clean.

### Gate 5 (Integration) — PASS

`npm run type-check` in `aloop/cli`: exit 0, zero errors output. All 632 tests continue to pass per commit message.

### Gate 6 (Proof) — PASS

Purely internal: test import fix, baseProps fix, README model name correction. No observable output requiring proof. Empty artifacts array is correct outcome.

### Gate 7 (Runtime Layout) — N/A

No CSS or layout changes.

### Gate 8 (Version Compliance) — N/A

No dependency changes.

### Gate 9 (Documentation) — PASS

`README.md`: model IDs corrected from `gemini-3.1-flash-lite` to `gemini-3.1-flash-lite-preview` — verified against actual agent files. Spec-gap P2 items documented in TODO.md are accurate descriptions of known issues (loop.sh/loop.ps1 model mismatch, missing `on_start` config block, periodic spec-gap scheduling unimplemented) — each references correct file paths and line numbers.

---
