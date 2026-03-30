# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| compile-loop-plan: loopSettings embedded from pipeline.yml | 2026-03-30 | 66abdb0 | PASS | triage_interval, scan_pass_throttle_ms, rate_limit_backoff all present in loop-plan.json; concurrency_cap absent by design (orchestrator-only) |
| loop.sh: orchestrator settings NOT loaded | 2026-03-30 | 66abdb0 | PASS | TRIAGE_INTERVAL, SCAN_PASS_THROTTLE_MS, RATE_LIMIT_BACKOFF confirmed absent from installed loop.sh |
| resolveOrchestratorSettingsFromConfig: reads from pipeline.yml | 2026-03-30 | 66abdb0 | PASS | All 4 settings read correctly; CLI overrides work; defaults apply when no loop: section |
| concurrency_cap: pipeline.yml loop: section | 2026-03-30 | 66abdb0 | PASS | Default=3 when absent; overrides to custom value when set; partial loop: section merges correctly |
