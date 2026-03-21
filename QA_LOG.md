# QA Log — Issue #86: Proof Artifact Display

## QA Session — 2026-03-21 (iteration 16)

### Test Environment
- Binary under test: /tmp/aloop-test-install-inHYAK/bin/aloop
- Version: 1.0.0
- Temp dir: /tmp/aloop-test-install-inHYAK
- Dashboard tested on: http://localhost:4042
- Session with proof data: ralph-skill-20260314-173930 (946 events, iter 304 has proof manifest)
- Session under test: orchestrator-20260321-125357-issue-86-20260321-130325
- Browser: Playwright chromium
- Features tested: 5

### Results
- PASS: Inline artifacts in activity log
- PASS: Image thumbnails (~150px, lazy loading)
- FAIL: Lightbox on thumbnail click (bug filed)
- PASS: Non-image syntax highlighting (language-json, language-plaintext)
- FAIL: Diff percentage badge colors (bug filed)
- PASS: Error fallback for failed artifact loads
- FAIL: Artifact API Content-Type header (bug filed)

### Bugs Filed
- [qa/P1] Lightbox not opening — thumbnail click navigates to session instead
- [qa/P1] Diff percentage badge missing — no badges on artifact entries
- [qa/P2] Artifact API Content-Type wrong — returns application/json for all files

### Command Transcript

#### Setup
```
$ ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
ALOOP_BIN=/tmp/aloop-test-install-inHYAK/bin/aloop

$ $ALOOP_BIN --version
1.0.0

$ $ALOOP_BIN dashboard --port 4042 --session-dir ~/.aloop/sessions/ralph-skill-20260314-173930 --workdir <worktree>
# exit code: 0 (backgrounded)
# Dashboard running on http://localhost:4042
```

#### API Tests
```
$ curl -s -o /dev/null -w "%{http_code}" http://localhost:4042/api/artifacts/304/dashboard-desktop.png
200

$ curl -sI http://localhost:4042/api/artifacts/304/dashboard-desktop.png | grep content-type
Content-Type: application/json; charset=utf-8
# BUG: Should be image/png

$ curl -s http://localhost:4042/api/artifacts/304/dashboard-desktop.png | wc -c
56720
# Content is valid PNG binary, header is wrong

$ curl -s -o /dev/null -w "%{http_code}" http://localhost:4042/api/artifacts/999/nonexistent.png
404
# Error case returns 404 correctly
```

#### Browser Tests (Playwright)

**Layout verification (1920x1080):**
- Layout panels found: 4
- Activity log present with 946 events
- Evidence: /tmp/qa-dashboard-layout.png

**Inline artifacts:**
- Clicked proof entry at 16:13
- "5 artifacts" section expanded with descriptions
- 3 image thumbnails rendered: dashboard-desktop.png, dashboard-health.png, dashboard-archived.png
- 2 non-image artifacts: status-output.txt, archived-session-state.json
- Evidence: /tmp/qa-proof-clicked2.png

**Image thumbnails:**
- src="/api/artifacts/304/dashboard-desktop.png" loading="lazy" 150x85px cursor=pointer
- src="/api/artifacts/304/dashboard-health.png" loading="lazy" 150x85px cursor=pointer
- src="/api/artifacts/304/dashboard-archived.png" loading="lazy" 150x85px cursor=pointer
- All meet spec requirements (loading="lazy", ~150px wide, clickable)

**Lightbox test:**
- Clicked thumbnail → page navigated to "proof-session" session view
- No [role="dialog"], lightbox, overlay, or modal element appeared
- BUG: Click event captured by parent session-navigation handler
- Evidence: /tmp/qa-lightbox-direct.png

**Syntax highlighting:**
- <pre class="overflow-auto rounded bg-muted/40 p-2 text-[10px] max-h-48 border border-border">
- <code class="language-plaintext"> for status-output.txt
- <code class="language-json"> for archived-session-state.json
- Content fetched and rendered correctly

**Diff percentage badge:**
- No per-artifact diff percentage badges found
- Only "92%" found in header (iteration progress, not diff)
- Proof manifest has no diff_percent field in artifact metadata
- BUG: Spec requires "Diff percentage badge on artifact entries: green (<5%), yellow (5-20%), red (>20%)"

**Error fallback:**
- Changed thumbnail src to /api/artifacts/999/broken.png
- "Failed to load image" placeholder appeared with warning icon
- Broken image was replaced, not shown as browser default broken-image icon
- PASS
- Evidence: /tmp/qa-error-fallback.png

### Cleanup
```
$ rm -rf /tmp/aloop-test-install-inHYAK
$ pkill -f "aloop dashboard"
```
