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

#### Previous (issue #38 scope)
- spec-gap analysis: no discrepancies found — spec fully fulfilled
- All acceptance criteria verified: CI workflow runs `vitest run` via `npm test`, triggers on PRs to master, uses jsdom (no browser needed), excludes Playwright e2e tests
- Tests pass locally: 87 tests, 2 test files

#### Cross-Codebase Spec-Gap Findings (2026-03-22)

- [ ] [spec-gap][P2] **`opencode` provider missing from TypeScript PROVIDER_SET** — `aloop/bin/loop.sh:31` and `aloop/bin/loop.ps1:28-31` both support `opencode` as a valid provider. `aloop/cli/src/commands/start.ts` defines `PROVIDER_SET` without `opencode` (only `claude|codex|gemini|copilot|round-robin`). CLI `aloop start --provider opencode` would reject a valid provider. **Fix:** add `opencode` to `ProviderName` type and `PROVIDER_SET` in `start.ts`.

- [ ] [spec-gap][P2] **`single` mode not in loop.sh validation gate** — `aloop/bin/loop.sh:1852-1853` validates `plan|build|review|plan-build|plan-build-review` but does NOT include `single`. Yet `single` is used at line 368 (`resolve_iteration_mode`) and listed in help text at line 63. Passing `--mode single` would be rejected at the validation gate before reaching the handler. **Fix:** add `single` to the case statement at line 1853.

- [ ] [spec-gap][P2] **`PROMPT_proof.md` missing `provider:` frontmatter** — `aloop/templates/PROMPT_proof.md` has `agent: proof` and `trigger: final-qa` but no `provider:` field. All other loop-phase templates (plan, build, qa, review, docs, spec-gap, etc.) specify `provider: claude`. The loop frontmatter parser falls back to the default provider, so this works at runtime, but it's inconsistent with spec's statement that frontmatter carries provider config. **Fix:** add `provider: claude` to PROMPT_proof.md frontmatter.

- [ ] [spec-gap][P2] **`PROMPT_orch_skill_scout.md` referenced in SPEC but missing** — SPEC.md line 3370 describes a skill scout agent (`PROMPT_orch_skill_scout.md`) and line 3416 has an acceptance criterion checkbox for it. The template does not exist in `aloop/templates/`. **Fix:** either create the template or mark the SPEC acceptance criterion as deferred/future.

- [ ] [spec-gap][P2] **Orchestrator planner/refine/resolver templates exist but have no dispatch code** — `aloop/templates/` contains `PROMPT_orch_refine.md`, `PROMPT_orch_resolver.md`, `PROMPT_orch_planner_{frontend,backend,infra,fullstack}.md`. Test file `project.test.ts:85-92` validates they exist. But `orchestrate.ts` has zero references to these templates — no dispatch logic, no constants. They are dead templates that will never be invoked. **Fix:** either implement dispatch logic in orchestrate.ts or remove the templates (and update tests).

- [ ] [spec-gap][P3] **Orchestrator templates missing YAML frontmatter** — All 17 `PROMPT_orch_*.md` templates lack YAML frontmatter (no `agent:`, `provider:`, `reasoning:` fields). SPEC states frontmatter is the "same parser for cycle, finalizer, and queue prompts." If orchestrator prompts are queued via `queue/`, the frontmatter parser will find no metadata. This may be intentional (orchestrator sets provider via code) but is inconsistent with the spec's uniform frontmatter model. **Fix:** add minimal frontmatter to orchestrator templates, or document the exception in SPEC.

### Notes
- No `.github/workflows/` directory or `ci.yml` exists on master or this branch
- The spec says "Dashboard deps should already be installed from the core workflow" but that core workflow hasn't been created yet — we need to include basic setup (checkout + Node + npm ci) so the dashboard test step can run
- Vitest uses jsdom — no browser install needed
- Do NOT include Playwright e2e tests
- Dashboard tests are in `aloop/cli/dashboard/src/App.test.tsx`, config in `vitest.config.ts`
- `npm test` maps to `vitest run` in dashboard's `package.json`
