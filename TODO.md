# Issue #44: Fix 5 orchestrate.test.ts expectations after Needs decomposition status change

## Tasks

- [x] Implement as described in the issue

## Spec-Gap Analysis Findings

- [x] **[spec-gap] P2 — CLAUDE_MODEL default drift between config.yml and loop.sh**
  - config.yml (line 21) says `claude: opus` and is the documented single source of truth for default model IDs
  - loop.sh line 33 defaults to `CLAUDE_MODEL="${ALOOP_CLAUDE_MODEL:-sonnet}"` — should be `opus`
  - loop.ps1 line 34 correctly defaults to `$ClaudeModel = 'opus'`
  - Both loop scripts have comments saying "keep in sync with ~/.aloop/config.yml (source of truth)"
  - **Fix**: Update loop.sh line 33 default from `sonnet` to `opus`

- [x] **[spec-gap] P2 — SPEC internal contradiction on proof phase in default pipeline**
   - SPEC line 717 acceptance criterion says: "Default pipeline becomes: plan → build × 5 → proof → qa → review (9-step)"
   - SPEC lines 407-409 say: "Proof does NOT run in the cycle — it's expensive and only meaningful as final evidence. Proof runs only at the end"
   - The loop scripts correctly implement 8-step cycle (no proof): `plan → build×5 → qa → review`
   - **Fix**: Update SPEC line 717 acceptance criterion to match the architecture — proof is a finalizer-only phase, not part of the cycle. Change to: "Default pipeline is: plan → build × 5 → qa → review (8-step cycle). Proof runs in the finalizer."

- [ ] **[spec-gap] P3 — Loop script header comments omit `opencode` from provider list**
  - loop.sh line 13: `#   claude, codex, gemini, copilot, round-robin` — missing `opencode`
  - loop.ps1 line 13: same omission
  - Both scripts fully support `opencode` (it's in ValidateSet, round-robin defaults, and invoke_provider)
  - **Fix**: Add `opencode` to the provider list in both header comments

- [ ] **[spec-gap] P3 — PROMPT_proof.md missing `provider:` frontmatter field**
  - All 11 other prompt templates with frontmatter include `provider: claude`
  - PROMPT_proof.md only has `agent: proof` and `trigger: final-qa` — no `provider:` key
  - This may be intentional (proof uses round-robin or finalizer-specific provider routing), but it's inconsistent with every other template
  - **Fix**: Add `provider: claude` to PROMPT_proof.md frontmatter for consistency, or document the intentional omission

- [ ] **[spec-gap] P2 — aloop/TODO.md contains stale review items unrelated to spec gaps**
  - The aloop/TODO.md file has 5 review findings about `orchestrate.test.ts` mock issues (Gate 4/5 items)
  - These are build-review findings, not spec-gap items, and reference specific test mock issues
  - **Fix**: The build agent should address these review findings. No spec-gap action needed — these are genuine code issues, not spec drift
