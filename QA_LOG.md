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
