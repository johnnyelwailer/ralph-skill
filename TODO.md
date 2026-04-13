# Issue #200: CI: Add agent/* branch triggers and workflow polish

## Tasks

### Completed
- [x] Add `agent/*` and `aloop/*` branch triggers to push and pull_request events in `.github/workflows/ci.yml`, ensure all four jobs (type-check, cli-tests, dashboard-tests, loop-script-tests) run in parallel with no inter-job dependencies, and polish workflow structure (concurrency settings, consistent naming) [reviewed: gates 1-9 pass]

### Spec Review Approval
**Reviewed by**: Aloop spec-review agent  
**Date**: 2026-04-13  
**Result**: APPROVED  

All acceptance criteria for this task are satisfied:
- `agent/*` and `aloop/*` branch triggers present on push (line 5) and pull_request (line 7)
- All four jobs run in parallel with no `needs:` dependencies
- Concurrency group with `cancel-in-progress: true` configured (lines 9-11)
- Consistent `name:` labels across all jobs
- No inter-job dependencies detected

---

## In Progress

- [ ] [review] Gate 9: README.md:166-172 documents `aloop gh gate1`, `aloop gh gate2`, `aloop gh gate3`, and `aloop gh pr rebase` — none of these four commands exist in `aloop/cli/src/commands/gh.ts:2165-2291` (evaluatePolicy switch). Remove these four rows from the `aloop gh subcommands` table. (priority: high)
- [ ] [review] Gate 9: README.md:165-166 table shows `aloop gh issue comment` and `aloop gh pr rebase` with spaces. Actual command names are `issue-comment` and `pr-rebase` (hyphenated) per gh.ts:1509-1518. Fix the table to use hyphenated command names. (priority: medium)

---

## Spec-Gap Analysis (Aloop Runtime)

The following gaps were found by cross-referencing `SPEC.md` against `~/.aloop/bin/loop.sh`, `~/.aloop/bin/loop.ps1`, and `~/.aloop/config.yml`.

### P1 — Runtime Failure

- [spec-gap/P1] **`opencode` missing from `loop.sh` provider validation** — `loop.sh:1947-1949` has a `case` statement validating `--provider` values, listing `claude|codex|gemini|copilot|round-robin` but omitting `opencode`. However, `invoke_provider` at `loop.sh:1456` has a full `opencode)` case block, and `config.yml:53-58` lists `opencode` as a valid provider. Running `loop.sh --provider opencode` exits with "Error: Invalid provider 'opencode'".  
  **Files**: `aloop/bin/loop.sh:1947-1949`  
  **Fix**: Add `opencode` to the provider validation case statement.

### P2 — Correctness Drift

- [spec-gap/P2] **`ROUND_ROBIN_PROVIDERS` default in `loop.sh` doesn't match `config.yml`** — `loop.sh:31` defaults to `claude,gemini,opencode` (3 providers, missing `codex` and `copilot`). `config.yml:53-58` defines `claude,opencode,codex,gemini,copilot` (5 providers, different order). `loop.ps1:31` correctly defaults to `@('claude', 'opencode', 'codex', 'gemini', 'copilot')`.  
  **Files**: `aloop/bin/loop.sh:31`, `aloop/config.yml:53-58`, `aloop/bin/loop.ps1:31`  
  **Fix**: Update `loop.sh` default to `claude,opencode,codex,gemini,copilot` to match config.

- [spec-gap/P2] **`single` mode missing from `loop.sh` validation and usage text** — `loop.sh` supports `single` mode internally (handled in `resolve_iteration_mode` at line ~405 and `MODE` case at line ~402), but it is absent from: (a) the `--mode` usage string at line 64, (b) the `case` validation at line 1941-1943. `loop.ps1` correctly declares `[ValidateSet('plan','build','review','plan-build','plan-build-review','single')]` at line 25 and documents it in usage.  
  **Files**: `aloop/bin/loop.sh:64`, `aloop/bin/loop.sh:1941-1943`, `aloop/bin/loop.ps1:25`  
  **Fix**: Add `single` to usage text and validation case in `loop.sh`.

- [spec-gap/P2] **`opencode` missing from `loop.sh` `--provider` usage text** — `loop.sh:65` usage says `claude|codex|gemini|copilot|round-robin` but omits `opencode`.  
  **Files**: `aloop/bin/loop.sh:65`  
  **Fix**: Add `opencode` to the `--provider` usage string.

- [spec-gap/P2] **Stuck detection not implemented in `loop.ps1`** — `loop.sh` has `skip_stuck_task()` (lines 1664-1683) that marks a task `[S]` in TODO.md and appends it to a `## Blocked` section after `$MAX_STUCK` consecutive failures on the same task. `loop.ps1` has `$stuckState` tracking (line 970) but no equivalent `Skip-StuckTask` function and no TODO.md mutation on stuck detection.  
  **Files**: `aloop/bin/loop.sh:1664-1683`, `aloop/bin/loop.ps1:970`, `aloop/bin/loop.ps1:2275-2288`  
  **Fix**: Implement `Skip-StuckTask` in `loop.ps1` mirroring the `loop.sh` behavior.

### P3 — Cross-Runtime Parity

- [spec-gap/P3] **Frontmatter `provider` validation differs between scripts** — In `loop.sh:2271`, frontmatter provider fallback uses `command -v "$FRONTMATTER_PROVIDER"` (checks if binary is on PATH). In `loop.ps1:2231-2232`, it uses `Get-Command $script:frontmatter.provider` against a hardcoded list `@('claude','opencode','codex','gemini','copilot')`. The PowerShell version would incorrectly log `frontmatter_provider_unavailable` for a frontmatter `provider: foo` even if `foo` is on PATH and the binary works — though this is unlikely to cause real failures.  
  **Files**: `aloop/bin/loop.sh:2271`, `aloop/bin/loop.ps1:2232`  
  **Fix**: Make `loop.ps1` use `Get-Command` (binary-on-PATH check) instead of the hardcoded list.

- [spec-gap/P3] **`Register-IterationFailure` accepts `spec-gap` and `docs` phases in `loop.ps1` but not in `loop.sh`** — `loop.ps1:1026` accepts `spec-gap` and `docs` alongside `plan/build/qa/review/proof`. `loop.sh:732` only accepts `plan|build|qa|review`. This creates a subtle divergence: if a future version adds `spec-gap` or `docs` phases to the cycle, the retry mechanism would handle them differently between scripts.  
  **Files**: `aloop/bin/loop.sh:732`, `aloop/bin/loop.ps1:1026`  
  **Fix**: Align phase lists, or use a shared constant.

### Spec Features with No Implementation

The following are described in `SPEC.md` but have no corresponding implementation in `loop.sh` or `loop.ps1`. These are listed for review — whether they need implementation or spec cleanup depends on project priorities.

- [spec-gap/P2] **Periodic `spec-gap` scheduling not implemented** — `SPEC.md:799-809` requires `spec-gap` to run before every 2nd plan phase (every other cycle) during normal loop execution. Neither `loop.sh` nor `loop.ps1` implements this periodic every-2nd-cycle scheduling. `PROMPT_spec-gap.md` exists and the finalizer triggers it, but the periodic-in-cycle variant is absent.  
  **Files**: `aloop/bin/loop.sh`, `aloop/bin/loop.ps1`  
  **Fix**: Implement every-other-cycle scheduling for spec-gap (requires `SPEC.md` review for priority, or update spec to remove this requirement).

- [spec-gap/P2] **Periodic `docs` agent scheduling not implemented** — `SPEC.md:859-862` requires `docs` to run every 2nd cycle after QA. Neither script implements this periodic scheduling. `PROMPT_docs.md` exists.  
  **Files**: `aloop/bin/loop.sh`, `aloop/bin/loop.ps1`  
  **Fix**: Same as above — implement or update spec.

- [spec-gap/P2] **`proof` not in cycle array** — `SPEC.md:419-422` shows the continuous cycle as `plan → build × 5 → qa → review` (8-step) with `proof` in the finalizer only. However, `SPEC.md:717` acceptance criteria says "Default pipeline becomes: plan → build × 5 → proof → qa → review (9-step)" — a contradiction. The `loop-plan.json` example in `SPEC.md:452-474` has an 8-element cycle with `proof` in finalizer, matching the 8-step description. `PROMPT_proof.md` exists. `resolve_iteration_mode` in both scripts does not include `proof` in the cycle, and the main loop never resolves `proof` from the cycle array. `proof` only runs via the finalizer.  
  **Files**: `aloop/bin/loop.sh:380-415`, `aloop/bin/loop.ps1:231-270`, `SPEC.md:717`  
  **Fix**: Resolve contradiction in `SPEC.md:717` — the acceptance criterion contradicts the stated 8-step default and the loop-plan.json example. If the 9-step cycle is the correct intent, both loop scripts need `proof` added to cycle resolution.

- [spec-gap/P3] **`proof` phase accepted in `Register-IterationFailure` in `loop.ps1` but never reached** — `loop.ps1:1026` accepts `spec-gap`, `docs`, and `proof` in the phase retry check, but `loop.ps1` never actually calls `Register-IterationFailure` for `proof` because `proof` is never resolved as a cycle phase. Dead code.  
  **Files**: `aloop/bin/loop.ps1:1026`  
  **Fix**: Remove dead code or implement the periodic scheduling that would reach it.
