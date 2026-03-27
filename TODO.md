# Issue #103: Periodic scheduling for spec-gap and docs agents in pipeline

## Tasks

### Up Next

- [ ] [qa/P1] Missing unit tests for periodic super-cycle expansion: The `compile-loop-plan.test.ts` task is still unchecked — unit tests for the super-cycle feature were not written. What was done: ran `aloop start` against the pipeline.yml and manually verified cycle[0..7]=[plan,build×5,qa,review] and cycle[8..17]=[spec-gap,plan,build×5,qa,docs,review] with cycleLength=18. What spec says: Constitution Rule 11 requires unit tests; TASK_SPEC.md deliverables list these tests as required acceptance criteria. Tested at iter 11. (priority: high)

- [x] Add `periodic` fields for spec-gap and docs to `.aloop/pipeline.yml` pipeline section
  - Add `- agent: spec-gap` with `periodic: {every: 2, inject_before: plan}` to the pipeline array
  - Add `- agent: docs` with `periodic: {every: 2, inject_after: qa}` to the pipeline array
  - Note: these agents remain in `finalizer` section too — that is separate behavior

- [x] Implement periodic super-cycle expansion in `buildCycleFromPipeline()` in `compile-loop-plan.ts`
  - Separate pipeline entries into `baseSteps` (no `periodic`) and `periodicSteps` (has `periodic`)
  - If no periodicSteps, return base cycle unchanged (backwards compat)
  - Compute `superCyclePasses = LCM(all periodic.every values)`
  - For each pass `p` in `[0, superCyclePasses)`, build base cycle copy and splice in periodic agents at anchor positions where `(p + 1) % periodic.every === 0`
  - `inject_before: plan` → insert immediately before the first plan entry in that pass
  - `inject_after: qa` → insert immediately after the last qa entry in that pass
  - Concatenate all passes into super-cycle and return
  - If file grows beyond 150 LOC net addition, extract to `periodic-cycle.ts` (Constitution Rule 7)

- [x] Fix `buildRoundRobinCycle()` to filter out periodic steps when building the base round-robin cycle
  - When iterating `parsed.pipeline` in the round-robin path, skip entries where `step.every` is a number (periodic indicator)
  - Periodic agents are not part of the base round-robin slot assignment
  - Also fixed `buildCycleFromPipeline()` to detect periodic steps using `step.every` instead of `step.periodic.every` (the basic YAML parser flattens nested objects)

- [ ] Add tests in `compile-loop-plan.test.ts` for periodic scheduling
  - Pipeline without `periodic` entries compiles to length-8 cycle (backwards compat)
  - spec-gap at `every: 2` with `inject_before: plan` appears at position 8 (first entry of pass 2)
  - docs at `every: 2` with `inject_after: qa` appears at position 16 (after qa in pass 2)
  - Super-cycle length is 18 given the spec schema
  - Pass 1 (positions 0–7): `[plan, build×5, qa, review]` — no periodic agents
  - Pass 2 (positions 8–17): `[spec-gap, plan, build×5, qa, docs, review]`
  - `cycle.length === 18`
  - Round-robin with periodic entries in pipeline filters them out (done)

### Completed
