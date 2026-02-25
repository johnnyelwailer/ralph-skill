---
name: ralph-setup
description: Configure Ralph autonomous coding loop for the current project. Creates project config and prompts in ~/.ralph/projects/.
agent: agent
---

Configure Ralph for the current project. Detect the project, gather configuration from the user, and create project-specific config and prompts in `~/.ralph/projects/<hash>/`.

## Step 1: Run project-scope discovery (required)

Do NOT do manual shell probing and do NOT use ad-hoc bash snippets for setup discovery.
Before explicit user go-ahead, do not read files outside the current project root.
Run exactly this script first:

`pwsh -NoProfile -File ~/.ralph/bin/setup-discovery.ps1 -Command discover -Scope project -Output json`

Use its JSON output as the source of truth for:
- project root/name/hash
- detected language + confidence
- validation presets
- spec candidates
- context files (`TODO.md`, `RESEARCH.md`, `REVIEW_LOG.md`, `STEERING.md`)
- installed/missing providers

Display a concise summary: `Setting up Ralph for: <project-name> (<project-root>)`

## Step 2: Be conversation-aware before asking questions

Assume setup may be invoked inside an ongoing conversation.

Before asking anything, summarize what is already known from:
1. Discovery JSON
2. Existing project files/context (`TODO.md`, `RESEARCH.md`, `REVIEW_LOG.md`)
3. Current conversation context provided by the user

Then ask only delta questions. Do NOT ask questions that discovery/context already answered with high confidence.

## Step 3: Existing setup behavior

In interview phase, treat existing external config checks as deferred.
Do not inspect `~/.ralph/projects/*` yet.

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
- `Proceed to prepare Ralph loop config now? (yes/no)`

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
4. Runtime storage mode:
  - `global` (default): keep runtime/session state in `~/.ralph/`
  - `project-local`: store runtime/session state in `<project-root>/.ralph/`

Now it is allowed to read outside project root for runtime preparation. Re-run discovery in full scope:

`pwsh -NoProfile -File ~/.ralph/bin/setup-discovery.ps1 -Command discover -Scope full -Output json`

## Step 8: Use script to scaffold config + prompts (required)

After collecting final choices, call:

`pwsh -NoProfile -File ~/.ralph/bin/setup-discovery.ps1 -Command scaffold -Output json -RuntimeScope <global|project-local> -Provider <provider> -EnabledProviders <csv-or-list> -RoundRobinOrder <csv-or-list> -Language <language> -SpecFiles <list> -ValidationCommands <list>`

This script must be used to write:
- `~/.ralph/projects/<hash>/config.yml`
- `~/.ralph/projects/<hash>/prompts/PROMPT_{plan,build,review}.md`

If `RuntimeScope=project-local`, scaffold writes config/prompts under `<project-root>/.ralph/`, hydrates loop assets there once, and ensures `<project-root>/.gitignore` contains `.ralph/`.

## Step 9: Confirm setup

Display:
```
Ralph configured for <project-name>!

  Config:     ~/.ralph/projects/<hash>/config.yml
  Prompts:    ~/.ralph/projects/<hash>/prompts/
  Provider:   <selected>
  Enabled:    <provider+model list>
  Validation: <commands summary>
  Spec files: <selected spec files>
  Runtime:    <global|project-local> (<resolved runtime root>)

Next: /ralph-start to launch a loop
```

> If `~/.ralph/templates/` is missing, stop and ask the user to run `./install.ps1` first.
