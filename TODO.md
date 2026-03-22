# TODO: Issue #144 — Autonomous daemon lifecycle

## Acceptance Criteria

- [x] `aloop orchestrate` spawns background daemon and returns immediately
- [x] Orchestrator registers in `active.json` with correct metadata
- [x] Scan loop runs indefinitely until all issues resolved or user stops
- [x] `aloop stop <id>` gracefully shuts down orchestrator
- [x] Orchestrator deregisters from `active.json` on exit
- [x] Child loops are stopped during shutdown
- [x] `status.json` reflects orchestrator state transitions

## Bug Fixes

- [x] Fix `resolvedOptions` → `options` in `orchestrateCommand` (undefined variable causing runtime crash on daemon spawn/resume paths)

## Pre-existing Issues (not in scope)

- [x] 12 pre-existing test failures in orchestrate.test.ts (unrelated to daemon lifecycle)
- [x] Syntax error in process-requests.test.ts (missing `}`)

## Spec-Gap Analysis

spec-gap analysis: all issue #144 acceptance criteria fully fulfilled — no discrepancies found between SPEC.md daemon lifecycle requirements and implementation.

### Pre-existing Cross-File Drift (not blocking issue #144)

- [ ] [spec-gap] P2: `loop.sh` provider validation (line 2240) missing "opencode" — `config.yml`, `loop.ps1`, and `start.ts` all include it. Causes runtime rejection of a valid provider. **Fix:** add `opencode` to case statement. Files: `aloop/bin/loop.sh:2240`, `aloop/config.yml:50`
- [ ] [spec-gap] P2: `loop.sh` Claude model default (line 33) is "sonnet" but `config.yml` (single source of truth) says "opus". `loop.ps1` and `start.ts` both use "opus". **Fix:** change default to "opus". Files: `aloop/bin/loop.sh:33`, `aloop/config.yml:21`
- [ ] [spec-gap] P2: `loop.sh` round-robin default (line 31) is `claude,gemini,opencode` — missing codex and copilot. `config.yml` and `loop.ps1` both list all 5 providers. **Fix:** align with config.yml order. Files: `aloop/bin/loop.sh:31`, `aloop/config.yml:49-54`
- [ ] [spec-gap] P2: `loop.sh` mode validation (line 2233) missing "single" mode — supported in `loop.ps1` and `start.ts`. **Fix:** add `single` to case statement. Files: `aloop/bin/loop.sh:2233`
- [ ] [spec-gap] P3: `PROMPT_proof.md` missing `provider:` in frontmatter — has `agent:` and `trigger:` but no provider declaration. Falls back to default, not a runtime issue. Files: `aloop/templates/PROMPT_proof.md:1-4`
- [ ] [spec-gap] P3: `PROMPT_steer.md` missing YAML frontmatter entirely — no `agent:`, `provider:`, or `trigger:` fields. Falls back to defaults. Files: `aloop/templates/PROMPT_steer.md:1`
- [ ] [spec-gap] P3: `loop.sh` usage help (lines 68-69) doesn't list "opencode" as a provider and shows wrong round-robin default. Files: `aloop/bin/loop.sh:68-69`
