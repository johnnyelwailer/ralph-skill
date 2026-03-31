# Issue #38: CI: Add dashboard unit tests (vitest)

## Current Phase: Implementation

### In Progress

- [x] [qa/P1] `Sidebar.test.tsx:240` TypeScript error `TS2304: Cannot find name 'afterEach'`: ran `npm run type-check` in `aloop/cli/dashboard` → reports `Sidebar.test.tsx(240,5): error TS2304: Cannot find name 'afterEach'` → spec requires `npm run type-check` to pass (type-safe test suite). Fix: add `afterEach` to vitest imports in `Sidebar.test.tsx`. Tested at iter 3. (priority: high)
- [x] [review] Gate 5: `ActivityPanel.test.tsx:72` introduces a new TypeScript type error — `iterationStartedAt` is passed to `renderActivityPanel()` but is absent from `baseProps`, so `Partial<typeof baseProps>` doesn't include it. Fix: add `iterationStartedAt?: string` to the `baseProps` object in `ActivityPanel.test.tsx` so the helper accepts it without a type error. `npm run type-check` currently reports: `error TS2353: Object literal may only specify known properties, and 'iterationStartedAt' does not exist in type 'Partial<...>'` at line 72. (priority: high)

### Up Next

- [x] Create `.test.tsx` files for 6 components missing unit tests: `layout/CollapsedSidebar.tsx`, `layout/SidebarContextMenu.tsx`, `session/ActivityPanel.tsx`, `session/ArtifactComparisonHeader.tsx`, `session/DiffOverlayView.tsx`, `session/SideBySideView.tsx` — SPEC-ADDENDUM §"Dashboard Component Architecture" AC: "Every component in `components/` has a corresponding `.test.tsx` file." Each test file must cover props and key interactions using Testing Library. Confirmed missing by direct file listing. (priority: high)
- [x] Create `.stories.tsx` files for 13 components missing Storybook stories: `layout/CollapsedSidebar.tsx`, `layout/SidebarContextMenu.tsx`, `layout/ResponsiveLayout.tsx`, `session/ActivityPanel.tsx`, `session/ArtifactComparisonDialog.tsx`, `session/ArtifactComparisonHeader.tsx`, `session/DiffOverlayView.tsx`, `session/ImageLightbox.tsx`, `session/LogEntryExpandedDetails.tsx`, `session/LogEntryRow.tsx`, `session/SideBySideView.tsx`, `session/SliderView.tsx`, `shared/QACoverageBadge.tsx` — SPEC-ADDENDUM §"Dashboard Component Architecture" AC: "Every component in `components/` has a corresponding `.stories.tsx` file." Each stories file must export ≥2 stories covering key visual states. Confirmed missing by direct file listing. (priority: high)

### Completed
- [x] Create `.github/workflows/ci.yml` with Node.js setup, dependency install, and a dashboard unit test step that runs `npm test` in `aloop/cli/dashboard/`
- [x] Verify the workflow file is valid YAML and the test step references the correct working directory (`aloop/cli/dashboard`)

### Spec-Gap Analysis

**Issue #38 implementation verified — no gaps for CI/vitest work:**
- CI workflow (`ci.yml`) correctly runs `npm test` (vitest) in `aloop/cli/dashboard/`, triggers on PRs to master/agent/trunk, uses Node 22, runs `npm ci` first ✓
- All 6 previously missing `.test.tsx` files created: CollapsedSidebar, SidebarContextMenu, ActivityPanel, ArtifactComparisonHeader, DiffOverlayView, SideBySideView — all use Testing Library, verified by file listing ✓
- All 13 previously missing `.stories.tsx` files created — all export ≥2 named stories, verified by grep ✓
- `ui/` primitives correctly excluded from per-component test requirement per SPEC-ADDENDUM line 85: "(existing Radix primitives — keep as-is)" ✓
- QA_COVERAGE.md shows stale FAIL entries (at commit b0b690d61) for items now PASS — code is correct, doc lags; not a spec-gap

**spec-gap analysis: no new discrepancies found — Issue #38 implementation spec-compliant**

**Pre-existing P2 spec-internal inconsistency (does not block this issue, spec doc needs updating):**
- [spec-gap/P2] SPEC lines 717 and 775 (acceptance criteria in Proof and QA sections) reference a "9-step" default pipeline including proof in the cycle: `plan → build × 5 → proof → qa → review`. However, the SPEC body at lines 407–409 and 420–422 explicitly states "Proof does NOT run in the cycle — it's expensive and only meaningful as final evidence" and shows proof only in the finalizer. The `pipeline.yml` correctly implements the body text (proof in finalizer only). Fix: update SPEC ACs at lines 717 and 775 to remove proof from the cycle description and note proof runs in the finalizer only. (Spec is wrong, code is correct.)

### Spec Review — APPROVED (iter 2, 2026-03-31)

All in-scope requirements satisfied — verified against SPEC.md and SPEC-ADDENDUM.md:

**CI workflow [SPEC §"Epic Decomposition" + §"GitHub Actions integration"]:**
- [SPEC line 1781] `.github/workflows/ci.yml` created — GitHub Actions CI now exists ✓
- [SPEC line 1898] Workflow discoverable at `.github/workflows/*.yml` for orchestrator detection ✓
- Triggers on push + PR to `master` and `agent/trunk` ✓
- Node 22 via `actions/setup-node@v4` ✓
- `npm ci` installs deps in `aloop/cli/dashboard` before tests ✓
- `npm test` maps to `vitest run` in `aloop/cli/dashboard` ✓
- No Playwright/e2e tests included; jsdom configured — no browser install required ✓

**Component test files [SPEC-ADDENDUM §"Dashboard Component Architecture" AC line 122]:**
- All 28 non-ui components have `.test.tsx` files (ui/ excluded per SPEC-ADDENDUM line 85) ✓
- 6 newly added: CollapsedSidebar, SidebarContextMenu, ActivityPanel, ArtifactComparisonHeader, DiffOverlayView, SideBySideView ✓

**Component story files [SPEC-ADDENDUM §"Dashboard Component Architecture" AC line 123]:**
- All 28 non-ui components have `.stories.tsx` files ✓
- 13 newly added (all export ≥2 named stories): CollapsedSidebar, SidebarContextMenu, ResponsiveLayout, ActivityPanel, ArtifactComparisonDialog, ArtifactComparisonHeader, DiffOverlayView, ImageLightbox, LogEntryExpandedDetails, LogEntryRow, SideBySideView, SliderView, QACoverageBadge ✓

No gaps found. Issue #38 implementation is complete and spec-compliant.

### Notes
- No `.github/workflows/` directory or `ci.yml` exists on master or this branch
- The spec says "Dashboard deps should already be installed from the core workflow" but that core workflow hasn't been created yet — we need to include basic setup (checkout + Node + npm ci) so the dashboard test step can run
- Vitest uses jsdom — no browser install needed
- Do NOT include Playwright e2e tests
- Dashboard tests are in `aloop/cli/dashboard/src/App.test.tsx`, config in `vitest.config.ts`
- `npm test` maps to `vitest run` in dashboard's `package.json`
