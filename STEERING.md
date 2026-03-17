# Steering

Active directives for the current loop. Agents MUST read this file at the start of each iteration.

## Devcontainer Auth: Seamless Provider Credential Forwarding

**Problem:** Users authenticate providers (claude, codex, gemini, copilot, opencode) via browser OAuth on the host. This writes tokens to local files (e.g. `~/.codex/auth.json`), not env vars. The current `remoteEnv`-only approach doesn't forward these — containers can't authenticate.

**Directive:** Implement the auth file bind-mount fallback defined in SPEC.md § "Provider Auth in Container > Fallback: Auth File Bind-Mounts". The devcontainer generator must:

1. For each activated provider, check if an env var is set (preferred path, already implemented)
2. If no env var, check if the provider's auth file exists on host
3. If auth file exists, add a bind-mount for that specific file (not the whole directory) to `devcontainer.json`
4. Auth resolution order: env var → auth file mount → warn user

Auth file locations are documented in the SPEC table. Key constraint: mount only the auth file, never the whole config directory (SQLite/lock conflicts).

## PS1 Test Shims: Linux Compatibility

**Problem:** `loop.tests.ps1` E2E tests created `claude.cmd` fake provider shims. On Linux, `.cmd` files are invisible to `Get-Command`, so tests invoked the **real** claude binary with `--model opus` — burning API credits and hanging for hours.

**Fixed in `01bda83`:** Added Linux-compatible `claude` shell script shims alongside `.cmd` files. If touching test infrastructure, ensure both `.cmd` (Windows) and shell script (Linux/macOS) shims exist for all fake provider binaries.
