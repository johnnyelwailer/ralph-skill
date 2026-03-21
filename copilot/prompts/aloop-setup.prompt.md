---
name: aloop-setup
description: Configure Aloop for the current project through adaptive interview and parallel discovery. Produces SPEC.md, VERSIONS.md, convention docs, and agent configuration.
agent: agent
---

Set up Aloop for the current project. This is the most critical step — the loop is fully autonomous once it starts, so a weak spec leads to wasted iterations.

## Step 1: Translate Arguments

Map any user-provided arguments after `/aloop:setup` to `aloop setup` flags.

### Common flags
- `--non-interactive` -> `--non-interactive`
- `--spec <path>` -> `--spec <path>`
- `--provider <name>` -> `--provider <name>`
- `--providers <list>` -> `--providers <list>` (comma-separated)
- `--mode <loop|orchestrate|single>` -> `--mode <...>`
- `--autonomy-level <cautious|balanced|autonomous>` -> `--autonomy-level <...>`
- `--data-privacy <private|public>` -> `--data-privacy <...>`
- `--devcontainer-auth-strategy <mount-first|env-first|env-only>` -> `--devcontainer-auth-strategy <...>`

## Step 2: Run `aloop setup`

```bash
aloop setup [flags...]
```

Fallback if `aloop` is not on PATH:

```bash
node ~/.aloop/cli/aloop.mjs setup [flags...]
```

## Step 3: Explain the dual-mode setup flow

When setup runs, the CLI discovers project context and prepares defaults for both modes:

- It computes a **mode recommendation** from scope analysis (`loop` vs `orchestrate`) and shows reasoning.
- The user can accept the recommendation or override mode explicitly.
- The selected mode is written to project config and later used by `/aloop:start` unless overridden.

### ZDR configuration flow

- Setup asks for **Data Privacy** (`private` or `public`).
- If `private`, setup enables ZDR metadata in config and prints provider-specific ZDR warnings:
  - `claude`: org agreement required
  - `gemini`: project-level approval required
  - `codex`: org agreement required (images excluded)
  - `copilot`: Business/Enterprise plan required
- `opencode` has no additional warning in this step and remains selectable.

### OpenCode scaffolding

- If `opencode` is enabled in selected providers, setup scaffolds OpenCode agent files into `.opencode/agents/`.
- Setup also includes OpenCode provider/model settings in generated project config.

### Devcontainer auth recommendations

- If a devcontainer is detected, setup asks for auth strategy (`mount-first`, `env-first`, `env-only`).
- Setup prints proposed per-provider auth method based on the selected strategy.

## Step 4: Report Result

Show the CLI output to the user. If the command fails, relay the exact error.

On success, summarize:
- configured mode (and whether recommendation was overridden)
- data privacy and ZDR status
- enabled providers (including OpenCode if selected)
- where config was written

---

## Reference: interactive setup interview

The following phases describe the interview/scaffolding behavior driven by `aloop setup`.

## Phase 1: Parallel Discovery (4 independent tasks — run simultaneously)

Before asking the user anything, gather all information. Run these 4 tasks **in parallel**:

### Task A: Stack Detection
- Read package.json, Cargo.toml, go.mod, requirements.txt, Gemfile, *.csproj, pyproject.toml, pom.xml, build.gradle
- Read lockfiles: package-lock.json, yarn.lock, pnpm-lock.yaml, Cargo.lock, go.sum, poetry.lock
- Read config: tsconfig.json, vite.config.*, next.config.*, tailwind.config.*, .eslintrc*, jest.config.*, vitest.config.*, playwright.config.*
- Read .tool-versions, .nvmrc, .node-version, .python-version, Dockerfile, docker-compose.yml
- **Output:** language, framework, test runner, CSS approach, bundler, runtime versions

### Task B: Codebase Structure
- Map directory structure (top 3 levels), count files by extension
- Find entry points (src/index.*, src/main.*, app.*, cmd/, lib/)
- Detect folder organization (feature-based vs layer-based)
- Check for existing docs: README.md, CONTRIBUTING.md, CHANGELOG.md, docs/, SPEC.md
- Check for conventions: docs/conventions/, .editorconfig, linter configs
- **Output:** project shape, organization pattern, maturity (greenfield/early/established)

### Task C: Code Pattern Analysis
- Sample 5-10 representative source files
- Detect naming conventions, component patterns, error handling, test patterns
- Check for UI library usage (shadcn, MUI, Chakra, hand-rolled)
- Check API patterns (REST, GraphQL, tRPC)
- **Output:** detected conventions summary

### Task D: Build & Test Baseline
- Attempt: install deps, run tests, run build, run linter
- **Output:** build pass/fail + errors, test pass/fail + count, lint status

**Wait for all 4 to complete.**

---

## Phase 2: Present Findings

Synthesize results into a structured summary:

```
## Project Discovery

**Stack:** [language] + [framework] + [bundler]
**Test runner:** [detected] | **CSS:** [detected] | **UI lib:** [detected]
**Structure:** [feature-based / layer-based / mixed]
**Maturity:** [greenfield / early / established]

**Build:** [pass / fail / N/A]
**Tests:** [X passing, Y failing / no tests / N/A]
**Lint:** [pass / N failing / N/A]

**Detected patterns:**
- [3-5 key patterns]

**Missing/unusual:**
- [noteworthy gaps]
```

Ask: "Does this look right? Anything I'm missing or got wrong?"

---

## Phase 3: Adaptive Interview (one topic at a time)

Skip what Phase 1 already answered. For each topic: state what you know, ask only unknowns, confirm before moving on.

**Topic 1: Project Goal** — Desired outcome, scope, pin down vague descriptions.

**Topic 2: Environment & Secrets** — Confirm runtime versions. Guide secure secret management (env vars, not .env by default). Walk through setup if needed.

**Topic 3: Testing & Proof Strategy** — TDD is strong default. Define "done": Playwright screenshots with viewports for UI (desktop 1920x1080, tablet 768x1024, mobile 375x812), response shapes for API, command output for CLI.

**Topic 4: Approach & Constraints** — Tech constraints, performance requirements, a11y (WCAG), deployment target.

**Topic 5: Versions** — Default: latest stable. Cross-check detected versions against latest available.

---

## Phase 4: Parallel Generation (4 independent tasks — run simultaneously)

### Task E: SPEC.md
Generate spec from interview + discovery. Every acceptance criterion must be machine-verifiable. Reference deps without versions ("see VERSIONS.md"). Include integration scenarios and explicit viewport sizes.

### Task F: VERSIONS.md
Generate version table with detected + confirmed versions. Include policy (latest stable, LTS, pinned) and constraints.

### Task G: Convention Docs
Seed `docs/conventions/` from `~/.aloop/templates/conventions/`. Always: CODE_QUALITY.md, TESTING.md, GIT.md, SECURITY.md, ARCHITECTURE.md. Conditionally: FRONTEND.md, BACKEND.md, DATABASE.md, INFRA.md. Customize templates with actual stack examples.

### Task H: Project Scaffolding
Run `aloop setup --non-interactive` with detected values. Add convention bindings to agent YAML configs.

**Wait for all 4 to complete.**

---

## Phase 5: Review & Confirm

Present: SPEC.md (full), VERSIONS.md, convention doc list, decision summary.

Ask: "Ready to start the loop? Any changes needed?"

User signs off → done. Remind them: `/aloop:start` to launch.

---

## Execution Flow

```
Phase 1: [A] [B] [C] [D]  ← parallel, no user interaction
              |
Phase 2: present findings  ← user confirms
              |
Phase 3: interview topics  ← sequential, one at a time
              |
Phase 4: [E] [F] [G] [H]  ← parallel, no user interaction
              |
Phase 5: review & confirm  ← user signs off
```
