# Issue #200: CI: Add agent/* branch triggers and workflow polish

## Tasks

### Completed
- [x] Add `agent/*` and `aloop/*` to `on.push.branches` in `.github/workflows/ci.yml` — enables CI on child loop branches
- [x] Add `agent/*` and `aloop/*` to `on.pull_request.branches` in `.github/workflows/ci.yml` — enables CI gating on PRs from agent branches
- [x] Ensure four required jobs exist with no `needs:` dependencies: `type-check`, `cli-tests`, `dashboard-tests`, `loop-script-tests` — all run in parallel
- [x] Verify `name: CI` is stable for README badge reference
- [x] Verify README badge targets `actions/workflows/ci.yml/badge.svg` [reviewed: gates 1-9 pass]

---

## spec-gap Analysis

### [spec-gap] P1: Proof phase location — SPEC contradicts itself

**What's mismatched:**
- SPEC.md lines 400-409 (Proof-of-Work Phase section body) clearly state: "Proof does NOT run in the cycle" and "Proof runs only at the end — it's the last step of the finalizer"
- The continuous cycle is defined as `plan → build × 5 → qa → review` (8-step, no proof)
- Finalizer is defined as `spec-gap → docs → spec-review → final-review → final-qa → proof`
- **BUT** acceptance criteria at lines 716-717 says: "Proof is a first-class phase in the loop cycle... Default pipeline becomes: plan → build × 5 → proof → qa → review (9-step)"
- QA agent acceptance criteria at line 775 also says the same: "plan → build × 5 → proof → qa → review (9-step)"

**Files involved:**
- SPEC.md: lines 400-422 (body text says finalizer-only), lines 716-717 and 775 (acceptance criteria say cycle-included)
- `aloop/templates/loop-plan.json` (if it exists) — would show actual structure

**Suggested fix:**
SPEC is internally inconsistent. Decide which is correct:
1. If proof belongs in the finalizer only (as body text says) — update acceptance criteria lines 716-717 and 775 to reflect 8-step cycle + finalizer proof
2. If proof belongs in the cycle (as acceptance criteria say) — update body text and move PROMPT_proof.md reference into the cycle[] array in all pipeline configs

---

### [spec-gap] P2: Model default drift — loop.sh defaults to `sonnet`, config.yml says `opus`

**What's mismatched:**
- `aloop/config.yml` line 21: `claude: opus` (source of truth per comment on line 17)
- `aloop/bin/loop.sh` line 33: `CLAUDE_MODEL="${ALOOP_CLAUDE_MODEL:-sonnet}"` — defaults to `sonnet`
- `aloop/bin/loop.ps1` line 34: `$ClaudeModel = 'opus'` — correctly matches config.yml

**Files involved:**
- `aloop/config.yml:21`
- `aloop/bin/loop.sh:33`
- `aloop/bin/loop.ps1:34`

**Suggested fix:**
Update `loop.sh` line 33 to default to `opus`:
```bash
CLAUDE_MODEL="${ALOOP_CLAUDE_MODEL:-opus}"
```

Note: In practice, the CLI's compile step would inject the correct model via frontmatter, so this hardcoded default may not be used in normal operation. But it creates a correctness drift for direct script usage.

---

### [spec-gap] P2: Provider validation parity — loop.ps1 accepts `opencode` as direct provider, loop.sh does not

**What's mismatched:**
- `aloop/bin/loop.ps1` lines 28-29: `ValidateSet('claude', 'opencode', 'codex', 'gemini', 'copilot', 'round-robin')` — **includes `opencode`**
- `aloop/bin/loop.sh` lines 1858-1860: `case "$PROVIDER" in claude|codex|gemini|copilot|round-robin)` — **does NOT include `opencode`**
- Yet `opencode` IS in `config.yml`'s `round_robin_order` and IS fully implemented in invocation code on both scripts

**Files involved:**
- `aloop/bin/loop.ps1:28-29`
- `aloop/bin/loop.sh:1858-1860`

**Suggested fix:**
Add `opencode` to loop.sh's provider validation case:
```bash
case "$PROVIDER" in
    claude|opencode|codex|gemini|copilot|round-robin) ;;
    *) echo "Error: Invalid provider '$PROVIDER'"; usage ;;
esac
```

---

### [spec-gap] P3: `round_robin_order` in config.yml includes `opencode` but loop.sh validation comment doesn't list it

**What's mismatched:**
- `aloop/bin/loop.sh` line 65 usage text: `--round-robin <list>    Comma-separated provider list (default: claude,opencode,codex,gemini,copilot)` — correctly lists opencode
- But line 31: `ROUND_ROBIN_PROVIDERS="claude,opencode,codex,gemini,copilot"` — correctly set
- The case validation at line 1859 simply omits opencode from the direct provider check

**Files involved:**
- `aloop/bin/loop.sh:1858-1860` (case statement)

**Suggested fix:**
Same as above — add `opencode` to the case validation to match the documented behavior and loop.ps1's ValidateSet.

---

## Summary

| Priority | Gap | Spec says | Code does |
|----------|-----|-----------|-----------|
| P1 | Proof phase location | Body: finalizer-only; Acceptance criteria: in-cycle | `loop-plan.json` finalizer[] contains proof; cycle[] does not |
| P2 | Claude model default | `opus` (config.yml) | `sonnet` in loop.sh; `opus` in loop.ps1 |
| P2 | opencode as direct provider | Supported (in round-robin, invocation) | loop.ps1: yes; loop.sh: no (validation rejects it) |
| P3 | opencode in case statement | Listed in usage docs and round_robin_order | Omitted from loop.sh validation case |
