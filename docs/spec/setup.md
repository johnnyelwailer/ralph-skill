# Setup

> **Reference document.** How aloop onboards a new project — a daemon-owned, long-lived **setup orchestration** surfaced through multiple entry points (CLI, dashboard, external skill/chat hosts) and powered by discovered intelligence providers / agent harnesses. Hard rules live in CONSTITUTION.md. Work items live in GitHub issues (or the configured tracker).
>
> Setup is the single gate between "a repository exists" and "aloop can run a loop against it." A misconfigured setup never recovers — every downstream subsystem (scheduler, orchestrator, tracker adapter, provider chain) reads the artifacts setup produces.
>
> Sources: SPEC.md §`aloop setup` CLI subcommand, §ZDR integration, §Devcontainer Auth Resolution, §Domain Skill Discovery, §Parallel Orchestrator decomposition; SPEC-ADDENDUM.md §`aloop start` Unification, §Setup boundary; `aloop/templates/PROMPT_setup.md` (skill-side operating recipe); CRs #93 (readiness gate), #233 (CONSTITUTION), #48 (tessl discovery), #46 (platform-neutral prompts), #203 (dual-mode recommendations + settings table), #220/#221/#222 (tech-stack/GH-project/template refinement), #78 (.opencode/agents scaffold); aloop/cli `setup.ts`, `discover.ts`, `scaffold.ts`, `project.ts`.

## Table of contents

- Role of setup in the system
- Entry points
- Setup execution model
- Setup phases
  - Stage 0: Environment readiness (internal)
  - Phase 1: Repository discovery
  - Phase 2: Parallel analysis and guided interview
  - Phase 3: Intelligence-led ambiguity judgment
  - Phase 4: Chapter review and plan confirmation
  - Phase 5: Generation
  - Phase 6: Verification
  - Phase 7: Handoff to runtime orchestration (optional)
- Client shells
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
- **Incubation promotion** — setup may be started from a matured incubation proposal, but setup still owns readiness and may reject or reopen assumptions from the proposal.

Setup is not a one-time script. It is one orchestrated workflow with multiple shells:

- A **daemon-owned setup orchestration** — authoritative state, long-lived execution, child fanout, gating, resumability, verification, and final promotion to `ready`.
- **Client shells** — CLI, dashboard, and external skill/chat hosts that create or resume the same setup run, render the next question or review step, and submit answers/comments/approvals back through the API.
- **Provider-backed intelligence** — the same provider adapter layer used elsewhere in aloop, re-used here for setup-specific analysis, research, judgment, and drafting.

The prompt behavior for ambiguity handling is shared with runtime and defined in `refinement.md`. Setup remains the stricter gate because it owns readiness, but it should use the same classification and option-synthesis discipline as runtime refinement.

The entry point may change; the setup run does not. **A setup is not "complete" until the daemon has verified every readiness gate, persisted registration state, and confirmed that no blocking ambiguity remained open when orchestration began.**

What a successful setup looks like:

- `POST /v1/projects` has returned a `project_id` and the registry knows the project.
- `<project>/aloop/config.yml`, `<project>/aloop/pipeline.yml`, and `<project>/CONSTITUTION.md` exist and parse cleanly.
- Every enabled provider CLI is on `PATH` and authenticates successfully from the host (and from the devcontainer, if one was chosen).
- The project's validation commands run green against the current baseline.
- The configured tracker adapter (github, builtin, or other) pings successfully.
- `aloop-agent` round-trips a test submit through the daemon.
- For orchestrator projects, the first decomposition pass has produced at least one Epic in the tracker.

Any gate that fails aborts setup — the daemon does not register a half-configured project.

### Initial decomposition vs living decomposition

Setup owns **initial spec shaping** and, for orchestrator-mode projects, the **initial decomposition baseline** needed to start autonomous delivery safely.

That includes:

- validating that the initial spec is coherent enough to run against
- drafting or refining the initial chapter structure where the spec is missing or weak
- producing an execution-oriented first decomposition baseline for the project
- optionally creating the first Epic set during the final handoff

Setup does **not** own decomposition forever. Once the project is running, the runtime orchestrator retains authority over **living decomposition**:

- refining or re-splitting work after implementation reveals new structure
- reacting to spec edits, chapter rewrites, comments, and change requests
- re-estimating, re-decomposing, redispatching, and filing follow-up Epics

The boundary is:

- **setup** answers: "Do we understand the initial spec well enough to begin autonomous delivery?"
- **runtime orchestrator** answers: "Given the current spec and tracker state, what work should run next now?"

## Entry points

Setup is addressable from multiple surfaces. They all converge on the same daemon API and the same persisted `setup_run`.

| Entry | Surface | Typical user |
|---|---|---|
| `aloop setup` | CLI (interactive) | Human in a terminal, first-time setup |
| `aloop setup --non-interactive` | CLI (flags) | CI, scripted provisioning, `aloop setup` invoked by a parent agent |
| Dashboard setup wizard | Rich UI over HTTP API | User reviewing progress, chapters, drafts, and comments |
| Incubation promotion | Inbox/research proposal over HTTP API | User turning a matured idea into a setup run |
| `/aloop:setup` | Slash command / external chat host | Claude Code, opencode, or any harness that supports slash commands |
| `aloop setup <path>` | CLI from outside the target | Configuring a sibling project without `cd` |
| `POST /v1/projects` + `POST /v1/setup/runs` | API direct | Dashboard, bot, remote orchestration |

**All entries route through the daemon's setup state machine.** The CLI is a thin shim over the API. The dashboard is a richer API client. A slash-command skill is a recipe for operating the same setup flow and should drive the CLI or the same shared API client layer rather than inventing a separate backend path. No entry has a privileged path that bypasses discovery, ambiguity resolution, or verification.

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

## Setup execution model

Setup reuses aloop's existing orchestration machinery under the hood. It is **not** a separate engine.

- The daemon runs a dedicated `setup_orchestrator` workflow, with setup-specific prompt agents and child sessions where needed.
- Background work fans out through the same session runner, provider adapters, event log, and child-loop model used elsewhere in aloop.
- Setup-specific agents may analyze, research, synthesize, question, draft, and judge readiness; they may **not** dispatch normal implementation work or mark the project `ready` on their own.
- The depth of setup adapts to the project. Small greenfield repos may finish quickly; large brownfield or research-heavy repos may remain in `setup_pending` for days while background research continues and the user answers staged questions over time.

Illustrative setup-side agents:

- `setup_discover` — repository index + environment scan
- `setup_research` — deeper investigation of unclear modules, product scope, or external questions
- `setup_judge` — explicit readiness / ambiguity verdict at the current scope
- `setup_questioner` — targeted next-question selection based on the latest findings
- `setup_spec_writer` — initial or revised draft spec chapters
- `setup_constitution_drafter` — project constitution from spec + codebase understanding
- `setup_decompose` — initial decomposition baseline for orchestrator-mode projects

## Setup phases

The setup phases are a **logical decomposition** of one long-lived state machine. Some phases overlap in time: analysis children may keep running while the user answers independent questions, and the user may leave and come back later. What never overlaps is the gate: setup may not scaffold, verify, or hand off to runtime orchestration while blocking ambiguity remains open.

### Stage 0: Environment readiness (internal)

Before repo-specific work begins, setup establishes which intelligence backends are actually available on this machine.

- Detect installed harnesses / provider CLIs (`opencode`, `codex`, `copilot`, `claude`, `gemini`, future adapters).
- Detect host auth state and any devcontainer-specific auth constraints.
- Determine which providers are eligible for **setup intelligence** and which are eligible for the project's eventual runtime provider chain.
- Ask the user, early in the same overall flow, which detected providers they actually want to use.

This stage is internal to `setup`; it is not a separate user-facing bootstrap command.

### Phase 1: Repository discovery

Before asking the user anything repo-specific, the daemon gathers everything knowable from the filesystem, environment, and adjacent state. Discovery is read-only **with respect to the project/worktree**; it does not modify project files, tracker state, or runtime branches. It may persist its findings into the daemon-owned setup run state so the long-running setup pipeline can resume, compare revisions, and continue across sessions or days.

Discovery lanes (launched in parallel when run via the setup orchestrator or a shell that is driving it):

| Subagent | Inputs | Outputs |
|---|---|---|
| **Repository inventory** | Complete file tree, manifests, lockfiles, config files, docs, generated dirs, ignored dirs | Whole-repo map, file classifications, module boundaries, notable hotspots |
| **Stack detection** | `package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, `Gemfile`, `*.csproj`, `pom.xml`, `build.gradle`, lockfiles, tsconfig/vite/webpack/next/tailwind/eslint/jest/vitest/playwright configs, `.tool-versions`/`.nvmrc`/`.python-version`, `Dockerfile`/`docker-compose.yml` | Language, framework, test runner, CSS approach, bundler, runtime versions |
| **Structure analysis** | Full directory graph, entry points, existing docs, convention files, import graph where available | Project shape, organization pattern, module seams, maturity (greenfield/early/established) |
| **Pattern analysis** | Whole-codebase semantic scan plus full reads of ambiguous or high-leverage areas | Naming conventions, module patterns, error-handling style, test style, UI library, API style, internal inconsistencies |
| **Build & test baseline** (brownfield only) | `install` / `build` / `test` / `lint` commands | Pass/fail + error details; establishes the "before" state for verification |
| **Intent signals** | `CLAUDE.md`, `AGENTS.md`, `README.md`, `SPEC.md` | Prior user-declared intent; pre-existing aloop or tessl state |
| **Environment detection** | Provider CLIs on `PATH`, available auth tokens (via `devcontainer.md` detection), `devcontainer.json` presence, `gh auth status` | Which providers are usable without further action; which tracker adapters are viable |

Discovery outputs a structured `DiscoveryResult` persisted in the setup run state. It also emits initial ambiguity candidates: mismatches, low-confidence detections, unresolved decisions, and places where deeper research is still required. All subsequent phases start from this snapshot rather than rediscovering blindly; later background research appends to or refines the persisted setup state instead of bypassing it ad hoc.

Discovery is side-effect free. It does not install dependencies, write config, or contact external services beyond what the host already caches (PATH lookups, local auth probes).

Whole-codebase coverage is the default. Sampling is allowed only as an internal optimization inside a lane after the repository inventory is complete; it is not the contract by which setup is allowed to conclude "we understand this repo."

### Phase 2: Parallel analysis and guided interview

The interview translates discovery into decisions. It is discovery-first: the user is shown what aloop found, how confident each finding is, what it implies, and which choices still require human intent. But it is **not** a strictly sequential wizard. Background lanes can keep running while the user answers unrelated questions, and newly-completed research can inject follow-up questions later.

The interview runs on a **two-speed model**:

- **Fast path** — low-latency interactive question handling in the current shell/session. This is for structured choices, question invalidation, branch switching, and immediate next-question selection.
- **Slow path** — background setup orchestration for deep repo research, draft generation, readiness judgment, and other expensive work.

The user should almost never wait on the slow path just to receive the next structured question.

The question scheduler is dependency-aware:

- questions with no unmet prerequisites may be asked immediately
- questions that depend on a still-running analysis lane wait until that lane finishes
- while one lane researches in the background, the user can continue answering independent topics
- when new findings materially change the picture, the current shell surfaces a delta summary before asking the next question
- every new answer or completed research result triggers a recomputation of the pending-question set
- pending questions that are now redundant, answered implicitly, or based on stale assumptions are invalidated and must not be asked
- shells should present only the current valid next question set, not a precomputed static questionnaire

The preferred interview representation is a **precomputed question graph** (or tree with branches), not a flat questionnaire. Each question may have:

- prerequisites
- branch/topic ownership
- invalidation conditions
- follow-up edges
- answer options that deterministically advance the graph

This allows the interview to stay fast: selecting among structured options is a local graph transition, not a model call.

Topics (in order; depth adapts to maturity):

1. **Primary goal** — feature development, refactor, greenfield build, maintenance. Pins vague language ("make it good" → specific acceptance criteria).
2. **Sensitivity hints** — optional advisory flags the user can set if the project is production-deployed, security-sensitive, or otherwise high-stakes. Hints inform orchestrator strictness and comment-prompt cadence; they do not pause the autonomous loop (see §Human intervention channels as setup output).
3. **Mode** — standalone loop vs orchestrator. The daemon computes a recommendation from spec complexity, parallelism score, and workstream count (§Edge cases covers when to override).
4. **Tracker** — `github | builtin | <future>`. Default is `builtin` when no `gh auth status` is available; `github` when auth is present and the project has a remote. `skip` is not an option: a project without a tracker cannot run the orchestrator (standalone loops can, using `builtin` for per-session bookkeeping).
5. **Provider selection** — which detected providers / harnesses should be used for setup intelligence, and which should be in the project's eventual runtime chain. The runtime canonical order is `[opencode, copilot, codex, gemini, claude]`, restricted to providers actually installed on the host (and with working auth, per `devcontainer.md` §Auth resolution). User may reorder or drop.
6. **Budget cap** — daily or per-orchestrator USD ceiling for pay-per-use providers. Consumed by the scheduler's burn-rate gate (see `provider-contract.md` §Cost and usage capture).
7. **Devcontainer** — yes (new) / yes (existing) / no. When yes, the auth resolution strategy (`mount-first | env-first | env-only`) is surfaced with per-provider method preview (see `devcontainer.md`).
8. **Validation commands** — exact commands that constitute "this build is verified" (typecheck, lint, test, e2e, build). Used by the review agent's Gate 5 and by setup's own Phase 6 verification.
9. **Preview deployments** — default-on for deployable web/API products when the repository or host can provide PR preview URLs (Vercel, Netlify, Render, Railway, Fly, custom deploy script, tunnel, or equivalent). Setup records the mechanism or the explicit opt-out reason. The generated constitution should require every previewable PR / change set to carry a clickable deployment or preview URL in its tracker comment before review approval.
10. **Safety rules** — project-specific guardrails beyond the baseline (e.g., "never modify the database schema without a migration"). Folded into CONSTITUTION.md.
11. **Data privacy** — `private` or `public`. `private` enables ZDR-specific provider configuration (see §File scaffolds for what this triggers).

The interview never prompts for **runtime** defaults (thresholds, timeouts, concurrency caps, polling intervals) — those belong in `daemon.yml` and `pipeline.yml` and are edited directly. Setup's job is project intent, not scheduler tuning.

Each answer lands incrementally in run state. Answers may resolve an ambiguity, raise a new one, or narrow a previously broad question into a concrete follow-up. The daemon only materializes the final `InterviewResult` after the latest readiness judgment says there are zero blocking ambiguities.

Question handling is therefore **dynamic, not append-only**. A user answer may:

- satisfy multiple pending questions at once
- make another queued question irrelevant
- reveal that a broader earlier question was framed incorrectly
- require a narrower replacement question instead of the one that was previously queued

The system must prefer recomputing the next best question over preserving a stale queue for the sake of order.

For **structured answers**, no LLM recomputation is required. The shell can immediately:

- record the answer
- invalidate stale pending questions
- advance along the relevant branch
- show the next valid question(s)

For **custom / freeform answers**, the system may invoke a small inline reasoning pass to interpret the answer and update nearby graph state. This is a fast-path operation in the active shell/session, not a queued background orchestrator turn. Only when that interpretation reveals deeper uncertainty or repo-level implications should the slow background path be engaged.

### Phase 3: Intelligence-led ambiguity judgment

Ambiguity resolution is the hard gate between "we have some answers" and "we know enough to scaffold." The **judgment** is intelligence-led, not a deterministic rule engine. At the appropriate scope — whole repo, a subsystem, a document chapter, or a single conflicting decision — a setup judge agent emits an explicit verdict and the current blocking ambiguities.

The same prompt discipline is reused later by runtime refinement when change requests, comments, or implementation discoveries create new ambiguity after setup is complete. The difference is not the reasoning style; it is the gating consequence.

The daemon persists an explicit ambiguity ledger, but that ledger is authored and updated by setup-side intelligence, not inferred by a shallow fixed heuristic. Each ambiguity item has:

- a `kind` (`missing_required`, `conflict`, `low_confidence`, `broad_answer`, `external_prereq`)
- the affected field(s)
- the discovery evidence or conflicting answers that created it
- a blocking bit (`blocks_generation`, `blocks_orchestrator`)
- a concrete next action (ask user, inspect more files, run deeper research, rerun auth probe, etc.)

The corresponding readiness verdict is one of:

- `resolved` — no blocking ambiguity remains at the current stage
- `unresolved` — blocking ambiguity exists and must be addressed
- `needs_deeper_research` — the system cannot honestly judge yet; more analysis must run before asking or confirming further

Typical blocking ambiguities:

- discovery and the repository disagree (`README.md` says Next.js app, tree looks like a package-only library)
- two validation command sets are plausible and would produce materially different gates
- the user answers "use whatever is best" where multiple tracker/provider/devcontainer outcomes are meaningfully different
- a brownfield `SPEC.md` and the codebase point to different product scope
- orchestrator mode is requested but tracker ownership, spec files, or merge target are still unclear

The setup orchestrator keeps drilling into these items until they are either resolved or explicitly converted into a non-blocking advisory note. **Generation, verification, and orchestrator bootstrap are forbidden while the latest readiness verdict is not `resolved`.** In non-interactive mode, an unresolved blocking ambiguity is a hard error with the exact missing/unclear field list.

### Phase 4: Chapter review and plan confirmation

Once the latest readiness verdict is `resolved`, setup renders the exact plan it is about to apply: selected mode, tracker, setup-analysis provider set, runtime provider chain, validation commands, preview-deployment policy, privacy mode, devcontainer strategy, generated artifacts, and any advisory sensitivity hints. For previewable artifacts, setup shows drafts before writing them. Greenfield `SPEC.md` / `CONSTITUTION.md` previews are reviewed here, then written in Phase 5 if approved.

The review surface is chapter/document-oriented, not just a flat summary:

- large specs and draft documents are split into chapters/sections
- users can drill into individual chapters, review diffs, and leave feedback or steering on a specific document or section
- the dashboard presents this as a rich wizard with progress, chapters, drafts, and comments
- CLI and skill/chat shells surface the same state as summaries plus targeted follow-up prompts and comments

This is a confirmation step, not another open-ended interview. The user can:

- approve the plan as-is
- jump back to a specific decision and reopen that topic
- leave feedback on a draft chapter or document and trigger a revision pass
- abort without writing anything

Only after confirmation does the daemon freeze the `InterviewResult` and accept a `ScaffoldRequest`.

### Phase 5: Generation

Generation turns the `DiscoveryResult` + resolved `InterviewResult` into artifacts. When setup is being driven from an AI-hosted shell, generators may be launched as parallel subagents; when run non-interactively, the daemon uses templates + variable substitution with no subagent involvement.

Artifacts (see §File scaffolds for full list):

- **CONSTITUTION.md** — generated by a dedicated subagent that scans SPEC.md and interview answers for architectural invariants, layer separations, trust boundaries, protocol contracts, ownership rules, and preview-deployment policy, then distills 10–30 actionable one-sentence rules grouped by category (Architecture, Security, Protocol, Ownership, Evidence). Per CR #233: "rules must be independently enforceable in a code review — not vague principles but specific constraints with clear pass/fail criteria." For deployable products, the default Evidence rule is: every previewable PR / change set must include a clickable deployment or preview URL in its tracker comment before review approval, unless setup recorded an explicit opt-out or the Story is not externally previewable. Referenced at runtime via `{{CONSTITUTION}}` (see `pipeline.md` §Template variable reference).
- **`aloop/config.yml`** — project-level configuration consumed by the daemon: tracker adapter, status/label maps, provider chain, validation commands, safety rules, preview-deployment policy, privacy policy, budget cap, sensitivity hints. Preview deployment policy is explicit data, for example:

  ```yaml
  evidence:
    preview_deployments:
      enabled: true
      mechanism: vercel
      url_source: tracker_deployment_status
      opt_out_reason: null
  ```

  If disabled, `opt_out_reason` is required so proof and review agents can distinguish an intentional project choice from a missing deployment.
- **`aloop/pipeline.yml`** — authored workflow (pipeline + finalizer + triggers). The compile step resolves it into `loop-plan.json` on first session start (see `pipeline.md` §Workflow vs pipeline vs loop-plan).
- **`.devcontainer/devcontainer.json`** — written only when the devcontainer option is selected; generator consults per-provider auth resolution (`devcontainer.md` §Auth resolution) and the chosen strategy.
- **`.aloop/tracker/`** — initialized only when `tracker.adapter: builtin` (see `work-tracker.md` §Built-in adapter); seeded with a monotonic id counter and an empty `events.jsonl`.
- **Project prompt templates** under `.claude/commands/aloop/`, `.opencode/commands/aloop/`, etc. — one set per activated provider surface, copied from `aloop/templates/` with setup-time variables expanded (`{{SPEC_FILES}}`, `{{VALIDATION_COMMANDS}}`, `{{CONSTITUTION}}`, `{{SAFETY_RULES}}` — see `pipeline.md`).
- **Subagent definitions** under `.opencode/agents/` (when opencode is activated; per CR #78 and `pipeline.md` §Subagent delegation) — vision-reviewer, code-critic, test-writer, error-analyst, and others, inert for non-opencode providers.
- **SPEC.md / VERSIONS.md / `docs/conventions/`** — for greenfield projects, generated by the setup orchestration's generation fan-out (SPEC.md from interview answers with machine-verifiable acceptance criteria; VERSIONS.md from detected + confirmed versions; convention docs seeded from `aloop/templates/conventions/` and customized with project-specific examples). Brownfield projects reuse existing specs.
- **Initial worktree branch `agent/trunk`** — created when orchestrator mode is selected (the merge target for dispatched children; see `orchestrator.md` §Agent-trunk branch).
- **Tessl skill registration** (when tessl is installed) — `tessl init --project-dependencies` runs during generation; discovered skills are listed in the settings summary. Further per-task skill installation happens during orchestration (CR #48, CR #220).
- **Tracker prerequisites** — for the GitHub adapter, required labels are created if missing and (when configured) the project's GitHub Project V2 is created with status field options aligned to the status map (CR #221). For the builtin adapter, the tracker directory is seeded.

All artifacts are written through the daemon's scaffold API, not directly by a shell. The shell constructs or confirms the `ScaffoldRequest`; the daemon writes files, returns paths, and records the write in its event log. This keeps the client layer stateless between turns and gives the dashboard a visible trail of what setup produced.

### Phase 6: Verification

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

Per the canonical setup boundary (issues #93, #203): **intelligent default selection belongs to the setup shells and setup-side agents. The daemon never silently picks a runtime default.** Every gap the verifier surfaces includes the explicit missing configuration and the required action.

### Phase 7: Handoff to runtime orchestration (optional)

When the chosen mode is `orchestrator`, setup hands off to the runtime orchestrator only after Phase 6 passes and the latest readiness verdict is still `resolved`.

The handoff may include:

- a final initial decomposition pass during setup (`setup_decompose`) to establish the first Epic baseline
- or, for smaller / clearer projects, direct handoff into the runtime orchestrator's normal decomposition flow

What matters is the ownership boundary: setup establishes the initial baseline; after handoff, all further decomposition authority belongs to the runtime orchestrator.

Typical handoff flow:

1. Daemon creates an orchestrator session: `POST /v1/sessions { kind: "orchestrator", workflow: "orchestrator.yaml" }`.
2. The initial Epic baseline is materialized — either from the final setup-side decomposition result or by the runtime orchestrator's first scan turn reading the approved spec and emitting `decompose_result`.
3. Adapter creates the Epics via the configured tracker (native sub-issues in GitHub, work-item files in builtin).
4. Setup's final summary includes the Epic count and first wave.
5. Setup exits; the orchestrator session continues on its own heartbeat.

This hand-off is a single daemon transaction. If decomposition fails, Phase 6 retrospectively fails the run — setup does not leave a half-bootstrapped orchestrator in the registry.

Standalone (non-orchestrator) projects skip Phase 7. Their first `aloop start` creates the first session directly.

## Client shells

Every shell is a client of the same setup orchestration. The shell changes the presentation, not the backend behavior.

### CLI

The CLI is a thin API client. It should:

- create or resume the current setup run
- render the next question, draft review, or blocking issue
- show incremental progress and background research status
- allow the user to leave and return later without losing state

### Dashboard

The dashboard is the rich setup shell. It should:

- show overall progress and current stage
- show chapter/document breakdown for large setup runs
- allow drilling into individual chapters, findings, and generated drafts
- show background research tasks and their results as they complete
- allow comments / steering on individual chapters and documents

### Skill / external chat host

The skill is targeted instructions — a recipe for driving setup from an external agent chat experience. It is not a separate privileged backend. Under the hood it should use the CLI or the same shared API client layer the CLI uses.

What the shells own:

- question phrasing and pacing
- presentation of discovery summaries, draft previews, and progress
- convenience affordances for comments, steering, and chapter navigation

What the shells do **not** own:

- project promotion to `ready`
- readiness judgment
- ambiguity waivers
- file writes, tracker mutations, or orchestrator bootstrap outside the daemon's gated flow

## The setup runtime (daemon side)

Everything shell-initiated lands here eventually. The daemon-side view treats setup as a long-running, resumable, event-producing workflow that may span minutes or days, may continue background research while awaiting user input, and is interactive only when it actually needs the user.

**Project registration:**

```
POST /v1/projects { abs_path, name }
→ 200 { id, abs_path, name, added_at, status: "setup_pending" }
```

The daemon canonicalizes `abs_path`, refuses to register a path outside the configured workspace roots (a safety boundary, not a setup detail), and returns an existing row on duplicate registration (see `daemon.md` §Project registry). A `setup_pending` project cannot have sessions started against it — `aloop start` rejects with `project_not_ready` until Phase 6 passes.

**Setup run state:**

```
POST /v1/setup/runs { abs_path, mode?, non_interactive?, flags? }
→ 200 { run_id, status: "discovering" }
```

Typical inputs are `abs_path`, optional flags, and optional non-interactive answers already known at launch. Discovery happens first; `InterviewResult` and `ScaffoldRequest` are assembled later as the run advances. The run row persists across turns, page reloads, daemon restarts. A setup run may remain alive across multiple days. An interrupted or paused run can be resumed with `POST /v1/setup/runs/:id/resume`.

**Ambiguity ledger:**

Each run stores a durable set of ambiguity records under `scratch/ambiguities.json`, plus the latest readiness verdict that produced them. A run may move through states like `discovering`, `researching`, `awaiting_user`, `synthesizing`, `draft_review`, `scaffolding`, `verifying`, and `bootstrapping`, but it may not enter `scaffolding`, `verifying`, or `bootstrapping` while the latest verdict is not `resolved`.

**Setup workspace model:**

Each run also owns:

- chapters / topic groups
- draft documents and their revisions
- background research tasks
- comments / steering attached to a chapter or draft document

This is what makes setup resumable across CLI, dashboard, and skill/chat entry points.

**Scaffolding:**

The daemon executes the `ScaffoldRequest` transactionally where possible: either all artifacts land or none do. Pre-existing files are merged when the user selected "merge" on the re-run prompt (§Edge cases) and replaced when they selected "replace."

**Verification pipeline:**

Phase 6 runs as a setup-owned workflow, compiled the same way any other pipeline is. Check results publish `setup.check.*` events; the dashboard can watch the run in real time. On any failure, the run pauses in `verification_failed` status with the failing check as the resume point. Re-running does not re-scaffold unless the user asks — it re-verifies.

**Idempotency:**

Running setup twice with identical answers produces no writes and no tracker operations. The daemon diffs the pending scaffold against the current filesystem and tracker state; empty diff exits with `status: "no_change"`. This is what makes setup safe as a dry-run check (`aloop setup --verify-only`) and as a CI safety net.

**State durability:**

Setup progress lives in `~/.aloop/state/setup_runs/<id>/` on the host. Killing the CLI mid-interview does not lose the answers collected so far; re-running picks up at the last unanswered topic, unresolved ambiguity, draft review, or failed verification check. JSONL event history lets the dashboard replay a run after the fact.

**Event surface:**

Every setup run publishes the following events on the daemon bus. Dashboards, bots, the CLI, and external skill/chat hosts subscribe to render live status.

| Event | When |
|---|---|
| `setup.discovery.started` | Phase 1 kicks off |
| `setup.discovery.complete` | `DiscoveryResult` persisted |
| `setup.research.started` / `setup.research.complete` | Background setup research child starts / finishes |
| `setup.interview.answered` | Each topic's answer lands |
| `setup.question.invalidated` | A pending question became stale or redundant and was removed |
| `setup.question.queued` | A newly valid follow-up question entered the current question set |
| `setup.ambiguity.raised` / `setup.ambiguity.resolved` | A blocking or advisory ambiguity changes state |
| `setup.readiness.judged` | A setup judge emits the latest verdict + rationale |
| `setup.chapter.updated` | A draft chapter/document revision lands |
| `setup.comment.added` | User feedback/steering attached to a chapter/document |
| `setup.confirmation.requested` / `setup.confirmation.approved` | The exact plan is ready for approval / was approved |
| `setup.scaffold.planned` | `ScaffoldRequest` accepted, diff computed |
| `setup.scaffold.applied` | Files written, tracker entities created |
| `setup.check.passed` / `setup.check.failed` | Per Phase 6 gate |
| `setup.run.ready` | Project `status` flipped to `ready` |
| `setup.completed` | Full setup flow is done, including Phase 7 when applicable |
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
| `<tracker>/labels` | Required label set | Adapter (during setup verification/bootstrap) | Via tracker directly |
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
| **Compile step** (`pipeline.md`) | `pipeline.yml`, prompt templates, `{{CONSTITUTION}}` / `{{SPEC_FILES}}` / `{{VALIDATION_COMMANDS}}` | Plan compile fails, surfaced during Phase 6; no session starts |
| **Orchestrator** (`orchestrator.md`) | `agent/trunk` branch, tracker adapter, spec files to decompose, sensitivity hints | Decompose runs against missing / stale spec, produces bad Epics |
| **Tracker adapter** (`work-tracker.md`) | Adapter id + config, status map, label map, webhook config | Adapter fails `ping()`; orchestrator cannot file Epics |
| **Proof / review agents** | CONSTITUTION preview-deployment rule, preview mechanism or opt-out reason from `aloop/config.yml` | Humans get screenshots or prose but no clickable PR deployment even though the project can provide one |
| **Sandbox backend** (`devcontainer.md`) | `.devcontainer/devcontainer.json` for the v1 backend, auth-resolution strategy, later backend selection | Sandbox fails to start; provider auth unavailable inside sandbox |
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
- **No specs present (greenfield).** The interview's Topic 1 goes deep on project goal, scope, and acceptance criteria. Before Phase 5 writes anything, setup shows a preview of the generated `SPEC.md` and constitution-derived rules during Phase 4 confirmation. The constitution is derived from the spec + interview; constitution review is mandatory even for greenfield.
- **Project is a subfolder of a monorepo.** The daemon canonicalizes `abs_path` and treats the subfolder as its own project. Sibling folders are unrelated projects in the registry. Shared root-level files (root `package.json`, shared `tsconfig.json`) are read by discovery but not modified by scaffold.
- **Project is under an existing aloop parent.** The daemon walks up for `.aloop/` on `aloop start`; setup writes its own `.aloop/` at the subfolder level and registers the subfolder distinctly. The parent project is unaffected.
- **Interrupted setup.** The run state in `~/.aloop/state/setup_runs/<id>/` is durable. `aloop setup --resume <id>` picks up at the last unanswered interview topic, open ambiguity, draft review, or failed verification check.
- **Large or ambiguous project setup takes days.** Setup may stay in `setup_pending` while background research keeps running. The user can leave, come back later through any shell, review new findings, and continue from the current stage rather than restarting.
- **Container build fails.** Phase 6 devcontainer check fails with the build log. User fixes the Dockerfile / devcontainer feature list, reruns `aloop setup --resume`. The daemon re-checks only that gate.
- **Tracker permissions insufficient.** The adapter reports which scope is missing. Setup surfaces the exact `gh` re-auth command (or the equivalent for other adapters). User fixes auth, reruns.
- **Conflict between user-provided SPEC.md and discovery (brownfield).** The interview surfaces the mismatch and lets the user either correct the spec or confirm that discovery misread the codebase. Setup does not silently overwrite SPEC.md.
- **Non-interactive flags incomplete.** Setup exits non-zero with the list of missing fields. No fallback defaults are silently chosen.

## Invariants

1. **Setup never marks a project ready without passing verification gates.** The registry `status` flips to `ready` only on Phase 6 green.
2. **CONSTITUTION.md is always produced** — may be minimal for trivial projects, but it is the durable record of project intent and is referenced by every downstream prompt that includes `{{CONSTITUTION}}`.
3. **Setup is reproducible.** Same inputs (discovery snapshot + interview answers) produce the same outputs, modulo external state (PATH, auth tokens, remote tracker state).
4. **Setup is idempotent.** Running it twice with identical answers is a no-op. Diff-and-apply semantics, not blind overwrite.
5. **Setup never edits CONSTITUTION.md silently after first generation.** Changes go through the CR workflow — the constitution is a tracked artifact like any spec file, not a scratchpad.
6. **Deployable projects default to clickable PR previews.** Setup records preview deployments as enabled whenever discovery finds a viable mechanism, and the generated constitution carries the review rule. Disabling this requires an explicit opt-out reason.
7. **Setup never installs a provider's auth globally.** It only forwards what the host already has (env vars, auth files per `devcontainer.md` §Auth resolution). It does not run interactive OAuth flows, does not write to `~/.config/` outside `~/.aloop/`, does not touch OS keychains.
8. **Setup's readiness judgment is explicit and authoritative.** Blocking ambiguities must be resolved before scaffold, verification, or runtime orchestration bootstrap. There is no "best effort" promotion past an unresolved blocking judgment.
9. **Whole-codebase discovery is the default.** Repository understanding for setup may use summarization and progressive deepening internally, but it does not rely on a tiny sampled slice as the contract boundary.
10. **Setup's verification is the single source of truth for "this project is ready to run a loop."** `aloop start` refuses to launch against a project whose `status` is not `ready`.
11. **Setup is one backend workflow with multiple shells.** CLI, dashboard, and skill/chat hosts all operate the same daemon-owned setup run. No shell has privileged setup logic.
12. **Intelligent default selection is a setup-shell concern, not a daemon-side silent fallback.** The daemon enumerates missing configuration and enforces gates; the shell and setup-side agents gather the needed answers. There are no hidden runtime defaults in setup's code path.
13. **Setup runs through the daemon API.** The CLI is a shim, the dashboard is a richer client, and the skill/chat host is a recipe over the same path. No entry has a privileged back door that writes directly to the filesystem, the tracker, or the registry.
14. **Setup artifacts in the project root are committed with the code.** `CONSTITUTION.md`, `aloop/`, `docs/conventions/`, `.devcontainer/`, `.opencode/agents/` are versioned alongside the code so the project's intent is reviewable, blame-able, and revertable like any other source file.
