#!/bin/bash
# Test for loop.sh phase advancement logic:
# - Cycle position advances on success
# - Cycle position stays the same on failure (same phase retried with next provider)

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOOP_SH="$SCRIPT_DIR/loop.sh"

extract_function() {
    local name="$1"
    sed -n "/^${name}() {/,/^}/p" "$LOOP_SH"
}

# Source the functions we're testing
eval "$(extract_function advance_cycle_position)"
eval "$(extract_function register_iteration_success)"
eval "$(extract_function register_iteration_failure)"

# Mocks
MAX_PHASE_RETRIES=3
EFFECTIVE_MAX_RETRIES=3
write_log_entry() { :; }
write_status() { :; }
update_provider_health_on_success() { :; }
update_provider_health_on_failure() { :; }

failed=0
pass_case() { echo "PASS: $1"; }
fail_case() { echo "FAIL: $1"; failed=1; }

# ---------------------------------------------------------------------------
# Test Cases
# ---------------------------------------------------------------------------

# Setup initial state
MODE="plan-build-review"
CYCLE_POSITION=0
CYCLE_LENGTH=3
PHASE_RETRY_PHASE=""
PHASE_RETRY_CONSECUTIVE=0

# Test 1: Success advances position
register_iteration_success "plan" false
if [ "$CYCLE_POSITION" -eq 1 ]; then
    pass_case "Cycle position advances on success"
else
    fail_case "Cycle position did not advance on success (got $CYCLE_POSITION, expected 1)"
fi

# Test 2: Failure does NOT advance position
register_iteration_failure "build" "provider_failed"
if [ "$CYCLE_POSITION" -eq 1 ]; then
    pass_case "Cycle position stays the same on failure"
else
    fail_case "Cycle position advanced on failure (got $CYCLE_POSITION, expected 1)"
fi

# Test 3: Multiple failures stay at same position
register_iteration_failure "build" "another_failure"
if [ "$CYCLE_POSITION" -eq 1 ]; then
    pass_case "Cycle position stays the same after multiple failures"
else
    fail_case "Cycle position advanced after multiple failures (got $CYCLE_POSITION, expected 1)"
fi

# Test 4: Finalizer mode does not use cycle position (should stay same)
MODE="finalizer"
CYCLE_POSITION=0
register_iteration_success "spec-gap" false
if [ "$CYCLE_POSITION" -eq 0 ]; then
    pass_case "Cycle position stays same in finalizer mode"
else
    fail_case "Cycle position advanced in finalizer mode (got $CYCLE_POSITION, expected 0)"
fi

# Test 5: Fallback mode (no CYCLE_LENGTH) advances based on MODE
CYCLE_POSITION=0
CYCLE_LENGTH=0
MODE="plan-build"
register_iteration_success "plan" false
if [ "$CYCLE_POSITION" -eq 1 ]; then
    pass_case "Cycle position advances in fallback plan-build mode"
else
    fail_case "Cycle position did not advance in fallback plan-build mode (got $CYCLE_POSITION, expected 1)"
fi

# ---------------------------------------------------------------------------
# Cleanup and Summary
# ---------------------------------------------------------------------------

if [ $failed -eq 0 ]; then
    echo "All tests passed!"
    exit 0
fi

echo "Some tests failed!"
exit 1
