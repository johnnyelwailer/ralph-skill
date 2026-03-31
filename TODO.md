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

**New spec-gap findings (2026-03-31):**

- [spec-gap/P2] `aloop/bin/loop.sh` default claude model (`sonnet`) disagrees with `aloop/config.yml` and `aloop/bin/loop.ps1` (both default to `opus`). SPEC §"Global Configuration" says `config.yml` is the "single source of truth" for default model IDs and "Loop scripts and setup commands inherit from here." Files: `aloop/config.yml` line 21 (`claude: opus`), `aloop/bin/loop.sh` line 33 (`CLAUDE_MODEL="${ALOOP_CLAUDE_MODEL:-sonnet}"`), `aloop/bin/loop.ps1` line 34 (`ClaudeModel = 'opus'`). Fix: update `loop.sh` default to `opus` to match `config.yml` and `loop.ps1`.

- [spec-gap/P2] `aloop/config.yml` is missing the `on_start` config block required by SPEC §"UX: Dashboard, Start Flow" (~line 1047). SPEC defines: `on_start: { monitor: dashboard, auto_open: true }` as a configurable option controlling auto-launch behavior. The key is absent from `aloop/config.yml`, meaning there is no config-layer entry point for users to control this behavior. Fix: add the `on_start` block to `aloop/config.yml` with documented defaults.

- [spec-gap/P2] Spec-gap periodic scheduling ("runs before every 2nd plan phase") is not implemented in `loop.sh` or `loop.ps1`. SPEC §"Spec-Gap Analysis Agent" line 839 states: "Spec-gap runs before every 2nd plan phase (i.e., every other cycle)" and shows `Cycle 2: spec-gap → plan → build x5 → qa → docs → review`. The loop scripts have a fixed 8-step cycle with no mechanism to inject spec-gap or docs before every 2nd plan. Spec-gap only appears in the finalizer array (`pipeline.yml` line 16). Fix: implement cycle counter in loop scripts that injects spec-gap and docs prompts at the start of every 2nd cycle, OR document that periodic scheduling is handled by compile-loop-plan generating a longer cycle array with these agents interspersed.

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

### Spec Review — APPROVED (iter 3, 2026-03-31) [reviewed: gates 1-9 pass]

TypeScript fixes verified in code — no further gaps:

- `Sidebar.test.tsx` line 3: `afterEach` imported from vitest — TS2304 resolved ✓
- `ActivityPanel.test.tsx` line 14: `iterationStartedAt: undefined as string | undefined` present in `baseProps` — TS2353 resolved ✓
- CI workflow (`ci.yml`): correct triggers, Node 22, `npm ci` + `npm test` in `aloop/cli/dashboard` ✓

All requirements satisfied. No new findings.

### Notes
- No `.github/workflows/` directory or `ci.yml` exists on master or this branch
- The spec says "Dashboard deps should already be installed from the core workflow" but that core workflow hasn't been created yet — we need to include basic setup (checkout + Node + npm ci) so the dashboard test step can run
- Vitest uses jsdom — no browser install needed
- Do NOT include Playwright e2e tests
- Dashboard tests are in `aloop/cli/dashboard/src/App.test.tsx`, config in `vitest.config.ts`
- `npm test` maps to `vitest run` in dashboard's `package.json`
