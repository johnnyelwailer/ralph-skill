# Issue #85: Proof Artifact API: Serve artifact files via /api/artifacts endpoint

## Objective
Serve proof artifacts from the current session via `GET /api/artifacts/<iteration>/<filename>`, so dashboard UI entries (screenshots, diffs, `output.txt`, JSON captures) can be fetched directly from `<sessionDir>/artifacts/iter-<N>/`.

## Architectural Context
- Artifact files are produced by the loop/proof flow under session storage: `artifacts/iter-<iteration>/...`.
- The dashboard backend is the API owner for this endpoint: [aloop/cli/src/commands/dashboard.ts](/home/pj/.aloop/sessions/orchestrator-20260321-172932/worktree/aloop/cli/src/commands/dashboard.ts).
- Frontend consumers already call this contract from [aloop/cli/dashboard/src/AppView.tsx](/home/pj/.aloop/sessions/orchestrator-20260321-172932/worktree/aloop/cli/dashboard/src/AppView.tsx) via `artifactUrl(...)` and `fetch(/api/artifacts/{iteration}/output.txt)`.
- MIME behavior is owned by the backend helper `getContentType(...)` in `dashboard.ts`.

## Scope
In-scope modifications are limited to backend artifact-serving behavior and its tests:
- [aloop/cli/src/commands/dashboard.ts](/home/pj/.aloop/sessions/orchestrator-20260321-172932/worktree/aloop/cli/src/commands/dashboard.ts): artifact route handling, boundary validation, and MIME mapping used by artifact responses.
- [aloop/cli/src/commands/dashboard.test.ts](/home/pj/.aloop/sessions/orchestrator-20260321-172932/worktree/aloop/cli/src/commands/dashboard.test.ts): integration tests for success, 404, traversal rejection, and MIME headers.

## Out of Scope
Do not modify the following as part of this issue:
- Loop runners [aloop/bin/loop.sh](/home/pj/.aloop/sessions/orchestrator-20260321-172932/worktree/aloop/bin/loop.sh) and [aloop/bin/loop.ps1](/home/pj/.aloop/sessions/orchestrator-20260321-172932/worktree/aloop/bin/loop.ps1) (Constitution Architecture rules 1-2: runners stay dumb; host/runtime logic belongs in CLI runtime).
- Orchestrator/request bridge flow (for example `process-requests`, pipeline eventing, GH dispatch) (Constitution rule 12: one issue, one concern).
- Proof artifact generation semantics (`PROMPT_proof`, manifest authoring, baseline update policy); this issue only serves already-written files.
- Dashboard UI redesign or new artifact visualization behaviors; no frontend feature expansion required for endpoint delivery (Constitution rule 19: do not gold-plate).
- Optional listing endpoint `GET /api/artifacts/<iteration>` is explicitly deferred from this issue unless separately scoped.

## Constraints
- Keep implementation in the existing dashboard Node HTTP server request router (no migration to Express or Vite middleware in this issue).
- Validate boundary inputs at the HTTP layer and reject unsafe filenames/paths (Constitution rule 17).
- Iteration segment must be numeric (`<iteration>` in path); non-matching routes must not access the filesystem.
- Resolved artifact path must remain inside `<sessionDir>/artifacts` after normalization.
- Preserve data-driven/session-based pathing; do not introduce hardcoded absolute filesystem paths (Constitution rule 15).
- Add/maintain automated tests for changed behavior (Constitution rule 11).
- Keep changes contained to scoped files (Constitution rule 18).

## Inputs
- Proof artifacts stored in session directories (for example: `artifacts/iter-1/screenshot.png`, `artifacts/iter-1/output.txt`).
- Existing dashboard backend server in [aloop/cli/src/commands/dashboard.ts](/home/pj/.aloop/sessions/orchestrator-20260321-172932/worktree/aloop/cli/src/commands/dashboard.ts).

## Deliverables
- `GET /api/artifacts/<iteration>/<filename>` serves artifact bytes from `<sessionDir>/artifacts/iter-<iteration>/`.
- Correct `Content-Type` for common artifact extensions used by proof outputs (including image formats, `.json`, and `.txt`).
- Descriptive JSON error responses for invalid paths and missing files.
- Path traversal protections for encoded and unencoded traversal attempts.

## Acceptance Criteria
- [ ] `GET /api/artifacts/1/screenshot.png` returns HTTP 200 and `content-type: image/png` when file exists.
- [ ] `GET /api/artifacts/999/missing.png` returns HTTP 404 with JSON containing `error` and message matching `Artifact not found`.
- [ ] Traversal attempts (for example `/api/artifacts/3/..%2F..%2Fstatus.json`, slash/backslash variants) return HTTP 400 and do not read files outside `artifacts/`.
- [ ] MIME detection returns correct types for representative extensions: `.png`, `.jpg`/`.jpeg`, `.gif`, `.webp`, `.svg`, `.json`, `.txt`, and unknown fallback `application/octet-stream`.
- [ ] Automated tests in [aloop/cli/src/commands/dashboard.test.ts](/home/pj/.aloop/sessions/orchestrator-20260321-172932/worktree/aloop/cli/src/commands/dashboard.test.ts) cover all criteria above.

## Technical Notes
- Use `path.resolve` + prefix check (or `path.relative`) to enforce that resolved paths stay under `<sessionDir>/artifacts`.
- Reject any filename containing path separators/traversal markers before filesystem reads.
- Keep response format consistent with existing API style (JSON errors via `writeJson`).
- Caching behavior should remain aligned with existing dashboard API conventions for this issue unless a separate requirement changes it.

## Metadata
- Labels: `aloop/sub-issue`, `aloop/needs-refine`
- Wave: `1`
- Dependencies: none
