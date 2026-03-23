# Sub-Spec: Issue #170 — Redispatch failure handling — escalate after N attempts, don't spin or give up

## Problem

When redispatch fails (worktree creation, branch issues), it retries every scan pass forever, generating hundreds of error log entries.

## Required behavior

1. Track `redispatch_failures` count on the issue
2. After 3 failures: escalate
   - Post comment on GH issue: "Redispatch failed 3 times: {error}. Needs manual intervention."
   - Label issue with `aloop/needs-human`  
   - Set `redispatch_paused=true` — stop attempting
3. Resume when:
   - Human removes the `aloop/needs-human` label (detected by triage monitor)
   - Or human posts a comment with resolution
   - Or the blocking condition changes (worktree pruned, branch deleted)

Never silently give up. Never spin forever. Always escalate to human visibility.
