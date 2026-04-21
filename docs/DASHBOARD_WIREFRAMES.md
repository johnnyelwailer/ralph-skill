# Dashboard Wireframe Variants

> Early workstation mockups for the richer dashboard direction. These are intentionally low-fidelity so layout, information hierarchy, and operator workflows can be compared before visual polish.

## Reference pulled from `agent/trunk`

The old dashboard implementation on `agent/trunk` is a useful baseline, not the target:

- path: `aloop/cli/dashboard/`
- primary shell: session hierarchy sidebar + central session/activity pane + right docs panel
- built surfaces: live activity log, doc viewer, artifact viewer, cost display, provider health, steering box, stop controls
- old product language: "repo > project > issue > session" hierarchy and real-time SSE updates

What it did well:

- strong session inspector
- obvious live steering surface
- useful three-pane operator shell

What it did not yet cover well enough for the current vision:

- tracker/kanban planning as a first-class surface
- rich setup experience
- project-wide command center beyond one selected session
- deeper configurable workstation layouts

## Variant A — Operator Tri-Pane

Best when the user spends most of the day supervising active work and drilling into one story/session at a time.

```text
+------------------------------------------------------------------------------------------------------------------+
| Top Bar: Project switcher | Global search | Provider health | Cost today | Scheduler | Alerts | Command palette |
+------------------------------------------------------------------------------------------------------------------+
| Sidebar Tree              | Main Work Surface                                        | Inspector Rail            |
|---------------------------|----------------------------------------------------------|---------------------------|
| Home                      | Tabs: Overview | Board | Sessions | Spec | Artifacts     | Selected Story / Session  |
| Projects                  |                                                          |---------------------------|
|  > Project Alpha          |  If Overview:                                            | Phase / workflow          |
|    > Overview             |  - active orchestrator summary                           | Iteration / status        |
|    > Setup                |  - progress by epic                                      | Provider / cost           |
|    > Tracker              |  - child-session matrix                                  | Queue / steering          |
|      > Epics              |                                                          | Last commits              |
|      > Stories            |  If Board:                                               | Validation + gates        |
|      > Board              |  - kanban lanes by story                                 | Artifacts preview         |
|    > Runtime              |                                                          | Comments / discussion     |
|      > Orchestrators      |  If Sessions:                                            |                           |
|      > Sessions           |  - active session list                                   |                           |
|      > Artifacts          |  - selected session transcript / event tail              |                           |
|    > Observability        |                                                          |                           |
|    > Config               |  If Spec:                                                |                           |
| Recent                    |  - chapter/doc review with comment threads               |                           |
+---------------------------+----------------------------------------------------------+---------------------------+
| Bottom Composer: steer / comment / ask agent / apply proposal / stop / force stop                             |
+------------------------------------------------------------------------------------------------------------------+
```

Why it works:

- keeps the old `agent/trunk` session-inspector strength
- adds tracker/spec as peer tabs instead of hiding them
- preserves a persistent control rail for fine-grained action

Tradeoffs:

- board and session views compete for the same main surface
- less ideal for comparing multiple sessions at once

## Variant B — Mission Control

Best when the user wants a global command center first and only drills down second.

```text
+------------------------------------------------------------------------------------------------------------------+
| Top Bar: Project | Mode | Cost cap status | Provider cooldowns | Keeper rate | Burn rate | Active alerts          |
+------------------------------------------------------------------------------------------------------------------+
| Left Nav                  | Center Grid: Real-Time Operations                     | Right Rail                 |
|---------------------------|--------------------------------------------------------|----------------------------|
| Tree / filters            | +----------------------+---------------------------+ | Inbox / Discussion         |
| Saved views               | | Orchestrator status  | Provider health / quota   | |----------------------------|
|  - All active             | +----------------------+---------------------------+ | Human comments waiting     |
|  - Blocked stories        | | Epic progress        | Session throughput        | Agent questions            |
|  - High spend             | +----------------------+---------------------------+ | Proposed syntheses         |
|  - Setup pending          | | Child-session board  | Recent merges / failures  | Needs approval             |
|                           | +----------------------------------------------------+ |                            |
|                           | | Live event stream / diagnose feed                  | |                            |
|                           | +----------------------------------------------------+ |                            |
+---------------------------+--------------------------------------------------------+----------------------------+
| Docked Detail Drawer: selected epic/story/session opens here without leaving the main control view              |
+------------------------------------------------------------------------------------------------------------------+
| Bottom Action Bar: reprioritize | override provider | pause dispatch | create story | open selected details      |
+------------------------------------------------------------------------------------------------------------------+
```

Why it works:

- strongest high-level operating model
- best fit for multi-provider, multi-session supervision
- makes cost, quota, and permits co-equal with delivery progress

Tradeoffs:

- weaker default storytelling for one selected session
- can become noisy if every panel streams simultaneously

## Variant C — Builder Workbench

Best when the workstation should feel closer to Codex/Conductor/T3 Chat style tooling: one central work object, one live chat/log thread, one adaptable dock system. This is the most natural candidate for the `ElectroBun` app shell.

```text
+------------------------------------------------------------------------------------------------------------------+
| Top Tabs: Project Overview | Story Board | Session Workbench | Setup | Config                                   |
+------------------------------------------------------------------------------------------------------------------+
| Left Stack                 | Center Canvas                                       | Right Dock                  |
|---------------------------|------------------------------------------------------|-----------------------------|
| Hierarchy tree            | Selected object canvas                               | Dock tabs:                  |
| Backlog mini-list         |------------------------------------------------------| - Chat / stream             |
| Favorites                 | If Story Board: board/list hybrid                    | - Session details           |
|                           | If Session Workbench: transcript + exact run output  | - Artifacts                 |
|                           | If Setup: question/review workspace                  | - Metrics                   |
|                           |                                                      | - Comments                  |
|                           |                                                      |                             |
+---------------------------+------------------------------------------------------+-----------------------------+
| Bottom Dock                                                                                                     |
|---------------------------------------------------------------------------------------------------------------|
| Open panes: event tail | commits | test output | proof diffs | provider trace | queue items                   |
+------------------------------------------------------------------------------------------------------------------+
```

Why it works:

- feels like a serious desktop tool, not a static admin dashboard
- supports rich, customizable multi-pane work
- most natural home for streaming agent chat alongside non-chat surfaces
- maps cleanly to native desktop affordances like multi-window, global shortcuts, notifications, and docked utility panes

T3-style interaction traits to explicitly preserve here:

- always-hot composer with minimal chrome
- smooth chunk streaming without transcript jank
- keyboard-first thread navigation and send/retry/interrupt
- scoped chat attached to the selected project/story/session rather than a global undifferentiated thread
- lightweight context attachment for artifacts, diffs, logs, and spec sections
- collapsed-by-default tool noise so the main reply stays readable

Tradeoffs:

- easiest variant to over-engineer
- needs strong defaults or it becomes a blank-canvas docking app

## Variant D — Setup and Spec Studio

Best if setup and spec collaboration are important enough to deserve a purpose-built mode rather than being a tab inside the runtime shell.

```text
+------------------------------------------------------------------------------------------------------------------+
| Header: Setup run | stage | readiness verdict | blocking ambiguities | save/progress                              |
+------------------------------------------------------------------------------------------------------------------+
| Left Outline                | Main Review Surface                                 | Right Context Rail          |
|----------------------------|------------------------------------------------------|-----------------------------|
| Repository discovery       | Current step                                         | Background research status  |
| Interview topics           |------------------------------------------------------| Ambiguity ledger            |
| Chapters                   | Structured question set                              | Verification checklist      |
| Draft docs                 | or                                                   | Suggested defaults          |
| Verification               | chapter/spec review with inline comments             |                             |
| Bootstrap                  | or                                                   |                             |
|                            | synthesized proposal + apply/revise controls         |                             |
+----------------------------+------------------------------------------------------+-----------------------------+
| Bottom Composer: answer question / leave comment / ask agent to reason / approve scaffold                      |
+------------------------------------------------------------------------------------------------------------------+
```

Why it works:

- gives setup the richness it needs
- cleanest place for comment-before-apply and ambiguity handling
- lowers risk that setup gets treated as a second-class wizard

Tradeoffs:

- more mode-switching between setup and runtime
- not the best default shell once the project is running continuously

## Comparison

| Variant | Best for | Strength | Risk |
|---|---|---|---|
| A. Operator Tri-Pane | daily supervision of one active project | balanced runtime + planning | can feel tab-heavy |
| B. Mission Control | multi-session / multi-provider oversight | strongest global visibility | session detail is secondary |
| C. Builder Workbench | desktop-app workstation feel | richest and most flexible | complexity / customization sprawl |
| D. Setup and Spec Studio | onboarding and spec collaboration | best setup UX | split mental model |

## Recommended direction

The strongest path is probably a hybrid:

- **default shell from Variant A**
- **overview panels from Variant B**
- **dockable inspector + fast chat ideas from Variant C**
- **setup mode from Variant D**

That would preserve the proven `agent/trunk` three-pane monitoring DNA while extending it into the fuller workstation you described.

## Suggested next step

Pick one of these as the primary shell, then I can convert it into:

1. a more concrete screen map with named panels and navigation states
2. a clickable component inventory aligned to the React app
3. a higher-fidelity mockup set for desktop and mobile
