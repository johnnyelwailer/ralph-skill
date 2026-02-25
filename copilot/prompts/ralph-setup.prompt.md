---
name: ralph-setup
description: Configure Ralph autonomous coding loop for the current project. Creates project config and prompts in ~/.ralph/projects/.
agent: agent
---

Configure Ralph for the current project. Detect the project, gather configuration from the user, and create project-specific config and prompts in `~/.ralph/projects/<hash>/`.

## Step 1: Detect Project

Detect the current project:
1. Find the git root of the current working directory (or use cwd if not a git repo)
2. Compute a project hash from the absolute path (use a short hash: first 8 chars of SHA-256)
3. Determine the project name from the directory name

Display: "Setting up Ralph for: <project-name> (<project-root>)"

## Step 2: Check Existing Setup

Check if `~/.ralph/projects/<hash>/config.yml` already exists.
- If yes, ask: "Ralph is already configured for this project. Reconfigure? (yes/no)"
- If no, continue

## Step 3: Gather Project Context

Ask the user (batch questions — up to 4 at a time):

**Question 1:** "What programming language/framework is this project using?"
Options: Node.js/TypeScript, Python, Go, Rust, .NET/C#, Other

**Question 2:** "What validation commands should Ralph run as backpressure?"
- Tests only — `npm test` / `pytest` / `go test ./...` / etc.
- Tests + type checking
- Full validation — Tests, type checking, linting, builds
- Custom — I'll specify the commands

**Question 3:** "Where are your specification/requirement files?"
- Single spec file (e.g., `SPEC.md`, `README.md`)
- Directory of specs (e.g., `specs/`, `docs/`)
- No specs yet — I'll create them as I go
- Custom paths — I'll specify

**Question 4:** "Which providers do you want to enable?" (multi-select)
Read `~/.ralph/config.yml` to get current default model IDs per provider.
- Claude — claude CLI
- Codex — codex CLI
- Gemini — gemini CLI
- Copilot — copilot CLI

If 2+ providers selected, also ask:
- "Which provider should be the default (or use round-robin)?"
- "Customize models for enabled providers?" (use defaults from config.yml)

## Step 4: Generate Validation Commands

Based on language and validation level:

**Node.js/TypeScript:**
- Tests only: `npx vitest run` or `npm test`
- Tests + types: `npx tsc --noEmit && npx vitest run`
- Full: `npx tsc --noEmit && npx eslint src/ && npx vitest run`

**Python:** `pytest` / `mypy . && pytest` / `mypy . && ruff check . && pytest`

**Go:** `go test ./...` / `go vet ./... && go test ./...` / `go vet ./... && golangci-lint run && go test ./...`

**.NET/C#:** `dotnet test` / `dotnet build && dotnet test`

**Rust:** `cargo test` / `cargo clippy -- -D warnings && cargo test`

## Step 5: Create Project Config

Create `~/.ralph/projects/<hash>/config.yml`:

```yaml
project_name: <name>
project_root: <absolute-path>
language: <detected>
provider: <selected>  # claude, codex, gemini, copilot, or round-robin
mode: plan-build-review
spec_files: <selected-paths>
validation_commands: |
  <generated-commands>
safety_rules: |
  - Never delete the project directory or run destructive commands
  - Never push to remote without explicit user approval

enabled_providers:
  - claude
  - codex

models:
  claude: opus
  codex: gpt-5.3-codex
  gemini: gemini-3.1-pro-preview
  copilot: gpt-5.3-codex

round_robin_order:
  - claude
  - codex

created_at: <timestamp>
```

## Step 6: Generate Project-Specific Prompts

Read `~/.ralph/templates/PROMPT_{plan,build,review}.md` and substitute:
- `{{SPEC_FILES}}` → spec paths from config
- `{{VALIDATION_COMMANDS}}` → concrete validation commands
- `{{SAFETY_RULES}}` → safety rules
- `{{PROVIDER_HINTS}}` → provider-specific hints

Write resolved prompts to `~/.ralph/projects/<hash>/prompts/PROMPT_{plan,build,review}.md`.

## Step 7: Confirm Setup

Display:
```
Ralph configured for <project-name>!

  Config:     ~/.ralph/projects/<hash>/config.yml
  Prompts:    ~/.ralph/projects/<hash>/prompts/
  Provider:   <selected>
  Enabled:    claude (opus), codex (gpt-5.3-codex)
  Validation: <commands summary>

Next: /ralph-start to launch a loop
```

> Note: If `~/.ralph/templates/` doesn't exist, warn the user to run the install script from https://github.com/johnnyelwailer/ralph-skill
