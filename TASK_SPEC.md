# Sub-Spec: Issue #101 — Proof artifact storage, baseline management, and manifest validation

## CRITICAL: Constitution Rule #1

**HARD RULE: Nothing may be added to loop.sh or loop.ps1. Any PR that touches these files must reduce their line count.** All new logic belongs in the runtime (`process-requests.ts`, `orchestrate.ts`). The existing `mkdir` in loop.sh must be MOVED OUT to the runtime, not kept.

## Objective

Implement runtime infrastructure for proof artifact storage: directory creation before proof agent runs, baseline directory initialization, post-proof manifest existence checks, and expanded subagent delegation hints.

## Where Logic Lives

| Behavior | Where | NOT |
|---|---|---|
| `mkdir artifacts/iter-N/` before proof phase | `process-requests.ts` (runs between iterations) | ~~loop.sh~~ |
| `mkdir artifacts/baselines/` at session init | `orchestrate.ts` `createChildWorktreeAndSession` | ~~loop.sh~~ |
| Post-proof manifest existence check | `process-requests.ts` | ~~loop.sh~~ |
| Existing `mkdir -p` at loop.sh:2300 | **REMOVE from loop.sh**, move to `process-requests.ts` | — |

## In Scope

- `aloop/cli/src/commands/process-requests.ts` — pre-iteration dir setup, post-proof manifest check, log entry
- `aloop/cli/src/commands/orchestrate.ts` — `artifacts/baselines/` in child session setup
- `aloop/templates/subagent-hints-proof.md` — expand with vision-model delegation examples
- `aloop/bin/loop.sh` — **REMOVE** existing mkdir at line 2300. Net line count MUST decrease.
- `aloop/bin/loop.ps1` — equivalent removal. Net line count MUST decrease.

## Out of Scope

- `proof-manifest.json` JSON validation — runtime, separate issue
- Baseline promotion — runtime, separate issue
- Skip-protocol detection — runtime, separate issue
- Dashboard artifact serving — separate issue

## Acceptance Criteria

- [ ] `artifacts/iter-N/` exists before provider invoke for proof iterations (created by runtime)
- [ ] `artifacts/baselines/` created at session init by `orchestrate.ts`
- [ ] Post-proof manifest existence check in runtime, warning log if missing
- [ ] `{{ARTIFACTS_DIR}}` and `{{ITERATION}}` resolve correctly (no regression)
- [ ] `subagent-hints-proof.md` expanded with vision-model delegation examples
- [ ] **loop.sh net line count decreased** (removed mkdir, no additions)
- [ ] **loop.ps1 net line count decreased** (equivalent removal)
- [ ] No JSON parsing in loop scripts
- [ ] No baseline promotion in loop scripts
