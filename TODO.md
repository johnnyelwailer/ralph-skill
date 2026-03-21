# Issue #181: Self-healing: auto-create missing labels and derive missing config

## Current Phase: Implementation

### Context
The dashboard (`aloop/cli/dashboard/src/AppView.tsx`, ~2378 lines) has partial responsive support (mobile sidebar drawer, breakpoint-based hiding) but does not meet WCAG 2.5.8 tap target requirements, lacks long-press context menus, and has unverified tooltip/hover-card tap equivalents. Note: AppView.tsx is a monolith that SPEC-ADDENDUM says should be decomposed, but that's a separate issue — this issue focuses on accessibility within the existing structure.

### QA Bugs

- [x] [qa/P1] Steer textarea 32px height on mobile: Fixed — changed to `min-h-[44px] md:min-h-[32px] h-auto md:h-8` for WCAG 2.5.8 compliance. (priority: high)

- [x] [qa/P1] GitHub repo link missing aria-label: Fixed — added `aria-label="Open repo on GitHub"` to the link. (priority: high)

- [ ] [qa/P1] Escape key does not close mobile sidebar drawer: On mobile viewport (390x844), after opening the sidebar via hamburger button, pressing Escape does not close the sidebar. The sidebar overlay (`div.fixed.inset-0.z-40`) remains visible and the sidebar stays at width=256px. Clicking the overlay does close the sidebar correctly. Spec says "Escape key should close overlays and return focus." Fix: add keydown listener for Escape that closes the mobile sidebar drawer. Tested at iter 3. (priority: high)

- [ ] [qa/P1] Focus not moved into sidebar on mobile open: After tapping the hamburger button to open the mobile sidebar drawer, focus remains on the hamburger button instead of moving into the sidebar content. Spec says "When mobile sidebar drawer opens, focus should move to the drawer appropriately." Fix: after sidebar opens on mobile, programmatically focus the first focusable element inside the sidebar. Tested at iter 3. (priority: high)

- [ ] [qa/P1] Command palette focus not trapped on open: After pressing Ctrl+K to open command palette on mobile, `document.activeElement` is `BODY` instead of the search input inside the dialog. The palette renders correctly and Escape closes it, but keyboard focus is not in the input field. Fix: auto-focus the command input on open. Tested at iter 3. (priority: high)

### In Progress

### Up Next
- [x] **Label self-healing: ensure required labels exist at startup** — Add `ensureLabels()` function that checks for `aloop/auto`, `aloop/epic`, `aloop/sub-issue`, `aloop/needs-refine`, `aloop/needs-review`, `aloop/in-progress`, `aloop/done` via `gh label list`, creates missing ones via `gh label create` with appropriate colors. Call once at startup in `orchestrateCommandWithDeps` before the scan loop. Cache result in session state. Log warnings on failure but don't block. (priority: critical)

- [ ] **Config derivation: derive filter_repo from git remote** — When `filter_repo` is null (no `--repo` flag), derive it from `gh repo view --json nameWithOwner` or parse `git remote get-url origin`. Also check `meta.json` fields (`repo`, `project_root`) and env vars (`GITHUB_REPOSITORY`, `GH_HOST`). Log all derivations. (priority: critical)

- [ ] **Config derivation: detect trunk branch from repo default branch** — When `trunk_branch` is the default `'agent/trunk'` and no `--trunk` flag was given, detect the repo's actual default branch via `gh repo view --json defaultBranchRef` and use it. Log the derivation. (priority: high)

- [ ] **Config derivation: verify gh_project_number discovery works** — The dynamic project number discovery (lines 1115-1126) already exists but only runs inside the `filterRepo && state.issues.length === 0` block. Verify it works correctly and consider running it earlier/unconditionally so `gh_project_number` is always available. (priority: medium)

- [ ] **Startup health check: implement pre-scan-loop verification** — Before entering the scan loop, run: `gh auth status` (verify authenticated), `gh repo view` (verify repo access), `git status` (verify clean worktree). Write results to `session-health.json` in the session dir. If critical checks fail (auth, repo access), write `ALERT.md` and exit with clear error message. (priority: high)

- [ ] **Missing config recovery: reconstruct from multiple sources** — If `meta.json` is missing critical fields, attempt reconstruction from: git remote URL → repo slug, `orchestrator.json` state → spec file / trunk branch, environment variables (`GH_HOST`, `GITHUB_REPOSITORY`). Log all derivations for user verification. (priority: medium)

- [ ] **Tests: add unit tests for self-healing functions** — Add tests to `orchestrate.test.ts` covering: label creation (success, partial failure, permission denied), config derivation (from git remote, from meta.json, from env vars), startup health check (all pass, auth failure, repo access failure), graceful degradation. (priority: high)

### Completed
