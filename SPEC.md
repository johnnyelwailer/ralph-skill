# SPEC.md — Aloop Skill Repository

Canonical specification for the Aloop skill installer, covering naming conventions, supported harnesses, command/prompt surface, and runtime layout.

## Canonical Naming

| Context | Value |
|---------|-------|
| Product / methodology | **Aloop** |
| Installer `$skillName` variable | `ralph` (constructed as `'ra' + 'lph'` to avoid grep detection) |
| Repo source: skill + commands | `claude/skills/ralph/`, `claude/commands/ralph/` |
| Repo source: Copilot prompts | `copilot/prompts/` (files named `aloop-*.prompt.md`) |
| Repo source: runtime | `ralph/` (config, bin, templates) |
| Install: skill directories | `~/.{claude,codex,copilot,agents}/skills/ralph/` |
| Install: command directories | `~/.{claude,codex}/commands/ralph/` |
| Install: runtime root | `~/.aloop/` |
| SKILL.md YAML `name:` | `aloop` |
| Copilot prompt YAML `name:` | `aloop-{setup,start,status,stop,steer}` |
| Slash commands (Claude/Codex) | `/ralph:setup`, `/ralph:start`, `/ralph:status`, `/ralph:stop`, `/ralph:steer` |
| VS Code prompts (Copilot) | `/aloop-setup`, `/aloop-start`, `/aloop-status`, `/aloop-stop`, `/aloop-steer` |

**Rule**: The string `ralph` must never appear literally in non-SPEC.md content files (`.md`, `.ps1`, `.sh`, `.yml`, `.mjs`). The installer constructs it at runtime via string concatenation. Reference files use the directory name but avoid the literal string in prose.

## Supported Harnesses

| Id | Name | Skill | Commands | Notes |
|----|------|:-----:|:--------:|-------|
| `claude` | Claude Code | yes | yes (5 slash commands) | Primary harness |
| `codex` | Codex CLI | yes | yes (5 slash commands) | Shares claude/ source files |
| `copilot` | GH Copilot (VS Code) | yes | no (uses `.prompt.md` files) | Prompts installed to VS Code user dir |
| `agents` | Agents (generic) | yes | no | agentskills.io standard |

### CLI Providers (independent of harness)

| Provider | Binary | npm Package | Auth |
|----------|--------|-------------|------|
| Claude Code | `claude` | `@anthropic-ai/claude-code` | `claude auth` or `$ANTHROPIC_API_KEY` |
| Codex CLI | `codex` | `@openai/codex` | `codex auth` or `$OPENAI_API_KEY` |
| Gemini CLI | `gemini` | `@google/gemini-cli` | `gemini auth` or `$GEMINI_API_KEY` |
| Copilot CLI | `copilot` | `@github/copilot` | `/login` or `$GH_TOKEN`/`$GITHUB_TOKEN` |

## Command / Prompt Surface

### Claude Code + Codex CLI: 5 Slash Commands

Source: `claude/commands/ralph/`

| Command | File | Purpose |
|---------|------|---------|
| `/ralph:setup` | `setup.md` | Configure Aloop for current project (discovery + interview) |
| `/ralph:start` | `start.md` | Launch a loop (`--plan`, `--build`, `--review`, `--provider`, `--in-place`, `--max <n>`) |
| `/ralph:status` | `status.md` | Display running sessions and history |
| `/ralph:stop` | `stop.md` | Stop a running loop (graceful SIGTERM, escalate SIGKILL) |
| `/ralph:steer` | `steer.md` | Send live steering instruction (generates `STEERING.md`) |

### GitHub Copilot: 5 VS Code Prompt Files

Source: `copilot/prompts/`

| Prompt | File | YAML `name:` |
|--------|------|--------------|
| `/aloop-setup` | `aloop-setup.prompt.md` | `aloop-setup` |
| `/aloop-start` | `aloop-start.prompt.md` | `aloop-start` |
| `/aloop-status` | `aloop-status.prompt.md` | `aloop-status` |
| `/aloop-stop` | `aloop-stop.prompt.md` | `aloop-stop` |
| `/aloop-steer` | `aloop-steer.prompt.md` | `aloop-steer` |

Install destinations:
- VS Code stable: `%APPDATA%\Code\User\prompts\`
- VS Code Insiders: `%APPDATA%\Code - Insiders\User\prompts\`

### Skill (auto-loaded, all harnesses)

Source: `claude/skills/ralph/`

| File | Purpose |
|------|---------|
| `SKILL.md` | Skill metadata (`name: aloop`) + methodology overview |
| `references/ralph-fundamentals.md` | Core concepts, phases, stuck detection |
| `references/prompt-design.md` | Prompt principles, template design |
| `references/validation-strategy.md` | Backpressure: tests, lints, builds |
| `references/operational-learnings.md` | AGENTS.md guidance and evolution |

## Runtime Layout

All runtime state installs to `~/.aloop/`, independent of harness selection.

```
~/.aloop/
  config.yml                     # Global defaults (provider, model, modes)
  cli/
    dist/
      index.js                   # Bundled CLI entry (resolve/discover/scaffold/dashboard)
  bin/
    loop.ps1                     # PowerShell loop (Windows / macOS / Linux)
    loop.sh                      # Bash loop (macOS / Linux)
    setup-discovery.ps1          # Discovery + scaffold for setup command
  templates/
    PROMPT_plan.md               # Plan template with {{variables}}
    PROMPT_build.md              # Build template
    PROMPT_review.md             # Review template
    PROMPT_steer.md              # Steering template (spec-update agent)
  projects/<hash>/               # Per-project config (created by setup)
    config.yml
    prompts/                     # Substituted prompt files
  sessions/<id>/                 # Per-session state (created by start)
    meta.json, status.json, log.jsonl, report.md
  active.json                    # Registry of running sessions
  history.json                   # Completed sessions (last 100, managed by uninstaller)
```

### CLI Monorepo Build Contract

- CLI server implementation lives in `aloop/cli/src/` TypeScript sources (`index.ts`, `commands/{resolve,discover,scaffold,dashboard}.ts`).
- Dashboard frontend lives in `aloop/cli/dashboard/` and is built with React + Tailwind CSS 4 + shadcn/ui (LATEST) components (copied source).
- Markdown rendering for Docs view uses `marked` (or `react-markdown`).
- Build output installs under `~/.aloop/cli/` and includes `dist/index.js` (server) plus bundled dashboard HTML assets.
- Runtime execution uses the installed bundle (`node ~/.aloop/cli/dist/index.js`).
- "Zero deps" applies to installed runtime output (no installed `node_modules` required on user machines); dev/build dependencies are allowed.

### Template Variables

Resolved during `/ralph:setup` (or `/aloop-setup`) into per-project prompts:

| Variable | Purpose |
|----------|---------|
| `{{SPEC_FILES}}` | Paths to spec files (e.g. `SPEC.md`, `specs/*.md`) |
| `{{REFERENCE_FILES}}` | Additional reference documents |
| `{{VALIDATION_COMMANDS}}` | Backpressure commands (e.g. `npm test && npm run type-check`) |
| `{{SAFETY_RULES}}` | Project safety constraints |
| `{{PROVIDER_HINTS}}` | Provider-specific guidance |

## Live Progress Dashboard

Self-contained Node.js HTTP server for real-time monitoring of running sessions.

### Architecture
- **Runtime**: TypeScript monorepo with server code in `aloop/cli/src/` and dashboard frontend app in `aloop/cli/dashboard/`; `commands/dashboard.ts` serves the bundled frontend.
- **Dependencies**: Frontend stack uses React, Tailwind CSS, shadcn/ui, and `marked` (or `react-markdown`); Vite or esbuild is used as a dev/build bundler.
- **Data Source**: Watches `status.json`, `log.jsonl`, `active.json`, and work-dir documents via `fs.watch`.
- **Transport**: Server-Sent Events (SSE) for live push to browser.
- **Frontend**: Single bundled HTML response with inlined CSS/JS served by the dashboard server.

### Dashboard Layout (Three-Column)
1.  **Left: Session List**: Active and recent sessions from `active.json`. Shows name, status (running/complete/stuck), elapsed time, and iteration count.
2.  **Center: Vertical Nav**:
    - **Progress** (Default): Session header and iteration timeline.
    - **Docs**: Markdown document viewer (TODO.md, SPEC.md, etc.).
    - **Log**: Raw log stream from `log.jsonl`.
    - **Steer**: Interface to submit steering instructions (writes `STEERING.md` via `/api/steer`).
    - **Stop**: Graceful session stop via `/api/stop`.
3.  **Right: Content Area**: Renders the selected navigation view.

### Integration
- **Lifecycle**: Launched automatically by `loop.ps1` / `loop.sh` by starting the CLI dashboard subcommand in the background on an available port.
- **Discovery**: URL printed to CLI upon launch and included in the `/ralph:start` prompt output.
- **Build pipeline**: `vite build` bundles dashboard frontend, `esbuild` (or `tsc`) compiles CLI server to `dist/index.js`, and the server reads/serves the bundled HTML on `GET /`.
- **Installer**: `install.ps1` deploys bundled CLI output to `~/.aloop/cli/`; the `aloop` shim runs `node ~/.aloop/cli/dist/index.js`.

### Project Working Files

Created in the project work directory (or worktree):

| File | Lifecycle |
|------|-----------|
| `TODO.md` | Volatile — regenerated each plan cycle |
| `RESEARCH.md` | Append-only — survives TODO regenerations |
| `REVIEW_LOG.md` | Append-only — tracks review verdicts |
| `STEERING.md` | Temporary — consumed by steer agent, then removed |

## Installer Contract (`install.ps1`)

### Source-to-Destination Mapping

| Source (repo) | Destination | Condition |
|---------------|-------------|-----------|
| `claude/skills/$skillName/` | `~/.<harness>/skills/$skillName/` | All selected harnesses |
| `claude/commands/$skillName/` | `~/.<harness>/commands/$skillName/` | Only `claude` and `codex` (`HasCommands = $true`) |
| `copilot/prompts/` | `%APPDATA%\Code{,-Insiders}\User\prompts\` | Auto-detected VS Code installations |
| `$skillName/config.yml` | `~/.aloop/config.yml` | Always |
| `$skillName/cli/dist/` | `~/.aloop/cli/` | Always (built CLI server + bundled dashboard frontend) |
| `$skillName/bin/` | `~/.aloop/bin/` | Always |
| `$skillName/templates/` | `~/.aloop/templates/` | Always |

### Flags

| Flag | Effect |
|------|--------|
| `-All` | Install all harnesses + auto-install missing CLIs |
| `-Harnesses claude,codex` | Pre-select specific harnesses |
| `-Force` | Overwrite existing files |
| `-DryRun` | Preview without changes |
| `-SkipCliCheck` | Skip CLI detection and auto-install |

### Stale Cleanup

The installer removes legacy directories from older installs:
- `~/.copilot/commands/aloop` (Copilot never supported commands dir)
- `~/.agents/commands/aloop` (Agents never supported commands dir)

## Uninstaller Contract (`uninstall.ps1`)

### Removal Targets

| Target | Paths |
|--------|-------|
| Claude Code | `~/.claude/skills/$skillName/`, `~/.claude/commands/$skillName/` |
| Codex CLI | `~/.codex/skills/$skillName/`, `~/.codex/commands/$skillName/` |
| GH Copilot | `~/.copilot/skills/$skillName/` |
| Agents | `~/.agents/skills/$skillName/` |
| VS Code prompts | `%APPDATA%\Code{,-Insiders}\User\prompts\aloop-*.prompt.md` |
| Runtime | `~/.aloop/` (includes session data — warning displayed) |

**Note**: The uninstaller must use `$skillName` (`ralph`) for harness paths, matching what the installer deploys. VS Code prompt glob uses `aloop-*` because prompt file metadata names use `aloop-` prefix.

### Flags

| Flag | Effect |
|------|--------|
| `-All` | Remove everything without interactive selection |
| `-Force` | Skip confirmation prompt |
| `-DryRun` | Preview without changes |

## Loop Modes

| Mode | Cycle | Description |
|------|-------|-------------|
| `plan` | Plan only | Gap analysis, output TODO.md, no commits |
| `build` | Build only | Implement one task, validate, commit |
| `review` | Review only | Audit against 5 gates, write [review] tasks |
| `plan-build` | Plan, Build alternating | Plan then build, repeat |
| `plan-build-review` | Plan, Build x3, Review | Full 5-iteration cycle (default) |

## Backpressure Validation

Every commit must pass configured validation. The build prompt includes `{{VALIDATION_COMMANDS}}` which the agent runs before committing. Stuck detection auto-skips tasks after `max_stuck` (default: 3) consecutive failures.

## Platform Support

| Component | Windows | macOS | Linux |
|-----------|:-------:|:-----:|:-----:|
| `install.ps1` / `uninstall.ps1` | yes | yes (pwsh) | yes (pwsh) |
| `loop.ps1` | yes | yes (pwsh) | yes (pwsh) |
| `loop.sh` | no | yes | yes |
