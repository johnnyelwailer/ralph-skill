---
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - AskUserQuestion
---

<objective>
Configure Aloop for the current project. Detect the project, gather configuration from the user, and create project-specific config and prompts in `~/.aloop/projects/<hash>/`.
</objective>

<process>

## Step 1: Run scripted discovery first (required)

Do NOT perform ad-hoc shell probing. Do NOT compose custom bash discovery pipelines.

Run this command first:

`pwsh -NoProfile -File ~/.aloop/bin/setup-discovery.ps1 -Command discover -Output json`

Treat the JSON output as source of truth for:
- project root/name/hash
- existing setup (`config_exists`, config path, templates path)
- language guess + confidence
- validation presets
- spec candidates
- context files (`TODO.md`, `RESEARCH.md`, `REVIEW_LOG.md`, `STEERING.md`)
- installed/missing providers + default models

Show: "Setting up Aloop for: <project-name> (<project-root>)"

## Step 2: Use current conversation context

Assume setup is often run inside an ongoing discussion.

Before asking questions:
1. Summarize discovered repo context
2. Summarize context already present in conversation
3. Ask only delta questions

Do NOT repeat questions answered by discovery or earlier messages in the same conversation.

## Step 3: Existing config behavior

If `config_exists=true`, ask:
- "Patch existing setup (recommended) or fully reconfigure?"

Default to patching unless user explicitly requests full reset.

## Step 4: Interview phase (requirements/spec only)

This phase is interview-only. Do NOT prepare loop runtime yet.

Ask only spec/context questions needed to align on work:
- Desired outcome
- Scope / non-goals
- Constraints
- Acceptance criteria
- Risks

Ask about language only when detection confidence is low.

## Step 5: Spec-first interview (default)

Do not force a "where is your spec file" question as the primary path.

If no clear spec exists, or user wants to define requirements now, interview and create/update `SPEC.md` directly in the repo using concise prompts:
- Desired outcome
- Scope and non-goals
- Constraints
- Acceptance criteria
- Risks

If discovery found spec candidates, ask whether to include each candidate in `spec_files`.

## Step 6: Explicit go-ahead gate (required)

After interview/spec alignment, ask:
- "Proceed to prepare Aloop loop config now? (yes/no)"

If no:
- stop after summarizing the agreed interview/spec output
- do not ask provider/run details
- do not scaffold config/prompts

If yes:
- continue to Step 7

## Step 7: Collect run details (only after go-ahead)

Ask only now:
1. Validation level (tests only / tests+types / full / custom)
2. Enabled providers (from installed list)
3. Default provider vs round-robin (only if 2+ enabled)

## Step 8: Use scaffold script to write config and prompts (required)

After decisions are finalized, run:

`pwsh -NoProfile -File ~/.aloop/bin/setup-discovery.ps1 -Command scaffold -Output json -Provider <provider> -EnabledProviders <csv-or-list> -RoundRobinOrder <csv-or-list> -Language <language> -SpecFiles <list> -ValidationCommands <list>`

This script writes:
- `~/.aloop/projects/<hash>/config.yml`
- `~/.aloop/projects/<hash>/prompts/PROMPT_{plan,build,review}.md`

## Step 9: Confirm setup

Display to user:

```
Aloop configured for <project-name>!

  Config: ~/.aloop/projects/<hash>/config.yml
  Prompts: ~/.aloop/projects/<hash>/prompts/

  Provider: <selected>
  Enabled:  <provider+model list>
  Mode:     plan-build-review (plan -> build x3 -> review)
  Validation: <commands summary>
  Spec files: <selected spec files>

Next steps:
  /$skillName:start          Launch a Aloop loop
  /$skillName:start --plan   Run planning mode only
```

</process>

<notes>
- The project hash is computed from the absolute path of the project root
- On Windows, use `$HOME/.aloop/` (PowerShell resolves `~` correctly)
- If `~/.aloop/templates/` doesn't exist, stop and ask the user to run the install script
- Keep setup script-driven for consistency across machines and harnesses.
</notes>
