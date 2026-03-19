# Prompt Design

Guidance for writing effective planning, building, and review mode prompts.

<prompt_principles>
## Prompt Principles

### 1. Prompts Are Signs, Not Rules

The prompt provides initial direction. The environment (tests, types, lints) shapes actual behavior.

### 2. Start Minimal, Evolve Through Observation

Don't try to predict all failure modes. Start with simple instructions and add guidance when you observe specific failures.

**Anti-pattern:**
```markdown
IMPORTANT: Don't do X
CRITICAL: Never do Y
WARNING: Avoid Z
```

**Better:**
```markdown
1. Study specs
2. Implement task
3. Run tests
4. Commit
```

### 3. One Clear Objective Per Mode

**Planning mode:** Gap analysis only, no implementation
**Building mode:** Implement one task, validate, commit
**Review mode:** Audit last build, write fix tasks or approvals

Mixing objectives creates confusion.

### 4. Context Budget Allocation

~176K usable tokens. Typical allocation:
- Prompt: ~5,000 tokens
- AGENTS.md: ~2,000 tokens
- TODO.md: ~5,000 tokens
- Specs: ~20,000 tokens
- Source code: ~100,000 tokens
- "Smart zone" (reasoning): ~40,000 tokens

Keep prompts tight to maximize smart zone.
</prompt_principles>

<template_variables>
## Template Variables

Aloop prompt templates use `{{variables}}` that are resolved during `/$skillName:setup`:

| Variable | Purpose | Example |
|----------|---------|---------|
| `{{SPEC_FILES}}` | Paths to spec/requirement files | `SPEC.md`, `specs/*.md` |
| `{{REFERENCE_FILES}}` | Additional reference paths | `0d. Reference: docs/*.md` |
| `{{VALIDATION_COMMANDS}}` | Backpressure commands | `npm test && npm run type-check` |
| `{{SAFETY_RULES}}` | Project-specific safety constraints | "Never delete production data" |
| `{{PROVIDER_HINTS}}` | Provider-specific instructions | Subagent counts for Claude |

Variables are filled per-project during setup and stored in `~/.aloop/projects/<hash>/prompts/`.
</template_variables>

<review_prompt_design>
## Review Prompt Design

The review prompt is the adversarial critic. Key design principles:

### Be Specific About What "Shallow" Means

Don't just say "write good tests." Enumerate the anti-patterns:

| Anti-Pattern | Example |
|-------------|---------|
| Existence check | `expect(result).toBeDefined()` |
| Truthy check | `expect(output).toBeTruthy()` |
| Shape-only check | `expect(result).toHaveProperty('name')` |
| Over-mocking | Mock the module under test |
| Tautological | Assert mock returns canned data |

### Rejection Flow

When gates fail, the reviewer writes `[review]` tasks — specific, actionable items that the next build iteration picks up with highest priority. This creates a self-correcting feedback loop.

### Approval Flow

Even when all gates pass, the reviewer must cite concrete observations. "Everything looks good" is itself a failure — it means the reviewer didn't actually look.
</review_prompt_design>

<common_prompt_mistakes>
## Common Prompt Mistakes

1. **Mixing Modes** — Plan AND build in same prompt creates confusion
2. **Over-Specifying** — Too many rules = over-steering. Start minimal.
3. **No Clear Exit** — Aloop needs to know when to stop. Always include "Exit" step.
4. **Vague Validation** — "Make sure it works" is not actionable. List specific commands.
5. **No Review Phase** — Without the critic, shallow tests and spec drift accumulate
</common_prompt_mistakes>
