#!/bin/bash
# Unit tests for provider health classification and usage extraction in loop.sh

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOOP_SH="$SCRIPT_DIR/loop.sh"

extract_func() {
    sed -n "/^$1() {/,/^}/p" "$LOOP_SH"
}

eval "$(extract_func classify_provider_failure)"
eval "$(extract_func get_provider_cooldown_seconds)"
eval "$(extract_func extract_opencode_usage)"

failed=0
pass_case() { echo "PASS: $1"; }
fail_case() { echo "FAIL: $1"; failed=1; }

# ---------------------------------------------------------------------------
# Test classify_provider_failure
# ---------------------------------------------------------------------------

test_classify() {
    local input="$1"
    local expected="$2"
    local result
    result=$(classify_provider_failure "$input")
    if [ "$result" = "$expected" ]; then
        pass_case "classify_provider_failure: '$input' -> $expected"
    else
        fail_case "classify_provider_failure: '$input' -> expected $expected, got $result"
    fi
}

test_classify "API Error: 429 Too Many Requests" "rate_limit"
test_classify "Rate limit reached for model" "rate_limit"
test_classify "Failed to authenticate. API Error: 401 Unauthorized" "auth"
test_classify "Invalid API key" "auth"
test_classify "Expired token" "auth"
test_classify "Connection timeout" "timeout"
test_classify "Network error" "timeout"
test_classify "Cannot launch inside another session" "concurrent_cap"
test_classify "Some random error" "unknown"

# ---------------------------------------------------------------------------
# Test get_provider_cooldown_seconds
# ---------------------------------------------------------------------------

test_cooldown() {
    local failures="$1"
    local expected="$2"
    local result
    result=$(get_provider_cooldown_seconds "$failures")
    if [ "$result" = "$expected" ]; then
        pass_case "get_provider_cooldown_seconds: $failures failures -> $expected s"
    else
        fail_case "get_provider_cooldown_seconds: $failures failures -> expected $expected, got $result"
    fi
}

test_cooldown 1 0
test_cooldown 2 120
test_cooldown 3 300
test_cooldown 4 900
test_cooldown 5 1800
test_cooldown 6 3600
test_cooldown 10 3600

# ---------------------------------------------------------------------------
# Test extract_opencode_usage
# ---------------------------------------------------------------------------

# Mock dependencies
DC_EXEC=()
command() {
    if [ "$2" = "python3" ]; then return 0; fi
    builtin command "$@"
}

test_extract_usage() {
    local name="$1"
    local mock_json="$2"
    local expected_input="${3:-}"
    local expected_output="${4:-}"
    local expected_cache="${5:-}"
    local expected_cost="${6:-}"
    local expected_rc="${7:-0}"

    # Export mock_json so it's available inside the mock function in subshells
    export MOCK_OPENCODE_JSON="$mock_json"

    # Mock opencode
    opencode() {
        if [ "$1" = "session" ] && [ "$2" = "list" ]; then
            echo "$MOCK_OPENCODE_JSON"
        elif [ "$1" = "export" ]; then
            # Extract the correct session from MOCK_OPENCODE_JSON
            # For simplicity in testing, we just return the first session as a whole
            python3 -c "
import json, sys
data = json.loads(sys.stdin.read())
if isinstance(data, list) and len(data) > 0:
    print(json.dumps(data[0]))
" <<< "$MOCK_OPENCODE_JSON"
        else
            return 1
        fi
    }
    export -f opencode

    if extract_opencode_usage; then
        rc=0
    else
        rc=1
    fi

    if [ "$rc" -ne "$expected_rc" ]; then
        fail_case "$name: expected rc $expected_rc, got $rc"
        return
    fi

    if [ "$rc" -eq 0 ]; then
        if [ "$_OC_TOKENS_INPUT" = "$expected_input" ] && \
           [ "$_OC_TOKENS_OUTPUT" = "$expected_output" ] && \
           [ "$_OC_TOKENS_CACHE_READ" = "$expected_cache" ] && \
           [ "$_OC_COST_USD" = "$expected_cost" ]; then
            pass_case "$name"
        else
            fail_case "$name: values do not match"
            echo "  Got: input=$_OC_TOKENS_INPUT output=$_OC_TOKENS_OUTPUT cache=$_OC_TOKENS_CACHE_READ cost=$_OC_COST_USD"
            echo "  Exp: input=$expected_input output=$expected_output cache=$expected_cache cost=$expected_cost"
        fi
    else
        pass_case "$name (expected failure)"
    fi
}

# Scenario 1: Valid usage
MOCK_SESSIONS='[
  {
    "id": "sess1",
    "messages": [
      {
        "role": "assistant",
        "tokens": { "input": 100, "output": 50, "cache": { "read": 20 } },
        "cost": 0.001
      }
    ]
  }
]'
test_extract_usage "extract_opencode_usage: valid usage" "$MOCK_SESSIONS" "100" "50" "20" "0.001"

# Scenario 2: No sessions
test_extract_usage "extract_opencode_usage: no sessions" "[]" "" "" "" "" 1

# Scenario 3: Multiple messages (should sum or pick last? loop.sh logic says pick last assistant message's tokens)
# Wait, let me check loop.sh logic for extract_opencode_usage.
# I'll check it again.

# Scenario 4: Missing fields
MOCK_SESSIONS_MISSING='[
  {
    "id": "sess1",
    "messages": [
      {
        "role": "assistant",
        "tokens": { "input": 100 }
      }
    ]
  }
]'
test_extract_usage "extract_opencode_usage: missing fields" "$MOCK_SESSIONS_MISSING" "100" "0" "0" "0" 0

if [ $failed -eq 0 ]; then
    echo "All tests passed!"
    exit 0
fi

echo "Some tests failed!"
exit 1
