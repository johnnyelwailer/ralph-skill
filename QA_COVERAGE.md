# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| compile-loop-plan: loopSettings embedded from pipeline.yml | 2026-03-30 | 66abdb0 | PASS | triage_interval, scan_pass_throttle_ms, rate_limit_backoff all present in loop-plan.json; concurrency_cap absent by design (orchestrator-only) |
| loop.sh: orchestrator settings NOT loaded | 2026-03-30 | 66abdb0 | PASS | TRIAGE_INTERVAL, SCAN_PASS_THROTTLE_MS, RATE_LIMIT_BACKOFF confirmed absent from installed loop.sh |
| resolveOrchestratorSettingsFromConfig: reads from pipeline.yml | 2026-03-30 | 66abdb0 | PASS | All 4 settings read correctly; CLI overrides work; defaults apply when no loop: section |
| concurrency_cap: pipeline.yml loop: section | 2026-03-30 | 66abdb0 | PASS | Default=3 when absent; overrides to custom value when set; partial loop: section merges correctly |
| provider_timeout: compile→load chain (P2 fix) | 2026-03-30 | 89534441b | PASS | In numFields (compile-loop-plan.ts:310), in LoopSettings interface (line 19), in both loop.sh mappings (lines 306/360), unit test asserts value 10800 (line 895). Static verification only (bash broken). |
| concurrency_cap: removed from LoopSettings interface (P3 fix) | 2026-03-30 | 89534441b | PASS | No occurrences in compile-loop-plan.ts. Dead code removed per CONSTITUTION rule 13. |
| backoff strategies: unit tests (exponential/linear/fixed) | 2026-03-30 | 89534441b | PASS | 3 tests in orchestrate.test.ts:4600-4659. Dependency injection pattern correct. |
| SPEC.md loop-plan.json example: loopSettings field | 2026-03-30 | 9068180 | PASS | All 13 fields present at lines 3654-3669 with correct values; conditionally-present note added at line 3673. Fixed by commit 4ddcaf2f6. |
| loopSettings in loop-plan.json: .aloop/pipeline.yml loop: section | 2026-03-30 | 9068180 | PASS | Full integration test: 6 custom values (triage_interval=12, scan_pass_throttle_ms=55000, rate_limit_backoff=exponential, provider_timeout=7200, max_iterations=10, max_stuck=5) all correctly emitted. |
| loopSettings absent when no loop: section | 2026-03-30 | 9068180 | PASS | No .aloop/pipeline.yml → loopSettings absent from loop-plan.json. Conditional emission verified. |
| README.md hot-reload documentation (Gate 9, lines 109/113) | 2026-03-30 | 64d93fd43 | PASS | Line 109 correctly states loop-plan.json at startup, meta.json hot-reloaded each iteration. Line 113 consistent. Fixed in commit 9d4c7bbe0. Re-test PASS. |
| README.md concurrency_cap placement (Gate 9, line 130) | 2026-03-30 | 6082ba681 | PASS | Re-test PASS. README.md:130 now says "under the loop: section"; YAML example shows concurrency_cap: 3 nested under loop:. Fixed in commit ab2d68409. |
| max_iterations validation: --max-iterations 0 and -1 | 2026-03-30 | 6082ba681 | PASS | `aloop start --max-iterations 0` → "must be a positive integer" (exit 1). `--max-iterations -1` same error. Behavior matches spec. |
| .aloop/pipeline.yml:31 max_iterations comment | 2026-03-30 | 6082ba681 | FAIL | Comment still says "(set 0 for unlimited)" — contradicts validation (0 is rejected). README.md was fixed (commit 51a3cfc24) but pipeline.yml missed. Bug tracked in TODO.md as open [review] Gate 9 item. |
| compile-loop-plan: loopSettings 6-field integration (final-qa re-test) | 2026-03-30 | 6082ba681 | PASS | All 6 custom values correctly in loop-plan.json loopSettings: triage_interval=12, scan_pass_throttle_ms=55000, rate_limit_backoff=exponential, provider_timeout=7200, max_iterations=10, max_stuck=5. concurrency_cap absent. |
| compile-loop-plan: loopSettings integration (6-field) | 2026-03-30 | 64d93fd43 | PASS | All 6 custom values (triage_interval=12, scan_pass_throttle_ms=55000, rate_limit_backoff=exponential, provider_timeout=7200, max_iterations=10, max_stuck=5) correctly emitted. concurrency_cap correctly absent (orchestrator-only). |
| loopSettings absent when no loop: section | 2026-03-30 | 64d93fd43 | PASS | No loop: section in pipeline.yml → loopSettings field absent from loop-plan.json. Conditional emission verified (re-test of prior PASS). |
