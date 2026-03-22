# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| CLI build & npm pack install | 2026-03-22 | 59b8999 | PASS | Build succeeds, binary runs, version prints correctly |
| `aloop orchestrate --help` | 2026-03-22 | 59b8999 | PASS | All expected flags present |
| `aloop orchestrate --plan-only` | 2026-03-22 | b82c1e3 | PASS | Creates session, initializes state files correctly |
| Review prompt template (`PROMPT_orch_review.md`) | 2026-03-22 | 59b8999 | PASS | Uses `comments` array with path/line/body/suggestion fields, clear JSON schema |
| Test: rejects PR when agent review requests changes | 2026-03-22 | 59b8999 | PASS | Formal review API assertions pass, adapter injection works |
| Test: stores individual review comments with IDs | 2026-03-22 | 59b8999 | PASS | Comment IDs stored for builder redispatch |
| Test: flags for human when agent review flags | 2026-03-22 | 59b8999 | PASS | Human flag path works |
| Test: reviewPrDiff flags for human when diff fetch fails | 2026-03-22 | 59b8999 | PASS | Fixed — was returning `pending`, now returns `flag-for-human` |
| Test: checkPrGates handles gh errors for mergeability | 2026-03-22 | 59b8999 | PASS | Fixed — was returning `pass`, now returns `fail` |
| Test: normalizeAgentReviewResult parsing | 2026-03-22 | 59b8999 | PASS | 3/3 tests pass — valid with comments, valid without, malformed rejection |
| Test: auto-approves when no agent reviewer configured | 2026-03-22 | 59b8999 | PASS | Auto-approve path works |
| Test: delegates to agent reviewer when configured | 2026-03-22 | 59b8999 | PASS | Delegation path works |
| All PR lifecycle tests (checkPrGates + reviewPrDiff + processPrLifecycle) | 2026-03-22 | 59b8999 | PASS | 25/25 tests pass |
