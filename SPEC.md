# Sub-Spec: Issue #86 — Proof Artifact Display: Inline rendering in activity log with thumbnails and lightbox

## Objective

Render proof artifacts inline within the activity log, with image thumbnails that expand to a lightbox view, and syntax-highlighted code blocks for non-image artifacts.

## Inputs
- `/api/artifacts/<iteration>/<filename>` endpoint (dependency)
- Activity log entries that reference proof artifacts
- `marked` library (already installed) for markdown

## Deliverables
- `ArtifactViewer` component: renders single artifact (image thumbnail or code block)
- Image artifacts: displayed as thumbnails (~150px wide) in the log entry
- Click thumbnail to open full-size lightbox overlay (with close button, Escape to dismiss)
- Non-image artifacts (`.ts`, `.json`, `.md`, etc.): rendered as syntax-highlighted code blocks
- Diff percentage badge on artifact entries: green (<5%), yellow (5-20%), red (>20%)
- Loading states and error fallbacks for failed artifact loads

## Acceptance Criteria
- [ ] Proof artifacts render inline in activity log entries
- [ ] Image artifacts show as clickable thumbnails
- [ ] Clicking thumbnail opens lightbox with full-size image
- [ ] Non-image artifacts render as syntax-highlighted code
- [ ] Diff percentage badge displays with correct color coding
- [ ] Failed artifact loads show error placeholder, not broken image

## Technical Notes
- Use `<img loading="lazy">` for thumbnails to avoid loading all images at once
- Lightbox: use Radix `Dialog` primitive for accessible modal
- Syntax highlighting: consider lightweight option like `highlight.js` or CSS-only with `<pre><code>` classes
- Parse diff percentage from proof manifest or artifact metadata

## Labels
`aloop/sub-issue`, `aloop/needs-refine`
