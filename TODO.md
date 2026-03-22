# TODO

## Current Phase: Bug fixes (QA findings from iter 4)

### In Progress

- [x] [qa/P1] `gh start` and `gh stop` ignore `--output json` for error messages: `withErrorHandling()` in `error-handling.ts` always uses `console.error()` with plain text — it has no access to the `options.output` flag. Fix: make `withErrorHandling` output-mode-aware, or use the same pattern as `gh watch` (which extracts `outputMode` before try/catch and calls `failGhWatch` with it). Commands affected: `gh start` (line 1481), `gh stop` (line 1547), `gh status` (line 1536), `gh stop-watch` (line 1556). (priority: high)
- [x] [qa/P2] `gh start --spec nonexistent.md` doesn't fail fast: In `ghStartCommandWithDeps` (gh.ts:1745), the GitHub API call (`deps.execGh` at line 1757) runs before spec file validation (line 1767-1773). Move the `--spec` file existence check before the `gh issue view` API call so it fails fast without making network requests. (priority: medium)

### Spec-Gap Findings

- [ ] [spec-gap/P2] `loop.sh` provider validation rejects `opencode` as standalone provider: Line 1859 validates `claude|codex|gemini|copilot|round-robin` but omits `opencode`. Loop.ps1 line 28 correctly includes `opencode` in ValidateSet. The invoke_provider function in loop.sh (line 1367) supports `opencode`. Help text at lines 64-65 also omits `opencode`. Config.yml and round-robin default both list opencode. Files: `aloop/bin/loop.sh:1859`, `aloop/bin/loop.sh:64-65`. Suggested fix: add `opencode` to the validation case and help text in loop.sh. (Cross-runtime parity issue — loop.ps1 is correct)
- [ ] [spec-gap/P2] SPEC.md internal inconsistency: proof phase described as both cycle and finalizer-only. Acceptance criteria at SPEC.md:717 say "plan → build × 5 → proof → qa → review (9-step)" and SPEC.md:775 says the same. But SPEC.md:404-409 and SPEC.md:420-425 explicitly state proof does NOT run in the cycle — it's expensive and only runs in the finalizer. The loop-plan.json structure at SPEC.md:454-473 also shows proof only in finalizer[]. Suggested fix: update the stale acceptance criteria at lines 717 and 775 to reflect the current design (proof in finalizer only, cycle is 8-step: plan → build × 5 → qa → review).

### Completed
