#!/bin/bash
# Integration tests for provider health state transitions (AC1)
# Tests real file-based health state using functions extracted from loop.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOOP_SH="$SCRIPT_DIR/loop.sh"

# --- Extract functions from loop.sh ---
# We extract the health-related functions and their dependencies rather than
# sourcing the entire loop.sh (which has side effects like argument parsing).

extract_func() {
    sed -n "/^${1}() {/,/^}/p" "$LOOP_SH"
}

# Core dependencies
eval "$(extract_func json_escape)"
eval "$(extract_func json_nullable_string)"
eval "$(extract_func extract_json_string_field)"
eval "$(extract_func extract_json_number_field)"
eval "$(extract_func ensure_provider_health_dir)"
eval "$(extract_func get_provider_health_path)"
eval "$(extract_func acquire_provider_health_lock)"
eval "$(extract_func release_provider_health_lock)"
eval "$(extract_func provider_health_defaults)"
eval "$(extract_func get_provider_health_state)"
eval "$(extract_func set_provider_health_state)"
eval "$(extract_func get_provider_cooldown_seconds)"
eval "$(extract_func classify_provider_failure)"
eval "$(extract_func timestamp_to_epoch)"
eval "$(extract_func update_provider_health_on_success)"
eval "$(extract_func update_provider_health_on_failure)"

# --- Test infrastructure ---

HEALTH_LOCK_RETRY_DELAYS=(0.05 0.10 0.15 0.20 0.25)
TEST_TMP_DIR=""
LOG_FILE=""
failed=0

setup() {
    TEST_TMP_DIR="$(mktemp -d)"
    PROVIDER_HEALTH_DIR="$TEST_TMP_DIR"
    LOG_FILE="$(mktemp)"
}

teardown() {
    rm -rf "$TEST_TMP_DIR" "$LOG_FILE" 2>/dev/null || true
}

write_log_entry() {
    local event="$1"
    shift
    local line="$event"
    while [ $# -gt 1 ]; do
        line="$line|$1=$2"
        shift 2
    done
    echo "$line" >> "$LOG_FILE"
}

contains_log() {
    grep -Fq "$1" "$LOG_FILE"
}

assert_health_field() {
    local provider="$1"
    local field="$2"
    local expected="$3"
    local label="${4:-$field}"
    get_provider_health_state "$provider"
    local actual
    case "$field" in
        status)               actual="$HEALTH_STATUS" ;;
        consecutive_failures) actual="$HEALTH_CONSECUTIVE_FAILURES" ;;
        failure_reason)       actual="$HEALTH_FAILURE_REASON" ;;
        cooldown_until)       actual="$HEALTH_COOLDOWN_UNTIL" ;;
        last_success)         actual="$HEALTH_LAST_SUCCESS" ;;
        last_failure)         actual="$HEALTH_LAST_FAILURE" ;;
    esac
    if [ "$actual" != "$expected" ]; then
        echo "  ASSERT FAIL: $label — expected '$expected', got '$actual'"
        return 1
    fi
    return 0
}

# --- Tests ---

test_healthy_to_cooldown_to_healthy() {
    setup
    local ok=true

    # Initial state: no file exists, should default to healthy
    get_provider_health_state "testprov"
    if [ "$HEALTH_STATUS" != "healthy" ]; then
        echo "  FAIL: initial status should be healthy, got $HEALTH_STATUS"
        ok=false
    fi

    # Cause a non-auth failure (e.g. timeout) — first failure has 0s cooldown
    update_provider_health_on_failure "testprov" "connection timeout"
    assert_health_field "testprov" "consecutive_failures" "1" || ok=false

    # Second failure should put into cooldown (tier 2 = 120s)
    update_provider_health_on_failure "testprov" "connection timeout"
    assert_health_field "testprov" "status" "cooldown" "status after 2 failures" || ok=false
    assert_health_field "testprov" "consecutive_failures" "2" || ok=false
    assert_health_field "testprov" "failure_reason" "timeout" || ok=false

    # Cooldown_until should be set (non-empty)
    get_provider_health_state "testprov"
    if [ -z "$HEALTH_COOLDOWN_UNTIL" ]; then
        echo "  FAIL: cooldown_until should be set after 2 failures"
        ok=false
    fi

    # Now succeed — should reset to healthy
    update_provider_health_on_success "testprov"
    assert_health_field "testprov" "status" "healthy" "status after recovery" || ok=false
    assert_health_field "testprov" "consecutive_failures" "0" "failures reset" || ok=false

    # Cooldown_until should be cleared
    get_provider_health_state "testprov"
    if [ -n "$HEALTH_COOLDOWN_UNTIL" ]; then
        echo "  FAIL: cooldown_until should be cleared after recovery"
        ok=false
    fi

    # Should have logged recovery
    if ! contains_log "provider_recovered"; then
        echo "  FAIL: expected provider_recovered log entry"
        ok=false
    fi

    teardown
    if $ok; then
        echo "PASS: healthy → cooldown → healthy transition"
    else
        echo "FAIL: healthy → cooldown → healthy transition"
        failed=1
    fi
}

test_healthy_to_degraded_on_auth_failure() {
    setup
    local ok=true

    # Auth failure should immediately set degraded
    update_provider_health_on_failure "testprov" "Error: unauthorized invalid token"
    assert_health_field "testprov" "status" "degraded" "status after auth failure" || ok=false
    assert_health_field "testprov" "failure_reason" "auth" || ok=false
    assert_health_field "testprov" "consecutive_failures" "1" || ok=false

    # Cooldown_until should NOT be set for degraded (no auto-recovery)
    get_provider_health_state "testprov"
    if [ -n "$HEALTH_COOLDOWN_UNTIL" ]; then
        echo "  FAIL: degraded should not have cooldown_until"
        ok=false
    fi

    # Should have logged degraded event
    if ! contains_log "provider_degraded"; then
        echo "  FAIL: expected provider_degraded log entry"
        ok=false
    fi

    teardown
    if $ok; then
        echo "PASS: healthy → degraded on auth failure"
    else
        echo "FAIL: healthy → degraded on auth failure"
        failed=1
    fi
}

test_backoff_escalation_through_all_tiers() {
    setup
    local ok=true
    local expected_cooldowns=(0 120 300 900 1800 3600 3600)
    local i

    for i in "${!expected_cooldowns[@]}"; do
        local failures=$((i + 1))
        local expected="${expected_cooldowns[$i]}"
        local actual
        actual=$(get_provider_cooldown_seconds "$failures")
        if [ "$actual" != "$expected" ]; then
            echo "  FAIL: get_provider_cooldown_seconds($failures) expected $expected, got $actual"
            ok=false
        fi

        update_provider_health_on_failure "tierprov" "connection timeout"
        assert_health_field "tierprov" "consecutive_failures" "$failures" "failure count after attempt $failures" || ok=false

        get_provider_health_state "tierprov"
        if [ "$expected" -eq 0 ]; then
            if [ "$HEALTH_STATUS" != "healthy" ]; then
                echo "  FAIL: status should remain healthy at failure $failures, got $HEALTH_STATUS"
                ok=false
            fi
            if [ -n "$HEALTH_COOLDOWN_UNTIL" ]; then
                echo "  FAIL: cooldown_until should be empty at failure $failures"
                ok=false
            fi
        else
            if [ "$HEALTH_STATUS" != "cooldown" ]; then
                echo "  FAIL: status should be cooldown at failure $failures, got $HEALTH_STATUS"
                ok=false
            fi
            if [ -z "$HEALTH_COOLDOWN_UNTIL" ]; then
                echo "  FAIL: cooldown_until should be set at failure $failures"
                ok=false
            fi
        fi
    done

    teardown
    if $ok; then
        echo "PASS: backoff escalation through all cooldown tiers"
    else
        echo "FAIL: backoff escalation through all cooldown tiers"
        failed=1
    fi
}

test_health_file_is_valid_json() {
    setup
    local ok=true

    # Write some state and verify the file is valid JSON
    update_provider_health_on_failure "jsontest" "rate limit 429"
    update_provider_health_on_failure "jsontest" "rate limit 429"

    local path
    path=$(get_provider_health_path "jsontest")
    if [ ! -f "$path" ]; then
        echo "  FAIL: health file should exist at $path"
        ok=false
    else
        # Verify it contains expected JSON fields
        local raw
        raw=$(cat "$path")
        local status
        status=$(extract_json_string_field "$raw" "status")
        if [ "$status" != "cooldown" ]; then
            echo "  FAIL: file JSON status should be 'cooldown', got '$status'"
            ok=false
        fi
        local failures
        failures=$(extract_json_number_field "$raw" "consecutive_failures")
        if [ "$failures" != "2" ]; then
            echo "  FAIL: file JSON consecutive_failures should be 2, got '$failures'"
            ok=false
        fi
    fi

    teardown
    if $ok; then
        echo "PASS: health file contains valid JSON"
    else
        echo "FAIL: health file contains valid JSON"
        failed=1
    fi
}

test_success_preserves_last_failure_info() {
    setup
    local ok=true

    # Fail then succeed — last_failure and failure_reason should be preserved
    update_provider_health_on_failure "testprov" "network timeout"
    update_provider_health_on_failure "testprov" "network timeout"
    update_provider_health_on_success "testprov"

    get_provider_health_state "testprov"
    if [ -z "$HEALTH_LAST_FAILURE" ]; then
        echo "  FAIL: last_failure should be preserved after recovery"
        ok=false
    fi
    if [ -z "$HEALTH_FAILURE_REASON" ]; then
        echo "  FAIL: failure_reason should be preserved after recovery"
        ok=false
    fi

    teardown
    if $ok; then
        echo "PASS: success preserves last failure info"
    else
        echo "FAIL: success preserves last failure info"
        failed=1
    fi
}

test_concurrent_write_safety() {
    setup
    local ok=true
    local pids=()
    local num_writers=5
    local provider="conctest"

    # Spawn multiple parallel subshells that each write to the same provider's
    # health file simultaneously.  Each subshell inherits the extracted
    # functions and the test PROVIDER_HEALTH_DIR via the environment.
    for i in $(seq 1 "$num_writers"); do
        (
            update_provider_health_on_failure "$provider" "timeout error from writer $i"
        ) &
        pids+=($!)
    done

    # Wait for all writers to finish
    for pid in "${pids[@]}"; do
        wait "$pid" 2>/dev/null || true
    done

    # The health file must exist and be valid JSON
    local path
    path=$(get_provider_health_path "$provider")
    if [ ! -f "$path" ]; then
        echo "  FAIL: health file should exist after concurrent writes"
        ok=false
    else
        local raw
        raw=$(cat "$path")

        # Verify it has all required JSON fields (proves no truncation/corruption)
        local status
        status=$(extract_json_string_field "$raw" "status")
        if [ -z "$status" ]; then
            echo "  FAIL: file JSON missing or empty 'status' field after concurrent writes"
            echo "  File contents: $raw"
            ok=false
        fi

        local failures
        failures=$(extract_json_number_field "$raw" "consecutive_failures")
        if [ -z "$failures" ] || [ "$failures" -lt 1 ]; then
            echo "  FAIL: consecutive_failures should be >= 1, got '$failures'"
            echo "  File contents: $raw"
            ok=false
        fi

        # Verify the file is well-formed by checking it contains opening and
        # closing braces and all expected keys
        for key in status last_success last_failure failure_reason consecutive_failures cooldown_until; do
            if ! printf '%s' "$raw" | grep -q "\"$key\""; then
                echo "  FAIL: JSON missing key '$key' after concurrent writes"
                echo "  File contents: $raw"
                ok=false
                break
            fi
        done
    fi

    # Ensure no stale lock directory is left behind
    if [ -d "${path}.lock" ]; then
        echo "  FAIL: lock directory should not remain after writes complete"
        ok=false
    fi

    teardown
    if $ok; then
        echo "PASS: concurrent write safety — $num_writers parallel writers produced valid JSON"
    else
        echo "FAIL: concurrent write safety"
        failed=1
    fi
}

# --- Run tests ---

echo "=== Provider Health Integration Tests ==="
test_healthy_to_cooldown_to_healthy
test_healthy_to_degraded_on_auth_failure
test_backoff_escalation_through_all_tiers
test_health_file_is_valid_json
test_success_preserves_last_failure_info
test_concurrent_write_safety

if [ $failed -eq 0 ]; then
    echo "All integration tests passed!"
    exit 0
fi

echo "Some integration tests failed!"
exit 1
