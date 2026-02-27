# Validation Strategy

Using tests, lints, and builds as backpressure to steer Aloop.

<what_is_backpressure>
## What is Backpressure?

Backpressure is automated validation that rejects invalid work. It creates a self-correcting feedback loop:

1. Aloop implements task
2. Validation runs (tests, type checks, lints)
3. If validation fails, Aloop investigates and fixes
4. Loop continues until validation passes
5. Only then can Aloop commit and move to next task

**Without backpressure:** Aloop generates code that may not work.
**With backpressure:** Aloop must produce working code to progress.
</what_is_backpressure>

<types_of_backpressure>
## Types of Backpressure

### 1. Tests (Most Important)
Binary pass/fail, fast feedback, aligned with specs. If no tests exist, Aloop should create them.

### 2. Type Checking
`tsc --noEmit`, `mypy .`, `go vet` — catches type errors before runtime.

### 3. Linting
ESLint, Ruff, clippy — enforces code style and catches common mistakes. Start minimal, add rules as patterns emerge.

### 4. Builds
Ensures code compiles and bundles correctly. Slower than tests — use sparingly in loop.

### 5. Custom Validation
Visual regression, performance benchmarks, security scans — for project-specific quality criteria.
</types_of_backpressure>

<validation_levels>
## Validation Levels

### Level 1: Tests Only (Fastest)
```bash
npm test
```
For early development, fast iteration.

### Level 2: Tests + Type Checking (Recommended)
```bash
npm test && npm run type-check
```
Good balance of speed and quality.

### Level 3: Full Validation (Slowest)
```bash
npm test && npm run type-check && npm run lint && npm run build
```
For mature projects and pre-release gates.

### Level 4: Custom
Add project-specific validation commands as needed.
</validation_levels>

<handling_validation_failures>
## Handling Validation Failures

### Expected Behavior
Aloop should: see failure → read errors → investigate → fix → re-validate → repeat until passing.

### Stuck in Loop
If Aloop repeatedly fails validation (3+ iterations on same task):

1. **Auto-skip**: Stuck detection marks task as blocked and moves on
2. **Regenerate plan**: Delete TODO.md and run planning mode
3. **Manual intervention**: Stop loop, fix issue, restart
4. **Update guidance**: Add learning to AGENTS.md so Aloop doesn't repeat
</handling_validation_failures>

<tuning_backpressure>
## Tuning Backpressure

Start strict, loosen if too slow:

**Week 1:** Full validation — see where Aloop struggles
**Week 2:** Remove low-value checks — keep only what catches real issues
**Week 3:** Add custom checks — based on observed failure patterns
**Ongoing:** Evolve with project
</tuning_backpressure>
