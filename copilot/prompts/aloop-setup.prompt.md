---
name: aloop-setup
description: Configure Aloop autonomous coding loop for the current project. Creates project config and prompts in ~/.aloop/projects/.
agent: agent
---

Configure Aloop for the current project. Detect the project, gather configuration from the user, and create project-specific config and prompts in `~/.aloop/projects/<hash>/`.

## Step 1: Run scripted discovery (required)

Do NOT do manual shell probing and do NOT use ad-hoc bash snippets for setup discovery.
Run exactly this command first:

`aloop discover`

(fallback if `aloop` is not yet on PATH: `node ~/.aloop/cli/aloop.mjs discover`)

Use its JSON output as the source of truth for:
- project root/name/hash
- existing Aloop config path + existence
- detected language + confidence
- validation presets
- spec candidates
- context files (`TODO.md`, `RESEARCH.md`, `REVIEW_LOG.md`, `STEERING.md`)
- installed/missing providers + default models

Display a concise summary: `Setting up Aloop for: <project-name> (<project-root>)`

## Step 2: Be conversation-aware before asking questions

Assume setup may be invoked inside an ongoing conversation.

Before asking anything, summarize what is already known from:
1. Discovery JSON
2. Existing project files/context (`TODO.md`, `RESEARCH.md`, `REVIEW_LOG.md`)
3. Current conversation context provided by the user

Then ask only delta questions. Do NOT ask questions that discovery/context already answered with high confidence.

## Step 3: Existing setup behavior

If discovery says `config_exists=true`, ask:
- `Keep current config and patch only missing fields, or fully reconfigure?`

Default to **patch** when possible.

## Step 4: Interview phase (requirements/spec only)

This phase is interview-only. Do NOT prepare loop runtime yet.

Ask only spec/context questions needed to align on work:
- Desired outcome
- Scope / non-goals
- Constraints
- Acceptance criteria
- Risks

Language question is allowed only if detection confidence is low.

## Step 5: Spec-first interview (default when spec is missing/weak)

Do NOT primarily ask for a spec file path.

If no clear spec exists (or user prefers to refine it live), interview the user to create or update `SPEC.md` directly in repo. Use concise questions:
- Problem / desired outcome
- In-scope and out-of-scope
- Constraints (tech, timeline, compatibility)
- Acceptance criteria / definition of done
- Risks or non-goals

If spec candidates exist, propose them as references and ask whether to include them in `spec_files`.

## Step 6: Explicit go-ahead gate (required)

After the interview/spec alignment, ask:
- `Proceed to prepare Aloop loop config now? (yes/no)`

If **no**:
- stop after summarizing the agreed spec/interview output
- do not ask provider/run details
- do not scaffold config/prompts

If **yes**:
- continue to Step 7

## Step 7: Collect run details (only after go-ahead)

Ask only now:
1. Validation level (tests only / tests+types / full / custom)
2. Provider selection from installed providers (multi-select)
3. Default provider vs round-robin (only when 2+ providers selected)

## Step 8: Use CLI to scaffold config + prompts (required)

After collecting final choices, call:

`aloop scaffold --provider <provider> --enabled-providers <csv-or-list> --round-robin-order <csv-or-list> --language <language> --spec-files <list> --validation-commands <list>`

(fallback if `aloop` is not yet on PATH: `node ~/.aloop/cli/aloop.mjs scaffold ...`)

This command must be used to write:
- `~/.aloop/projects/<hash>/config.yml`
- `~/.aloop/projects/<hash>/prompts/PROMPT_{plan,build,review}.md`

## Step 9: Confirm setup

Display:
```
Aloop configured for <project-name>!

  Config:     ~/.aloop/projects/<hash>/config.yml
  Prompts:    ~/.aloop/projects/<hash>/prompts/
  Provider:   <selected>
  Enabled:    <provider+model list>
  Validation: <commands summary>
  Spec files: <selected spec files>

Next: /aloop-start to launch a loop
```

> If `~/.aloop/templates/` is missing, stop and ask the user to run `./install.ps1` first.
> The `aloop discover` command computes the project hash automatically from the git root.
