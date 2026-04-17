#!/bin/bash
# Unit tests for provider health primitives in loop.sh
# Tests the raw I/O primitives directly (no mocking of the functions under test).

# ---------------------------------------------------------------------------
# Extract functions from loop.sh
# ---------------------------------------------------------------------------
extract_func() {
    sed -n "/^$1() {/,/^}/p" aloop/bin/loop.sh
}

eval "$(extract_func ensure_provider_health_dir)"
eval "$(extract_func get_provider_health_path)"
eval "$(extract_func acquire_provider_health_lock)"
eval "$(extract_func release_provider_health_lock)"
eval "$(extract_func provider_health_defaults)"
eval "$(extract_func json_escape)"
eval "$(extract_func json_nullable_string)"
eval "$(extract_func extract_json_string_field)"
eval "$(extract_func extract_json_number_field)"
eval "$(extract_func get_provider_health_state)"
eval "$(extract_func set_provider_health_state)"

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
PROVIDER_HEALTH_DIR="$(mktemp -d)"
HEALTH_LOCK_RETRY_DELAYS=(0.05 0.10 0.15 0.20 0.25)

LOG_FILE="$(mktemp)"

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

# Speed up tests: override sleep so lock-retry loops don't actually wait
sleep() { return 0; }

contains_log() {
    grep -Fq "$1" "$LOG_FILE"
}

reset_log() {
    : > "$LOG_FILE"
}

failed=0

# ---------------------------------------------------------------------------
# Test 1: get_provider_health_path normalizes uppercase to lowercase
# ---------------------------------------------------------------------------
path=$(get_provider_health_path "ClAuDe")
expected="$PROVIDER_HEALTH_DIR/claude.json"
if [ "$path" = "$expected" ]; then
    echo "PASS: get_provider_health_path normalizes uppercase to lowercase"
else
    echo "FAIL: get_provider_health_path normalization — expected '$expected', got '$path'"
    failed=1
fi

# ---------------------------------------------------------------------------
# Test 2: provider_health_defaults sets expected values
# ---------------------------------------------------------------------------
HEALTH_STATUS="stale"
HEALTH_LAST_SUCCESS="some-value"
HEALTH_LAST_FAILURE="some-value"
HEALTH_FAILURE_REASON="auth"
HEALTH_CONSECUTIVE_FAILURES=99
HEALTH_COOLDOWN_UNTIL="some-value"

provider_health_defaults

if [ "$HEALTH_STATUS" = "healthy" ] \
    && [ "$HEALTH_LAST_SUCCESS" = "" ] \
    && [ "$HEALTH_LAST_FAILURE" = "" ] \
    && [ "$HEALTH_FAILURE_REASON" = "" ] \
    && [ "$HEALTH_CONSECUTIVE_FAILURES" = "0" ] \
    && [ "$HEALTH_COOLDOWN_UNTIL" = "" ]; then
    echo "PASS: provider_health_defaults sets expected values"
else
    echo "FAIL: provider_health_defaults — unexpected values"
    echo "  HEALTH_STATUS=$HEALTH_STATUS HEALTH_CONSECUTIVE_FAILURES=$HEALTH_CONSECUTIVE_FAILURES"
    failed=1
fi

# ---------------------------------------------------------------------------
# Test 3: get_provider_health_state returns defaults when file absent
# ---------------------------------------------------------------------------
# Ensure no file exists for this provider
rm -f "$PROVIDER_HEALTH_DIR/absent.json"

HEALTH_STATUS="stale"
HEALTH_CONSECUTIVE_FAILURES=42

get_provider_health_state "absent"

if [ "$HEALTH_STATUS" = "healthy" ] && [ "$HEALTH_CONSECUTIVE_FAILURES" = "0" ]; then
    echo "PASS: get_provider_health_state returns defaults when file absent"
else
    echo "FAIL: get_provider_health_state (absent file) — HEALTH_STATUS=$HEALTH_STATUS HEALTH_CONSECUTIVE_FAILURES=$HEALTH_CONSECUTIVE_FAILURES"
    failed=1
fi

# ---------------------------------------------------------------------------
# Test 4: get_provider_health_state reads and parses an existing file correctly
# ---------------------------------------------------------------------------
cat > "$PROVIDER_HEALTH_DIR/testprovider.json" << 'EOF'
{"status":"cooldown","last_success":"2024-01-01T00:00:00Z","last_failure":"2024-01-02T00:00:00Z","failure_reason":"rate_limit","consecutive_failures":3,"cooldown_until":"2024-01-02T01:00:00Z"}
EOF

get_provider_health_state "testprovider"

if [ "$HEALTH_STATUS" = "cooldown" ] \
    && [ "$HEALTH_LAST_SUCCESS" = "2024-01-01T00:00:00Z" ] \
    && [ "$HEALTH_LAST_FAILURE" = "2024-01-02T00:00:00Z" ] \
    && [ "$HEALTH_FAILURE_REASON" = "rate_limit" ] \
    && [ "$HEALTH_CONSECUTIVE_FAILURES" = "3" ] \
    && [ "$HEALTH_COOLDOWN_UNTIL" = "2024-01-02T01:00:00Z" ]; then
    echo "PASS: get_provider_health_state reads and parses an existing file correctly"
else
    echo "FAIL: get_provider_health_state (existing file) — parsed values do not match"
    echo "  STATUS=$HEALTH_STATUS LAST_SUCCESS=$HEALTH_LAST_SUCCESS FAILURES=$HEALTH_CONSECUTIVE_FAILURES"
    failed=1
fi
rm -f "$PROVIDER_HEALTH_DIR/testprovider.json"

# ---------------------------------------------------------------------------
# Test 5: Round-trip — set_provider_health_state writes, get_provider_health_state reads back
# ---------------------------------------------------------------------------
set_provider_health_state "roundtrip" "degraded" "2025-06-01T12:00:00Z" "2025-06-02T08:00:00Z" "timeout" "7" "2025-06-02T09:00:00Z"
get_provider_health_state "roundtrip"

if [ "$HEALTH_STATUS" = "degraded" ] \
    && [ "$HEALTH_LAST_SUCCESS" = "2025-06-01T12:00:00Z" ] \
    && [ "$HEALTH_LAST_FAILURE" = "2025-06-02T08:00:00Z" ] \
    && [ "$HEALTH_FAILURE_REASON" = "timeout" ] \
    && [ "$HEALTH_CONSECUTIVE_FAILURES" = "7" ] \
    && [ "$HEALTH_COOLDOWN_UNTIL" = "2025-06-02T09:00:00Z" ]; then
    echo "PASS: round-trip set/get_provider_health_state"
else
    echo "FAIL: round-trip — values do not match after write+read"
    echo "  STATUS=$HEALTH_STATUS FAILURES=$HEALTH_CONSECUTIVE_FAILURES COOLDOWN=$HEALTH_COOLDOWN_UNTIL"
    failed=1
fi
rm -f "$PROVIDER_HEALTH_DIR/roundtrip.json"

# ---------------------------------------------------------------------------
# Test 6: acquire/release/re-acquire lock cycle
# ---------------------------------------------------------------------------
lock_test_path="$PROVIDER_HEALTH_DIR/locktest.json"

lock_dir=$(acquire_provider_health_lock "$lock_test_path" "lockprovider" "test")
if [ -d "$lock_dir" ]; then
    release_provider_health_lock "$lock_dir"
    # After release, lock dir should be gone
    if [ ! -d "$lock_dir" ]; then
        # Re-acquire should succeed
        lock_dir2=$(acquire_provider_health_lock "$lock_test_path" "lockprovider" "test")
        if [ -d "$lock_dir2" ]; then
            release_provider_health_lock "$lock_dir2"
            echo "PASS: acquire-release-re-acquire lock cycle"
        else
            echo "FAIL: re-acquire after release failed"
            failed=1
        fi
    else
        echo "FAIL: lock dir still exists after release"
        failed=1
    fi
else
    echo "FAIL: initial lock acquire did not create lock dir"
    failed=1
fi

# ---------------------------------------------------------------------------
# Test 7: Lock failure — when lock is held, acquire logs health_lock_failed and returns 1
# ---------------------------------------------------------------------------
reset_log
contended_path="$PROVIDER_HEALTH_DIR/contended.json"
contended_lock="${contended_path}.lock"
mkdir "$contended_lock"  # Simulate a held lock

set +e
acquire_provider_health_lock "$contended_path" "contended" "write" > /dev/null
rc=$?
set -e

rmdir "$contended_lock"

if [ "$rc" -eq 1 ] && contains_log "health_lock_failed|provider=contended|operation=write"; then
    echo "PASS: lock failure returns 1 and logs health_lock_failed"
else
    echo "FAIL: lock failure behavior — rc=$rc, log contents:"
    cat "$LOG_FILE"
    failed=1
fi

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
rm -rf "$PROVIDER_HEALTH_DIR"
rm -f "$LOG_FILE"

if [ $failed -eq 0 ]; then
    echo "All tests passed!"
    exit 0
fi

echo "Some tests failed!"
exit 1
