---
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
---

<objective>
Configure Aloop for the current project. Capture requirements as-is into a PRD, build a multi-perspective plan, verify completeness, then scaffold the loop config.
</objective>

<process>

## Phase 1: Discovery

### Step 1: Run project-scope discovery (required)

Do NOT perform ad-hoc shell probing. Do NOT compose custom bash discovery pipelines.
Before explicit user go-ahead, do not read files outside the current project root.

Run this command first:

`pwsh -NoProfile -File ~/.aloop/bin/setup-discovery.ps1 -Command discover -Scope project -Output json`

Treat the JSON output as source of truth for:
- project root/name/hash
- language guess + confidence
- validation presets
- spec candidates
- context files (`TODO.md`, `RESEARCH.md`, `REVIEW_LOG.md`, `STEERING.md`)
- installed/missing providers

Show: "Setting up Aloop for: <project-name> (<project-root>)"

### Step 2: Use current conversation context

Assume setup is often run inside an ongoing discussion.

Before asking questions:
1. Summarize discovered repo context
2. Summarize context already present in conversation
3. Ask only delta questions

Do NOT repeat questions answered by discovery or earlier messages in the same conversation.

### Step 3: Existing config behavior

In interview phase, treat external config checks as deferred.
Do not inspect `~/.aloop/projects/*` yet.

After go-ahead and full-scope discovery, if `config_exists=true`, ask:
- "Patch existing setup (recommended) or fully reconfigure?"

Default to patching unless user explicitly requests full reset.

## Phase 2: PRD Capture

### Step 4: Capture requirements verbatim into PRD

**Do NOT structure, rewrite, or interpret.** Your job here is stenography — capture exactly what the user says they want, in their words.

Ask the user to describe what they want built. Use open-ended prompts:
- "What are you trying to build? Describe it however feels natural."
- "Anything else? Constraints, must-haves, things to avoid?"

Keep prompting until the user says they're done. After each response, confirm: "Got it. Anything else to add, or is that everything?"

Write everything to `PRD.md` in the project root:

```markdown
# Product Requirements Document

_Captured verbatim from user input during setup._

## Requirements

<user's words, verbatim, preserving their structure/formatting>

## Constraints

<any constraints mentioned, verbatim>

## Out of Scope

<anything explicitly excluded, verbatim>
```

Only use sections the user actually addressed. Do not add empty sections or placeholder text. Do not add your own interpretation, summary, or rewording.

If discovery found existing spec candidates, ask: "I found these existing docs: <list>. Should I include their content in the PRD as reference, or are you starting fresh?"

### Step 5: PRD confirmation gate

Show the user the PRD you wrote. Ask:
- "Does this capture everything? Edit anything, or good to plan?"

Do not proceed until the user confirms. If they add or change things, update `PRD.md` and re-confirm.

## Phase 3: Multi-Perspective Planning

### Step 6: Parallel planning subagents

Launch 3-5 subagents in parallel using the Agent tool. Each reads `PRD.md` and produces planning notes from a specific perspective. The agent output is returned to you — do NOT ask agents to write files directly.

Required perspectives (launch all in parallel):
1. **Architecture** — "Read PRD.md. Propose a technical architecture: components, data flow, key abstractions, technology choices. Flag any requirements that are ambiguous or contradictory from an architecture standpoint."
2. **Implementation** — "Read PRD.md. Break the requirements into an ordered list of implementation tasks. Identify dependencies between tasks. Flag requirements that are too vague to implement as-is."
3. **Testing & QA** — "Read PRD.md. For each requirement, describe how you would verify it works. Identify requirements that lack clear acceptance criteria. Propose a testing strategy."

Optional perspectives (add when relevant based on the PRD):
4. **Security & Privacy** — only if the PRD mentions auth, user data, APIs, or external services
5. **UX / Developer Experience** — only if the PRD describes a UI, CLI, or developer-facing API
6. **Operations / Deployment** — only if the PRD mentions deployment, infrastructure, or scaling

Each subagent prompt must start with: "You are a planning advisor reviewing a PRD. Read PRD.md in the current directory, then provide your analysis from the following perspective:"

### Step 7: Synthesize plan into SPEC.md

Collect all subagent outputs. Synthesize into a single `SPEC.md`:

1. **Merge, don't append** — the spec should read as one coherent document, not 3-5 separate sections pasted together
2. **Preserve all concerns** — every flag, gap, or ambiguity raised by any subagent must appear in the spec (either resolved by another perspective's input, or called out as an open question)
3. **Structure the spec** with these sections:
   - Overview (from PRD, lightly edited for clarity)
   - Architecture (from architecture agent, refined)
   - Implementation Plan (ordered tasks with dependencies)
   - Acceptance Criteria (from testing agent, mapped to requirements)
   - Open Questions (unresolved ambiguities from any perspective)
   - Non-Goals (from PRD constraints)
4. **Cross-reference the PRD** — every requirement in PRD.md must map to at least one task in the implementation plan and one acceptance criterion

If an existing `SPEC.md` exists, ask: "Merge into existing spec or replace?"

### Step 8: Verification pass — PRD coverage check

After writing SPEC.md, run a verification subagent:

Launch one Agent: "Read both PRD.md and SPEC.md. For each requirement in the PRD, check whether SPEC.md contains: (1) a corresponding implementation task, and (2) a way to verify it. Output a coverage table:

```
| PRD Requirement | Spec Task | Acceptance Criterion | Status |
|-----------------|-----------|---------------------|--------|
| <requirement>   | <task or MISSING> | <criterion or MISSING> | ✓ / GAP |
```

List any GAPs at the end."

If gaps are found:
1. Show the coverage table to the user
2. Ask: "These requirements don't have full coverage in the plan. Should I add tasks for them, or are they intentionally deferred?"
3. Update SPEC.md accordingly
4. Re-run verification until clean (max 2 rounds, then show remaining gaps and move on)

## Phase 4: Loop Configuration

### Step 9: Explicit go-ahead gate (required)

After plan verification passes, ask:
- "Plan is complete and verified. Proceed to configure the Aloop loop? (yes/no)"

If no:
- stop after summarizing PRD + SPEC output
- do not ask provider/run details
- do not scaffold config/prompts

If yes:
- continue to Step 10

### Step 10: Collect run details (only after go-ahead)

Ask only now:
1. Validation level (tests only / tests+types / full / custom)
2. Enabled providers (from installed list)
3. Default provider vs round-robin (only if 2+ enabled)
4. Runtime storage mode:
  - `global` (default): keep runtime/session state in `~/.aloop/`
  - `project-local`: store runtime/session state in `<project-root>/.aloop/`

Now it is allowed to read outside project root for runtime preparation. Re-run discovery in full scope:

`pwsh -NoProfile -File ~/.aloop/bin/setup-discovery.ps1 -Command discover -Scope full -Output json`

### Step 11: Use scaffold script to write config and prompts (required)

After decisions are finalized, run:

`pwsh -NoProfile -File ~/.aloop/bin/setup-discovery.ps1 -Command scaffold -Output json -RuntimeScope <global|project-local> -Provider <provider> -EnabledProviders <csv-or-list> -RoundRobinOrder <csv-or-list> -Language <language> -SpecFiles <list> -ValidationCommands <list>`

This script writes:
- `~/.aloop/projects/<hash>/config.yml`
- `~/.aloop/projects/<hash>/prompts/PROMPT_{plan,build,review,steer}.md`

If `RuntimeScope=project-local`, scaffold writes config/prompts under `<project-root>/.aloop/`, hydrates loop assets there once, and ensures `<project-root>/.gitignore` contains `.aloop/`.

### Step 12: Confirm setup

Display to user:

```
Aloop configured for <project-name>!

  PRD:      PRD.md (captured verbatim)
  Spec:     SPEC.md (multi-perspective plan, verified)
  Config:   ~/.aloop/projects/<hash>/config.yml
  Prompts:  ~/.aloop/projects/<hash>/prompts/

  Provider:   <selected>
  Enabled:    <provider+model list>
  Mode:       plan-build-review (plan -> build x5 -> qa -> review)
  Validation: <commands summary>
  Spec files: <selected spec files>
  Runtime:    <global|project-local> (<resolved runtime root>)

Next steps:
  /aloop:start          Launch an Aloop loop
  /aloop:start --plan   Run planning mode only
```

</process>

<notes>
- The project hash is computed from the absolute path of the project root
- On Windows, use `$HOME/.aloop/` (PowerShell resolves `~` correctly)
- If `~/.aloop/templates/` doesn't exist, stop and ask the user to run the install script
- Keep setup script-driven for consistency across machines and harnesses.
- PRD.md is a living document — the loop's plan agent can reference it as the source of truth for "what was asked"
- SPEC.md is the plan agent's starting point — it should not need to re-derive architecture or task ordering from scratch
</notes>
