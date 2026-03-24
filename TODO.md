# Issue #38: CI: Add dashboard unit tests (vitest)

## Current Phase: Implementation

### In Progress
_(none)_

### Up Next
_(none)_

### Completed
- [x] Create `.github/workflows/ci.yml` with Node.js setup, dependency install, and a dashboard unit test step that runs `npm test` in `aloop/cli/dashboard/`
- [x] Verify the workflow file is valid YAML and the test step references the correct working directory (`aloop/cli/dashboard`)

### Spec-Gap Analysis
- [ ] [spec-gap] **P2** — `PROMPT_proof.md` missing `provider:` field in frontmatter. All other finalizer templates (spec-gap, docs, spec-review, final-review, final-qa) declare `provider: claude`; proof.md omits it entirely. SPEC.md L41-42 states "Parse frontmatter from prompt files (provider, model, agent, reasoning, trigger)". File: `aloop/templates/PROMPT_proof.md` lines 1-4. Fix: add `provider: claude` to frontmatter.
- [ ] [spec-gap] **P2** — `loop.sh` help text (L64) lists `claude|codex|gemini|copilot|round-robin` but omits `opencode`, even though opencode is implemented in the switch (L1367), listed in ROUND_ROBIN_PROVIDERS default (L31: `claude,gemini,opencode`), and promised in SPEC.md L4-5. Help text L65 also shows wrong default (`claude,codex,gemini,copilot` vs actual `claude,gemini,opencode`). Fix: update help text to include opencode and fix default display.
- Previous analysis (issue #38 CI work): all acceptance criteria verified — CI workflow runs `vitest run` via `npm test`, triggers on PRs to master, uses jsdom, excludes Playwright e2e tests; 87 tests pass.

### Notes
- No `.github/workflows/` directory or `ci.yml` exists on master or this branch
- The spec says "Dashboard deps should already be installed from the core workflow" but that core workflow hasn't been created yet — we need to include basic setup (checkout + Node + npm ci) so the dashboard test step can run
- Vitest uses jsdom — no browser install needed
- Do NOT include Playwright e2e tests
- Dashboard tests are in `aloop/cli/dashboard/src/App.test.tsx`, config in `vitest.config.ts`
- `npm test` maps to `vitest run` in dashboard's `package.json`
