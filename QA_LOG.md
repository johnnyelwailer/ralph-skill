# QA Log

## QA Session — 2026-03-21 (iteration 16)

### Binary Under Test
- Path: `/tmp/aloop-test-install-JBlCQu/bin/aloop`
- Version: 1.0.0
- Installed via: `npm --prefix aloop/cli run test-install -- --keep`

### Test Environment
- Isolated test project: `/tmp/qa-test-134`
- Features tested: 5 (CLI structure, status, discover, start/stop lifecycle, dashboard)
- Commit: 873e94b

### Results
- PASS: aloop --help (all README commands present)
- PASS: aloop status (text + json output)
- PASS: aloop discover (correct detection of spec, providers, mode recommendation)
- PASS: aloop start + stop lifecycle (session starts, shows in status, stops cleanly)
- PASS: aloop scaffold (creates project config)
- PASS: aloop dashboard (starts on custom port 4099)
- PASS: aloop orchestrate --help (expected flags)
- PASS: aloop gh --help (expected subcommands)
- PASS: Error paths — stop/steer without args, stop nonexistent session
- NOT IMPL: Inline review comment posting (spec feature, TODO not complete)
- NOT IMPL: Builder thread resolution (spec feature, TODO not complete)

### Bugs Filed
None — all tested features pass. Core spec features (inline review posting, thread resolution) are not yet implemented per TODO.md.

### Notes on Issue #134 Scope
The three completed tasks in TODO.md are internal/foundational:
1. `AgentReviewResult` type extended with `InlineReviewComment[]` — internal type change
2. Review prompt updated for structured inline output — prompt template change
3. `invokeAgentReview` parser handles inline comments — internal parsing logic

These are not directly user-testable from CLI. The user-facing features (posting inline PR reviews, builder resolving threads) are still marked as TODO. No regressions detected in existing functionality.

### Command Transcript

```
$ aloop --help
→ EXIT 0, shows all expected commands (start, orchestrate, dashboard, status, stop, setup, steer, gh, discover, update, devcontainer)

$ aloop status
→ EXIT 0, shows 4 active sessions + provider health (gemini in cooldown, others healthy)

$ aloop status --output json
→ EXIT 0, valid JSON with sessions[] and health{}

$ aloop orchestrate --help
→ EXIT 0, shows --spec, --concurrency, --trunk, --issues, --label, --budget, --plan-only flags

$ aloop gh --help
→ EXIT 0, shows start, watch, status, stop, pr-create, pr-comment, pr-merge subcommands

$ aloop steer (no args)
→ EXIT 1, "error: missing required argument 'instruction'"

$ aloop stop (no args)
→ EXIT 1, "error: missing required argument 'session-id'"

$ aloop stop nonexistent-session-id
→ EXIT 1, "Session not found: nonexistent-session-id"

$ cd /tmp/qa-test-134 && aloop discover
→ EXIT 0, detected SPEC.md, git repo, all 5 providers, recommended loop mode

$ cd /tmp/qa-test-134 && aloop scaffold
→ EXIT 0, created project config at ~/.aloop/projects/a46a5515/

$ cd /tmp/qa-test-134 && aloop start --provider claude --max-iterations 1
→ EXIT 0, session qa-test-134-20260321-142018 started, PID 1374199, dashboard on port 35829

$ aloop status | grep qa-test-134
→ Shows session running, iter 1, plan phase

$ aloop stop qa-test-134-20260321-142018
→ EXIT 0, "Session qa-test-134-20260321-142018 stopped."

$ aloop status | grep qa-test-134
→ No output (session removed from active list)

$ aloop dashboard --port 4099 --session-dir <session-dir>
→ Starts, prints port/session info, served until timeout killed it (EXIT 124)
```

### Cleanup
- Removed `/tmp/qa-test-134`
- Removed test session directory
- Removed test project config
- Removed install prefix `/tmp/aloop-test-install-JBlCQu`
