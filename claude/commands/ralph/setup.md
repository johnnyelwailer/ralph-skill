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
Configure Ralph for the current project. Detect the project, gather configuration from the user, and create project-specific config and prompts in `~/.ralph/projects/<hash>/`.
</objective>

<process>

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

Ask the user using AskUserQuestion (batch into 2-3 questions):

**Question 1:** "What programming language/framework is this project using?"
- Options: Node.js/TypeScript, Python, Go, Rust, .NET/C#, Other

**Question 2:** "What validation commands should Ralph run as backpressure?"
- Option 1: **Tests only** — `npm test` / `pytest` / `go test ./...` / etc.
- Option 2: **Tests + type checking** — Tests and type checker
- Option 3: **Full validation** — Tests, type checking, linting, builds
- Option 4: **Custom** — I'll specify the commands

**Question 3:** "Where are your specification/requirement files?"
- Option 1: Single spec file (e.g., `SPEC.md`, `README.md`)
- Option 2: Directory of specs (e.g., `specs/`, `docs/`)
- Option 3: No specs yet — I'll create them as I go
- Option 4: Custom paths — I'll specify

If custom validation or custom spec paths selected, ask follow-up questions.

**Question 4:** "Which provider should Ralph use by default?"
- Option 1: **Claude** (Recommended) — Most capable for complex tasks
- Option 2: **Codex** — Fast, good for straightforward tasks
- Option 3: **Round-robin** — Cycle through multiple providers
- Option 4: **Other** — gemini or copilot

## Step 4: Generate Validation Commands

Based on language and validation level, determine the concrete commands:

**Node.js/TypeScript:**
- Tests only: `npx vitest run` or `npm test`
- Tests + types: `npx tsc --noEmit && npx vitest run`
- Full: `npx tsc --noEmit && npx eslint src/ && npx vitest run`

**Python:**
- Tests only: `pytest`
- Tests + types: `mypy . && pytest`
- Full: `mypy . && ruff check . && pytest`

**Go:**
- Tests only: `go test ./...`
- Tests + types: `go vet ./... && go test ./...`
- Full: `go vet ./... && golangci-lint run && go test ./...`

**.NET/C#:**
- Tests only: `dotnet test`
- Tests + types: `dotnet build && dotnet test`
- Full: `dotnet build && dotnet test`

**Rust:**
- Tests only: `cargo test`
- Tests + types: `cargo clippy -- -D warnings && cargo test`
- Full: `cargo clippy -- -D warnings && cargo test && cargo build --release`

## Step 5: Create Project Config

Create directory `~/.ralph/projects/<hash>/` and write `config.yml`:

```yaml
project_name: <name>
project_root: <absolute-path>
language: <detected>
provider: <selected>
mode: plan-build-review
spec_files: <selected-paths>
validation_commands: |
  <generated-commands>
safety_rules: |
  - Never delete the project directory or run destructive commands
  - Tests must run in isolated temp directories when testing file generation
  - Never push to remote without explicit user approval
created_at: <timestamp>
```

## Step 6: Generate Project-Specific Prompts

Read the templates from `~/.ralph/templates/PROMPT_{plan,build,review}.md` and substitute variables:

- `{{SPEC_FILES}}` → the spec paths from config
- `{{REFERENCE_FILES}}` → any additional reference file lines (or remove the line)
- `{{VALIDATION_COMMANDS}}` → the concrete validation commands
- `{{SAFETY_RULES}}` → the safety rules
- `{{PROVIDER_HINTS}}` → provider-specific hints (e.g., subagent counts for Claude)

Write the resolved prompts to `~/.ralph/projects/<hash>/prompts/PROMPT_{plan,build,review}.md`.

## Step 7: Confirm Setup

Display to user:

```
Ralph configured for <project-name>!

  Config: ~/.ralph/projects/<hash>/config.yml
  Prompts: ~/.ralph/projects/<hash>/prompts/

  Provider: <selected>
  Mode: plan-build-review
  Validation: <commands summary>

Next steps:
  /ralph:start          Launch a Ralph loop
  /ralph:start --plan   Run planning mode only
```

</process>

<notes>
- The project hash is computed from the absolute path of the project root
- On Windows, use `$HOME/.ralph/` (PowerShell resolves `~` correctly)
- If `~/.ralph/templates/` doesn't exist, warn the user to run the install script
- Provider hints for Claude: mention subagent parallelism. For Codex: mention stdin mode.
</notes>
