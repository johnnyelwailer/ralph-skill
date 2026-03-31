# QA Log

## QA Session — 2026-03-31 (iteration 1)

### Test Environment

- Working directory: worktree root (host session — not testing lifecycle commands)
- Dashboard directory: `aloop/cli/dashboard/`
- Features tested: 3
- Node available: yes (`npm` in dashboard has deps installed)

### Results

- PASS: CI workflow file exists and is valid YAML
- PASS: `npm test` runs vitest in dashboard (45 files, 588 tests)
- FAIL: Component test coverage — 6 components missing `.test.tsx` files (4 new)
- FAIL: Component story coverage — 13 components missing `.stories.tsx` files (10 new)

### Bugs Filed

- [qa/P1] 4 components missing `.test.tsx`: ActivityPanel, ArtifactComparisonHeader, DiffOverlayView, SideBySideView
- [qa/P1] 10 components missing `.stories.tsx`: ResponsiveLayout, ActivityPanel, ArtifactComparisonDialog, ArtifactComparisonHeader, DiffOverlayView, ImageLightbox, LogEntryExpandedDetails, LogEntryRow, SideBySideView, SliderView

### Command Transcript

```
# Check CI workflow
$ cat .github/workflows/ci.yml
# Output: valid YAML, correct triggers, Node 22, npm ci + npm test in aloop/cli/dashboard
# Exit: 0

# Validate YAML
$ python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); print('YAML valid')"
YAML valid
# Exit: 0

# Run dashboard tests
$ cd aloop/cli/dashboard && npm test
> aloop-dashboard@1.0.0 test
> vitest run

[Note: 2 console errors logged for useResponsiveLayout outside <ResponsiveLayout>
 — these are expected, from ResponsiveLayout.test.tsx testing the .toThrow() case]

 Test Files  45 passed (45)
       Tests  588 passed (588)
    Start at  11:28:36
    Duration  4.09s
# Exit: 0

# Check component test coverage
$ find components/ -name "*.tsx" | grep -v test | grep -v stories | grep -v "/ui/" | \
  while read f; do base="${f%.tsx}"; [ ! -f "${base}.test.tsx" ] && echo "NO TEST: $f"; done
NO TEST: ./layout/CollapsedSidebar.tsx
NO TEST: ./layout/SidebarContextMenu.tsx
NO TEST: ./session/ActivityPanel.tsx
NO TEST: ./session/ArtifactComparisonHeader.tsx
NO TEST: ./session/DiffOverlayView.tsx
NO TEST: ./session/SideBySideView.tsx

# Check component story coverage
$ find components/ -name "*.tsx" | grep -v test | grep -v stories | grep -v "/ui/" | \
  while read f; do base="${f%.tsx}"; [ ! -f "${base}.stories.tsx" ] && echo "NO STORY: $f"; done
NO STORY: ./layout/CollapsedSidebar.tsx
NO STORY: ./layout/ResponsiveLayout.tsx
NO STORY: ./layout/SidebarContextMenu.tsx
NO STORY: ./session/ActivityPanel.tsx
NO STORY: ./session/ArtifactComparisonDialog.tsx
NO STORY: ./session/ArtifactComparisonHeader.tsx
NO STORY: ./session/DiffOverlayView.tsx
NO STORY: ./session/ImageLightbox.tsx
NO STORY: ./session/LogEntryExpandedDetails.tsx
NO STORY: ./session/LogEntryRow.tsx
NO STORY: ./session/SideBySideView.tsx
NO STORY: ./session/SliderView.tsx
NO STORY: ./shared/QACoverageBadge.tsx
```

## QA Session — 2026-03-31 (iteration final-qa)

### Test Environment
- Binary under test: /tmp/aloop-test-install-JskkRK/bin/aloop (version 1.0.0)
- Commit: 613a7bab4
- Features tested: 5 (re-tests of all previously tracked items)

### Results
- PASS: `.github/workflows/ci.yml` exists and is valid YAML — correct triggers, Node 22, npm ci + npm test
- PASS: CI workflow Node 22 + npm ci setup — confirmed via `cat ci.yml`
- PASS: `npm test` (vitest) in dashboard — 51 test files, 632 tests, exit 0
- PASS: Every non-ui component has `.test.tsx` — no missing files
- PASS: Every non-ui component has `.stories.tsx` — no missing files
- PASS: TypeScript type-check (`tsc --noEmit`) — **previously FAIL, now PASS** — both errors resolved

### Bugs Filed
- None. All previously filed bugs are resolved.

### Command Transcript

```
# Install CLI from packaged source
ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
echo "Binary under test: $ALOOP_BIN"
# → Binary under test: /tmp/aloop-test-install-JskkRK/bin/aloop
$ALOOP_BIN --version
# → 1.0.0

# Run TypeScript type-check (was FAIL in iter 3 with 2 errors)
npm --prefix aloop/cli/dashboard run type-check
# → (no output)
# Exit: 0  ← PASS (previously non-zero)

# Run full vitest suite
npm --prefix aloop/cli/dashboard test -- --run
# → Test Files  51 passed (51)
# → Tests       632 passed (632)
# → Duration    5.11s
# Exit: 0

# Check .test.tsx coverage (non-ui components)
find aloop/cli/dashboard/src/components -name "*.tsx" ! -name "*.test.tsx" ! -name "*.stories.tsx" ! -path "*/ui/*" | while read f; do base="${f%.tsx}"; [ ! -f "${base}.test.tsx" ] && echo "NO TEST: $f"; done
# → (no output — all components have test files)

# Check .stories.tsx coverage (non-ui components)
find aloop/cli/dashboard/src/components -name "*.tsx" ! -name "*.test.tsx" ! -name "*.stories.tsx" ! -path "*/ui/*" | while read f; do base="${f%.tsx}"; [ ! -f "${base}.stories.tsx" ] && echo "NO STORY: $f"; done
# → (no output — all components have story files)

# Verify ci.yml
cat .github/workflows/ci.yml
# → name: CI; on: push+PR to master,agent/trunk; Node 22 via actions/setup-node@v4; working-directory: aloop/cli/dashboard; npm ci then npm test
```
## QA Session — 2026-03-31 (iteration 3)

### Test Environment
- Binary under test: /tmp/aloop-test-install-w1lqjx/bin/aloop (version 1.0.0)
- Commit: 2d02591e7b0cd07ef37591448efca8099defb23e
- Features tested: 5

### Results
- PASS: ci.yml exists and is valid YAML
- PASS: CI workflow Node 22 + npm ci setup
- PASS: npm test (vitest) runs in dashboard — 51 test files, 632 tests
- PASS: Every non-ui component has .test.tsx (previously FAIL — all 6 missing files now present)
- PASS: Every non-ui component has .stories.tsx (previously FAIL — all 13 missing files now present)
- FAIL: TypeScript type-check — 2 errors remain

### Bugs Filed
- [qa/P1] Sidebar.test.tsx:240 TS2304: `afterEach` not found (new)
- [review] ActivityPanel.test.tsx:72 TS2353: `iterationStartedAt` type error (pre-existing, tracked as [review] gate item)

### Command Transcript

```
# Install CLI from packaged source
npm --prefix aloop/cli install --silent
npm --prefix aloop/cli run test-install -- --keep
# → Binary: /tmp/aloop-test-install-w1lqjx/bin/aloop
/tmp/aloop-test-install-w1lqjx/bin/aloop --version
# → 1.0.0

# Run dashboard test suite
npm --prefix aloop/cli/dashboard test -- --run
# → Test Files: 51 passed (51)
# → Tests: 632 passed (632)
# → Duration: 4.70s
# (Note: error logged for useResponsiveLayout outside context but does not fail tests)

# Check .test.tsx coverage (non-ui components)
find src/components -name "*.tsx" ! -name "*.test.tsx" ! -name "*.stories.tsx" ! -path "*/ui/*"
# → All have corresponding .test.tsx — no missing files

# Check .stories.tsx coverage (non-ui components)
find src/components -name "*.tsx" ! -name "*.test.tsx" ! -name "*.stories.tsx" ! -path "*/ui/*"
# → All have corresponding .stories.tsx — no missing files
# (ui/sonner.stories.tsx has only 1 story but ui/ is excluded per SPEC-ADDENDUM)

# TypeScript type-check
npm --prefix aloop/cli/dashboard run type-check
# → src/components/layout/Sidebar.test.tsx(240,5): error TS2304: Cannot find name 'afterEach'.
# → src/components/session/ActivityPanel.test.tsx(72,70): error TS2353: ...iterationStartedAt...
# Exit: non-zero (2 errors)

# Check ci.yml
cat .github/workflows/ci.yml
# → Triggers on push+PR to master, agent/trunk
# → Node 22 via actions/setup-node@v4
# → working-directory: aloop/cli/dashboard
# → npm ci then npm test
```
