# Issue #86: Proof Artifact Display — Inline rendering in activity log

## Current Phase: Spec-Gap Analysis

### Completed
- [x] `ArtifactViewer` / inline artifact rendering in `ActivityPanel` — `aloop/cli/dashboard/src/AppView.tsx:1376-1431`
- [x] Image thumbnails: clickable, 150px max, lazy loading — `AppView.tsx:1378-1394`
- [x] `ImageLightbox` component: full-size overlay, Escape to close, click-outside dismiss — `AppView.tsx:1499-1511`
- [x] `ArtifactComparisonDialog`: side-by-side, slider, diff-overlay modes with history scrubbing — `AppView.tsx:1525+`
- [x] Diff percentage badge: green (<5%), yellow (5-20%), red (>20%) — `AppView.tsx:1423-1427`
- [x] Error fallback: `onError` hides broken `<img>`, inserts "Failed to load" text — `AppView.tsx:1385-1392`
- [x] `/api/artifacts/{iteration}/{filename}` endpoint with path-traversal protection — `dashboard.ts:984-1011`

### Spec-Gap Analysis
- [ ] [spec-gap] **P2**: Non-image artifacts not rendered as syntax-highlighted code blocks. SPEC.md says `.ts`, `.json`, `.md` etc. should render as "syntax-highlighted code blocks" (acceptance criterion 4). Code (`AppView.tsx:1395-1404`) only shows a file icon + truncated filename — artifact content is never fetched or displayed inline. **Suggested fix:** Fetch artifact content via `/api/artifacts/` endpoint and render in a `<pre><code>` block (SPEC technical notes suggest `highlight.js` or CSS-only approach).
