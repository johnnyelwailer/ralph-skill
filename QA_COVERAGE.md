# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| `.github/workflows/ci.yml` exists and is valid YAML | 2026-03-31 | b0b690d61 | PASS | File exists, YAML parses cleanly, triggers on push+PR to master and agent/trunk |
| CI workflow Node 22 + npm ci setup | 2026-03-31 | b0b690d61 | PASS | actions/setup-node@v4 with node-version 22, working-directory aloop/cli/dashboard |
| `npm test` runs vitest in dashboard | 2026-03-31 | b0b690d61 | PASS | 45 test files, 588 tests all pass; jsdom configured; e2e excluded |
| Every component has .test.tsx | 2026-03-31 | b0b690d61 | FAIL | 6 components lack test files: CollapsedSidebar, SidebarContextMenu (tracked in [review]), ActivityPanel, ArtifactComparisonHeader, DiffOverlayView, SideBySideView (new [qa/P1] bugs filed) |
| Every component has .stories.tsx | 2026-03-31 | b0b690d61 | FAIL | 13 components lack story files: CollapsedSidebar, SidebarContextMenu, QACoverageBadge (tracked in [review]), plus ResponsiveLayout, ActivityPanel, ArtifactComparisonDialog, ArtifactComparisonHeader, DiffOverlayView, ImageLightbox, LogEntryExpandedDetails, LogEntryRow, SideBySideView, SliderView (new [qa/P1] bugs filed) |
