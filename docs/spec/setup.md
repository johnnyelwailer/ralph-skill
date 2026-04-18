# Setup

> **Reference document.** How aloop onboards a new project — partly an AI-driven **skill** (the interactive interview + artifact generation) and partly a daemon-driven **runtime** (discovery, scaffolding, registration, verification). Hard rules live in CONSTITUTION.md. Work items live in GitHub issues (or the configured tracker).
>
> Setup is the single gate between "a repository exists" and "aloop can run a loop against it." A misconfigured setup never recovers — every downstream subsystem (scheduler, orchestrator, tracker adapter, provider chain) reads the artifacts setup produces.
>
> Sources: SPEC.md §`aloop setup` CLI subcommand, §ZDR integration, §Devcontainer Auth Resolution, §Domain Skill Discovery, §Parallel Orchestrator decomposition; SPEC-ADDENDUM.md §`aloop start` Unification, §Setup boundary; `aloop/templates/PROMPT_setup.md` (five-phase skill); CRs #93 (readiness gate), #233 (CONSTITUTION), #48 (tessl discovery), #46 (platform-neutral prompts), #203 (dual-mode recommendations + settings table), #220/#221/#222 (tech-stack/GH-project/template refinement), #78 (.opencode/agents scaffold); aloop/cli `setup.ts`, `discover.ts`, `scaffold.ts`, `project.ts`.

## Table of contents

- Role of setup in the system
- Entry points
- Setup phases
  - Phase 1: Discovery
  - Phase 2: Interview
  - Phase 3: Generation
  - Phase 4: Verification
  - Phase 5: Orchestrator bootstrap (optional)
- The setup skill (AI-driven UX layer)
- The setup runtime (daemon side)
- File scaffolds — where things land
- Human intervention channels as setup output
- Setup's relationship to other subsystems
- Edge cases
- Invariants

---

## Role of setup in the system

Setup defines the trajectory of every project using aloop.

- **SPEC.md, CONSTITUTION.md, `aloop/config.yml`, `aloop/pipeline.yml`** — the four artifacts every loop iteration reads, directly or transitively. Everything downstream is a consequence of what setup writes.
- **The daemon's project registry** — the set of repos the daemon is willing to run sessions against. Setup is the sole legitimate path to registration (see `daemon.md` §Project registry).
- **The compile step's inputs** — `pipeline.yml` is authored by setup; the compile step turns it into `loop-plan.json`; the shim and the daemon only read the compiled output (see `pipeline.md` §Compile step).

Setup is not a one-time script. It is a hybrid:

- A **skill** — an AI-driven interactive experience (slash-commands, a subagent fleet) that asks the right questions, generates sensible defaults, and produces project artifacts aligned with the target codebase.
- A **runtime flow** — a daemon-owned sequence of API calls that discovers the project, scaffolds files, registers the project, verifies every gate, and (for orchestrator projects) hands off to decomposition.

Both parts share one contract: the skill translates interview answers into API calls; the daemon executes them. Neither bypasses the other. **A setup is not "complete" until the daemon has verified every readiness gate and persisted registration state.**

What a successful setup looks like:

- `POST /v1/projects` has returned a `project_id` and the registry knows the project.
- `<project>/aloop/config.yml`, `<project>/aloop/pipeline.yml`, and `<project>/CONSTITUTION.md` exist and parse cleanly.
- Every enabled provider CLI is on `PATH` and authenticates successfully from the host (and from the devcontainer, if one was chosen).
- The project's validation commands run green against the current baseline.
- The configured tracker adapter (github, builtin, or other) pings successfully.
- `aloop-agent` round-trips a test submit through the daemon.
- For orchestrator projects, the first decomposition pass has produced at least one Epic in the tracker.

Any gate that fails aborts setup — the daemon does not register a half-configured project.

## Entry points

Setup is addressable from multiple surfaces. They all converge on the same daemon API.

| Entry | Surface | Typical user |
|---|---|---|
| `aloop setup` | CLI (interactive) | Human in a terminal, first-time setup |
| `aloop setup --non-interactive` | CLI (flags) | CI, scripted provisioning, `aloop setup` invoked by a parent agent |
| `/aloop:setup` | Slash command / skill | Claude Code, opencode, or any harness that supports slash commands |
| `aloop setup <path>` | CLI from outside the target | Configuring a sibling project without `cd` |
| `POST /v1/projects` + `POST /v1/setup/runs` | API direct | Dashboard, bot, remote orchestration |

**All entries route through the daemon's setup state machine.** The CLI is a thin shim that translates flags into API calls. The slash-command skill is an AI-driven orchestrator over the same API. No entry has a privileged path that bypasses verification.

Non-interactive flags (illustrative — see the daemon's API for the canonical surface):

```
aloop setup \
  --spec SPEC.md \
  --providers opencode,copilot,codex,gemini,claude \
  --mode orchestrator \
  # (no --autonomy flag; aloop is autonomous by default) \
  --tracker github \
  --tracker-repo owner/repo \
  --devcontainer mount-first \
  --data-privacy private \
  --budget-cap-usd 50 \
  --non-interactive
```

Non-interactive setup must never prompt. Missing required configuration is a non-zero exit, not a fallback.

## Setup phases

The five phases are a **logical decomposition**, not an enforced process-level sequence. Phase 1 and Phase 3 are parallel fan-outs; Phase 2 and Phase 5 are sequential and interactive; Phase 4 runs after generation and gates success.

### Phase 1: Discovery

Before asking the user anything, the daemon (or the skill on its behalf) gathers everything knowable from the filesystem, environment, and adjacent state. Discovery is read-only; it writes nothing to the project.

Discovery subagents (launched in parallel when run via the skill):

| Subagent | Inputs | Outputs |
|---|---|---|
| **Stack detection** | `package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, `Gemfile`, `*.csproj`, `pom.xml`, `build.gradle`, lockfiles, tsconfig/vite/webpack/next/tailwind/eslint/jest/vitest/playwright configs, `.tool-versions`/`.nvmrc`/`.python-version`, `Dockerfile`/`docker-compose.yml` | Language, framework, test runner, CSS approach, bundler, runtime versions |
| **Structure analysis** | Directory tree (top 3 levels), file counts, entry points, existing docs, convention files | Project shape, organization pattern (feature- vs layer-based), maturity (greenfield/early/established) |
| **Pattern analysis** | 5–10 sampled source files | Naming conventions, module patterns, error-handling style, test style, UI library, API style |
| **Build & test baseline** (brownfield only) | `install` / `build` / `test` / `lint` commands | Pass/fail + error details; establishes the "before" state for verification |
| **Intent signals** | `CLAUDE.md`, `AGENTS.md`, `README.md`, `SPEC.md` | Prior user-declared intent; pre-existing aloop or tessl state |
| **Environment detection** | Provider CLIs on `PATH`, available auth tokens (via `devcontainer.md` detection), `devcontainer.json` presence, `gh auth status` | Which providers are usable without further action; which tracker adapters are viable |

Discovery outputs a structured `DiscoveryResult` persisted in the setup run state. All subsequent phases read from it; none re-discover ad hoc.

Discovery is side-effect free. It does not install dependencies, write config, or contact external services beyond what the host already caches (PATH lookups, local auth probes).

### Phase 2: Interview

The interview translates discovery into decisions. Skipped fields — already answered by discovery or passed as flags — are presented as confirmed defaults, not asked again.

Topics (in order; depth adapts to maturity):

1. **Primary goal** — feature development, refactor, greenfield build, maintenance. Pins vague language ("make it good" → specific acceptance criteria).
2. **Sensitivity hints** — optional advisory flags the user can set if the project is production-deployed, security-sensitive, or otherwise high-stakes. Hints inform orchestrator strictness and comment-prompt cadence; they do not pause the autonomous loop (see §Human intervention channels as setup output).
3. **Mode** — standalone loop vs orchestrator. The daemon computes a recommendation from spec complexity, parallelism score, and workstream count (§Edge cases covers when to override).
4. **Tracker** — `github | builtin | <future>`. Default is `builtin` when no `gh auth status` is available; `github` when auth is present and the project has a remote. `skip` is not an option: a project without a tracker cannot run the orchestrator (standalone loops can, using `builtin` for per-session bookkeeping).
5. **Provider chain** — canonical order `[opencode, copilot, codex, gemini, claude]`, restricted to providers actually installed on the host (and with working auth, per `devcontainer.md` §Auth resolution). User may reorder or drop.
6. **Budget cap** — daily or per-orchestrator USD ceiling for pay-per-use providers. Consumed by the scheduler's burn-rate gate (see `provider-contract.md` §Cost and usage capture).
7. **Devcontainer** — yes (new) / yes (existing) / no. When yes, the auth resolution strategy (`mount-first | env-first | env-only`) is surfaced with per-provider method preview (see `devcontainer.md`).
8. **Validation commands** — exact commands that constitute "this build is verified" (typecheck, lint, test, e2e, build). Used by the review agent's Gate 5 and by setup's own Phase 4 verification.
9. **Safety rules** — project-specific guardrails beyond the baseline (e.g., "never modify the database schema without a migration"). Folded into CONSTITUTION.md.
10. **Data privacy** — `private` or `public`. `private` enables ZDR-specific provider configuration (see §File scaffolds for what this triggers).

The interview never prompts for **runtime** defaults (thresholds, timeouts, concurrency caps, polling intervals) — those belong in `daemon.yml` and `pipeline.yml` and are edited directly. Setup's job is project intent, not scheduler tuning.

Interview answers are returned to the daemon as a single `InterviewResult` submit. The daemon validates the shape; invalid answers are rejected with actionable error messages.

### Phase 3: Generation

Generation turns the `DiscoveryResult` + `InterviewResult` into artifacts. When run via the skill, generators are launched as parallel subagents; when run non-interactively, the daemon uses templates + variable substitution with no subagent involvement.

Artifacts (see §File scaffolds for full list):

- **CONSTITUTION.md** — generated by a dedicated subagent that scans SPEC.md and interview answers for architectural invariants, layer separations, trust boundaries, protocol contracts, and ownership rules, then distills 10–30 actionable one-sentence rules grouped by category (Architecture, Security, Protocol, Ownership). Per CR #233: "rules must be independently enforceable in a code review — not vague principles but specific constraints with clear pass/fail criteria." Referenced at runtime via `{{CONSTITUTION}}` (see `pipeline.md` §Template variable reference).
- **`aloop/config.yml`** — project-level configuration consumed by the daemon: tracker adapter, status/label maps, provider chain, validation commands, safety rules, privacy policy, budget cap, sensitivity hints.
- **`aloop/pipeline.yml`** — authored workflow (pipeline + finalizer + triggers). The compile step resolves it into `loop-plan.json` on first session start (see `pipeline.md` §Workflow vs pipeline vs loop-plan).
- **`.devcontainer/devcontainer.json`** — written only when the devcontainer option is selected; generator consults per-provider auth resolution (`devcontainer.md` §Auth resolution) and the chosen strategy.
- **`.aloop/tracker/`** — initialized only when `tracker.adapter: builtin` (see `work-tracker.md` §Built-in adapter); seeded with a monotonic id counter and an empty `events.jsonl`.
- **Project prompt templates** under `.claude/commands/aloop/`, `.opencode/commands/aloop/`, etc. — one set per activated provider surface, copied from `aloop/templates/` with setup-time variables expanded (`{{SPEC_FILES}}`, `{{VALIDATION_COMMANDS}}`, `{{CONSTITUTION}}`, `{{SAFETY_RULES}}` — see `pipeline.md`).
- **Subagent definitions** under `.opencode/agents/` (when opencode is activated; per CR #78 and `pipeline.md` §Subagent delegation) — vision-reviewer, code-critic, test-writer, error-analyst, and others, inert for non-opencode providers.
- **SPEC.md / VERSIONS.md / `docs/conventions/`** — for greenfield projects, generated by the skill's Phase 4 fan-out subagents (SPEC.md from interview answers with machine-verifiable acceptance criteria; VERSIONS.md from detected + confirmed versions; convention docs seeded from `aloop/templates/conventions/` and customized with project-specific examples). Brownfield projects reuse existing specs.
- **Initial worktree branch `agent/trunk`** — created when orchestrator mode is selected (the merge target for dispatched children; see `orchestrator.md` §Agent-trunk branch).
- **Tessl skill registration** (when tessl is installed) — `tessl init --project-dependencies` runs during generation; discovered skills are listed in the settings summary. Further per-task skill installation happens during orchestration (CR #48, CR #220).
- **Tracker prerequisites** — for the GitHub adapter, required labels are created if missing and (when configured) the project's GitHub Project V2 is created with status field options aligned to the status map (CR #221). For the builtin adapter, the tracker directory is seeded.

All artifacts are written through the daemon's scaffold API, not directly by the skill. The skill constructs the `ScaffoldRequest`; the daemon writes files, returns paths, and records the write in its event log. This keeps the skill stateless between turns and gives the dashboard a visible trail of what setup produced.

### Phase 4: Verification

The readiness gate from CR #93. Setup is not complete until every applicable check passes; any failure aborts with actionable, per-check remediation.

| Check | What it verifies | Failure action |
|---|---|---|
| **Scaffold completeness** | All required prompt templates present (both loop and orchestrator sets where the mode warrants); all referenced files exist | List missing paths by filename |
| **Compile preflight** | `pipeline.yml` compiles to a valid `loop-plan.json`; `{{...}}` template variables resolve | Show the compile error with file + line |
| **Provider auth** | Each enabled provider authenticates from the host (and, when devcontainer is selected, from inside the container) | Provider-specific remediation (e.g., "run `claude setup-token`", "set `OPENAI_API_KEY`") |
| **Validation baseline** | Each configured validation command executes from project root with exit status 0 | Report command output; user fixes or adjusts |
| **Tracker adapter ping** | `TrackerAdapter.ping()` returns `healthy`; required labels exist; GitHub Project V2 accessible when configured | Adapter-specific: `gh auth status`, missing labels, insufficient scopes |
| **Devcontainer build** | Container builds and starts; provider CLIs on container `PATH`; `aloop-agent` reachable from within | `devcontainer up` log; which binary is missing |
| **Aloop-agent round-trip** | A test submit through `aloop-agent` reaches the daemon and is validated against the session's schema catalog | Connection error; schema mismatch |
| **Daemon health** | `GET /v1/daemon/health` returns OK; scheduler permits can be acquired and released | Daemon autostart failure; SQLite schema mismatch |
| **Decomposition/startup health** (orchestrator mode only) | Orchestrator can run one scan turn without errors | Blocking issue is logged; setup does not mark complete |

Verification runs as an ordinary daemon-owned pipeline. The setup run record accumulates `check_result` events. When every check is `passed`, the daemon flips the project's `status` from `setup_pending` to `ready`. Only `ready` projects can have sessions started against them.

Per the canonical setup boundary (issues #93, #203): **intelligent default selection belongs to the skill layer. The CLI/daemon never silently picks a runtime default.** Every gap the verifier surfaces includes the explicit missing configuration and the required action.

### Phase 5: Orchestrator bootstrap (optional)

When the chosen mode is `orchestrator`, setup hands off to the orchestrator's decompose flow (see `orchestrator.md` §Refinement pipeline) after Phase 4 passes:

1. Daemon creates an orchestrator session: `POST /v1/sessions { kind: "orchestrator", workflow: "orchestrator.yaml" }`.
2. The orchestrator's first scan turn runs: reads spec files, emits `decompose_result` with initial Epics.
3. Adapter creates the Epics via the configured tracker (native sub-issues in GitHub, work-item files in builtin).
4. Setup's final summary includes the Epic count and first wave.
5. Setup exits; the orchestrator session continues on its own heartbeat.

This hand-off is a single daemon transaction. If decomposition fails, Phase 4 retrospectively fails the run — setup does not leave a half-bootstrapped orchestrator in the registry.

Standalone (non-orchestrator) projects skip Phase 5. Their first `aloop start` creates the first session directly.

## The setup skill (AI-driven UX layer)

The setup skill is invoked via `/aloop:setup` (or equivalent in the host harness) and is the primary interactive surface for humans. Under the hood it talks to the same daemon API as `aloop setup --non-interactive` — it is a UX layer, not a privileged path.

What the skill owns:

- **Question sequencing and depth adaptation** — how to walk the user through interview topics, what to skip based on discovery signals, how to cope with "I don't know" answers.
- **Presentation** — rendering the discovery summary as a human-readable structured block (Stack / Structure / Maturity / Build / Tests / Lint / Detected patterns / Missing-or-unusual); rendering the final settings table before write.
- **Subagent orchestration** — launching Phase 1 (stack / structure / pattern / baseline / intent / environment) and Phase 3 (SPEC / VERSIONS / conventions / CONSTITUTION / agent config) fan-outs in parallel; serializing Phase 2 and Phase 5 interactions.
- **Translation** — turning interview answers into a valid `InterviewResult` the daemon accepts. Schema validation is daemon-side; the skill just composes.
- **Iterative refinement** — the user can re-run setup to adjust. The skill's role is to detect "this is a re-run, load the existing run state" and let the user edit individual answers without rebuilding everything.

What the skill does **not** own:

- File writes, tracker API calls, provider installs, container builds, branch creation — all happen daemon-side through adapters and scheduled jobs.
- Authority over runtime defaults — the skill cannot silently pick a threshold. If a value is not in the interview, it comes from `daemon.yml` or fails verification.
- Amendments to CONSTITUTION.md after Phase 5 sign-off — post-setup edits go through the CR workflow, not the skill (§Invariants).

Subagents used by the skill (illustrative; specific list lives in `aloop/templates/PROMPT_setup.md`):

- `spec-analyzer` — reads SPEC.md and extracts architectural invariants for CONSTITUTION seeding
- `constitution-drafter` — produces the 10–30 rules, grouped by category
- `stack-detector`, `structure-mapper`, `pattern-sampler`, `baseline-runner` — Phase 1 discovery
- `spec-writer`, `versions-writer`, `convention-seeder`, `agent-configurator` — Phase 3 artifact generation
- `provider-recommender` — chooses the initial chain from installed providers and user priorities

Subagents are provider-specific (opencode's `task` tool, Claude Code's `Agent` tool, etc.); the skill catalog in `aloop/templates/PROMPT_setup.md` is the source of truth for behavior. The daemon's API does not distinguish subagent vs monolithic execution — it only sees the final `InterviewResult` + `ScaffoldRequest`.

## The setup runtime (daemon side)

Everything skill-initiated lands here eventually. The runtime view treats setup as a long-running, resumable, event-producing workflow that happens to be interactive at two points (Phase 2 interview, Phase 5 confirmation) and autonomous everywhere else.

**Project registration:**

```
POST /v1/projects { abs_path, name }
→ 200 { id, abs_path, name, added_at, status: "setup_pending" }
```

The daemon canonicalizes `abs_path`, refuses to register a path outside the configured workspace roots (a safety boundary, not a setup detail), and returns an existing row on duplicate registration (see `daemon.md` §Project registry). A `setup_pending` project cannot have sessions started against it — `aloop start` rejects with `project_not_ready` until Phase 4 passes.

**Setup run state:**

```
POST /v1/setup/runs { project_id, interview, scaffold_plan }
→ 200 { run_id, status: "discovering" }
```

The run row persists across turns, page reloads, daemon restarts. An interrupted run can be resumed with `POST /v1/setup/runs/:id/resume`.

**Scaffolding:**

The daemon executes the `ScaffoldRequest` transactionally where possible: either all artifacts land or none do. Pre-existing files are merged when the user selected "merge" on the re-run prompt (§Edge cases) and replaced when they selected "replace."

**Verification pipeline:**

Phase 4 runs as a setup-owned workflow, compiled the same way any other pipeline is. Check results publish `setup.check.*` events; the dashboard can watch the run in real time. On any failure, the run pauses in `verification_failed` status with the failing check as the resume point. Re-running does not re-scaffold unless the user asks — it re-verifies.

**Idempotency:**

Running setup twice with identical answers produces no writes and no tracker operations. The daemon diffs the pending scaffold against the current filesystem and tracker state; empty diff exits with `status: "no_change"`. This is what makes setup safe as a dry-run check (`aloop setup --verify-only`) and as a CI safety net.

**State durability:**

Setup progress lives in `~/.aloop/state/setup_runs/<id>/` on the host. Killing the CLI mid-interview does not lose the answers collected so far; re-running picks up at the last unanswered topic. JSONL event history lets the dashboard replay a run after the fact.

**Event surface:**

Every setup run publishes the following events on the daemon bus. Dashboards, bots, and the skill itself subscribe to render live status.

| Event | When |
|---|---|
| `setup.discovery.started` | Phase 1 kicks off |
| `setup.discovery.complete` | `DiscoveryResult` persisted |
| `setup.interview.answered` | Each topic's answer lands |
| `setup.scaffold.planned` | `ScaffoldRequest` accepted, diff computed |
| `setup.scaffold.applied` | Files written, tracker entities created |
| `setup.check.passed` / `setup.check.failed` | Per Phase 4 gate |
| `setup.run.ready` | Project `status` flipped to `ready` |
| `setup.run.paused` / `setup.run.resumed` | User interrupted / continued |

The event stream is replayable — the setup run can be fully reconstructed from its JSONL log without consulting SQLite (same pattern as session logs; see `daemon.md` §State layout).

## File scaffolds — where things land

Setup writes artifacts across three locations: the project root (committed), the daemon state directory (machine-local), and the tracker (remote state).

| Path | Purpose | Source | Editable by user? |
|---|---|---|---|
| `<project>/CONSTITUTION.md` | Project-specific non-negotiable rules | Interview + spec analysis (subagent) | Yes, via CR workflow |
| `<project>/aloop/config.yml` | Project-level runtime config | Interview + discovery | Yes, re-run setup or edit |
| `<project>/aloop/pipeline.yml` | Authored workflow | Template + interview | Yes, triggers recompile |
| `<project>/SPEC.md` (greenfield) | Product/technical spec | Interview (subagent) | Yes, but treat as authoritative |
| `<project>/VERSIONS.md` (greenfield) | Version policy table | Discovery + interview (subagent) | Yes |
| `<project>/docs/conventions/*.md` | Stack-specific conventions | Seeded from `aloop/templates/conventions/`, customized | Yes |
| `<project>/.devcontainer/devcontainer.json` | Dev container definition | Interview (devcontainer=yes) | Yes, triggers container rebuild |
| `<project>/.aloop/tracker/` | Built-in work-item store | Scaffold (tracker=builtin) | Via `aloop-agent tracker *` only |
| `<project>/.claude/commands/aloop/*.md` | Claude Code slash commands | Templates, per-provider activation | Yes (or re-run setup) |
| `<project>/.opencode/agents/*.md` | Opencode subagent defs | Templates (opencode activated) | Yes |
| `<project>/.opencode/config.json` or `opencode.json` | OpenRouter ZDR config | Interview (data-privacy=private + opencode) | Yes |
| `~/.aloop/state/projects/<id>/` | Registry row, cached discovery | Daemon | No (API only) |
| `~/.aloop/state/setup_runs/<id>/` | Per-run state, JSONL events | Daemon | No |
| `<tracker>/labels` | Required label set | Adapter (during Phase 4) | Via tracker directly |
| `<tracker>/GitHub Project V2` | Status-tracking board | Adapter (GH, orchestrator mode, CR #221) | Via GitHub UI |
| `<project>` git ref `agent/trunk` | Orchestrator merge target | Scaffold (orchestrator mode) | Not directly |

Files in the project root are committed alongside code (reviewable, blame-able, revertable). Files under `~/.aloop/state/` are host-local and never committed.

## Human intervention channels as setup output

Aloop is autonomous by default — there are no autonomy tiers to choose. What setup surfaces to the user is the **five always-available human intervention channels** (see `orchestrator.md` §Autonomy and human intervention), so the user knows how to engage with the running system.

| Channel | Mechanism | Typical use |
|---|---|---|
| Steer | `aloop steer <msg>` or dashboard steer box | "Please prefer approach X for this Story" |
| Stop | `aloop stop <id>` or dashboard stop button | Session is off course or burning budget |
| Edit Epic/Story | Tracker UI or `aloop tracker edit` | Clarify scope, fix a wrong assumption |
| Edit Task | `aloop-agent todo` CLI or dashboard todo panel | Insert a prerequisite, reorder, delete |
| Comment on Epic/Story | Tracker comment (GitHub issue comment, etc.) | Ongoing conversation with the orchestrator |

Setup does not ask for an autonomy tier. Projects run autonomously from the first `aloop start`; the user chooses when and how to intervene.

**Per-project sensitivity hints** (optional, from Phase 1 discovery): setup may surface signals like "no test coverage baseline" or "production-deployed" by recording advisory flags in `aloop/config.yml` that the orchestrator uses to inform — not gate — its decisions. These do not pause the loop. They do raise the bar on review gate strictness and the frequency at which the orchestrator queues `orch_conversation` prompts inviting human input.

## Setup's relationship to other subsystems

Setup is the seam where abstract design becomes concrete project state. Each downstream subsystem consumes a specific artifact setup produces; none of them owns the artifact's creation.

| Subsystem | What it reads from setup | Consequence of a bad setup |
|---|---|---|
| **Daemon** (`daemon.md`) | `projects` row, `~/.aloop/state/projects/<id>/` | Project cannot register; `aloop start` fails with `project_not_ready` |
| **Scheduler** (`provider-contract.md`) | Provider chain, budget cap, daily/per-turn limits from `aloop/config.yml` | Permits denied with `provider_unavailable`, `overrides_exclude_all`, or `budget_exceeded` before work begins |
| **Compile step** (`pipeline.md`) | `pipeline.yml`, prompt templates, `{{CONSTITUTION}}` / `{{SPEC_FILES}}` / `{{VALIDATION_COMMANDS}}` | Plan compile fails, surfaced during Phase 4; no session starts |
| **Orchestrator** (`orchestrator.md`) | `agent/trunk` branch, tracker adapter, spec files to decompose, sensitivity hints | Decompose runs against missing / stale spec, produces bad Epics |
| **Tracker adapter** (`work-tracker.md`) | Adapter id + config, status map, label map, webhook config | Adapter fails `ping()`; orchestrator cannot file Epics |
| **Devcontainer** (`devcontainer.md`) | `.devcontainer/devcontainer.json`, auth-resolution strategy | Container fails to build; provider auth unavailable inside sandbox |
| **Agent contract** (`pipeline.md` §Agent contract) | `aloop-agent` on `PATH` inside worktrees and the container | Agents cannot submit; every turn fails validation |
| **Review / QA agents** | `CONSTITUTION.md`, `docs/conventions/`, validation commands | First-review-dimension compliance check has nothing to enforce |

Setup is explicitly **not** the owner of:

- Runtime thresholds and tuning — lives in `daemon.yml`, edited directly.
- Overrides (force / allow / deny) — lives in `~/.aloop/overrides.yml`, edited via `aloop providers override` (CLI) or the dashboard.
- Session-level configuration — chosen on `aloop start`, not at setup.
- Secrets — the host's auth tokens exist before setup and persist after; setup forwards, never generates.

Keeping these out of setup's scope is deliberate: setup is project intent, everything else is operational tuning. Conflating them makes both harder to reason about and harder to automate.

## Edge cases

Setup handles the following without surprising the user:

- **Re-running on an existing project.** The daemon detects the `aloop/config.yml` and asks "merge changes into existing setup, or replace?" Merge keeps user edits to templates and conventions, updates only what the interview actually changed. Replace is the "fresh start" path — backs up existing artifacts under `.aloop/backup/<timestamp>/` before overwriting.
- **No provider CLIs installed.** Discovery reports no installed providers. Setup offers an install walkthrough for the user's platform (brew, apt, winget, curl installers) and exits gracefully when the user declines; it does **not** install providers itself (see §Invariants).
- **No tracker available.** No `gh auth`, no configured builtin path, no remote. Setup falls back to `builtin` with a local `.aloop/tracker/` directory. The user can migrate later with `aloop tracker migrate --from builtin --to github` (see `work-tracker.md` §Migration).
- **No specs present (greenfield).** The interview's Topic 1 goes deep on project goal, scope, and acceptance criteria. Phase 3's `spec-writer` subagent produces an initial SPEC.md that the user reviews in Phase 5. The constitution is derived from the spec + interview; constitution review is mandatory even for greenfield.
- **Project is a subfolder of a monorepo.** The daemon canonicalizes `abs_path` and treats the subfolder as its own project. Sibling folders are unrelated projects in the registry. Shared root-level files (root `package.json`, shared `tsconfig.json`) are read by discovery but not modified by scaffold.
- **Project is under an existing aloop parent.** The daemon walks up for `.aloop/` on `aloop start`; setup writes its own `.aloop/` at the subfolder level and registers the subfolder distinctly. The parent project is unaffected.
- **Interrupted setup.** The run state in `~/.aloop/state/setup_runs/<id>/` is durable. `aloop setup --resume <id>` picks up at the last unanswered interview topic or the last failed verification check.
- **Container build fails.** Phase 4 devcontainer check fails with the build log. User fixes the Dockerfile / devcontainer feature list, reruns `aloop setup --resume`. The daemon re-checks only that gate.
- **Tracker permissions insufficient.** The adapter reports which scope is missing. Setup surfaces the exact `gh` re-auth command (or the equivalent for other adapters). User fixes auth, reruns.
- **Conflict between user-provided SPEC.md and discovery (brownfield).** The interview surfaces the mismatch and lets the user either correct the spec or confirm that discovery misread the codebase. Setup does not silently overwrite SPEC.md.
- **Non-interactive flags incomplete.** Setup exits non-zero with the list of missing fields. No fallback defaults are silently chosen.

## Invariants

1. **Setup never marks a project ready without passing verification gates.** The registry `status` flips to `ready` only on Phase 4 green.
2. **CONSTITUTION.md is always produced** — may be minimal for trivial projects, but it is the durable record of project intent and is referenced by every downstream prompt that includes `{{CONSTITUTION}}`.
3. **Setup is reproducible.** Same inputs (discovery snapshot + interview answers) produce the same outputs, modulo external state (PATH, auth tokens, remote tracker state).
4. **Setup is idempotent.** Running it twice with identical answers is a no-op. Diff-and-apply semantics, not blind overwrite.
5. **Setup never edits CONSTITUTION.md silently after first generation.** Changes go through the CR workflow — the constitution is a tracked artifact like any spec file, not a scratchpad.
6. **Setup never installs a provider's auth globally.** It only forwards what the host already has (env vars, auth files per `devcontainer.md` §Auth resolution). It does not run interactive OAuth flows, does not write to `~/.config/` outside `~/.aloop/`, does not touch OS keychains.
7. **Setup's verification is the single source of truth for "this project is ready to run a loop."** `aloop start` refuses to launch against a project whose `status` is not `ready`.
8. **Intelligent default selection is a skill concern, not a CLI concern.** The CLI / daemon enumerate missing configuration; the skill (or the user) fills it in. There are no hidden runtime defaults in setup's code path.
9. **Setup runs through the daemon API.** The CLI is a shim; the skill is a UX layer; both compose API calls. No entry has a privileged back door that writes directly to the filesystem, the tracker, or the registry.
10. **Setup artifacts in the project root are committed with the code.** `CONSTITUTION.md`, `aloop/`, `docs/conventions/`, `.devcontainer/`, `.opencode/agents/` are versioned alongside the code so the project's intent is reviewable, blame-able, and revertable like any other source file.
