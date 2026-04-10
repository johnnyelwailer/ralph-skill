#!/bin/bash
# Unit tests for task management functions in loop.sh

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOOP_SH="$SCRIPT_DIR/loop.sh"

extract_func() {
    sed -n "/^$1() {/,/^}/p" "$LOOP_SH"
}

eval "$(extract_func get_current_task)"
eval "$(extract_func skip_stuck_task)"
eval "$(extract_func append_plan_task_if_missing)"

failed=0
pass_case() { echo "PASS: $1"; }
fail_case() { echo "FAIL: $1"; failed=1; }

# ---------------------------------------------------------------------------
# Test get_current_task
# ---------------------------------------------------------------------------

TMP_DIR="$(mktemp -d)"
PLAN_FILE="$TMP_DIR/TODO.md"

test_get_task() {
    local content="$1"
    local expected="$2"
    local name="$3"

    echo -e "$content" > "$PLAN_FILE"
    local result
    result=$(get_current_task)
    if [ "$result" = "$expected" ]; then
        pass_case "get_current_task: $name"
    else
        fail_case "get_current_task: $name (expected '$expected', got '$result')"
    fi
}

test_get_task "- [ ] Task 1" "Task 1" "first task"
test_get_task "- [x] Done\n- [ ] Pending" "Pending" "skip completed"
test_get_task "- [ ] Task with [brackets]" "Task with [brackets]" "handle brackets"
test_get_task "- [x] All done" "" "none pending"
test_get_task "" "" "empty file"

# ---------------------------------------------------------------------------
# Test skip_stuck_task
# ---------------------------------------------------------------------------

test_skip_stuck() {
    local task="$1"
    local content="$2"
    local expected_substring="$3"
    local name="$4"

    # Mock dependencies
    MAX_STUCK=3
    LAST_TASK="something"
    STUCK_COUNT=3
    sed_i() {
        # Simple mock for sed -i
        local pattern="$1"
        local file="$2"
        sed -i "$pattern" "$file"
    }

    echo -e "$content" > "$PLAN_FILE"
    skip_stuck_task "$task" > /dev/null
    local result
    result=$(cat "$PLAN_FILE")
    if echo "$result" | grep -q -- "$expected_substring"; then
        pass_case "skip_stuck_task: $name"
    else
        fail_case "skip_stuck_task: $name (unexpected content)"
        echo "  Got: $result"
    fi
}

test_skip_stuck "Stuck" "- [ ] Stuck" "- \[S\] Stuck" "skip first task"
test_skip_stuck "Stuck" "- [x] Done\n- [ ] Stuck" "- \[S\] Stuck" "skip first pending task"

# ---------------------------------------------------------------------------
# Test append_plan_task_if_missing
# ---------------------------------------------------------------------------

test_append_task() {
    local content="$1"
    local task="$2"
    local expected_substring="$3"
    local name="$4"

    echo -e "$content" > "$PLAN_FILE"
    append_plan_task_if_missing "$task" > /dev/null
    local result
    result=$(cat "$PLAN_FILE")
    if echo "$result" | grep -q -- "$expected_substring"; then
        pass_case "append_plan_task_if_missing: $name"
    else
        fail_case "append_plan_task_if_missing: $name (unexpected content)"
        echo "  Got: $result"
    fi
}

test_append_task "- [ ] Existing" "New Task" "- \[ \] New Task" "append new task"
test_append_task "- [ ] Existing" "Existing" "- \[ \] Existing" "don't append duplicate"
test_append_task "- [x] Done" "Done" "- \[x\] Done" "don't append if already present as [x]"

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

rm -rf "$TMP_DIR"

if [ $failed -eq 0 ]; then
    echo "All tests passed!"
    exit 0
fi

echo "Some tests failed!"
exit 1
