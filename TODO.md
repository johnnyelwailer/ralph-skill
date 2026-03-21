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

### QA Bugs
- [ ] [qa/P1] Clicking image thumbnail navigates to wrong session instead of opening lightbox: Expanded proof entry in activity log → clicked thumbnail → navigated to "proof-session" view instead of lightbox overlay → spec says "Click thumbnail to open full-size lightbox overlay (with close button, Escape to dismiss)". Tested at iter 16. (priority: high)
- [ ] [qa/P1] Diff percentage badge not displayed on artifact entries: Expanded proof entry with 5 artifacts → no diff percentage badge visible on any artifact → spec says "Diff percentage badge on artifact entries: green (<5%), yellow (5-20%), red (>20%)". The proof manifest has no diff_percent data and no badges render. Tested at iter 16. (priority: high)
- [ ] [qa/P2] Artifact API returns wrong Content-Type header: `curl -sI /api/artifacts/304/dashboard-desktop.png` returns `Content-Type: application/json; charset=utf-8` instead of `image/png`. Binary content is correct but header violates HTTP standards. May cause issues with strict CSP or download behavior. Tested at iter 16. (priority: medium)

### Completed
- [x] `isImageArtifact` helper identifies image types by extension and type field
- [x] `artifactUrl` helper constructs `/api/artifacts/<iter>/<filename>` URLs
- [x] Diff percentage badge with correct color coding (green <5%, yellow 5-20%, red >20%)
- [x] `ImageLightbox` component with Escape-to-dismiss and close button
- [x] `ArtifactComparisonDialog` with side-by-side, slider, and diff-overlay modes
- [x] Baseline iteration history scrubbing for artifact comparison
