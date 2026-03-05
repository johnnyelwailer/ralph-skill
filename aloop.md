# Plan: `aloop` CLI — Node.js orchestration tool + portable loop scripts

## TL;DR

Rename "ralph" → **"aloop"** (agent loop) across everything: CLI, directory (`~/.aloop/`), commands (`/aloop:setup`), repo. Replace `setup-discovery.ps1` with a **Node.js CLI** (`aloop`) for developer-machine tasks (discover, scaffold, resolve). **Keep `loop.ps1`/`loop.sh` as-is** for the autonomous runtime — they run anywhere (containers, sandboxes, CI) with zero deps beyond shell + git + provider CLI.

**Architecture:**

| Layer | Runs where | Tech | Deps |
|-------|-----------|------|------|
| **`aloop` CLI** (discover, scaffold, resolve) | Developer machine | Node.js `.mjs` | Node.js (already there for provider CLIs) |
| **Loop scripts** (plan-build-review cycle) | Anywhere — containers, sandboxes, CI, exitbox | `loop.ps1` / `loop.sh` | Only shell + git + provider CLI |

---

## Phase 0: Rename ralph → aloop (all references)

**Goal:** Consistent naming across the entire project.

**Rename map:**
- `~/.ralph/` → `~/.aloop/`
- `ralph/` (repo subdir) → `aloop/`
- Commands: `/ralph:setup` → `/aloop:setup`, `/ralph-setup` → `/aloop-setup`, etc.
- Skill dirs: `~/.claude/skills/ralph/` → `~/.claude/skills/aloop/`
- Command dirs: `~/.claude/commands/ralph/` → `~/.claude/commands/aloop/`
- Prompts: `ralph-setup.prompt.md` → `aloop-setup.prompt.md`
- Config references, README, install.ps1, uninstall.ps1
- SKILL.md, all reference docs
- Repo itself (user decision — can be deferred)

**Files to rename/modify:**
- `ralph/` directory → `aloop/`
- `ralph/config.yml` → `aloop/config.yml`
- `ralph/bin/loop.ps1` → `aloop/bin/loop.ps1`
- `ralph/bin/loop.sh` → `aloop/bin/loop.sh`
- `ralph/bin/setup-discovery.ps1` → `aloop/bin/setup-discovery.ps1` (temporary, deleted in Phase 2)
- `ralph/templates/*` → `aloop/templates/*`
- `claude/skills/ralph/` → `claude/skills/aloop/`
- `claude/commands/ralph/` → `claude/commands/aloop/`
- `copilot/prompts/ralph-*.prompt.md` → `copilot/prompts/aloop-*.prompt.md`
- `install.ps1` — all `ralph` → `aloop` references
- `uninstall.ps1` — all `ralph` → `aloop` references
- `README.md` — full rebrand
- All prompt/command content — update internal references

**Verification:**
- `grep -ri "ralph" .` returns zero hits after rename (except maybe git history references)
- `install.ps1` installs to `~/.aloop/`
- Commands register as `/aloop:setup`, etc.

---

## Phase 1: `aloop resolve` — kills the 7-file duplication

**Goal:** Single `aloop resolve` command replaces duplicated runtime-root resolution logic in 7 prompt/command files.

**Steps:**

1. Create `aloop/cli/aloop.mjs` — main entry point, subcommand router (`process.argv` parsing, no deps)
2. Create `aloop/cli/lib/project.mjs`:
   - `resolveProjectRoot()` — git root or cwd
   - `computeProjectHash(absPath)` — SHA-256 first 8 hex of lowercased normalized path
   - `resolveConfig(projectRoot, hash)` — checks `<project>/.aloop/config.yml` first, then `~/.aloop/projects/<hash>/config.yml`
   - `resolveRuntimeRoot(config)` — reads `runtime_scope`/`runtime_root` from config, defaults to `~/.aloop`
3. Create `aloop/cli/lib/config.mjs` — minimal YAML parser (key-value + lists, hand-rolled, ~60 lines)
4. Implement `aloop resolve` subcommand → JSON output:
   ```json
   {
     "project_root": "/home/user/my-project",
     "project_name": "my-project",
     "project_hash": "a1b2c3d4",
     "config_path": "/home/user/.aloop/projects/a1b2c3d4/config.yml",
     "runtime_root": "/home/user/.aloop",
     "runtime_scope": "global",
     "sessions_dir": "/home/user/.aloop/sessions",
     "active_json_path": "/home/user/.aloop/active.json"
   }
   ```
5. Update all 7 prompt/command files — replace dual-path resolution prose with:
   ```
   Run: aloop resolve
   ```
6. Update `install.ps1`:
   - Copy `aloop/cli/` → `~/.aloop/cli/`
   - Create platform shims in `~/.aloop/bin/`:
     - Windows: `aloop.cmd` → `@node "%~dp0\..\cli\aloop.mjs" %*`
     - Unix: `aloop` → `#!/bin/sh\nexec node "$(dirname "$0")/../cli/aloop.mjs" "$@"`
   - Print PATH advice if `~/.aloop/bin` not on PATH

**Files modified:**
- **New:** `aloop/cli/aloop.mjs`, `aloop/cli/lib/project.mjs`, `aloop/cli/lib/config.mjs`
- **Modified:** 7 prompt/command files (start, stop, status, steer × copilot + claude)
- **Modified:** `install.ps1`

**Verification:**
- `aloop resolve` from project with global config → correct JSON
- `aloop resolve` from project with project-local config → correct JSON
- `aloop resolve` from unconfigured project → clear error
- `grep -c "resolve.*config.*order\|Resolve runtime root" claude/ copilot/` → 0 hits

---

## Phase 2: Port `setup-discovery.ps1` → `aloop discover` + `aloop scaffold`

**Goal:** Replace the PowerShell setup-discovery with JS equivalents.

**Steps:**

7. Create `aloop/cli/lib/discover.mjs`:
   - `detectLanguage(root)` — file-signature scoring (same logic as PS1)
   - `buildValidationPresets(lang, root)` — same preset map per language
   - `discoverSpecCandidates(root)` — ordered file check
   - `getContextFiles(root)` — TODO.md, RESEARCH.md, etc.
   - `getInstalledProviders()` — `which`/`where.exe` check
   - `getDefaultModelMap(configPath)` — parse global config
   - `getExistingProjectConfig(hash)` — uses `resolveConfig()` from Phase 1

8. Implement `aloop discover` subcommand:
   - `aloop discover [--scope project|full] [--project-root <path>]`
   - Same JSON output schema as current PS1
   - `--scope project` (default): no reads outside project root
   - `--scope full`: reads `~/.aloop/` for models, providers, existing config

9. Create `aloop/cli/lib/scaffold.mjs`:
   - `writeProjectConfig(options)` — writes config.yml
   - `hydratePromptTemplates(options)` — copies + substitutes `{{PLACEHOLDER}}`
   - `ensureGitignore(projectRoot)` — adds `.aloop/` to project .gitignore when project-local
   - `copyRuntimeAssets(projectRoot)` — hydrates loop scripts into project-local `.aloop/` when project-local

10. Implement `aloop scaffold` subcommand:
    - Same flags: `--provider`, `--enabled-providers`, `--language`, `--spec-files`, `--validation-commands`, `--runtime-scope`, `--mode`
    - Same JSON output

11. Update setup prompt/command files:
    - Replace `pwsh -NoProfile -File ~/.aloop/bin/setup-discovery.ps1 -Command discover ...` → `aloop discover ...`
    - Replace `pwsh -NoProfile -File ~/.aloop/bin/setup-discovery.ps1 -Command scaffold ...` → `aloop scaffold ...`

12. Delete `aloop/bin/setup-discovery.ps1`, update `install.ps1` to stop copying it

**Files modified:**
- **New:** `aloop/cli/lib/discover.mjs`, `aloop/cli/lib/scaffold.mjs`
- **Modified:** `copilot/prompts/aloop-setup.prompt.md`, `claude/commands/aloop/setup.md`
- **Deleted:** `aloop/bin/setup-discovery.ps1`
- **Modified:** `install.ps1`

**Verification:**
- `aloop discover --scope project` matches old PS1 JSON schema
- `aloop discover --scope full` includes provider/model info from `~/.aloop/`
- `aloop scaffold --provider claude --language node-typescript ...` writes config + prompts
- Full `/aloop-setup` and `/aloop:setup` flow works end-to-end

---

## Phase 3: Convenience subcommands (optional, low priority)

13. `aloop status` — reads active.json + status.json, prints table
14. `aloop stop <session-id>` — kills PID, updates state files
15. `aloop active` — lists active sessions

These simplify the prompt/command files further but aren't required — the prompts can do this via shell commands.

---

## Relevant files (final state after all phases)

```
aloop/
  config.yml                     # Global defaults template
  bin/
    loop.ps1                     # PowerShell loop (KEPT AS-IS, just renamed refs)
    loop.sh                      # Bash loop (KEPT AS-IS, just renamed refs)
  cli/
    aloop.mjs                    # NEW — CLI entry point
    lib/
      project.mjs                # NEW — project hash, config resolve, runtime root
      config.mjs                 # NEW — minimal YAML parser
      discover.mjs               # NEW — port of setup-discovery discover
      scaffold.mjs               # NEW — port of setup-discovery scaffold
  templates/
    PROMPT_plan.md               # Unchanged (just moved from ralph/ to aloop/)
    PROMPT_build.md
    PROMPT_review.md
    PROMPT_steer.md
claude/
  skills/aloop/                  # Renamed from ralph
  commands/aloop/                # Renamed from ralph
copilot/
  prompts/aloop-*.prompt.md      # Renamed from ralph-*
install.ps1                      # Modified — installs to ~/.aloop/, adds CLI shim
uninstall.ps1                    # Modified — cleans up ~/.aloop/
README.md                        # Rebranded
```

## Verification (end-to-end)

1. `grep -ri "ralph" . --include="*.md" --include="*.ps1" --include="*.sh" --include="*.yml" --include="*.mjs"` → 0 hits
2. `./install.ps1 -Force` → installs to `~/.aloop/`, `aloop --help` works
3. `aloop resolve` → correct JSON for configured project
4. `aloop discover --scope project` → correct discovery JSON
5. `aloop scaffold ...` → writes config + prompts
6. `/aloop-setup` → `/aloop-start` flow in VS Code Copilot works
7. `/aloop:setup` → `/aloop:start` flow in Claude Code works
8. Loop runs (ps1/sh) with renamed paths
9. `aloop status`, `aloop stop` work against running sessions (Phase 3)

## Decisions

- **Loop stays ps1/sh** — runs anywhere (containers, sandboxes, exitbox). CLI is developer-machine only.
- **Zero npm dependencies** — Node.js built-ins only (`crypto`, `child_process`, `fs`, `path`, `os`).
- **`.mjs` extension** — native ESM without package.json.
- **No build step** — plain JS.
- **Shim approach** for PATH — `install.ps1` creates `aloop.cmd` / `aloop` wrapper scripts.
- **Phase 0 (rename) first** — clean slate before adding new code.
- **Phase 1 is independently shippable** — kills duplication before the full port.
- **.aloop/ as gitignore entry** when project-local (was `.ralph/`).

## Further Considerations

1. **PATH setup:** Print instructions if `~/.aloop/bin` not on PATH. Prompts can fallback to `node ~/.aloop/cli/aloop.mjs` if PATH isn't configured.
2. **npm publish later?** Add `package.json` with `"bin": { "aloop": "./cli/aloop.mjs" }` to enable `npm i -g github:user/aloop`. Additive.
3. **Repo rename:** `ralph-skill` → `aloop` or `aloop-skill`. Can be done separately (GitHub handles redirects).
4. **loop.ps1/loop.sh internal references:** These scripts don't reference "ralph" in their logic (they take paths as parameters), so the rename mostly affects the paths they're stored at and the commands that invoke them.
