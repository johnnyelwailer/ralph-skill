# Issue #86: Proof Artifact Display — Inline rendering in activity log with thumbnails and lightbox

## Current Phase: Implementation

### In Progress

### Up Next
- [x] Create `ArtifactViewer` component that renders a single artifact — image thumbnail or syntax-highlighted code block. Extract from inline rendering in `LogEntryRow` (AppView.tsx:1360-1401). Image artifacts should render as `<img loading="lazy">` thumbnails (~150px wide). Non-image artifacts should fetch content from `/api/artifacts/<iter>/<filename>` and render as `<pre><code>` blocks. (priority: high)
- [x] Add syntax highlighting for non-image artifacts (`.ts`, `.json`, `.md`, etc.). Spec suggests `highlight.js` or CSS-only with `<pre><code>` classes. CSS-only approach with language-specific classes is lighter weight — consider using `marked` (already installed) for `.md` files and basic `<pre><code class="language-X">` for others. (priority: high)
- [x] Add loading states to `ArtifactViewer` — show a skeleton/spinner while artifact content or thumbnail is loading. Currently no loading indicator exists for artifact fetches. (priority: medium)
- [x] Add error fallbacks to `ArtifactViewer` — when an artifact image fails to load, show an error placeholder icon instead of a broken image. Use `<img onError>` for images and catch fetch errors for code artifacts. (priority: medium)
- [ ] Migrate `ImageLightbox` to use Radix `Dialog` primitive for accessible modal (spec requirement). `@radix-ui/react-dialog` is already a transitive dependency (in lock file) but not a direct dependency — needs to be added. Current lightbox is a custom div overlay without proper focus trapping or ARIA. (priority: medium)
- [x] Wire `ArtifactViewer` into `LogEntryRow` — replace the current text-link artifact list (AppView.tsx:1366-1400) with inline `ArtifactViewer` thumbnails/code blocks. Clicking an image thumbnail should still open the lightbox or comparison dialog. (priority: high)

### Completed
- [x] `isImageArtifact` helper identifies image types by extension and type field
- [x] `artifactUrl` helper constructs `/api/artifacts/<iter>/<filename>` URLs
- [x] Diff percentage badge with correct color coding (green <5%, yellow 5-20%, red >20%)
- [x] `ImageLightbox` component with Escape-to-dismiss and close button
- [x] `ArtifactComparisonDialog` with side-by-side, slider, and diff-overlay modes
- [x] Baseline iteration history scrubbing for artifact comparison
