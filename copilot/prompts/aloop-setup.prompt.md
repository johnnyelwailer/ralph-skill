---
name: aloop-setup
description: Configure Aloop for the current project through adaptive interview and parallel discovery. Produces SPEC.md, VERSIONS.md, convention docs, and agent configuration.
agent: agent
---

Set up Aloop for the current project. This is the most critical step — the loop is fully autonomous once it starts, so a weak spec leads to wasted iterations.

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

User signs off → done. Remind them: `/aloop-start` to launch.

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
