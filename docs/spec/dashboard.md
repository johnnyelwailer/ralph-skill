# Dashboard

> **Reference document.** The dashboard is the human operator workstation for aloop. It is still only an HTTP/SSE client of the daemon: no privileged backend, no hidden state, no UI-only mutations. If the workstation needs something the CLI cannot also do through the API, the API is missing an endpoint.

The earlier draft intentionally kept this file thin. That is no longer enough. The product promise in `VISION.md`, `setup.md`, `metrics.md`, `work-tracker.md`, and `api.md` already implies a much richer surface: setup shell, runtime control plane, tracker editing, session inspection, artifacts, provider health, cost, and configuration. This document specifies that workstation at the product level. Visual implementation details stay in `DESIGN_BRIEF.md`; transport and payload shapes stay in `api.md`.

## Table of contents

- Role of the workstation
- Core principles
- Client forms
- Desktop shell responsibilities
- Information architecture
- Primary surfaces
- Control model
- Chat interaction model
- Real-time model
- Layout and customization
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

The dashboard is not a vanity status page. It is the **human control surface** for a system that otherwise runs autonomously:

- setup a project
- understand what the orchestrator is doing now
- inspect why it made a decision
- steer or stop work at any level
- edit tracked work directly
- review artifacts and evidence
- watch costs, permits, quotas, and provider health
- configure the system without dropping to raw files unless desired

The workstation must serve both:

- **high-level operators** who want to manage the whole project or orchestrator
- **low-level inspectors** who want exact per-loop output, chunks, commits, metrics, and evidence

It therefore needs multiple levels of abstraction in one shell, not a single log view and not a pure chat UI.

## Core principles

1. **API-first, always.** The workstation consumes the same daemon API as every other client.
2. **One shell for setup and runtime.** Setup is not a separate mini-app. Runtime control is not a separate admin app.
3. **Hierarchy is first-class.** Users reason in trees: project → setup run / orchestrator → epic → story → session → turn → artifact.
4. **Realtime is core, not garnish.** Streaming state, event tails, chunk streams, and live metrics are default behavior.
5. **Control at multiple altitudes.** The user must be able to act on the whole project, one orchestrator, one work item, one session, or one queued instruction.
6. **Discussion before mutation when useful.** Editing spec chapters, tracker items, or synthesized changes should support comment/reason/preview loops before commit.
7. **Observable decisions.** Denials, reroutes, cooldowns, diagnoses, and merges need visible rationale.
8. **Flexible, but not chaotic.** Layout can be customized, resized, docked, and saved, but the app must still have sane default workspaces.
9. **Durable over ephemeral.** Streams are helpful; persisted records win. Every live panel should have a replay or inspectable history behind it.
10. **Chat is a tool, not the architecture.** Streaming agent chat is useful, especially for steering or discussion, but the product cannot collapse into a single chat transcript.
11. **Fast paths matter.** The workstation should feel immediate in the composer, stream, panel switching, and inspect flows; latency should not be amplified by heavy UI chrome or unnecessary rerenders.

## Client forms

The workstation may ship in more than one shell:

- **Web app** over the daemon's HTTP/SSE API
- **ElectroBun desktop shell** around the same web client, for a more Codex-like workstation feel, local shell integration, better window management, and native notifications

The desktop form is an alternative shell, not a separate product. It may add native affordances, but it does not get privileged operations.

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

The core navigation model is a **hierarchical sidebar tree** with optional saved filters and workspaces.

Illustrative top-level tree:

- Home
- Projects
  - Project
    - Overview
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

The workstation should also provide:

- global search
- command palette
- pinned items / favorites
- recent sessions and artifacts
- deep links to exact project, session, turn, story, or artifact views

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

### 2. Work tracker

The tracker surface is the planning and prioritization view:

- epic/story list views
- kanban board
- backlog / queue ordering
- work item detail
- comments and discussion
- child-story progress rollups
- change history

The user must be able to create, edit, split, merge, prioritize, re-order, relabel, and comment on Epics and Stories from here.

### 3. Session inspector

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

### 4. Spec and discussion

The spec surface is for reviewing, discussing, and evolving structured documents:

- setup chapters and drafts
- project spec sections
- generated syntheses
- comment threads on sections or work items
- agent reasoning/explanation attached to proposed mutations
- preview-before-apply flows for synthesized changes
- inline images and artifact-backed comments, not just plain text

The user should be able to argue with the system here before the system rewrites the source of truth.

### 5. Artifacts

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

### 6. Control center

The control center exposes runtime and configuration levers:

- provider overrides
- scheduler limits
- project mode / workflow defaults
- provider chain configuration
- budget caps
- setup and runtime policy settings

### 7. Setup workstation

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

- start / resume setup
- start / stop / pause an orchestrator
- reprioritize epics or stories
- apply provider override policies
- raise or lower scheduler limits within allowed bounds
- approve or reject setup scaffold

### Mid-level controls

Actions scoped to work items:

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

For spec mutations, tracker synthesis, and setup chapter edits, the preferred control loop is:

1. Proposed change appears with rationale and provenance.
2. User comments, revises, or asks the agent to reason about it.
3. The system synthesizes a revised proposal.
4. User applies the change.

Not every edit needs ceremony. Direct editing remains valid. But synthesis-heavy mutations need a reviewable intermediate state.

## Chat interaction model

The workstation should borrow the strongest parts of modern high-performance chat tools without becoming "just another chat app."

What to borrow:

- a **fast, always-ready composer**
- immediate visual response on send
- stable streaming with minimal layout shift
- keyboard-first conversation flow
- compact, high-signal message rendering
- easy branch/thread continuation from prior context
- lightweight attachment of artifacts, spec fragments, or work-item context into the message

What not to borrow:

- making the transcript the only source of truth
- forcing planning, tracker editing, or observability into chat turns
- hiding structured state behind natural-language conversation

The chat surface is most useful for:

- steering a running session
- discussing a spec section or proposed synthesis
- asking the system to explain a decision
- iterating on comments before applying them to tracker/spec state
- targeted agent assistance while staying anchored to a selected project, story, or session

### Required chat qualities

The chat experience should feel operationally sharp:

- **optimistic send behavior**: the user's message appears immediately
- **incremental streaming**: chunks append smoothly rather than re-rendering the full transcript on every delta
- **context pinning**: the active project/story/session/spec section is visible and editable as chat scope
- **interruptibility**: stop generation, retry, branch, or continue from a prior message
- **history durability**: every useful exchange can be replayed or linked back to the underlying object it affected
- **artifact-aware**: attach logs, proofs, diffs, comments, or exact run outputs into the conversation without copy-paste gymnastics
- **inline-media-aware**: embed screenshots, mockups, and visual diffs inline from the artifact picker when the comment or chat thread needs them

### Composer behavior

The composer should behave more like a professional tool than a generic textarea:

- autosize within tight bounds
- keyboard send by default, newline via modifier
- slash-style quick actions for common intents (`/steer`, `/explain`, `/comment`, `/apply`, `/stop`)
- visible scope chips for the current target (`project`, `epic`, `story`, `session`, `spec section`)
- drop targets or picker affordances for artifacts and context objects
- preserved draft state per target where practical

### Streaming behavior

Streaming should optimize for legibility and perceived speed:

- append tokens/chunks in place instead of repainting the whole message list
- separate `text`, `thinking` when enabled, `tool_call`, `tool_result`, and `usage` blocks clearly
- allow the user to collapse verbose tool output and reasoning by default
- keep scroll behavior predictable: follow while at bottom, do not yank the viewport when the user has scrolled away
- show partial responses immediately, even if richer metadata arrives later

### Chat in the workstation layout

Chat should usually live as one surface among several:

- docked inspector tab
- bottom conversation drawer
- right-rail discussion pane
- dedicated workbench mode when the user wants a chat-led flow

The default shell should not force chat open at all times. The system is broader than the transcript.

## Real-time model

The workstation is live by default, backed by persisted history.

It should combine:

- SSE event subscriptions for state change and live tails
- per-turn chunk streams for agent output
- polling only where appropriate for bounded summaries or Prometheus-style metrics
- replay from durable logs for reconnect, rewind, and post-mortem inspection

Live views include:

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
- **Operator**: tree + board/list + session detail + control rail
- **Inspector**: tree + transcript/log + artifacts + metrics
- **Setup**: tree + question/review panel + background research + status rail

Customization should be constrained:

- users may rearrange and resize panels
- users may pin preferred surfaces
- the system should ship opinionated presets
- layout freedom must not make onboarding or support impossible

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
8. **Customization is allowed but bounded by opinionated defaults.**
9. **If the workstation needs it, the API must expose it.**

See: `api.md`, `setup.md`, `metrics.md`, `work-tracker.md`, `VISION.md`, `DESIGN_BRIEF.md`.
