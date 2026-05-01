# Refinement and Decision Prompt Contract

> **Reference document.** Shared prompt behavior for ambiguity handling, issue refinement, contradiction handling, and variant exploration across setup and runtime. This is **not** a new daemon subsystem. It is a prompt-level contract implemented using the existing orchestration architecture, triggers, submit types, and workflows.
>
> Hard rules live in `CONSTITUTION.md`. Runtime orchestration lives in `orchestrator.md`. Setup-specific gating lives in `setup.md`.

## Why this exists

Setup and runtime already share the same orchestration model. The missing piece is a **shared prompt discipline** for what to do when requirements are incomplete, contradictory, or changed while work is already in flight.

This document defines that discipline.

It applies when the triggering signal is:

- initial setup discovery
- a change request
- an edited spec chapter
- a human comment on an Epic or Story
- an implementation discovery from a running child
- a review finding that reveals a contradiction or missing requirement

The system should not become a dark factory. When the requirements are unclear, it should:

- ask for feedback through the existing human channels
- propose concrete variants instead of asking vague questions
- keep unaffected work moving
- explore safe variants in parallel when useful
- produce evidence such as screenshots, diffs, and preview links
- react when the human steers later, even days later

## Scope

This is a **prompt contract**, not a new runtime primitive.

It reuses:

- existing setup and orchestrator workflows
- existing trigger routing
- existing submit types such as `refine_result`, `decompose_result`, `conversation_result`, `review_result`, and `proof_result`
- existing tracker comments, follow-up work items, and child-session dispatch

No new daemon subsystem is required to adopt this behavior.

## Shared reasoning steps

Any prompt covered by this contract should perform the following reasoning when it detects uncertainty, contradiction, or requirement drift.

### 1. Classify the problem

Choose the dominant category:

- `missing_required` — a necessary requirement is absent
- `conflict` — two requirements or signals disagree
- `low_confidence` — one interpretation is plausible but weakly supported
- `broad_answer` — the human answer allows materially different implementations
- `change_request` — scope or priority changed after previous refinement
- `implementation_discovery` — the codebase revealed a constraint the spec did not account for

### 2. Determine blast radius

Decide exactly what is affected:

- only the current task
- one Story
- one Epic
- multiple linked Stories
- the whole setup/runtime plan

Then decide the blocking level:

- `blocks_generation` — setup cannot scaffold honestly
- `blocks_dispatch` — do not start new children for the affected work
- `blocks_merge` — exploratory or partial work may continue, but nothing lands yet
- `non_blocking` — safe to continue while asking for clarification

### 3. Separate safe work from decision-bound work

Prompts should split:

- work that is still valid under all plausible interpretations
- work that depends on the unresolved decision
- exploratory work that can be done in parallel to make the decision easier

Unrelated Stories should not be paused just because one branch is unclear.

### 4. Produce concrete options

When asking the user for feedback, prompts should avoid open-ended “please clarify” requests when concrete options can be proposed.

Each option should include:

- the interpretation
- what changes in behavior or UX
- implementation implications
- risk or cost
- whether it is reversible or feature-flaggable

### 5. Bias toward evidence

Where useful, prompts should convert abstract disagreement into visible evidence:

- screenshots
- visual diffs
- API examples
- benchmark outputs
- preview deployment links when the project can produce them; setup makes this the default for deployable projects unless the project explicitly opts out

For UI uncertainty, screenshot-backed comparison is preferred over prose-only explanation.

### 6. Record a recommendation

The prompt should not be passive. It should state:

- the preferred option
- why it is preferred
- what confidence it has
- what new information would change the recommendation

## Prompt responsibilities

The existing prompt set is sufficient for a first pass. The behavior should be added to existing prompts before introducing new ones.

### `setup_judge`

Owns the authoritative readiness verdict during setup.

Under this contract it should:

- classify ambiguities using the shared categories above
- distinguish blocking from advisory issues
- prefer deeper research before asking the user when the repo can answer the question
- ask only questions that materially change setup output or policy

### `setup_questioner`

Should ask for clarification only after the ambiguity has been narrowed enough to present decision-grade options.

Questions should:

- be concrete
- describe tradeoffs
- avoid broad “what do you want?” prompts when 2–3 serious interpretations exist

### `setup_spec_writer` and related draft prompts

Should revise drafts in response to comments by:

- preserving decision context
- carrying unresolved alternatives forward visibly
- showing what changed because of the comment

### `orch_refine`

This is the main runtime refinement prompt and should absorb most of the new behavior.

It should:

- detect ambiguity, contradiction, and stale assumptions during Epic/Story refinement
- decide whether the issue is dispatchable as-is
- split safe work from decision-bound work
- create follow-up Stories when one Story actually contains multiple viable variants or concerns
- prefer fewer, cleaner Stories over speculative over-decomposition
- mark exploratory work as such in the Story body/metadata

When a UI or behavior question is unresolved, `orch_refine` should prefer:

- one enablement Story for shared plumbing that is valid across variants
- one or more variant Stories for competing realizations
- a human-facing comment that compares the options and recommends one

### `orch_conversation`

This is the primary human-facing runtime clarification prompt.

It should:

- reply with concrete options, not just acknowledge comments
- summarize what changed since the last decision
- point at evidence from running or completed exploratory Stories
- recommend an option when the system has enough evidence
- use existing actions such as `reply`, `refine_again`, `decompose_again`, `pause_dispatch_for`, `inject_into_child`, and `file_followup`

`orch_conversation` is also the place to react to delayed feedback on long-running work. A human answer arriving days later should still be enough to re-route work cleanly.

### `plan`

Inside a child session, `plan` should detect when a Story is not actually implementation-ready even if it was previously marked ready.

It should:

- add narrowly scoped follow-up tasks for safe work that remains valid
- avoid inventing behavior to fill a spec gap
- surface decision-bound gaps back to the orchestrator through existing review/refine paths rather than burying them in local tasks

### `proof`

When the story is exploratory or variant-driven, `proof` becomes central.

It should:

- capture comparison-friendly artifacts
- keep naming and views stable across variants where possible
- produce concise summaries that can be pasted into tracker comments

### `review` and `spec-review`

These prompts should block approval when a change quietly chooses one unresolved variant without the decision being made explicit.

They should reject:

- hidden policy choices
- UX choices presented as if they were specified when they were not
- contradictions between the implemented behavior and the currently recommended option

### `orch_diagnose`

This prompt should remain focused on anomalies and self-healing.

It may route work toward refinement, but it should not become the main decision-making prompt for product or UX ambiguity.

## When to add a new prompt

Start by changing existing prompts.

Add a new prompt only if one of these becomes true:

- `orch_refine` becomes overloaded with both decomposition and human-decision synthesis
- `orch_conversation` becomes too large because it mixes reply-writing with variant comparison
- a distinct recurring workflow emerges, such as formal side-by-side variant comparison

If that happens, the first candidate new prompt is:

- `orch_decision` — a focused orchestrator prompt that synthesizes options, recommendation, and evidence for one unresolved decision

That prompt would still live entirely inside the existing orchestration architecture.

## Recommended first iteration

Do **not** add new prompt names yet.

First update:

- `orch_refine`
- `orch_conversation`
- `setup_judge`
- `setup_questioner`
- `plan`
- `proof`
- `review`
- `spec-review`

That is enough to test the behavior end-to-end before introducing any new prompt files or daemon contracts.

## Example: change request arrives mid-flight

1. A change request lands while Stories are already running.
2. `orch_refine` re-evaluates affected Stories.
3. Unaffected Stories continue.
4. Affected Stories are split into:
   - safe work that can continue
   - decision-bound work that should pause or stay draft-only
   - exploratory variant work that can run now
5. Variant work produces screenshots or other proof artifacts.
6. `orch_conversation` posts a comparison comment with recommendation.
7. The human replies later.
8. The orchestrator re-routes or resumes based on that reply.

The key invariant is simple: **do not wait idly, but do not silently decide what should stay human-steerable.**
