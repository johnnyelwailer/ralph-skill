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

## Review — 2026-03-31 — commits cc509515c..cc9dbbbe5 (final-review, spec-review trigger)

**Verdict: PASS** (0 findings)
**Scope:** `README.md` (commit 119006048 — one-line Storybook component list fix); all other commits are bookkeeping (review, QA, spec-gap)

**Prior findings resolution:**
- All prior Gate 5 FAIL findings (TS2353, TS2304) were resolved in the previous review (a37348513..cc509515c). No regressions.

### Gate 1 (Spec Compliance) — PASS

`README.md` Storybook status now accurately reflects the codebase:
- `AppShell` removed — confirmed non-existent (no file found under `dashboard/src/`)
- `ArtifactViewer` added — exists at `components/artifacts/ArtifactViewer.tsx` with `.stories.tsx` ✓
- `ProviderHealth` added — exists at `components/health/ProviderHealth.tsx` with `.stories.tsx` ✓
- `CostDisplay` added — exists at `components/progress/CostDisplay.tsx` with `.stories.tsx` ✓

### Gate 2 (Test Depth) — PASS

No tests changed in this scope.

### Gate 3 (Coverage) — PASS

No new code branches introduced.

### Gate 4 (Code Quality) — PASS

One-line README edit, clean and accurate. No dead code or duplication.

### Gate 5 (Integration Sanity) — PASS

`npm run type-check` in `aloop/cli` exits 0 (confirmed). Disk full (ENOSPC) prevented running the full test suite, but the README change cannot introduce test failures. Prior review confirmed 632 tests passing; no code was changed since.

### Gate 6 (Proof) — N/A

Purely internal docs fix. Skipping is correct.

### Gate 7 (Runtime Layout) — N/A

No CSS or layout changes.

### Gate 8 (Version Compliance) — N/A

No dependency changes.

### Gate 9 (Documentation) — PASS

This iteration IS a documentation fix. README Storybook status now correctly lists component names that actually exist in the codebase, verified against directory listing.

---

## Review — 2026-03-31 — commits 0b102ba24..f9623d907 + staged README.md (final-review, spec-review trigger)

**Verdict: PASS** (0 findings)
**Scope:** `README.md` (staged uncommitted fix — adds PROMPT_spec-review.md to template list and completes finalizer prose to all 6 agents); commits `6650dcf30` and `f9623d907` are TODO.md/bookkeeping only.

**Prior findings resolution:**
- Gate 1/Gate 9 FAIL (README template list missing `PROMPT_spec-review.md`): ✅ RESOLVED — README line 246 now lists `PROMPT_spec-review.md  # Spec-review agent (finalizer)`.
- Gate 1/Gate 9 FAIL (README finalizer prose listed 3 of 6 agents): ✅ RESOLVED — README lines 22–28 now list all 6 finalizer agents: Spec-gap, Docs, Spec-review, Final-review, Final-qa, Proof.

### Gate 1 (Spec Compliance) — PASS

Both prior findings now resolved:
- SPEC §"Default pipeline update" line 422 defines 6 finalizer agents (`spec-gap → docs → spec-review → final-review → final-qa → proof`); README lines 22–28 accurately list all 6 ✓
- `aloop/templates/PROMPT_spec-review.md` exists on disk (confirmed by glob); README line 246 lists it in the Architecture template table ✓

### Gate 2 (Test Depth) — N/A

No tests changed.

### Gate 3 (Coverage) — N/A

No code changed.

### Gate 4 (Code Quality) — PASS

README additions are minimal (3 new bullet points in prose, 3 new template list entries). Content is accurate and non-redundant. No dead content introduced.

### Gate 5 (Integration Sanity) — PASS

README-only changes cannot affect tests or type-checking. Prior review (a37348513..cc509515c) confirmed `npm run type-check` exits 0 and 632 tests pass; no code was changed since. Note: ENOSPC on host prevented re-running test suite directly — disk full error in bash tool. Risk is zero for docs-only changes.

### Gate 6 (Proof) — N/A

Internal documentation fix only. No observable output requiring proof.

### Gate 7 (Runtime Layout) — N/A

No CSS or layout changes.

### Gate 8 (Version Compliance) — N/A

No dependency changes.

### Gate 9 (Documentation) — PASS

The fix is the documentation change itself:
- Template list (lines 244–248): `PROMPT_spec-review.md` (line 246), `PROMPT_final-qa.md` (line 247), `PROMPT_final-review.md` (line 248) — all three present and correctly described as finalizer agents ✓
- Finalizer prose (lines 22–28): Spec-gap, Docs, Spec-review, Final-review, Final-qa, Proof — complete, matches SPEC ✓

---

## Review — 2026-03-31 — commits a43e2b433..0b102ba24 (final-review, spec-review trigger)

**Verdict: FAIL** (2 findings → written to TODO.md as [review] tasks)
**Scope:** `README.md` (commit 06a97c3c2 — loop pipeline description and template list update); commits 16ae0c502 (spec-gap bookkeeping, TODO.md only) and 0b102ba24 (prior FAIL review, TODO.md only) are internal bookkeeping with no code/doc impact.

**Prior findings resolution:**
- All prior Gate 5 FAIL findings (TS2353, TS2304) remain resolved. No regressions.
- The Storybook component list fix (119006048) remains accurate — confirmed in prior review.

### Gate 1 (Spec Compliance) — FAIL

`README.md` commit 06a97c3c2 corrects the loop pipeline description but introduces two spec-compliance gaps:

1. **Template list missing `PROMPT_spec-review.md`** — file exists at `aloop/templates/PROMPT_spec-review.md` (confirmed by directory listing). The README Architecture section lists 8 templates (PROMPT_plan, PROMPT_build, PROMPT_review, PROMPT_qa, PROMPT_proof, PROMPT_spec-gap, PROMPT_docs, PROMPT_final-qa, PROMPT_final-review, PROMPT_steer, PROMPT_setup, PROMPT_single) but omits `PROMPT_spec-review.md`. SPEC line 422 lists `spec-review` as a finalizer agent with its own prompt file.

2. **Finalizer prose incomplete** — README lines 22–25 lists only 3 finalizer agents (Proof, Spec-gap, Docs). SPEC line 422 defines 6: `spec-gap → docs → spec-review → final-review → final-qa → proof`. Missing: spec-review, final-review, final-qa.

Note: both findings were independently identified by the prior spec-review FAIL commit (0b102ba24). Independent verification confirms they are real and unresolved.

### Gate 2 (Test Depth) — N/A

No test changes in this scope.

### Gate 3 (Coverage) — N/A

No code changes; docs-only commit.

### Gate 4 (Code Quality) — PASS

The docs corrections in 06a97c3c2 are accurate and clean. The loop pipeline description (plan → build ×5 → qa → review; proof in finalizer only) matches SPEC lines 407–409 and 420–422. No dead content introduced.

### Gate 5 (Integration Sanity) — PASS

No code changes; no regression risk. Prior review confirmed `npm run type-check` exits 0 and 632 tests pass — nothing in this scope changes that.

### Gate 6 (Proof) — N/A

Purely internal docs change. Skipping is correct.

### Gate 7 (Runtime Layout) — N/A

No CSS or layout changes.

### Gate 8 (Version Compliance) — N/A

No dependency changes.

### Gate 9 (Documentation) — FAIL

README.md is the subject of this commit, and the commit leaves two inaccuracies:
- Template list omits `PROMPT_spec-review.md` which exists on disk
- Finalizer agent prose is 3 of 6 agents

---

## Review — 2026-03-31 — uncommitted changes (final-review, spec-review trigger)

**Verdict: PASS** (0 findings)
**Scope:** `QA_COVERAGE.md` (+5 lines), `QA_LOG.md` (+67 lines, new QA session entry), `README.md` (+3 lines, `.aloop/` directory structure added)

**Prior findings resolution:**
- All prior findings resolved; README finalizer prose and template list confirmed complete in prior reviews.

### Gate 1 (Spec Compliance) — PASS

README.md adds `.aloop/` directory structure to project layout:
- `pipeline.yml` — exists on disk at `.aloop/pipeline.yml`; SPEC §4078 confirms it as source of truth ✓
- `agents/<name>.yml` — 5 files exist: build.yml, plan.yml, review.yml, proof.yml, steer.yml; format matches SPEC lines 3970–3988 ✓
Description "Per-agent overrides (prompt, reasoning, timeout)" matches actual file fields (prompt, reasoning) with timeout as a SPEC-supported override (line 3681) ✓

### Gate 2 (Test Depth) — N/A

No test code changed.

### Gate 3 (Coverage) — N/A

No new code branches.

### Gate 4 (Code Quality) — PASS

QA_COVERAGE.md additions are 5 clean rows with dates, commit hashes, PASS statuses. QA_LOG.md documents static-only verification (ENOSPC blocked bash) — limitation is explicitly stated. README addition is 3 lines, minimal and accurate.

### Gate 5 (Integration Sanity) — PASS

Last dynamic test run at commit `6650dcf30`: `tsc --noEmit` exit 0, 632 tests pass. All changes since then are documentation/tracking files only — zero risk of regression.

### Gate 6 (Proof) — N/A

Internal documentation and tracking changes only. No observable output requiring proof.

### Gate 7 (Runtime Layout) — N/A

No CSS or layout changes.

### Gate 8 (Version Compliance) — N/A

No dependency changes.

### Gate 9 (Documentation) — PASS

README `.aloop/` directory addition accurately reflects real files on disk (confirmed by glob). All Issue #38 documentation requirements remain satisfied: finalizer prose (6 agents), template list (includes PROMPT_spec-review.md), CI workflow description unchanged.

---

## Review — 2026-03-31 — uncommitted changes (final-review, spec-review trigger — repeat pass)

**Verdict: PASS** (0 findings)
**Scope:** `QA_COVERAGE.md` (staged — 1 new row added at 1933cd7eb), `QA_LOG.md` (unstaged — docs audit + final-qa session at 1933cd7eb), `README.md` (unstaged — minor tracking updates), `TODO.md` (unstaged — spec-gap re-runs, both [review] tasks now [x])

**Prior findings resolution:**
- All prior findings remain resolved. Both README [review] tasks (PROMPT_spec-review.md in template list; finalizer prose 6 agents) confirmed [x] and verified in code.

### Gate 1 (Spec Compliance) — PASS

All Issue #38 ACs verified via static checks:
- CI workflow (`ci.yml`): triggers on push+PR to master/agent/trunk, Node 22, `npm ci` + `npm test` in `aloop/cli/dashboard` ✓
- SPEC-ADDENDUM line 122: all 28 non-ui components have `.test.tsx` — 30 files confirmed via Glob (28 non-ui + 2 ui/) ✓
- SPEC-ADDENDUM line 123: all 28 non-ui components have `.stories.tsx` — 41 files confirmed ✓
- README finalizer prose (lines 22–28): all 6 agents present ✓
- README template list (line 246): `PROMPT_spec-review.md` present ✓
- TypeScript fixes intact: `afterEach` at `Sidebar.test.tsx:3`; `iterationStartedAt` in `ActivityPanel.test.tsx:14` baseProps ✓

### Gate 2 (Test Depth) — N/A

No test code changed in this scope.

### Gate 3 (Coverage) — N/A

No code branches added.

### Gate 4 (Code Quality) — PASS

QA_COVERAGE.md, QA_LOG.md, TODO.md additions are tracking-only. No dead content.

### Gate 5 (Integration Sanity) — PASS

Last dynamic run at `6650dcf30`/`613a7bab4`: `tsc --noEmit` exit 0, 632 tests pass. No code changes since — zero regression risk. Note: ENOSPC on /tmp prevents re-running bash commands in this session, same as prior passes.

### Gate 6 (Proof) — N/A

Tracking files only. No observable output requiring proof.

### Gate 7 (Runtime Layout) — N/A

No CSS or layout changes.

### Gate 8 (Version Compliance) — N/A

No dependency changes.

### Gate 9 (Documentation) — PASS

README.md: no new content added in this scope that contradicts reality. All prior documentation fixes remain intact and accurate.

---

## Review — 2026-03-31 — commits afbf4e6c3..091afbeee (final-review, spec-review trigger — final pass)

**Verdict: PASS** (0 findings)
**Scope:** Commits 44c123d1e, 1933cd7eb, 091afbeee — all pure review/bookkeeping (REVIEW_LOG.md + TODO.md only). No code or documentation changed since the last PASS final-review at afbf4e6c3.

**Prior findings resolution:**
- All prior findings remain resolved. No new changes to audit.

### Gate 1 (Spec Compliance) — PASS

All Issue #38 acceptance criteria verified (static checks; last dynamic run at 6650dcf30 confirmed 632 tests pass, tsc exit 0):
- `.github/workflows/ci.yml`: triggers on push+PR to master/agent/trunk, Node 22, `npm ci` + `npm test` in `aloop/cli/dashboard` ✓
- SPEC-ADDENDUM line 122: 28 non-ui components have `.test.tsx` (30 total including 2 ui/) — confirmed via prior Glob ✓
- SPEC-ADDENDUM line 123: 28 non-ui components have `.stories.tsx` (41 total) ✓
- README lines 22–28: all 6 finalizer agents listed (Spec-gap, Docs, Spec-review, Final-review, Final-qa, Proof) ✓
- README line 246: `PROMPT_spec-review.md` in template list ✓
- TypeScript fixes intact: `afterEach` at `Sidebar.test.tsx:3`; `iterationStartedAt` in `ActivityPanel.test.tsx:14` baseProps ✓

### Gates 2–9 — PASS / N/A

No code changed since last review. All conclusions from prior PASS review (afbf4e6c3) carry forward unchanged. Concrete observation: `QACoverageBadge.test.tsx` parseQACoveragePayload tests assert exact return values (`toEqual({ percentage: null, available: false, features: [] })`) — thorough, no anti-patterns detected.

---

## Review — 2026-03-31 — commits 091afbeee..4e8918f9e (final-review, spec-review trigger — seventh pass)

**Verdict: PASS** (0 findings)
**Scope:** Commits 79d1b1612, 7eb33f105, 91ca070f1, 4e8918f9e — `README.md` (91ca070f1 adds `.aloop/pipeline.yml` and `agents/<name>.yml` to architecture section); all others are review/bookkeeping only.

**Prior findings resolution:**
- All prior findings remain resolved. No regressions introduced.

### Gate 1 (Spec Compliance) — PASS

`91ca070f1` adds `.aloop/pipeline.yml` and `agents/<name>.yml` to README architecture section (lines 287–289). Both files actively used by `compile-loop-plan.ts`; SPEC §4078 and §4082 confirm them. Verified: `.aloop/pipeline.yml` exists on disk; agents directory contains 5 yml files. All Issue #38 ACs remain satisfied:
- `.github/workflows/ci.yml`: triggers push+PR master/agent/trunk, Node 22, `npm ci` + `npm test` in `aloop/cli/dashboard` ✓
- SPEC-ADDENDUM line 122: 28 non-ui components have `.test.tsx` — spot-checked via `find`: 28 files returned ✓
- SPEC-ADDENDUM line 123: 28 non-ui components have `.stories.tsx` — spot-checked via `find`: 28 files returned ✓
- README lines 22–28: all 6 finalizer agents listed (Spec-gap, Docs, Spec-review, Final-review, Final-qa, Proof) ✓
- README line 246: `PROMPT_spec-review.md` in template list ✓

### Gates 2–9 — PASS / N/A

No code changes since last substantive review. All gate conclusions carry forward. Concrete observation: README architecture section (lines 284–289) now correctly lists `RESEARCH.md`, `REVIEW_LOG.md`, `docs/conventions/`, `.aloop/pipeline.yml`, and `agents/<name>.yml` — the directory listing matches actual file structure on disk.

---

## Review — 2026-03-31 — commits 4e8918f9e..7d59ffa79 (final-review, spec-review trigger — ninth pass)

**Verdict: PASS** (0 findings)
**Scope:** `README.md` (commit `cea231924` — sync CLI flags and orchestrator behavior); commits `02f4faec1`, `3653cd767`, `063be9a50`, `7d59ffa79` are review/QA bookkeeping only (TODO.md, QA_COVERAGE.md, QA_LOG.md).

**Prior findings resolution:**
- All prior findings remain resolved. The eighth review (`7d59ffa79`) verified `cea231924` and updated TODO.md only (no REVIEW_LOG entry was written). This entry covers that scope.

### Gate 1 (Spec Compliance) — PASS

Three README corrections in `cea231924` verified against actual CLI source:
- `aloop steer <instruction>`: `index.ts:168` confirms `.command('steer <instruction>')` — README correction accurate ✓
- `--auto-merge` flag: `index.ts:160` has `.option('--auto-merge', 'Create a PR from trunk to main when all issues complete')` — README example accurate ✓
- `agent/trunk` default with `--trunk` override: `index.ts:150` has `.option('--trunk <branch>', 'Target branch for merged PRs', 'agent/trunk')` — PR lifecycle description accurate ✓

All Issue #38 ACs remain satisfied (unchanged since prior PASS reviews):
- `.github/workflows/ci.yml`: triggers push+PR master/agent/trunk, Node 22, `npm ci` + `npm test` in `aloop/cli/dashboard` ✓
- SPEC-ADDENDUM line 122: 28 non-ui components have `.test.tsx` ✓
- SPEC-ADDENDUM line 123: 28 non-ui components have `.stories.tsx` ✓
- README lines 22–28: all 6 finalizer agents listed (Spec-gap, Docs, Spec-review, Final-review, Final-qa, Proof) ✓
- README line 246: `PROMPT_spec-review.md` in template list ✓
- TypeScript fixes intact: `afterEach` at `Sidebar.test.tsx:3`; `iterationStartedAt` in `ActivityPanel.test.tsx:14` baseProps ✓

### Gate 2 (Test Depth) — N/A

No test code changed.

### Gate 3 (Coverage) — N/A

No code branches added.

### Gate 4 (Code Quality) — PASS

README changes are minimal (3 targeted corrections). No dead content, no duplication.

### Gate 5 (Integration Sanity) — PASS

No code changes since last confirmed dynamic run (`tsc --noEmit` exit 0, 632 tests pass at `6650dcf30`). Zero regression risk.

### Gate 6 (Proof) — N/A

Documentation-only change. Skipping proof is the correct outcome.

### Gate 7 (Runtime Layout) — N/A

No CSS or layout changes.

### Gate 8 (Version Compliance) — N/A

No dependency changes.

### Gate 9 (Documentation) — PASS

`cea231924` IS the documentation change. All three corrections verified against CLI source:
- `README.md:205`: `aloop steer <instruction>` — accurate per `index.ts:168` ✓
- `README.md:62–64`: `--auto-merge` example — accurate per `index.ts:160` ✓
- `README.md:52`: `agent/trunk` default + `--trunk` override — accurate per `index.ts:150` ✓

---

## Review — 2026-03-31 — commits 7d59ffa79..bc1b12b5a (final-review, spec-review trigger — tenth pass)

**Verdict: PASS** (0 findings)
**Scope:** `README.md` (commit `586afd444` — document --in-place, --watch, and --non-interactive flags); commits `be1188dc8` and `bc1b12b5a` are spec-gap/review bookkeeping only (TODO.md).

**Prior findings resolution:**
- All prior findings remain resolved. No regressions introduced.

### Gate 1 (Spec Compliance) — PASS

Three README documentation additions verified against SPEC and implementation:
- `--in-place`: SPEC line 913 defines it; `start.ts:783` implements `!options.inPlace && worktreeDefault` — README code example accurate ✓
- `--watch`: SPEC line 1243 AC defines it; `status.ts:87,102` implements with `setInterval` — README table entry accurate ✓
- `--non-interactive`: SPEC line 946 defines it; `setup.ts:127-128` implements it — README table entry accurate ✓

All Issue #38 ACs remain satisfied (unchanged since prior PASS reviews):
- `.github/workflows/ci.yml`: triggers push+PR master/agent/trunk, Node 22, `npm ci` + `npm test` in `aloop/cli/dashboard` ✓
- SPEC-ADDENDUM line 122: 28 non-ui components have `.test.tsx` ✓
- SPEC-ADDENDUM line 123: 28 non-ui components have `.stories.tsx` ✓
- README lines 22–28: all 6 finalizer agents listed (Spec-gap, Docs, Spec-review, Final-review, Final-qa, Proof) ✓
- README line 246: `PROMPT_spec-review.md` in template list ✓
- TypeScript fixes intact: `afterEach` at `Sidebar.test.tsx:3`; `iterationStartedAt` in `ActivityPanel.test.tsx:14` baseProps ✓

### Gate 2 (Test Depth) — N/A

No test code changed.

### Gate 3 (Coverage) — N/A

No code branches added.

### Gate 4 (Code Quality) — PASS

Three targeted README additions — minimal, non-redundant, accurate. No dead content.

### Gate 5 (Integration Sanity) — PASS

Documentation-only change. No code paths affected. Last confirmed dynamic run at `6650dcf30` (tsc exit 0, 632 tests pass); no code changed since.

### Gate 6 (Proof) — N/A

Documentation-only. Skipping proof is the correct outcome.

### Gate 7 (Runtime Layout) — N/A

No CSS or layout changes.

### Gate 8 (Version Compliance) — N/A

No dependency changes.

### Gate 9 (Documentation) — PASS

This commit IS the documentation change. All three additions verified against SPEC and CLI source. Concrete observation: `start.ts:783` uses `!options.inPlace && worktreeDefault` — the README example `aloop start --in-place --provider claude` correctly describes skip-worktree behavior.

---

## Review — 2026-03-31 — commit af4f65c56 (final-review, spec-review trigger — twelfth pass)

**Verdict: PASS** (0 findings)
**Scope:** Full Issue #183 implementation — no new code since last review (`af4f65c56` HEAD). Comprehensive final pass confirming readiness for PR.

**Prior findings resolution:**
- All prior findings from all iterations resolved. No regressions. Nothing new to fix.

### Gate 1 (Spec Compliance) — PASS

All Issue #183 ACs satisfied, verified by direct file inspection:
- SPEC-ADDENDUM line 122: 28 non-ui components have `.test.tsx` (28 files confirmed by `find | grep -v ui/`) ✓
- SPEC-ADDENDUM line 123: 28 non-ui components have `.stories.tsx` (28 files confirmed) ✓
- `.github/workflows/ci.yml`: triggers push+PR to master/agent/trunk, Node 22, `npm ci` + `npm test` in `aloop/cli/dashboard` ✓
- README finalizer prose (lines 22–28): all 6 agents (Spec-gap, Docs, Spec-review, Final-review, Final-qa, Proof) ✓
- README template list: `PROMPT_spec-review.md`, `PROMPT_final-qa.md`, `PROMPT_final-review.md` all present ✓
- TypeScript fixes intact: `afterEach` at `Sidebar.test.tsx:3`; `iterationStartedAt` in `ActivityPanel.test.tsx:14` ✓

Concrete observation: `QACoverageBadge.test.tsx` tests `parseQACoveragePayload` with exact value assertions (`toEqual({ percentage: null, available: false, features: [] })`) and covers all 3 badge color branches (`green`/`yellow`/`red`) with concrete className checks — the most recently added module meets the ≥90% new-module branch coverage threshold.

### Gate 2 (Test Depth) — PASS

No tests changed in this final pass. All previously reviewed test files confirmed passing with concrete value assertions (no toBeDefined/truthy-only patterns). Marginal cases accepted in prior reviews (date regex in ActivityPanel, timer truthy in Header) remain unchanged.

### Gate 3 (Coverage) — PASS

No new code. Coverage stable. All branches covered per prior reviews.

### Gate 4 (Code Quality) — PASS

No dead code, no uncommitted changes. Working tree is clean.

### Gate 5 (Integration Sanity) — PASS

Last confirmed dynamic test run: `npm run type-check` exit 0 (zero errors), 632 tests pass. No code changed since that run.

### Gate 6 (Proof) — PASS

No proof artifacts required — this is a CI/test infrastructure + documentation change. PR_DESCRIPTION.md explicitly notes "No screenshots needed — purely internal test infrastructure and CI workflow changes." Correct outcome.

### Gate 7 (Runtime Layout) — N/A

No CSS or layout changes in the entire issue scope.

### Gate 8 (Version Compliance) — N/A

No dependency changes introduced in this issue.

### Gate 9 (Documentation) — PASS

README accurately reflects implementation state: CLI flags (`--in-place`, `--watch`, `--non-interactive`) verified against SPEC and source; Storybook component list correct (non-existent AppShell removed, real components ArtifactViewer/ProviderHealth/CostDisplay added); finalizer prose and template list complete. `PR_DESCRIPTION.md` present and accurate.

---

## Review — 2026-03-31 — commit b301ceccc (final-review, spec-review trigger — fifteenth pass)

**Verdict: PASS** (0 findings)
**Scope:** Commit `b301ceccc` — review bookkeeping only (TODO.md, +14 lines spec-gap re-run note). No code or documentation changed since the fourteenth review pass at `6b3058ca7`.

**Prior findings resolution:**
- All prior findings remain resolved. Fourteenth pass reviewed `6b3058ca7` (docs: aloop gh subcommands) and confirmed PASS. Nothing changed since.

### Gate 1 (Spec Compliance) — PASS

No new changes to audit. All Issue #183 ACs verified and stable since prior PASS reviews:
- `.github/workflows/ci.yml`: triggers push+PR master/agent/trunk, Node 22, `npm ci` + `npm test` in `aloop/cli/dashboard` ✓
- SPEC-ADDENDUM line 122: 28 non-ui components have `.test.tsx` (30 total including 2 ui/) ✓
- SPEC-ADDENDUM line 123: 28 non-ui components have `.stories.tsx` (41 total) ✓
- README lines 22–28: all 6 finalizer agents listed (Spec-gap, Docs, Spec-review, Final-review, Final-qa, Proof) ✓
- README line 246: `PROMPT_spec-review.md` in template list ✓
- TypeScript fixes intact: `afterEach` at `Sidebar.test.tsx:3`; `iterationStartedAt` in `ActivityPanel.test.tsx:14` baseProps ✓
- `aloop gh start/watch/status/stop` subcommands documented in README — verified against `gh.ts` in fourteenth review ✓

Concrete observation: `TODO.md` line 96 confirms the spec-gap re-run found no new gaps; all 13th-pass findings are pre-existing P2 issues (loop.sh model default, on_start config block, spec-gap periodic scheduling) that are correctly scoped out of Issue #183.

### Gates 2–9 — PASS / N/A

No code or documentation changed since last review. All gate conclusions from prior PASS reviews carry forward. `PR_DESCRIPTION.md` is present and complete.

---

## Review — 2026-03-31 — commits b301ceccc..912611ad5 (final-review, spec-review trigger — sixteenth pass)

**Verdict: PASS** (0 findings)
**Scope:** `README.md` (commit `765558dcc` — correct auth failure behavior in provider health section); commit `912611ad5` is review bookkeeping only (TODO.md, +11 lines spec-review approval note).

**Prior findings resolution:**
- All prior findings remain resolved. Fifteenth pass reviewed `b301ceccc` and confirmed PASS. Nothing changed since beyond the docs fix in `765558dcc`.

### Gate 1 (Spec Compliance) — PASS

`README.md` commit `765558dcc` fixes auth failure documentation:
- Old: "Auth failures use longer cooldowns (10min → 30min → 1hr) but still auto-retry" — **incorrect per SPEC**
- New: "Auth failures mark the provider as `degraded` — skipped entirely until you manually fix the credentials. Transient failures use exponential backoff cooldowns (auto-retry)."
- SPEC line 151: `Auth error (expired token, invalid key) | auth | degraded (no auto-recover)` ✓
- SPEC line 130: "`degraded` — persistent failure (auth expired, quota exhausted), requires user action" ✓
- SPEC line 191 (AC): "Auth failures mark provider as `degraded` (no auto-recover)" ✓

Concrete observation: The old documentation was actively misleading (suggesting auth errors auto-retry via longer cooldowns). The fix correctly distinguishes between transient failures (backoff, auto-retry) and auth failures (degraded, manual fix). SPEC §"All providers in cooldown/degraded" sleep logic (line 170) correctly reflected in README.

All Issue #183 ACs remain satisfied (unchanged since prior PASS reviews).

### Gate 2 (Test Depth) — N/A

No test changes.

### Gate 3 (Coverage) — N/A

No new code branches.

### Gate 4 (Code Quality) — PASS

One-line README edit. Clean, no dead content introduced.

### Gate 5 (Integration Sanity) — PASS

README-only change — zero regression risk. Last confirmed dynamic run at `6650dcf30` (tsc exit 0, 632 tests pass); no code changed since.

### Gate 6 (Proof) — N/A

Documentation-only change. Skipping is correct.

### Gate 7 (Runtime Layout) — N/A

No CSS or layout changes.

### Gate 8 (Version Compliance) — N/A

No dependency changes.

### Gate 9 (Documentation) — PASS

This IS the documentation fix. README line 160 now accurately describes SPEC-specified behavior (auth → degraded/manual, transient → backoff/auto-retry). Verified against SPEC lines 130, 151, 191. `PR_DESCRIPTION.md` remains present and complete.

---

## Review — 2026-03-31 — commit 224d16c31..5c9765296 (spec-review trigger)

**Verdict: PASS** (0 findings)
**Scope:** `README.md` (commit 5c9765296 — adds loop-plan.json, queue/, requests/ to session directory architecture section)

**Prior findings:** None pending — last review (224d16c31) was PASS.

### Gate 1 (Spec Compliance) — PASS

Three runtime files/dirs added to the README architecture section. Verified against SPEC:
- `loop-plan.json` "Compiled cycle + finalizer arrays, position state" — matches SPEC lines 38-44, 275 (loop reads/writes loop-plan.json for cyclePosition, finalizerPosition, cycle[], finalizer[]) ✓
- `queue/` "Override prompts (processed before next iteration)" — matches SPEC line 38 ("check queue/ folder for override prompts before anything else") ✓
- `requests/` "Agent side-effect requests (GitHub ops, child dispatch)" — matches SPEC lines 46, 73-74, 93-94 ✓

### Gate 2 (Test Depth) — N/A

No tests changed.

### Gate 3 (Coverage) — N/A

No code changed.

### Gate 4 (Code Quality) — PASS

Clean, minimal README addition. No dead content introduced. Descriptions are concise and non-redundant.

### Gate 5 (Integration Sanity) — PASS

Documentation-only change — zero regression risk. Last confirmed dynamic run: tsc exit 0, 632 tests pass; no code changed since.

### Gate 6 (Proof) — N/A

Documentation-only. Empty artifacts is the correct outcome.

### Gate 7 (Runtime Layout) — N/A

No CSS or layout changes.

### Gate 8 (Version Compliance) — N/A

No dependency changes.

### Gate 9 (Documentation) — PASS

This IS the documentation change. The three additions fill a real gap: these runtime files/dirs are central to the inner loop protocol but were previously absent from the README architecture diagram. Content verified accurate per SPEC.

---

## Review — 2026-03-31 — commits 612415ca3..95b69712f (final-review, spec-review trigger — twenty-first pass)

**Verdict: PASS** (0 findings)
**Scope:** `README.md` (commit `45a82565c` — corrects sidebar description from 4-level hierarchy to "grouped by project, with active/recent session separation"); commit `95b69712f` is review bookkeeping only (TODO.md, +10 lines spec-gap re-run note).

**Prior findings resolution:**
- All prior findings remain resolved. No regressions introduced.
- Process note: The 20th review (95b69712f) correctly judged `45a82565c` as PASS but failed to append a REVIEW_LOG.md entry — only TODO.md was updated. This entry retroactively covers that scope.

### Gate 1 (Spec Compliance) — PASS

README change verified against `Sidebar.tsx` implementation:
- Old: "Session sidebar with hierarchy (repo > project > issue > session)" — inaccurate, no such 4-level hierarchy exists in the code
- New: "Session sidebar grouped by project, with active/recent session separation"
- `Sidebar.tsx:43–47`: groups `active` sessions by `s.projectName` — "grouped by project" accurate ✓
- `Sidebar.tsx:30–41`: splits sessions into `active` (running or within 24h) vs `older` — "active/recent session separation" accurate ✓

Concrete observation: `Sidebar.tsx:36` uses `s.isActive || s.status === 'running' || age < cutoff` (24h cutoff) to define active/recent sessions. The new README description matches this logic precisely.

All Issue #183 ACs remain satisfied (unchanged since prior PASS reviews):
- `.github/workflows/ci.yml`: triggers push+PR master/agent/trunk, Node 22, `npm ci` + `npm test` in `aloop/cli/dashboard` ✓
- SPEC-ADDENDUM line 122: 28 non-ui components have `.test.tsx` ✓
- SPEC-ADDENDUM line 123: 28 non-ui components have `.stories.tsx` ✓
- README lines 22–28: all 6 finalizer agents listed ✓
- README line 246: `PROMPT_spec-review.md` in template list ✓
- TypeScript fixes intact ✓

### Gate 2 (Test Depth) — N/A

No tests changed.

### Gate 3 (Coverage) — N/A

No code branches added.

### Gate 4 (Code Quality) — PASS

One-line README edit. Clean, no dead content introduced.

### Gate 5 (Integration Sanity) — PASS

Documentation-only change — zero regression risk. Last confirmed dynamic run: `tsc --noEmit` exit 0, 632 tests pass. No code changed since.

### Gate 6 (Proof) — N/A

Documentation-only change. Skipping is the correct outcome.

### Gate 7 (Runtime Layout) — N/A

No CSS or layout changes.

### Gate 8 (Version Compliance) — N/A

No dependency changes.

### Gate 9 (Documentation) — PASS

This IS the documentation fix. Sidebar description corrected from non-existent 4-level hierarchy to accurate project-grouping description. Verified against `Sidebar.tsx` lines 27–49. `PR_DESCRIPTION.md` updated to include this correction.

---

## Review — 2026-03-31 — commits 1cf0828d2..1cf0828d2 (final-review, spec-review trigger — twenty-fifth pass)

**Verdict: PASS** (0 findings)
**Scope:** No new changes since twenty-fourth spec-review pass. HEAD is `1cf0828d2` (review bookkeeping — TODO.md only). Last code/docs commit was `4b2ac4a28` (docs: fix steering-history directory), already reviewed and approved in twenty-fourth pass.

**Prior findings resolution:**
- All prior findings remain resolved. No regressions introduced.

### Gate 1 (Spec Compliance) — PASS

No code changes. All Issue #183 ACs verified in prior passes remain satisfied:
- `.github/workflows/ci.yml`: present, triggers push+PR master/agent/trunk, Node 22, npm ci + npm test ✓
- SPEC-ADDENDUM line 122: 28 non-ui components have `.test.tsx` ✓
- SPEC-ADDENDUM line 123: 28 non-ui components have `.stories.tsx` ✓
- README finalizer prose: all 6 agents listed ✓
- README template list: PROMPT_spec-review.md, PROMPT_final-qa.md, PROMPT_final-review.md ✓
- TypeScript fixes intact ✓

Concrete observation: `PR_DESCRIPTION.md` exists at repo root with complete verification checklist — all 8 ACs marked `[x]` with specific evidence (ci.yml file read, tsc exit 0, 632 tests pass, SPEC line citations).

### Gates 2–9 — N/A

No code, test, dependency, or documentation changes in scope. All gates pass by absence of change.

---

## Review — 2026-03-31 — commits f18c8609a..f18c8609a (final-review, spec-review trigger — twenty-third pass)

**Verdict: PASS** (0 findings)
**Scope:** No code changes since twenty-second spec-review pass. Commits `39c041c33` (docs PASS — no file changes), `f18c8609a` (review chore — TODO.md only), `f6e9c30ea` (spec-gap PASS — TODO.md only), `84b49fe0a` (qa PASS — TODO.md only). All are bookkeeping only.

**Prior findings resolution:**
- All prior findings remain resolved. No regressions introduced.

### Gate 1 (Spec Compliance) — PASS

No code changes. All Issue #183 ACs verified in the twenty-second pass remain satisfied:
- `.github/workflows/ci.yml`: present, triggers push+PR master/agent/trunk, Node 22, npm ci + npm test ✓
- SPEC-ADDENDUM line 122: 28 non-ui components have `.test.tsx` ✓
- SPEC-ADDENDUM line 123: 28 non-ui components have `.stories.tsx` ✓
- README finalizer prose: all 6 agents listed ✓
- README template list: PROMPT_spec-review.md, PROMPT_final-qa.md, PROMPT_final-review.md ✓
- TypeScript fixes intact ✓

Concrete observation: `PR_DESCRIPTION.md` exists at repo root with complete verification checklist — all 8 ACs marked `[x]` with specific evidence citations (e.g. `ci.yml` file read, `tsc --noEmit` exit 0, 632 tests pass).

### Gates 2–9 — N/A

No code, test, dependency, or documentation changes in scope. All gates pass by absence of change.

---
