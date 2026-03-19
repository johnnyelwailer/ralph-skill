---
name: aloop-devcontainer
description: Set up an isolated agent execution environment for the current project using VS Code Devcontainers.
agent: agent
---

Set up a project-tailored VS Code Devcontainer for isolated Aloop loop execution by running the `aloop devcontainer` CLI command.

## Step 1: Run `aloop devcontainer`

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

Remind the user:
- `/aloop-setup` — configure the project
- `/aloop-start` — launch an autonomous loop
- `/aloop-status` — check loop progress
