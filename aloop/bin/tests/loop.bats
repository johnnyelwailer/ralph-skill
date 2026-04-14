#!/usr/bin/env bats

# Aloop Loop Script Tests
# These tests treat loop.sh as a black box (black-box binary)
# and verify argument parsing and default values.
# No code modification allowed as per Constitution Rule 1.

# ---------------------------------------------------------------------------
# Stubs for sync_branch integration tests (tests 16-20).
# These are defined at file scope so they are available when sync_branch.sh
# is sourced inside setup() for each test.
# ---------------------------------------------------------------------------

# Captures every write_log_entry call as a JSON line in $LOG_FILE.
write_log_entry() {
    local event="$1"; shift
    local entry="{\"event\":\"$event\""
    while [ $# -ge 2 ]; do
        entry="$entry,\"$1\":\"$2\""
        shift 2
    done
    entry="$entry}"
    echo "$entry" >> "$LOG_FILE"
}

# Captures every write_log_entry_mixed call as a JSON line in $LOG_FILE.
write_log_entry_mixed() {
    local event="$1"
    local extra="${2:-}"
    echo "{\"event\":\"$event\"${extra:+,$extra}}" >> "$LOG_FILE"
}

# Initialises an isolated git environment: a bare remote and a local clone
# with a 'feature' branch checked out.  All paths are rooted under
# $TEST_TEMP_DIR which is created fresh per test.
_setup_sync_git_env() {
    local remote_dir="$TEST_TEMP_DIR/remote.git"
    git init --bare "$remote_dir" >/dev/null 2>&1
    git init "$WORK_DIR" >/dev/null 2>&1
    git -C "$WORK_DIR" config user.email "test@example.com" >/dev/null 2>&1
    git -C "$WORK_DIR" config user.name "Test" >/dev/null 2>&1
    git -C "$WORK_DIR" remote add origin "$remote_dir" >/dev/null 2>&1
    echo "init" > "$WORK_DIR/init.txt"
    git -C "$WORK_DIR" add init.txt >/dev/null 2>&1
    git -C "$WORK_DIR" commit -m "init" >/dev/null 2>&1
    git -C "$WORK_DIR" branch -M main >/dev/null 2>&1
    git -C "$WORK_DIR" push origin main >/dev/null 2>&1
    git -C "$WORK_DIR" checkout -b feature >/dev/null 2>&1
}

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

    # Variables required by sync_branch tests
    LOG_FILE="$TEST_TEMP_DIR/events.log"
    ITERATION="1"
    touch "$LOG_FILE"

    # Copy PROMPT_merge.md so conflict tests can find it
    local templates_dir
    templates_dir="$(cd "$BATS_TEST_DIRNAME/../../templates" && pwd)"
    if [ -f "$templates_dir/PROMPT_merge.md" ]; then
        cp "$templates_dir/PROMPT_merge.md" "$PROMPTS_DIR/"
    fi

    # Default meta.json (auto_merge=true, base_branch=main)
    echo '{"auto_merge": true, "base_branch": "main"}' > "$SESSION_DIR/meta.json"

    # Initialise isolated git environment for sync_branch tests
    _setup_sync_git_env

    # Source sync_branch function into the current shell.
    # The write_log_entry / write_log_entry_mixed stubs defined above
    # are already in scope, so sync_branch will call them.
    # shellcheck source=../lib/sync_branch.sh
    source "$(cd "$BATS_TEST_DIRNAME/.." && pwd)/lib/sync_branch.sh"
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

# ---------------------------------------------------------------------------
# sync_branch() integration tests (16-20)
# Each test calls sync_branch() directly (sourced in setup) against the
# isolated git environment created by _setup_sync_git_env().
# ---------------------------------------------------------------------------

@test "16. sync_branch logs branch_sync with result=up_to_date when already current" {
    sync_branch
    grep -q '"event":"branch_sync"' "$LOG_FILE"
    grep -q '"result":"up_to_date"' "$LOG_FILE"
    grep -q '"merged_commit_count":0' "$LOG_FILE"
}

@test "17. sync_branch logs branch_sync with result=merged and correct merged_commit_count after upstream commit" {
    # Push a new commit to remote main while on feature branch
    git -C "$WORK_DIR" checkout main >/dev/null 2>&1
    echo "upstream" > "$WORK_DIR/upstream.txt"
    git -C "$WORK_DIR" add upstream.txt >/dev/null 2>&1
    git -C "$WORK_DIR" commit -m "upstream commit" >/dev/null 2>&1
    git -C "$WORK_DIR" push origin main >/dev/null 2>&1
    git -C "$WORK_DIR" checkout feature >/dev/null 2>&1

    sync_branch
    grep -q '"event":"branch_sync"' "$LOG_FILE"
    grep -q '"result":"merged"' "$LOG_FILE"
    grep -q '"merged_commit_count":1' "$LOG_FILE"
}

@test "18. sync_branch returns 0 non-fatally when git fetch fails (broken remote)" {
    git -C "$WORK_DIR" remote set-url origin "/nonexistent/does-not-exist.git" >/dev/null 2>&1
    local rc=0
    sync_branch || rc=$?
    [ "$rc" -eq 0 ]
}

@test "19. sync_branch logs merge_conflict event, writes queue/000-merge-conflict.md, and returns 1 on conflict" {
    # Commit on feature branch
    echo "feature-change" > "$WORK_DIR/conflict.txt"
    git -C "$WORK_DIR" add conflict.txt >/dev/null 2>&1
    git -C "$WORK_DIR" commit -m "feature commit" >/dev/null 2>&1

    # Commit a conflicting change on main and push to remote
    git -C "$WORK_DIR" checkout main >/dev/null 2>&1
    echo "upstream-change" > "$WORK_DIR/conflict.txt"
    git -C "$WORK_DIR" add conflict.txt >/dev/null 2>&1
    git -C "$WORK_DIR" commit -m "upstream conflicting commit" >/dev/null 2>&1
    git -C "$WORK_DIR" push origin main >/dev/null 2>&1
    git -C "$WORK_DIR" checkout feature >/dev/null 2>&1

    local rc=0
    sync_branch || rc=$?
    [ "$rc" -eq 1 ]
    grep -q '"event":"merge_conflict"' "$LOG_FILE"
    [ -f "$SESSION_DIR/queue/000-merge-conflict.md" ]
}

@test "20. sync_branch skips sync and logs nothing when auto_merge=false in meta.json" {
    echo '{"auto_merge": false, "base_branch": "main"}' > "$SESSION_DIR/meta.json"
    sync_branch
    [ ! -s "$LOG_FILE" ]
}
