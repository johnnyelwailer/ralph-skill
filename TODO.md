# Issue #100: Agent YAML definitions for QA, spec-gap, and docs agents

## Current Phase: Implementation

### In Progress

### Up Next

### Completed
- [x] Create `.aloop/agents/qa.yml` — agent: qa, prompt: PROMPT_qa.md, reasoning effort: medium
- [x] Create `.aloop/agents/spec-gap.yml` — agent: spec-gap, prompt: PROMPT_spec-gap.md, reasoning effort: high
- [x] Create `.aloop/agents/docs.yml` — agent: docs, prompt: PROMPT_docs.md, reasoning effort: medium
- [x] Verify `compile-loop-plan.ts` `getAgentConfig` resolves all three new YAMLs correctly — all 33 tests pass
- [x] Verify `pipeline.yml` references match: qa in cycle (line 7), spec-gap and docs in finalizer (lines 16-17)

### Spec-Gap Analysis
- [x] [spec-gap] spec-gap analysis: no discrepancies found — spec fully fulfilled. All 5 deliverables verified, all 3 acceptance criteria met, no regressions in existing agents (2026-03-21)
