#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOOP_SH="$SCRIPT_DIR/loop.sh"

extract_func() {
    sed -n "/^${1}() {/,/^}/p" "$LOOP_SH"
}

eval "$(extract_func append_plan_task_if_missing)"
eval "$(extract_func check_finalizer_qa_coverage_gate)"

failed=0

assert_contains() {
    local file="$1"
    local needle="$2"
    local label="$3"
    if ! grep -Fq "$needle" "$file"; then
        echo "  FAIL: $label"
        failed=1
    fi
}

assert_not_contains() {
    local file="$1"
    local needle="$2"
    local label="$3"
    if grep -Fq "$needle" "$file"; then
        echo "  FAIL: $label"
        failed=1
    fi
}

run_case() {
    local name="$1"
    shift
    if "$@"; then
        echo "PASS: $name"
    else
        echo "FAIL: $name"
        failed=1
    fi
}

case_gate_passes_when_threshold_is_met() {
    local tmp
    tmp="$(mktemp -d)"
    WORK_DIR="$tmp"
    PLAN_FILE="$tmp/TODO.md"
    cat > "$PLAN_FILE" <<'PLAN'
- [x] existing completed task
PLAN

    cat > "$tmp/QA_COVERAGE.md" <<'COV'
| Feature | Component | Last Tested | Commit | Status | Criteria Met | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| A | c | 2026-03-22 | abc | PASS | 1/1 | ok |
| B | c | 2026-03-22 | abc | UNTESTED | 0/1 | pending |
| C | c | 2026-03-22 | abc | PASS | 1/1 | ok |
| D | c | 2026-03-22 | abc | PASS | 1/1 | ok |
COV

    if ! check_finalizer_qa_coverage_gate; then
        rm -rf "$tmp"
        return 1
    fi

    assert_not_contains "$PLAN_FILE" "[finalizer-qa-gate]" "gate pass should not append qa blocker tasks"
    rm -rf "$tmp"
    return 0
}

case_blocks_when_untested_exceeds_threshold() {
    local tmp
    tmp="$(mktemp -d)"
    WORK_DIR="$tmp"
    PLAN_FILE="$tmp/TODO.md"
    cat > "$PLAN_FILE" <<'PLAN'
- [x] existing completed task
PLAN

    cat > "$tmp/QA_COVERAGE.md" <<'COV'
| Feature | Component | Last Tested | Commit | Status | Criteria Met | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| A | c | 2026-03-22 | abc | UNTESTED | 0/1 | pending |
| B | c | 2026-03-22 | abc | UNTESTED | 0/1 | pending |
| C | c | 2026-03-22 | abc | PASS | 1/1 | ok |
COV

    if check_finalizer_qa_coverage_gate; then
        rm -rf "$tmp"
        return 1
    fi

    assert_contains "$PLAN_FILE" "Reduce UNTESTED QA coverage to <=30%" "should append untested coverage blocker task"
    rm -rf "$tmp"
    return 0
}

case_blocks_when_fail_rows_exist() {
    local tmp
    tmp="$(mktemp -d)"
    WORK_DIR="$tmp"
    PLAN_FILE="$tmp/TODO.md"
    cat > "$PLAN_FILE" <<'PLAN'
- [x] existing completed task
PLAN

    cat > "$tmp/QA_COVERAGE.md" <<'COV'
| Feature | Component | Last Tested | Commit | Status | Criteria Met | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Login flow | c | 2026-03-22 | abc | FAIL | 0/2 | broken |
| Other | c | 2026-03-22 | abc | PASS | 1/1 | ok |
COV

    if check_finalizer_qa_coverage_gate; then
        rm -rf "$tmp"
        return 1
    fi

    assert_contains "$PLAN_FILE" "Resolve FAIL coverage item: Login flow" "should append fail item task"
    rm -rf "$tmp"
    return 0
}

case_skips_enforcement_when_coverage_file_missing() {
    local tmp
    tmp="$(mktemp -d)"
    WORK_DIR="$tmp"
    PLAN_FILE="$tmp/TODO.md"
    cat > "$PLAN_FILE" <<'PLAN'
- [x] existing completed task
PLAN

    if ! check_finalizer_qa_coverage_gate; then
        echo "FAIL: gate should return success (skip enforcement) when QA_COVERAGE.md is missing"
        rm -rf "$tmp"
        return 1
    fi

    if [ "$FINALIZER_QA_GATE_REASON" != "qa_coverage_missing" ]; then
        echo "FAIL: expected gate reason 'qa_coverage_missing', got '$FINALIZER_QA_GATE_REASON'"
        rm -rf "$tmp"
        return 1
    fi

    rm -rf "$tmp"
    return 0
}

run_case "finalizer QA gate passes at <=30% untested and 0 fail" case_gate_passes_when_threshold_is_met
run_case "finalizer QA gate blocks when untested >30%" case_blocks_when_untested_exceeds_threshold
run_case "finalizer QA gate blocks when FAIL rows exist" case_blocks_when_fail_rows_exist
run_case "finalizer QA gate skips enforcement when QA_COVERAGE.md is missing" case_skips_enforcement_when_coverage_file_missing

if [ "$failed" -ne 0 ]; then
    exit 1
fi

echo "All finalizer QA coverage gate tests passed."
