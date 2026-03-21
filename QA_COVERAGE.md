# QA Coverage — Issue #86: Proof Artifact Display

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| Inline artifacts in activity log | 2026-03-21 | 79f1ae8 | PASS | Proof entries expand to show artifact count + descriptions |
| Image thumbnails (~150px, lazy) | 2026-03-21 | 79f1ae8 | PASS | 150x85px, loading="lazy", cursor=pointer — all per spec |
| Lightbox on thumbnail click | 2026-03-21 | 79f1ae8 | FAIL | Click navigates to different session instead of opening lightbox overlay. Bug filed. |
| Non-image syntax highlighting | 2026-03-21 | 79f1ae8 | PASS | `<code class="language-json">` and `language-plaintext` classes rendered correctly |
| Diff percentage badge colors | 2026-03-21 | 79f1ae8 | FAIL | No per-artifact diff badges rendered. Manifest lacks diff_percent data. Bug filed. |
| Error fallback for failed loads | 2026-03-21 | 79f1ae8 | PASS | "Failed to load image" placeholder shown for broken URLs |
| Artifact API Content-Type | 2026-03-21 | 79f1ae8 | FAIL | Returns `application/json` for all file types instead of correct MIME. Bug filed. |
