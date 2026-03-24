# Sub-Spec: Issue #169 — Change Request (CR) workflow — issues that update the spec

## Concept

Some issues (especially human-created ones) intentionally diverge from the current spec. These are Change Requests — they define NEW desired behavior that the spec doesn't yet describe.

## Objective

Implement the Change Request (CR) pipeline so that issues labelled `aloop/change-request` cause SPEC.md/SPEC-ADDENDUM.md to be updated **before** normal decomposition/refinement begins. The spec is then the source of truth for all downstream child loops, and the spec-gap agent never sees a divergence.

## Architectural Context

The orchestrator runtime is a data-driven event dispatch system:

- `pipeline.yml` → `orchestrator_events` section maps issue state filters to agent prompts (Constitution Rule 6). The runtime reads this at startup; no agent identities are hardcoded in TypeScript.
- `process-requests.ts` is the single host-side runtime entry point. It applies agent-produced result files, creates GH issues, and queues new prompt files into `queue/`. All spec mutations and git commits happen here — never inside an agent (Constitution Rule 4).
- `orchestrate.ts` owns the `OrchestratorIssue` type and GH issue preloading logic (line ~1146). Label detection happens during preload.
- Agent prompts live in `aloop/templates/`. Agents produce JSON output into `requests/` — the runtime consumes those files next cycle.
- Spec files (`SPEC.md`, `SPEC-ADDENDUM.md`) live in the project root. Commits to `agent/trunk` are made by `process-requests.ts` via `git` child processes, never by agents.

### CR State Machine

```
GH issue created with label aloop/change-request
  → is_change_request: true, cr_spec_updated: false, status: Needs refinement
  → pipeline.yml filter matches → PROMPT_orch_cr_analysis.md queued
  → Agent outputs cr-analysis-result-{N}.json (proposed spec changes)
  → process-requests.ts Phase 1:
      autonomous:     apply changes to SPEC.md/SPEC-ADDENDUM.md, git commit on agent/trunk
                      mark cr_spec_updated: true
      non-autonomous: post spec diff as GH comment, add aloop/blocked-on-human label,
                      set blocked_on_human: true (do not apply yet)
  → (after cr_spec_updated: true) normal refine/estimate filters pick up the issue
  → Child loops work against the updated spec
```

The spec-gap agent runs inside child loop finalizers against the already-updated spec, so it will never flag a CR issue as divergent — no changes to PROMPT_spec-gap.md are needed.

## Scope

Files permitted for modification:

| File | Change |
|---|---|
| `aloop/cli/src/commands/orchestrate.ts` | Extend `OrchestratorIssue` with `is_change_request?: boolean` and `cr_spec_updated?: boolean`. Detect `aloop/change-request` label during GH issue preload (around line 1146). |
| `aloop/cli/src/commands/process-requests.ts` | Phase 1 handler for `cr-analysis-result-{N}.json` files: apply spec changes (autonomous) or post comment + block (non-autonomous); set `cr_spec_updated: true`. |
| `aloop/templates/PROMPT_orch_cr_analysis.md` | **New file.** CR analysis agent prompt — reads issue body + SPEC.md + SPEC-ADDENDUM.md, proposes spec additions/changes as a structured diff. |
| `.aloop/pipeline.yml` | Add `cr_analysis` entry to `orchestrator_events` with filter `is_change_request: true, cr_spec_updated: false`. |
| `aloop/cli/src/commands/process-requests.test.ts` | Tests for CR result file processing — both autonomous apply and non-autonomous block paths. |
| `aloop/cli/src/commands/orchestrate.test.ts` | Tests for `is_change_request` detection from GH labels. |

## Out of Scope

- `aloop/bin/loop.sh` and `aloop/bin/loop.ps1` — Constitution Rule 1: loop runners are dumb, no business logic.
- `SPEC.md` and `SPEC-ADDENDUM.md` — modified at runtime by the orchestrator, not by this implementation PR.
- `aloop/templates/PROMPT_spec-gap.md` — no change needed; the CR pipeline ensures spec is updated before any child loop runs.
- `aloop/templates/PROMPT_orch_spec_consistency.md` — existing housekeeping agent; can be invoked by future follow-up after CR spec commits but is out of scope here.
- Any UI/dashboard files — this is a pure orchestrator runtime feature.

## Constraints

- **Constitution Rule 1**: No CR logic enters `loop.sh`/`loop.ps1`.
- **Constitution Rule 4**: The CR analysis agent writes a `requests/cr-analysis-result-{N}.json` file expressing intent. `process-requests.ts` decides whether and how to apply the spec changes. Agents never call `git`, `gh`, or write to SPEC.md directly.
- **Constitution Rule 5**: All side effects (spec file changes, git commits, GH comments, label updates) flow through result files consumed by the runtime, or are performed directly by the runtime — not by agents.
- **Constitution Rule 6**: The `cr_analysis` event must be declared in `pipeline.yml` `orchestrator_events`, not hardcoded in TypeScript. The runtime must remain agent-agnostic.
- **Constitution Rule 7**: `process-requests.ts` is already large. The CR result handler should be a focused block parallel to the existing `refine-result` handler (lines 210–230). If the file exceeds 150 LOC after additions, extract a `cr-pipeline.ts` helper.
- **Constitution Rule 12**: This issue implements CR pipeline mechanics only. Spec-gap CR awareness, CR-triggered replan, and UI indicators for CR status are separate concerns.

### CR Analysis Result Schema

The agent must output:
```json
{
  "issue_number": 169,
  "spec_changes": [
    {
      "file": "SPEC.md",
      "section": "3.2 Queue Priority",
      "action": "add" | "modify" | "remove",
      "content": "<new or replacement section text>",
      "rationale": "<why this change is needed>"
    }
  ],
  "summary": "<one-line description of what the spec change adds>"
}
```

The runtime applies each change sequentially. For `add`: append to the specified file. For `modify`: replace the named section. For `remove`: delete the named section. If the section cannot be located, the runtime skips that change and logs a warning (does not fail).

### pipeline.yml Addition

```yaml
  cr_analysis:
    prompt: PROMPT_orch_cr_analysis.md
    batch: 2
    filter:
      is_change_request: true
      cr_spec_updated: false
    result_pattern: "cr-analysis-result-{issue_number}.json"
```

The filter uses the existing data-driven matching in `loadOrchestratorEvents` / the scan loop (lines 269–296 of `process-requests.ts`). `is_change_request` and `cr_spec_updated` must be present on `OrchestratorIssue` for the filter to evaluate correctly.

## Acceptance Criteria

- [ ] `pipeline.yml` contains a `cr_analysis` entry under `orchestrator_events` with the filter above.
- [ ] `OrchestratorIssue` type has `is_change_request?: boolean` and `cr_spec_updated?: boolean` fields.
- [ ] During GH issue preload in `orchestrate.ts`, an issue with label `aloop/change-request` gets `is_change_request: true` in state.
- [ ] A `cr-analysis-result-{N}.json` file placed in `requests/` is processed by `process-requests.ts` on the next cycle:
  - In `autonomous` mode: spec changes are applied to SPEC.md/SPEC-ADDENDUM.md and committed to `agent/trunk`; `cr_spec_updated` is set to `true`.
  - In non-autonomous mode: a comment is posted on the GH issue with the proposed spec diff; `aloop/blocked-on-human` label is added; `blocked_on_human` is set to `true`; `cr_spec_updated` remains `false`.
- [ ] After `cr_spec_updated: true`, the issue transitions normally into the `refine` pipeline (existing filter matches it).
- [ ] `PROMPT_orch_cr_analysis.md` exists and instructs the agent to output the JSON schema above.
- [ ] Unit tests cover: CR label detection in preload, autonomous apply path, non-autonomous block path.
- [ ] `process-requests.ts` stays ≤ 150 LOC after changes (or a helper module is extracted per Constitution Rule 7).
- [ ] No changes to `loop.sh`, `loop.ps1`, `PROMPT_spec-gap.md`.

