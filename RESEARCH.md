# Research Log

## 2026-03-07 18:33 +01:00 — Devcontainer spec baseline for `/aloop:devcontainer` [T1+T2+T3]

- Confirmed authoritative sources and scope for implementation:
  - Use `containers.dev` implementor spec/reference as source of truth for `devcontainer.json` shape and lifecycle semantics.
  - Use VS Code devcontainer docs for CLI workflow and operational patterns.
  - Source: https://containers.dev/implementors/spec/ (T1), https://containers.dev/implementors/json_reference/ (T1), https://code.visualstudio.com/docs/devcontainers/create-dev-container (T1), `SPEC.md` devcontainer prerequisite section (T3)
- Lifecycle order to implement in generated configs and verification expectations:
  - `initializeCommand` (host) runs before container start, then `onCreateCommand` -> `updateContentCommand` -> `postCreateCommand`; on every start/attach: `postStartCommand` then `postAttachCommand`.
  - `waitFor` defaults to `updateContentCommand`.
  - Source: https://containers.dev/implementors/json_reference/ (T1), https://containers.dev/implementors/spec/ (T1)
- `devcontainer.json` constraints for generation:
  - `features` is a map keyed by feature ID (`ghcr.io/devcontainers/features/...`) with option objects.
  - `mounts` accepts Docker `--mount` syntax (string or object form).
  - Variable substitution supports `${localEnv:VAR}`, `${containerEnv:VAR}`, `${localWorkspaceFolder}`, `${containerWorkspaceFolder}` and related forms.
  - Source: https://containers.dev/implementors/json_reference/ (T1), https://containers.dev/implementors/features/ (T1)
- Environment forwarding semantics that affect provider auth strategy:
  - `containerEnv` applies to all processes in the container.
  - `remoteEnv` applies to VS Code and its subprocesses/terminals; can reference `${containerEnv:PATH}` and `${localEnv:VAR}`.
  - Source: https://code.visualstudio.com/remote/advancedcontainers/environment-variables (T1)
- Workspace/worktree mounting decisions for upcoming implementation:
  - VS Code defaults source mount to project root (or git root if `git` exists); override with `workspaceMount` + `workspaceFolder` when needed.
  - For Aloop worktrees under `~/.aloop/sessions/<id>/worktree`, plan to ensure explicit mount accessibility plus `devcontainer exec --workspace-folder <worktree>`.
  - Source: https://code.visualstudio.com/remote/advancedcontainers/change-default-source-mount (T1), `SPEC.md` devcontainer integration/worktree sections (T3)
- Docker Compose support remains first-class and should be augmentation-safe:
  - Existing `.devcontainer` setups may use `dockerComposeFile` + `service`; generation flow should augment, not replace, existing config.
  - Source: https://code.visualstudio.com/docs/devcontainers/create-dev-container (T1), https://code.visualstudio.com/remote/advancedcontainers/connect-multiple-containers (T1), `TODO.md` devcontainer/P1 augmentation task (T3)
- CLI command behaviors required for verification loop:
  - `devcontainer build`, `devcontainer up`, `devcontainer exec`, and `devcontainer read-configuration` are documented and should be used in verification/fail-fix-reverify flow.
  - Source: https://code.visualstudio.com/docs/devcontainers/devcontainer-cli (T1), https://github.com/devcontainers/cli (T1), `SPEC.md` devcontainer verification requirements (T3)
- Local environment check for this machine:
  - `devcontainer` CLI is currently not installed in this workspace environment (`Get-Command devcontainer` returns not found).
  - Source: command run `Get-Command devcontainer -ErrorAction SilentlyContinue`; command run `if (Get-Command devcontainer -ErrorAction SilentlyContinue) { devcontainer --version } else { Write-Output "devcontainer CLI not installed" }` (T2)

