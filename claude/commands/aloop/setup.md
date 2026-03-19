---
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Agent
---

<objective>
Set up Aloop for the current project through an adaptive interview and parallel discovery.
Produce: SPEC.md, VERSIONS.md, docs/conventions/, agent config, and aloop project scaffolding.
</objective>

<process>

## Phase 1: Parallel Discovery (launch subagents)

Before asking the user anything, gather all available information. Launch these **4 subagents in parallel** — they are fully independent. Send a single message with all 4 Agent tool calls.

### Subagent A: Stack Detection
Prompt the agent to:
- Read package.json, Cargo.toml, go.mod, requirements.txt, Gemfile, *.csproj, pyproject.toml, pom.xml, build.gradle (whichever exist)
- Read lockfiles: package-lock.json, yarn.lock, pnpm-lock.yaml, Cargo.lock, go.sum, poetry.lock
- Read config files: tsconfig.json, vite.config.*, next.config.*, tailwind.config.*, .eslintrc*, jest.config.*, vitest.config.*, playwright.config.*
- Read .tool-versions, .nvmrc, .node-version, .python-version, Dockerfile, docker-compose.yml
- Return structured output: language, framework, test runner, CSS approach, bundler, runtime versions

### Subagent B: Codebase Structure
Prompt the agent to:
- Map directory structure (top 3 levels)
- Count files by extension
- Identify entry points (src/index.*, src/main.*, app.*, cmd/, lib/)
- Detect folder organization (feature-based vs layer-based)
- Check for existing docs: README.md, CONTRIBUTING.md, CHANGELOG.md, docs/, SPEC.md
- Check for existing conventions: docs/conventions/, .editorconfig, linter configs
- Return: project shape, organization pattern, existing documentation, estimated maturity (greenfield/early/established)

### Subagent C: Code Pattern Analysis
Prompt the agent to:
- Sample 5-10 representative source files across the project
- Detect naming conventions (camelCase, snake_case, PascalCase)
- Detect component/module patterns (class-based, functional, hooks)
- Detect error handling patterns (try/catch, Result types)
- Detect test patterns (runner, assertion style, mocking approach)
- Check for UI library usage (shadcn, MUI, Chakra, hand-rolled)
- Check for API patterns (REST, GraphQL, tRPC)
- Return: detected conventions summary

### Subagent D: Build & Test Baseline
Prompt the agent to:
- Attempt dependency install (npm install, pip install, cargo build, etc.)
- Attempt running existing test suite
- Attempt build
- Attempt linter
- Return: build pass/fail + errors, test pass/fail + count, lint status

**Wait for all 4 to complete before proceeding.**

---

## Phase 2: Present Findings (interactive)

Synthesize subagent results into a structured summary:

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
- [3-5 key patterns from code analysis]

**Missing/unusual:**
- [noteworthy gaps]
```

Ask: "Does this look right? Anything I'm missing or got wrong?"
Wait for confirmation.

---

## Phase 3: Adaptive Interview (sequential, one topic at a time)

Cover each topic in order. Skip what Phase 1 already answered. For each:
1. State what you already know from discovery
2. Ask only what you couldn't determine
3. Confirm before moving on

**Topic 1: Project Goal** — What is the desired outcome? Scope: in vs out? Pin down vague descriptions.

**Topic 2: Environment & Secrets** — Confirm runtime versions. Any API keys needed? Guide secure secret management (env vars, never .env by default). Walk through setup if needed.

**Topic 3: Testing & Proof Strategy** — TDD is strong default (suggest with reasoning, user can opt out). Define "done": Playwright screenshots with viewport sizes for UI, response shapes for API, command output for CLI.

**Topic 4: Approach & Constraints** — Technology constraints, performance requirements, accessibility (WCAG level), deployment target.

**Topic 5: Versions** — Default: latest stable. Cross-check detected versions. Confirm.

---

## Phase 4: Parallel Generation (launch subagents)

After interview, generate all artifacts. Launch these **4 subagents in parallel**:

### Subagent E: SPEC.md
Prompt with all interview answers + discovery results. Generate spec where every acceptance criterion is machine-verifiable. Reference deps without versions ("see VERSIONS.md"). Include integration scenarios and explicit viewport sizes for UI proof.

### Subagent F: VERSIONS.md
Generate version table from detected + confirmed versions. Include version policy (latest stable, LTS, pinned) and constraints.

### Subagent G: Convention Docs
Seed docs/conventions/ from templates. Always seed: CODE_QUALITY.md, TESTING.md, GIT.md, SECURITY.md, ARCHITECTURE.md (copy from ~/.aloop/templates/conventions/ and customize with project-specific details — replace generic examples with actual stack examples). Conditionally seed based on detected stack: FRONTEND.md, BACKEND.md, DATABASE.md, INFRA.md.

### Subagent H: Project Scaffolding
Run `aloop setup --non-interactive` with detected values to scaffold ~/.aloop/projects/ config, prompts, and agent YAML. Add convention bindings to agent configs.

**Wait for all 4 to complete.**

---

## Phase 5: Review & Confirm (interactive)

Present generated artifacts:
1. SPEC.md — show full spec, ask for approval
2. VERSIONS.md — show version table, confirm
3. Convention docs — list generated files with brief summary
4. Summary of all decisions (agents, triggers, testing strategy)

Ask: "Ready to start the loop? Any changes needed?"

User signs off → done. Remind them of `/$skillName:start`.

</process>

<subagent-rules>
## Subagent Execution Rules

- Phases 1 and 4 are **parallel fan-outs**. Launch all subagents in a single message with multiple Agent tool calls.
- Phases 2, 3, and 5 are **sequential**. They require user interaction.
- Each subagent gets a **self-contained prompt** with all needed context. Don't assume it sees the conversation.
- Subagent output must be **structured data** (key-value, tables, lists), not prose.
- If a subagent fails (e.g., build fails), capture the error and report to user in Phase 2.
- Never pass user secrets to subagents.

```
Phase 1: [A] [B] [C] [D]  ← parallel fan-out, no user interaction
              |
Phase 2: present findings  ← sequential, user confirms
              |
Phase 3: interview topics  ← sequential, one at a time
              |
Phase 4: [E] [F] [G] [H]  ← parallel fan-out, no user interaction
              |
Phase 5: review & confirm  ← sequential, user signs off
```
</subagent-rules>
