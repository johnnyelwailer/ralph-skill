# Issue #86: Proof Artifact Display — Inline rendering in activity log with thumbnails and lightbox

## Current Phase: Implementation

### In Progress
- [ ] [qa/P1] Fix thumbnail click event propagation: `ArtifactViewer.tsx:107` `onClick={handleClick}` does not call `e.stopPropagation()`, and `handleClick` (line 80-82) doesn't receive the event object. Click bubbles up to the parent `LogEntryRow` div (AppView.tsx:1228) which toggles `expanded`, causing the entry to collapse. Fix: pass event to `handleClick`, call `e.stopPropagation()` before invoking `onClick`. (priority: high)
- [x] [review] Gate 4: Consolidate duplicated `isImageArtifact`, `artifactUrl`, and `ArtifactEntry` — defined in `ArtifactViewer.tsx` (canonical), `AppView.tsx:216,521,525`, and `App.tsx:33,36`. Remove definitions from AppView.tsx and App.tsx, import from `ArtifactViewer.tsx`. (priority: high)
- [x] [review] Gate 3: Add `src/components/ArtifactViewer.tsx` to vitest coverage config (`dashboard/vitest.config.ts:20` `include` array only covers `App.tsx` and `AppView.tsx`). Verify ≥90% branch coverage. (priority: medium)
- [ ] [review] Gate 2: Add `langClass` output assertion to `ArtifactViewer.test.tsx` — the code block test (line 82-84) asserts content text but never checks the `<code>` element has the correct CSS class. Add: `expect(codeEl).toHaveClass('language-typescript')`. (priority: medium)

### Up Next
- [ ] Migrate `ImageLightbox` to use Radix `Dialog` primitive for accessible modal (spec requirement). `@radix-ui/react-dialog` is a transitive dependency but not direct — add it to `package.json`. Current lightbox (AppView.tsx:1464-1476) is a custom div overlay without focus trapping or ARIA. (priority: medium)
- [ ] [qa/P1] Diff percentage badge not displayed: proof manifest data lacks `diff_percent` field, so the badge (AppView.tsx:1377-1381) never renders. Investigate proof manifest generation to populate `metadata.diff_percentage` on artifact entries. (priority: high)
- [ ] [qa/P2] Artifact API returns wrong Content-Type header: `/api/artifacts/<iter>/<filename>` returns `application/json` instead of the correct MIME type for the file. Server-side fix needed. (priority: medium)
- [ ] [review] Gate 2: Add test for `ImageThumbnail` loading spinner — the spinner overlay (ArtifactViewer.tsx:95-98) renders initially but no test asserts its presence before `onLoad` fires. (priority: low)
- [ ] [review] Gate 6: Capture proof screenshots into artifacts directory. Current QA evidence at `/tmp/` paths is ephemeral. Proof agent should capture before/after screenshots of the ArtifactViewer rendering into a committed artifacts location. (priority: high)

### Completed
- [x] Create `ArtifactViewer` component — renders image thumbnails (~150px, lazy loading) and syntax-highlighted code blocks with `langClass` helper
- [x] Add loading states (spinner overlay for images, Loader2 + text for code blocks)
- [x] Add error fallbacks (AlertTriangle + error text for both image and code fetch failures)
- [x] Wire `ArtifactViewer` into `LogEntryRow` (AppView.tsx:1384-1394) with `onImageClick` that opens lightbox or comparison dialog
- [x] `isImageArtifact` helper identifies image types by extension and type field
- [x] `artifactUrl` helper constructs `/api/artifacts/<iter>/<filename>` URLs
- [x] Diff percentage badge with correct color coding (green <5%, yellow 5-20%, red >20%)
- [x] `ImageLightbox` component with Escape-to-dismiss and close button
- [x] `ArtifactComparisonDialog` with side-by-side, slider, and diff-overlay modes
- [x] Baseline iteration history scrubbing for artifact comparison
