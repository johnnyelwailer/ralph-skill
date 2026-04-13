#!/usr/bin/env bats

# Aloop Loop Script Tests
# These tests treat loop.sh as a black box (black-box binary)
# and verify argument parsing and default values.
# No code modification allowed as per Constitution Rule 1.

setup() {
    # Create temp directories for tests
    TEST_TEMP_DIR="$(mktemp -d)"
    PROMPTS_DIR="$TEST_TEMP_DIR/prompts"
    SESSION_DIR="$TEST_TEMP_DIR/session"
    WORK_DIR="$TEST_TEMP_DIR/work"
    mkdir -p "$PROMPTS_DIR" "$SESSION_DIR" "$WORK_DIR"
    
    # Path to loop.sh relative to this test file
    # We use absolute path to avoid ambiguity
    LOOP_SH="$(cd "$BATS_TEST_DIRNAME/.." && pwd)/loop.sh"
}

teardown() {
    rm -rf "$TEST_TEMP_DIR"
}

@test "1. Missing all required args should exit non-zero" {
    run bash "$LOOP_SH"
    [ "$status" -ne 0 ]
    [[ "$output" == *"Error: --prompts-dir, --session-dir, and --work-dir are required"* ]]
}

@test "2. Missing --session-dir only should exit non-zero" {
    run bash "$LOOP_SH" --prompts-dir "$PROMPTS_DIR" --work-dir "$WORK_DIR"
    [ "$status" -ne 0 ]
    [[ "$output" == *"Error: --prompts-dir, --session-dir, and --work-dir are required"* ]]
}

@test "3. Invalid --launch-mode value should exit non-zero" {
    run bash "$LOOP_SH" --prompts-dir "$PROMPTS_DIR" --session-dir "$SESSION_DIR" --work-dir "$WORK_DIR" --launch-mode "bogus"
    [ "$status" -ne 0 ]
    [[ "$output" == *"Error: Invalid launch mode: bogus"* ]]
}

@test "4. Unknown option should exit non-zero" {
    run bash "$LOOP_SH" --bogus
    [ "$status" -ne 0 ]
    [[ "$output" == *"Unknown option: --bogus"* ]]
}

@test "5. Valid required args with non-existent --prompts-dir should exit non-zero" {
    run bash "$LOOP_SH" --prompts-dir "/tmp/non-existent-$(date +%s)" --session-dir "$SESSION_DIR" --work-dir "$WORK_DIR"
    [ "$status" -ne 0 ]
    [[ "$output" == *"Error: Prompts directory not found"* ]]
}

@test "6. Valid required args with non-existent --work-dir should exit non-zero" {
    run bash "$LOOP_SH" --prompts-dir "$PROMPTS_DIR" --session-dir "$SESSION_DIR" --work-dir "/tmp/non-existent-$(date +%s)"
    [ "$status" -ne 0 ]
    [[ "$output" == *"Error: Work directory not found"* ]]
}

@test "7. Default --mode should be plan-build-review" {
    # The script prints "Mode: $MODE" before it fails due to missing prompt files.
    run bash "$LOOP_SH" --prompts-dir "$PROMPTS_DIR" --session-dir "$SESSION_DIR" --work-dir "$WORK_DIR"
    # It should fail because PROMPTS_DIR is empty (no PROMPT_plan.md etc)
    [ "$status" -ne 0 ]
    [[ "$output" == *"Mode: plan-build-review"* ]]
}

@test "8. Custom --mode should be respected" {
    run bash "$LOOP_SH" --prompts-dir "$PROMPTS_DIR" --session-dir "$SESSION_DIR" --work-dir "$WORK_DIR" --mode plan-build
    [ "$status" -ne 0 ]
    [[ "$output" == *"Mode: plan-build"* ]]
}

@test "9. Custom --provider should be respected" {
    run bash "$LOOP_SH" --prompts-dir "$PROMPTS_DIR" --session-dir "$SESSION_DIR" --work-dir "$WORK_DIR" --provider gemini
    [ "$status" -ne 0 ]
    [[ "$output" == *"Provider: gemini"* ]]
}

@test "10. Custom --max-iterations should be respected" {
    run bash "$LOOP_SH" --prompts-dir "$PROMPTS_DIR" --session-dir "$SESSION_DIR" --work-dir "$WORK_DIR" --max-iterations 10
    [ "$status" -ne 0 ]
    [[ "$output" == *"Max iterations: 10"* ]]
}

@test "11. Custom --max-stuck should be respected" {
    run bash "$LOOP_SH" --prompts-dir "$PROMPTS_DIR" --session-dir "$SESSION_DIR" --work-dir "$WORK_DIR" --max-stuck 5
    [ "$status" -ne 0 ]
    [[ "$output" == *"Stuck threshold: 5"* ]]
}

@test "12. Valid --launch-mode 'restart' should be accepted" {
    # It should pass validation and fail later due to missing prompts
    run bash "$LOOP_SH" --prompts-dir "$PROMPTS_DIR" --session-dir "$SESSION_DIR" --work-dir "$WORK_DIR" --launch-mode restart
    [ "$status" -ne 0 ]
    [[ "$output" != *"Error: Invalid launch mode"* ]]
}

@test "13. Valid --launch-mode 'resume' should be accepted" {
    run bash "$LOOP_SH" --prompts-dir "$PROMPTS_DIR" --session-dir "$SESSION_DIR" --work-dir "$WORK_DIR" --launch-mode resume
    [ "$status" -ne 0 ]
    [[ "$output" != *"Error: Invalid launch mode"* ]]
}

@test "14. --help should print usage and exit non-zero" {
    run bash "$LOOP_SH" --help
    [ "$status" -ne 0 ]
    [[ "$output" == *"Usage: "* ]]
}

@test "15. Default --provider should be claude" {
    # The script prints "Provider: $PROVIDER" before it fails due to missing prompt files.
    run bash "$LOOP_SH" --prompts-dir "$PROMPTS_DIR" --session-dir "$SESSION_DIR" --work-dir "$WORK_DIR"
    [ "$status" -ne 0 ]
    [[ "$output" == *"Provider: claude"* ]]
}
