# Sub-Spec: Issue #101 — Proof artifact storage, baseline management, and manifest validation

## Objective

Implement the runtime infrastructure for proof artifact storage: directory creation, baseline management, proof-manifest.json validation, and subagent delegation hints for vision-model review.

## Context

`PROMPT_proof.md` already exists (135 lines) and instructs the proof agent to save artifacts to `{{ARTIFACTS_DIR}}/iter-{{ITERATION}}/` and write `proof-manifest.json`. However, the loop scripts don't currently:
1. Create the artifacts directory structure before invoking the proof agent
2. Manage baselines (store per-session, update after review approval)
3. Validate the proof manifest after the agent exits
4. Resolve `{{ARTIFACTS_DIR}}` and `{{ITERATION}}` template variables

Existing subagent hints file `aloop/templates/subagent-hints-proof.md` (251 bytes) needs expansion with vision-model delegation guidance.

## Deliverables

- [ ] Loop scripts create `~/.aloop/sessions/<id>/artifacts/iter-<N>/` before proof agent runs
- [ ] Template variable resolution: `{{ARTIFACTS_DIR}}` → session artifacts path, `{{ITERATION}}` → current iteration number
- [ ] After proof agent exits, validate `proof-manifest.json` exists and has valid JSON structure
- [ ] Baseline management: `artifacts/baselines/` directory created per-session; after review approval, latest artifacts become new baselines
- [ ] Proof skip protocol: if manifest has empty `artifacts` array, log skip reason but don't treat as failure
- [ ] Expand `subagent-hints-proof.md` with vision-model delegation examples (reference `aloop/agents/opencode/vision-reviewer.md`)
- [ ] Both `loop.sh` and `loop.ps1` updated consistently

## Files

- `aloop/bin/loop.sh` (modify — proof artifact section)
- `aloop/bin/loop.ps1` (modify — proof artifact section)
- `aloop/templates/subagent-hints-proof.md` (modify — expand)

## Acceptance Criteria

- Artifacts directory created before proof agent invocation
- `proof-manifest.json` validated after proof phase
- Baselines stored per-session and updated after review approval
- Template variables resolved in proof prompt
- Skip protocol works (empty artifacts = success with log)
- Both shell scripts behave identically
