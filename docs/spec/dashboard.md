# Dashboard

> **Reference document.** The dashboard is the human operator workstation for aloop. It is still only an HTTP/SSE client of the daemon: no privileged backend, no hidden state, no UI-only mutations. If the workstation needs something the CLI cannot also do through the API, the API is missing an endpoint.

The earlier draft intentionally kept this file thin. That is no longer enough. The product promise in `VISION.md`, `incubation.md`, `setup.md`, `metrics.md`, `work-tracker.md`, and `api.md` already implies a much richer surface: capture inbox, research queue, setup shell, runtime control plane, tracker editing, session inspection, artifacts, provider health, cost, and configuration. This document specifies that workstation at the product level. Visual implementation details stay in `DESIGN_BRIEF.md`; transport and payload shapes stay in `api.md`.

## Table of contents

- Role of the workstation
- Core principles
- Client forms
- Desktop shell responsibilities
- Information architecture
- Primary surfaces
- Control model
- Composer agent model
- Real-time model
- Layout and customization
- Incubation workstation
- Setup workstation
- Runtime workstation
- Tracker and planning workstation
- Artifacts and evidence
- Observability and economics
- Configuration center
- API implications
- Phasing
- Non-goals
- Invariants

---

## Role of the workstation

The dashboard is not a vanity status page. It is the **human control surface** for an always-reachable durable system that otherwise runs autonomously:

- setup a project
- capture raw ideas before they are projects or work items
- start and inspect non-mutating research tasks
- synthesize immature ideas into reviewable proposals
- understand what the orchestrator is doing now
- inspect why it made a decision
- steer or stop work at any level
- edit tracked work directly
- review artifacts and evidence
- watch costs, permits, quotas, and provider health
- configure the system without dropping to raw files unless desired
- manage worker capacity, leases, failures, and deployment health

The workstation must serve both:

- **high-level operators** who want to manage the whole project or orchestrator
- **low-level inspectors** who want exact per-loop output, chunks, commits, metrics, and evidence

It therefore needs multiple levels of abstraction in one shell, not a single log view and not a pure chat UI.

## Core principles

1. **API-first, always.** The workstation consumes the same daemon API as every other client.
2. **One shell for all phases.** Incubation, setup, planning, runtime, review, and learning are not separate products.
3. **Hierarchy is first-class.** Users reason in trees: inbox item → research run / proposal → project → setup run / orchestrator → epic → story → session → turn → artifact.
4. **Realtime is core, not garnish.** Streaming state, event tails, chunk streams, and live metrics are default behavior.
5. **Control at multiple altitudes.** The user must be able to act on the whole project, one orchestrator, one work item, one session, or one queued instruction.
6. **Discussion before mutation when useful.** Editing spec chapters, tracker items, or synthesized changes should support comment/reason/preview loops before commit.
7. **Observable decisions.** Denials, reroutes, cooldowns, diagnoses, and merges need visible rationale.
8. **Flexible, but not chaotic.** Layout can be customized, resized, docked, and saved, but the app must still have sane default workspaces.
9. **Durable over ephemeral.** Streams are helpful; persisted records win. Every live panel should have a replay or inspectable history behind it.
10. **The composer is the universal intent interface, not the state store.** Users should be able to ask for anything the app can do from one intelligent composer, but durable state still lands in daemon-owned objects.
11. **Fast paths matter.** The workstation should feel immediate in the composer, stream, panel switching, and inspect flows; latency should not be amplified by heavy UI chrome or unnecessary rerenders.

## Client forms

The workstation may ship in more than one shell:

- **Web app** over the daemon's HTTP/SSE API
- **Mobile web** over the same API, optimized for capture, triage, research status, comments, and proposal approval
- **ElectroBun desktop shell** around the same web client, for a more Codex-like workstation feel, local shell integration, better window management, and native notifications

The desktop and mobile forms are alternative shells, not separate products. They may add native affordances, but they do not get privileged operations.

## Desktop shell responsibilities

The `ElectroBun` shell should own native desktop concerns while keeping product logic in the shared workstation client.

Good responsibilities for the desktop shell:

- native windowing and multi-window support
- tray/menu-bar presence
- app-level keyboard shortcuts
- deep-link handling
- local notifications
- file/folder pickers and drag/drop bridge points
- desktop packaging, updates, and app lifecycle
- optional embedded terminal or log console surfaces where those are strictly host-shell affordances

What should stay out of the desktop shell:

- business logic for sessions, setup, tracker edits, or scheduler control
- hidden privileged mutations unavailable to the web client
- a forked UI model that diverges from the browser workstation

The intended architecture is:

- one shared workstation frontend
- one daemon API contract
- optional browser deployment
- optional `ElectroBun` shell for the local-app experience

## Information architecture

The core navigation model is a **hierarchical sidebar tree** with first-class workspaces and optional saved filters.

Illustrative top-level tree:

- Home
- Inbox / Incubation
  - Captures
  - Research
  - Proposals
  - Ready to promote
- Workspaces
  - Workspace
    - Overview
    - Inbox / Incubation
    - Research / monitors
    - Projects
      - Project
    - Cross-project tracker
    - Aggregate runtime
    - Costs / budgets
    - Workspace settings
- Projects
  - Project
    - Overview
    - Incubation
    - Setup
    - Spec
    - Tracker
      - Epics
      - Stories
      - Board
      - Inbox / comments
    - Runtime
      - Orchestrators
      - Sessions
      - Queue / steering
      - Artifacts
    - Observability
      - Metrics
      - Costs
      - Providers
      - Scheduler
    - Configuration
      - Project config
      - Pipeline / workflows
      - Provider chain
      - Safety / constitution
- Global providers
- Global scheduler
- Global settings

The point of the tree is not nostalgia for file explorers. It gives the user fast movement between:

- hierarchy level
- scope
- persistent object
- active run

A workspace is not just a saved layout. It is a durable operator scope that may contain multiple projects and multiple Git repositories. Examples: "Aloop product", "Client X", "AI research", "Mobile app + API + infra", or "Ideas not attached to repos yet."

Projects remain the runnable units. Workspaces are where the user supervises cross-project state, budgets, incubation, research, aggregate progress, and relationships between repos.

The workstation should also provide:

- global search
- command palette
- pinned items / favorites
- recent sessions and artifacts
- deep links to exact project, session, turn, story, or artifact views
- deep links to exact incubation item, research run, proposal, or promotion target

## Primary surfaces

The workstation is composed of a small set of durable surfaces, not one giant dashboard.

### 1. Overview

The overview is the global control room:

- active projects
- running sessions
- orchestrator status
- today cost vs cap
- provider health and cooldowns
- recent merges, failures, and diagnoses
- alerts requiring attention

This is where the user answers: "Is the system healthy, productive, and worth letting run?"

### 2. Incubation

The incubation surface is the front door for work before it is ready for setup, spec, or implementation:

- quick capture inbox
- item detail with provenance, comments, labels, related items, and artifacts
- research queue and research-run inspector
- source plan editor for docs, web, video, forums, social, repositories, issue trackers, market data, and user-provided artifacts
- cited source browser with transcripts, screenshots, retrieval timestamps, and limitations
- experiment-loop workbench for AutoResearch-style protocols, immutable oracle, mutable surface, attempt ledger, and best/rejected candidates
- monitor workspace for recurring/continuous tracking tasks with cadence, budget, alert conditions, and delta history
- outreach workspace for survey/interview drafts, approval gates, consent/privacy checks, and response analysis
- findings and evidence browser
- proposal synthesis with preview-before-apply
- promotion target picker
- mobile-friendly triage

This is where the user answers: "What is this thought, what do we know about it, and what should it become?"

### 3. Work tracker

The tracker surface is the planning and prioritization view:

- epic/story list views
- kanban board
- backlog / queue ordering
- work item detail
- comments and discussion
- child-story progress rollups
- change history

The user must be able to create, edit, split, merge, prioritize, re-order, relabel, and comment on Epics and Stories from here.

### 4. Session inspector

The session surface is the loop microscope:

- current phase / iteration / workflow
- live event tail
- turn-by-turn transcript
- streaming agent chunks where available
- queue / steering items
- commits, diffs, change set links
- tests, proofs, review outcomes, gate results
- per-session metrics and cost

This is where the user answers: "What exactly happened in this loop?"

### 5. Spec and discussion

The spec surface is for reviewing, discussing, and evolving structured documents:

- setup chapters and drafts
- project spec sections
- generated syntheses
- comment threads on sections or work items
- agent reasoning/explanation attached to proposed mutations
- preview-before-apply flows for synthesized changes
- inline images and artifact-backed comments, not just plain text

The user should be able to argue with the system here before the system rewrites the source of truth.

### 6. Artifacts

The artifact surface is an evidence browser:

- proof outputs
- logs
- screenshots
- benchmark outputs
- generated docs
- validation summaries
- rollback plans
- other workflow outputs

Artifacts must be grouped by project, story, session, and run phase.

### 7. Control center

The control center exposes runtime and configuration levers:

- provider overrides
- scheduler limits
- project mode / workflow defaults
- provider chain configuration
- budget caps
- setup and runtime policy settings

### 8. Setup workstation

The setup surface is a first-class shell for the long-lived onboarding flow:

- current phase and progress
- active question set
- background research status
- chapter/document review
- ambiguity list
- readiness verdict
- verification gate results

## Control model

The workstation must support both **fine-grained** and **high-level** control.

### High-level controls

Actions scoped to the whole project or orchestrator:

- capture a new idea or research request
- start, pause, resume, or cancel an incubation research run
- apply or reject an incubation proposal
- start / resume setup
- start / stop / pause an orchestrator
- reprioritize epics or stories
- apply provider override policies
- raise or lower scheduler limits within allowed bounds
- approve or reject setup scaffold

### Mid-level controls

Actions scoped to work items:

- classify or relate incubation items
- promote an incubation proposal to setup, spec, tracker, steering, decision record, or discard
- create epic/story
- edit title, body, scope, acceptance criteria, labels, assignees, priority
- split or merge stories
- move between backlog / active / blocked / done
- add comments and requests for clarification

### Fine-grained controls

Actions scoped to sessions or turns:

- steer a running session
- inspect queue items and cancel them
- pause, stop, or force-stop one session
- inspect one exact turn's chunks, logs, usage, and artifacts
- compare one run against previous runs on the same story

### Discussion-before-apply

For incubation promotion, spec mutations, tracker synthesis, and setup chapter edits, the preferred control loop is:

1. Proposed change appears with rationale and provenance.
2. User comments, revises, or asks the agent to reason about it.
3. The system synthesizes a revised proposal.
4. User applies the change.

Not every edit needs ceremony. Direct editing remains valid. But synthesis-heavy mutations need a reviewable intermediate state.

## Composer agent model

The composer is the intelligent interface for everything aloop can do. It is a real agentic control surface: it can understand ambiguous user intent, prepare the right task, delegate to specialized subagents, coordinate long-running work, and observe status through the same event streams as the rest of the app.

The composer is not a separate backend, not a hidden memory store, and not a god-mode API caller. A composer turn is a provider-backed control turn whose outputs are structured delegation plans, proposed mutations, proposals, comments, research runs, setup runs, session steering, configuration patches, project registrations, or status summaries.

The default user model should be:

- speak, type, paste, upload, screenshot, or share into the composer
- the composer resolves scope and asks clarifying questions when needed
- media is normalized into daemon artifacts before provider reasoning
- the composer previews the structured action it intends to take when the action is risky or durable
- the daemon applies approved mutations through normal endpoints
- long-running work continues as normal daemon jobs
- the composer can later summarize, pause, resume, cancel, or redirect those jobs

This makes incubation kickoff natural: a raw idea can begin as one sentence in the composer and become an `IncubationItem`, a `ResearchRun`, a monitor, an outreach draft, or a promotion proposal without forcing the user through a form first.

The dedicated workstations remain necessary. The composer is the fastest way to express intent; the incubation/setup/runtime/tracker surfaces are the durable places to inspect, compare, approve, and manage the resulting objects.

### What to borrow from chat

The workstation should borrow the strongest parts of modern high-performance chat tools without becoming "just another chat app":

- a **fast, always-ready composer**
- immediate visual response on send
- stable streaming with minimal layout shift
- keyboard-first conversation flow
- voice-first capture and command flow, especially on mobile
- multimodal capture and response when the selected provider supports it
- compact, high-signal message rendering
- easy branch/thread continuation from prior context
- lightweight attachment of artifacts, spec fragments, or work-item context into the message

### What not to borrow

- making the transcript the only source of truth
- forcing planning, tracker editing, or observability into chat turns
- hiding structured state behind natural-language conversation
- allowing the composer to mutate repos, trackers, outreach channels, or setup state outside the daemon API

### Composer responsibilities

The composer can initiate or assist with:

- capturing a new incubation item from raw text, a link, an image, a screenshot, an audio/voice note, a video, a document, a voice transcript, or a pasted thread
- preparing a research task by refining the question, source plan, budget, provider chain, and expected output
- starting, pausing, resuming, cancelling, or summarizing long-running research runs and monitors
- drafting outreach/survey plans while leaving send/approval gates to the daemon policy
- registering an existing repository or starting setup for a greenfield project
- starting setup runs from a candidate project or matured incubation proposal
- answering or revising setup questions and reviewing generated setup scaffold
- editing project metadata, workflow defaults, provider chains, scheduler limits, overrides, retention settings, and other daemon-exposed configuration
- creating, editing, splitting, reprioritizing, or explaining tracker work
- steering a running session
- starting, pausing, stopping, resuming, or inspecting sessions when policy permits
- explaining scheduler/provider/tracker decisions
- discussing a spec section or proposed synthesis
- asking the system to explain a decision
- iterating on comments before applying them to tracker/spec state
- targeted agent assistance while staying anchored to a selected incubation item, project, story, or session

The long-term target is simple: if an operation is possible anywhere in the app, the user should be able to ask the composer for it. The composer may still route the user to a structured workstation when visual inspection is better than conversation, but the intent and coordination path starts from the composer.

### Universal control surface

The composer should cover every daemon-exposed control plane by delegating to scoped specialist subagents where useful:

| Control area | Composer examples |
|---|---|
| Workspaces | "Create a workspace for the mobile app", "add these three repos", "show cross-repo status" |
| Projects | "Add this repo", "start setup for a new mobile app", "archive this project" |
| Incubation | "Capture this", "research it", "track this weekly", "promote this to setup" |
| Setup | "Continue setup", "answer these questions from the README", "show me unresolved ambiguities" |
| Tracker/planning | "Split this story", "reprioritize auth work", "create an epic from this proposal" |
| Runtime | "Start implementation", "pause all child sessions", "stop the stuck run", "explain this failure" |
| Providers | "Use codex first for this project", "deny claude for today", "show provider health" |
| Scheduler | "Lower concurrency to 2", "raise the daily project budget", "why was this permit denied?" |
| Configuration | "Turn on stream reasoning for this project", "change watchdog threshold", "show pending config diff" |
| Artifacts/evidence | "Compare these screenshots", "attach this log to the story", "summarize proof artifacts" |
| Security/audit | "Show what changed config today", "why was this action denied?" |

### Specialized control subagents

The composer is the front door and coordinator. It should not carry every specialized tool itself. For non-trivial work, it delegates to subagents with isolated scope and narrow tool access.

Representative subagents:

| Subagent | Scope | Tool access |
|---|---|---|
| `project-setup` | one candidate project or repo path | project registration, setup-run tools, discovery artifacts |
| `workspace-organizer` | one workspace or candidate group of repos | workspace read/write proposal tools, project membership tools |
| `incubation-research` | one incubation item or research question | source acquisition, artifact reading, research-run tools |
| `config-editor` | one daemon/project config document or provider override scope | config read/diff/validate/propose tools |
| `scheduler-operator` | scheduler limits, permits, provider health | scheduler read/explain/propose tools |
| `tracker-planner` | one project tracker scope | issue/work-item read/write proposal tools |
| `runtime-operator` | one project/session/orchestrator scope | session inspect/steer/pause/stop tools |
| `audit-explainer` | audit/event projections | read-only event, policy, and config history tools |

Subagent constraints:

- each subagent receives a scoped capability grant, not global daemon authority
- tool access is role-specific and time/budget bounded
- subagents emit proposed actions, artifacts, findings, and status events
- the daemon validates and applies mutations; subagents do not bypass policy
- the composer observes, summarizes, and reconciles subagent outputs for the user
- subagent runs are durable daemon jobs with events, cost, artifacts, and cancellation

This gives the composer broad reach without concentrating all authority in one prompt. The user experiences one intelligent interface; the system internally uses small, auditable, specialized agents.

The composer must not hide complexity by silently applying ambiguous changes. For broad or risky requests, it should produce a structured delegation/action plan:

1. resolved scope
2. selected specialist subagent(s)
3. capability grants and tool scopes
4. affected objects and config keys
5. proposed daemon mutations
6. expected side effects
7. rollback or reversal path where one exists
8. approval requirement

Fine-grained configuration is allowed through the composer, but it must feel like an expert assistant editing a real control plane, not a chatbot guessing at settings. The user should be able to ask follow-up questions, inspect the diff, edit the proposed patch, and then apply it through daemon policy.

### Multimodal composer

Multimodal input is a first-class composer behavior, not a special upload side path.

Supported input classes should include:

- text
- URLs
- screenshots and images
- audio, live speech, and voice notes
- short videos or screen recordings
- PDFs and documents
- pasted logs, terminal output, stack traces, diffs, and code fragments
- selected UI state such as current panel, active item, highlighted spec section, or selected artifact

The composer should normalize every non-text input into daemon-managed artifacts and derived records before reasoning:

| Input | Normalized daemon records |
|---|---|
| screenshot/image | artifact, optional OCR text, visual description, dimensions, provenance |
| voice note/audio | artifact, transcript artifact, language/confidence metadata |
| video/screen recording | artifact, transcript when available, keyframe/screenshot artifacts, timing notes |
| PDF/document | artifact, extracted text chunks, page images when needed |
| URL/share sheet | source record or artifact, retrieval timestamp, title/author when known |
| pasted code/log/diff | artifact or comment body with language/type metadata |

Provider capability is dynamic. If the selected provider supports native vision/audio/document input, the composer may pass artifact references through the provider adapter. If not, the daemon supplies derived text/OCR/transcripts and clearly marks the response as based on derived media, not native perception.

### Voice composer

Speaking to the composer should feel as natural as typing into it. Voice is not just file upload; it is a first-class composer input mode.

Required voice behaviors:

- push-to-talk and tap-to-toggle recording
- mobile-friendly voice capture from the composer bar
- visible live transcript while recording when a streaming transcriber is available
- editable transcript before send
- explicit "send transcript" vs "send audio + transcript" behavior when relevant
- language detection and manual language override
- confidence/unclear-span markers for low-quality transcription
- interruption controls for cancelling capture or stopping a spoken/streaming response
- quiet fallback to typed input when microphone access is unavailable

The composer should support two voice paths:

| Path | Behavior |
|---|---|
| native voice model | audio is passed through the provider adapter when the selected model supports speech/audio input |
| fallback transcriber | audio is first transcribed by a configured transcription adapter; the resulting transcript becomes the composer message and the audio remains an artifact |

Fallback transcription is still daemon-mediated. The client may capture audio, but the daemon owns upload, artifact retention, transcription provider choice, derived transcript artifact, language metadata, and policy decisions. Browser-only speech recognition may be used as a latency optimization only if the daemon records that the transcript came from a client-side recognizer.

For voice responses, the v1 baseline is text output with optional read-aloud in the client. Native spoken responses or generated audio replies can be added later as artifact-backed outputs, not as client-only audio blobs.

Multimodal output should also be artifact-backed:

- screenshots, mockups, diagrams, generated docs, survey drafts, transcripts, and comparison tables are artifacts
- inline display is a rendering concern
- durable references use artifact IDs, not pasted binary blobs in the transcript
- generated media that influences a proposal must be linked from the proposal evidence

### Long-running subagents

When the composer kicks off long-running work, it creates normal daemon jobs rather than owning hidden child agents:

| User asks composer to... | Daemon object created or updated |
|---|---|
| "Capture this idea" | `IncubationItem` |
| "Research this" | `ResearchRun` |
| "Track this for a month" | `ResearchMonitor` plus periodic `ResearchRun`s |
| "Draft a survey" | `OutreachPlan` and artifacts |
| "Figure out if this repo is ready" | `SetupRun` |
| "Implement this story" | `Session` or tracker/orchestrator action after promotion |
| "Set up a new project" | `project-setup` subagent creates `Project` plus `SetupRun` |
| "Change provider order" | `config-editor` subagent proposes provider override or project config patch |
| "Reduce concurrency" | `scheduler-operator` subagent proposes scheduler/config patch |
| "Explain what is running" | status read over existing projections/events |

The composer observes those objects by subscribing to SSE and reading normal API projections. It may summarize status, but the source of truth is still the underlying run/item/session.

### Required composer qualities

The composer experience should feel operationally sharp:

- **optimistic send behavior**: the user's message appears immediately
- **incremental streaming**: chunks append smoothly rather than re-rendering the full transcript on every delta
- **context pinning**: the active incubation item/project/story/session/spec section is visible and editable as chat scope
- **interruptibility**: stop generation, retry, branch, or continue from a prior message
- **history durability**: every useful exchange can be replayed or linked back to the underlying object it affected
- **artifact-aware**: attach logs, proofs, diffs, comments, or exact run outputs into the conversation without copy-paste gymnastics
- **multimodal-aware**: accept and render screenshots, images, audio transcripts, videos, PDFs, docs, visual diffs, mockups, and generated artifacts inline while preserving artifact IDs underneath
- **action previews**: show structured proposed mutations before durable or risky actions
- **job awareness**: show launched child work, live status, cost, and cancellation controls inline

### Composer behavior

The composer should behave more like a professional tool than a generic textarea:

- autosize within tight bounds
- keyboard send by default, newline via modifier
- slash-style quick actions for common intents (`/capture`, `/research`, `/monitor`, `/setup`, `/steer`, `/explain`, `/comment`, `/apply`, `/stop`)
- visible scope chips for the current target (`incubation item`, `project`, `epic`, `story`, `session`, `spec section`)
- drop targets, paste handling, capture buttons, microphone capture, camera/share-sheet capture on mobile, and picker affordances for artifacts and context objects
- preserved draft state per target where practical

### Streaming behavior

Streaming should optimize for legibility and perceived speed:

- append tokens/chunks in place instead of repainting the whole message list
- separate `text`, `thinking` when enabled, `tool_call`, `tool_result`, and `usage` blocks clearly
- allow the user to collapse verbose tool output and reasoning by default
- keep scroll behavior predictable: follow while at bottom, do not yank the viewport when the user has scrolled away
- show partial responses immediately, even if richer metadata arrives later

### Composer in the workstation layout

The composer should be globally reachable and scope-aware, not trapped inside one page:

- global command/composer bar
- docked inspector tab
- bottom conversation drawer
- right-rail discussion pane
- dedicated workbench mode when the user wants a chat-led flow

The default shell should not force a transcript open at all times. The system is broader than the transcript, but the composer should always be one shortcut or tap away.

## Real-time model

The workstation is live by default, backed by persisted history.

It should combine:

- SSE event subscriptions for state change and live tails
- per-turn chunk streams for agent output
- polling only where appropriate for bounded summaries or Prometheus-style metrics
- replay from durable logs for reconnect, rewind, and post-mortem inspection

Live views include:

- incubation item/proposal changes
- research run progress and findings
- session state changes
- event tails
- provider health transitions
- permit grants/denials
- cost movement
- setup progress
- discussion activity

The app must make clear when the user is seeing:

- live streaming data
- delayed aggregate metrics
- historical replay
- incomplete data due to dropped live events

## Layout and customization

The workstation should feel closer to a professional operator console than a fixed marketing dashboard.

Required layout characteristics:

- resizable panels
- docked multi-pane workspace
- saved layout presets
- optional per-user custom layouts
- keyboard-first navigation
- deep-linkable panel state where practical

Recommended default layouts:

- **Overview**: tree + project summary + activity + health
- **Incubation**: inbox/list + selected item + research/proposal rail
- **Operator**: tree + board/list + session detail + control rail
- **Inspector**: tree + transcript/log + artifacts + metrics
- **Setup**: tree + question/review panel + background research + status rail

Customization should be constrained:

- users may rearrange and resize panels
- users may pin preferred surfaces
- the system should ship opinionated presets
- layout freedom must not make onboarding or support impossible

## Incubation workstation

The dashboard is also the intake and maturation surface for ideas that are not ready to become work.

The incubation workstation needs:

- fast capture from desktop and phone
- inbox filters by state, project scope, label, priority, and age
- item detail with source provenance, comments, artifacts, and related items
- research run creation, progress, event replay, findings, cost, and artifacts
- source records, transcripts, citations, and acquisition limitations
- experiment protocol review, attempt ledger, metric chart, plateau detection, and winner proposal
- monitor creation, cadence/budget controls, alert review, and delta history
- outreach/survey planning with explicit approval and consent/privacy checks
- synthesis/proposal review with rationale and evidence
- explicit promotion controls for setup, spec proposal, Epic, Story, steering, decision record, or discard
- backlinks from promoted targets to the originating incubation item

Mobile should optimize for the narrow high-value loop:

- capture quickly
- add context or attachments
- triage state/label/priority
- start lightweight research
- pause/resume monitors and review alerts
- comment on findings
- approve or reject a ready proposal

The incubation UX should not feel like a ticket form. It should feel like a durable thinking surface: quick to enter, slow enough to preserve provenance, and explicit at the moment an idea becomes real work.

## Setup workstation

The dashboard is a first-class shell for setup, not just runtime.

The setup workstation needs:

- active setup runs list
- current phase, stage, and readiness state
- immediate structured question answering
- freeform answer interpretation feedback
- background research progress and findings
- chapter/document breakdown
- section-level comments
- ambiguity queue with blocking vs non-blocking distinction
- verification checklist with pass/fail details
- resumability across days

The setup UX should feel rich and deliberate, not like filling out a form and waiting for an opaque backend batch job.

## Runtime workstation

The runtime workstation centers on live autonomous execution.

Required runtime views:

- active orchestrator summary
- child session list grouped by epic/story/provider/status
- real-time overall progress and per-story progress
- blocked / failing / retrying work
- merge activity
- queue depth
- recent diagnoses
- session detail with exact run output

Progress must exist at multiple levels:

- project-level progress
- epic-level progress
- story-level progress
- session/phase-level progress

Where exact percentage is unavailable, the UI should show truthful proxies rather than fake precision.

## Tracker and planning workstation

The workstation should support planning and execution without forcing the user back to GitHub or a file tree for routine operations.

Required capabilities:

- list and board views for epics/stories
- create/edit/reprioritize from the surface
- drag/drop or equivalent priority changes
- comment threads
- inline status and dependency visibility
- roll-up progress from story to epic
- links from work items to live sessions, change sets, and artifacts

The board is useful, but it is only one lens. Dense users also need list, tree, and detail views.

## Artifacts and evidence

Artifacts are not optional garnish. They are how the human verifies what the loop actually produced.

The workstation must expose:

- artifacts by session
- artifacts by story
- artifacts by workflow phase
- links to commits and change sets
- exact validation outputs
- proof/evidence outputs
- benchmark and cost summaries
- downloadable or expandable raw logs where appropriate

The operator should be able to answer:

- what changed
- what evidence supports it
- what it cost
- whether the relevant gates passed

## Observability and economics

The workstation must make operations legible in economic and systems terms, not just task terms.

Required surfaces:

- provider health and cooldowns
- provider quota/headroom where available
- scheduler permits and denial reasons
- burn-rate and keeper-rate
- per-story, per-epic, per-session, and daily cost views
- per-research-run cost and incubation time-to-promotion views
- comparison over time where metrics support it
- recent failure classification

This is the panel set that tells the user whether the system is merely busy or actually effective.

## Configuration center

The product promise includes "ability to configure everything that is configurable" through a rich UI.

That means the workstation should expose, at minimum:

- project metadata
- selected tracker
- provider chain and per-project provider policy
- budget caps
- workflow defaults and overrides
- scheduler limits that are allowed to be edited live
- setup choices and generated config summaries
- constitution/safety surfaces in review form, even where the source of truth remains file-backed

The configuration center is not permission to bypass invariants. The UI edits only what the daemon already allows to change.

## API implications

This document does not define payloads. It does define capability classes the API must cover.

Beyond the already-documented session, setup, provider, scheduler, and metrics endpoints, the workstation will require first-class API support for:

- incubation item capture, detail, mutation, comments, research, proposals, and promotion
- source records, monitor CRUD, monitor run history, and outreach approval/response records
- experiment-loop attempt history and protocol records
- work-item list/detail/mutation
- work-item comments and discussion
- board/list ordering and prioritization mutations
- artifact listing and retrieval
- richer per-session evidence and run summaries
- project configuration read/update where hot edits are allowed
- reviewable proposal/apply flows for synthesis-heavy edits

If any workstation surface depends on scraping local files, reading the tracker directly, or holding hidden browser-only state, the architecture is wrong.

## Phasing

The workstation should be specified in two layers: **v1 operable shell** and **richer workstation**.

### v1 operable shell

Must include:

- incubation inbox with capture, item detail, comments, research status, and proposal application
- monitor list/detail and source provenance display
- project/session navigation
- session list and detail with live event tail
- provider health
- scheduler permits
- costs and key metrics
- steering box
- stop controls
- provider override editor
- setup run shell with question answering, progress, research status, and chapter summaries

This aligns with `DELIVERY_PLAN.md` M11.

### Rich workstation

Adds:

- mobile-first capture and triage
- richer incubation research/proposal workbench
- market-research workspace with monitors, source comparison, survey/interview planning, and response synthesis
- experiment-loop workspace for fixed-oracle trials and AutoResearch-style optimization
- hierarchical tree navigation across project, tracker, sessions, and artifacts
- customizable multi-pane layouts
- kanban board and backlog management
- full epic/story CRUD and prioritization
- proposal/discussion/apply loops for spec or tracker synthesis
- artifact explorer
- exact turn/run evidence and comparisons
- richer config center
- `ElectroBun` desktop shell
- streaming agent-chat style surfaces where the provider/runtime supports it

Not all of this must land in v1. It should still shape the API and information architecture now.

## Non-goals

- A dashboard-specific backend path
- A pure chat UI as the primary operating model
- Treating vague ideas as tracker work before they are ready
- Fake precision in progress or cost projections
- Making the UI the source of truth instead of the daemon, tracker, config, and event log
- Shipping every rich workstation surface before the core runtime and setup contracts exist

## Invariants

1. **No privileged dashboard behavior.** The workstation is only a client.
2. **Hierarchy is inspectable.** Project → work item → session → turn → artifact must be navigable.
3. **Realtime plus replay.** Live streams are paired with durable history.
4. **Control exists at multiple scopes.** Project, orchestrator, work item, session, queue item.
5. **Discussion is supported before synthesis-heavy mutation.**
6. **Costs, provider health, and permit rationale are visible.**
7. **Setup is first-class.** The workstation must handle onboarding, not just runtime.
8. **Incubation is first-class.** Capture, research, synthesis, and promotion are durable daemon state.
9. **Customization is allowed but bounded by opinionated defaults.**
10. **If the workstation needs it, the API must expose it.**
11. **Standards are preferred.** The workstation uses the daemon's HTTP/SSE/JSON/artifact contracts and normal browser/media standards; it does not invent dashboard-only protocols or hidden state sync.

See: `api.md`, `incubation.md`, `setup.md`, `metrics.md`, `work-tracker.md`, `VISION.md`, `DESIGN_BRIEF.md`.
