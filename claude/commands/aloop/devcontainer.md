---
allowed-tools:
  - Bash
  - Read
  - AskUserQuestion
---

<objective>
Set up an isolated agent execution environment for the current project using VS Code Devcontainers.
</objective>

<process>

## Step 1: Run `aloop devcontainer`

Launch the devcontainer generation and verification flow by delegating to the `aloop devcontainer` CLI.

```bash
aloop devcontainer
```

Fallback if `aloop` is not on PATH:

```bash
node ~/.aloop/cli/aloop.mjs devcontainer
```

## Step 2: Report Result

The CLI will:
1. Analyze the project (runtime, dependencies, build tools).
2. Generate or augment `.devcontainer/devcontainer.json`.
3. Verify the container builds and starts.
4. Confirm all loop dependencies (providers, git) are functional inside the container.

Show the CLI output to the user. If the command fails, relay the error message.

## Step 3: Next Steps

Once the devcontainer is verified, subsequent `aloop start` calls will automatically use it for agent isolation.

Remind the user of available commands:
- `/$skillName:setup` — configure the project
- `/$skillName:start` — launch an autonomous loop
- `/$skillName:status` — check loop progress

</process>

<notes>
- The `aloop devcontainer` CLI handles analysis, generation, and verification.
- This command is recommended for every project to ensure security boundary and environment reproducibility.
- If a devcontainer already exists, it will be augmented with aloop-specific mounts and environment variables.
</notes>
