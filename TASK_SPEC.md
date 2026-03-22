# Sub-Spec: Issue #111 — Child loops must auto-push to remote and link branch to GH issue

## Problem

Child loops work in local git worktrees on branch `aloop/issue-N` but never push to origin. The completed work is invisible on GitHub — no linked branch, no PR.

## Required behavior

1. **Auto-push after each commit** — child loop.sh should push to origin after every successful iteration that commits. Use `git push -u origin aloop/issue-N`.

2. **Link branch to GH issue** — when child is dispatched and branch is created, the orchestrator should create a "development branch" link on the GH issue via the API. This shows up in the issue sidebar as "linked branch".

3. **Auto-create PR** — when child loop completes (state: completed), `process-requests` should create a PR from `aloop/issue-N` → `agent/trunk`. The PR body should reference the issue (`Closes #N`).

4. **PR gates** — the orchestrator scan pass already has PR lifecycle handling (`prLifecycleDeps`). Once the PR exists, it should go through CI gates, agent review, then merge.

## Current state

- `launchChildLoop` creates worktree with branch but never pushes
- `--backup` flag exists in loop.sh but creates a separate backup repo, not pushing to issue branch
- Child completion is detected by scan pass (`monitored=3`) but no PR is created
- All 3 completed children's work is stuck in local worktrees

## Implementation

Option A (simplest): Pass `--backup` to child loop.sh but modify backup logic to push to origin instead of creating a separate repo.

Option B (cleaner): Add a post-iteration hook in loop.sh that runs `git push origin HEAD` after each commit. No backup repo needed.

For PR creation: `process-requests` should detect completed children (child_session set, PID dead, status.json state=completed) and create PRs via `gh pr create`.
