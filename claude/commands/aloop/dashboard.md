---
allowed-tools:
  - Bash
---

<objective>
Launch the Aloop dashboard by delegating to `aloop dashboard`.
</objective>

<process>

## Step 1: Translate Arguments

Map any user-provided arguments after `/$skillName:dashboard` to `aloop dashboard` flags:
- `--port <n>` -> `--port <n>`
- `--session-dir <path>` -> `--session-dir <path>`
- `--workdir <path>` -> `--workdir <path>`
- `--assets-dir <path>` -> `--assets-dir <path>`
- No args -> no extra flags (CLI defaults to port `3000`)

## Step 2: Run CLI

Run:

```bash
aloop dashboard [flags...]
```

Fallback if `aloop` is not on PATH:

```bash
node ~/.aloop/cli/aloop.mjs dashboard [flags...]
```

## Step 3: Report Result

Show the CLI output to the user. If the command fails, relay the error message.

</process>

<notes>
- The dashboard command serves both API and frontend for live session state.
- Do not reimplement dashboard setup logic here; call the CLI directly.
</notes>

