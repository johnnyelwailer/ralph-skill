#!/bin/bash
# Branch coverage harness for recently touched loop.sh runtime logic.
# Enforces Gate 3: >=80% branch-path coverage by default.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOOP_SH="$SCRIPT_DIR/loop.sh"
REPORT_PATH="${1:-coverage/shell-branch-coverage.json}"
MIN_BRANCH_COVERAGE="${MIN_BRANCH_COVERAGE:-80}"

if [[ "$REPORT_PATH" = /* ]]; then
    REPORT_FILE="$REPORT_PATH"
else
    REPORT_FILE="$REPO_ROOT/$REPORT_PATH"
fi

mkdir -p "$(dirname "$REPORT_FILE")"

declare -a BRANCH_ORDER=()
declare -A BRANCH_DESC=()
declare -A BRANCH_HIT=()
FAILED=0

register_branch() {
    local id="$1"
    local description="$2"
    BRANCH_ORDER+=("$id")
    BRANCH_DESC["$id"]="$description"
    BRANCH_HIT["$id"]=0
}

cover_branch() {
    local id="$1"
    BRANCH_HIT["$id"]=1
}

pass_case() {
    echo "PASS: $1"
}

fail_case() {
    echo "FAIL: $1"
    FAILED=1
}

extract_function() {
    local name="$1"
    sed -n "/^${name}() {/,/^}/p" "$LOOP_SH"
}

contains_log() {
    local needle="$1"
    grep -Fq "$needle" "$COVERAGE_LOG_FILE"
}

capture_resolved_provider() {
    local start_index="$1"
    local provider_file
    provider_file="$(mktemp)"
    resolve_healthy_provider "$start_index" > "$provider_file"
    CAPTURED_PROVIDER="$(cat "$provider_file")"
    rm -f "$provider_file"
}

run_invoke_provider() {
    local provider_name="$1"
    local prompt_content="$2"
    invoke_provider "$provider_name" "$prompt_content" >/dev/null 2>/dev/null
    local rc=$?
    return "$rc"
}

assert_no_return_trap() {
    if [ -n "$(trap -p RETURN)" ]; then
        fail_case "invoke_provider leaked RETURN trap state into caller"
        trap - RETURN
    fi
}

json_bool() {
    if [ "$1" -eq 1 ]; then
        printf 'true'
    else
        printf 'false'
    fi
}

register_branch "path.setup.create" "setup_gh_block creates gh and gh.exe shims"
register_branch "path.setup.reuse" "setup_gh_block reuses existing shim directory"
register_branch "path.cleanup.remove" "cleanup_gh_block removes shim directory and resets marker"
register_branch "path.cleanup.noop" "cleanup_gh_block safely no-ops when nothing is active"
register_branch "path.invoke.success" "invoke_provider claude success path returns 0 and clears error"
register_branch "path.invoke.opencode" "invoke_provider opencode success path"
register_branch "path.invoke.restore_success" "invoke_provider success restores PATH and keeps provider dir reachable"
register_branch "path.invoke.failure" "invoke_provider claude non-zero sets LAST_PROVIDER_ERROR and returns non-zero"
register_branch "path.invoke.restore_failure" "invoke_provider failure restores PATH"
register_branch "path.invoke.unsupported" "invoke_provider unsupported provider path returns non-zero"
register_branch "provider.healthy" "resolve_healthy_provider selects healthy provider immediately"
register_branch "provider.degraded_skip" "resolve_healthy_provider skips degraded provider and logs event"
register_branch "provider.all_degraded" "resolve_healthy_provider emits all_providers_degraded signal when all degraded"
register_branch "provider.cooldown_expired" "resolve_healthy_provider treats expired cooldown provider as available"
register_branch "provider.cooldown_wait" "resolve_healthy_provider waits/logs when all providers are in active cooldown"
register_branch "cycle.resolve.success" "resolve_cycle_prompt_from_plan resolves prompt name from valid loop-plan.json"
register_branch "cycle.resolve.missing_file" "resolve_cycle_prompt_from_plan returns 1 when file is missing"
register_branch "cycle.resolve.invalid_cycle" "resolve_cycle_prompt_from_plan returns 1 when cycle array is empty"
register_branch "cycle.resolve.modulo_wrap" "resolve_cycle_prompt_from_plan wraps cyclePosition via modulo"
register_branch "frontmatter.all_fields" "parse_frontmatter extracts trigger-capable fields from valid frontmatter"
register_branch "frontmatter.empty" "parse_frontmatter yields empty strings when no frontmatter block present"
register_branch "frontmatter.partial" "parse_frontmatter handles partial frontmatter with missing fields"
register_branch "frontmatter.exec_controls" "parse_frontmatter extracts timeout, max_retries, retry_backoff from valid frontmatter"
register_branch "duration.parse_seconds" "parse_duration_to_seconds parses plain integer as seconds"
register_branch "duration.parse_minutes" "parse_duration_to_seconds parses Nm as minutes"
register_branch "duration.parse_hours" "parse_duration_to_seconds parses Nh as hours"
register_branch "duration.parse_suffix_s" "parse_duration_to_seconds parses Ns as seconds"
register_branch "duration.parse_empty" "parse_duration_to_seconds returns empty for empty input"
register_branch "duration.parse_invalid" "parse_duration_to_seconds returns empty for invalid input"
register_branch "exec_controls.timeout_frontmatter" "resolve_execution_controls uses frontmatter timeout when valid"
register_branch "exec_controls.timeout_default" "resolve_execution_controls falls back to default timeout"
register_branch "exec_controls.retries_frontmatter" "resolve_execution_controls uses frontmatter max_retries when valid"
register_branch "exec_controls.retries_default" "resolve_execution_controls falls back to default max_retries"
register_branch "exec_controls.backoff_none" "resolve_execution_controls applies none backoff"
register_branch "exec_controls.backoff_linear" "resolve_execution_controls applies linear backoff"
register_branch "exec_controls.backoff_exponential" "resolve_execution_controls applies exponential backoff"
register_branch "exec_controls.backoff_default" "resolve_execution_controls defaults to none backoff"
register_branch "advance.with_cycle_length" "advance_cycle_position uses CYCLE_LENGTH for modulo when set"
register_branch "advance.fallback_mode" "advance_cycle_position falls back to MODE-based modulo when CYCLE_LENGTH unset"
register_branch "requests.wait.empty" "wait_for_requests returns immediately when no requests exist"
register_branch "requests.wait.success" "wait_for_requests polls until requests directory is empty"
register_branch "requests.wait.timeout" "wait_for_requests breaks loop after timeout"
register_branch "queue.empty" "run_queue_if_present returns 1 when queue is empty"
register_branch "queue.success" "run_queue_if_present runs item from queue and returns 0"
register_branch "queue.frontmatter" "run_queue_if_present respects frontmatter provider in queue item"
register_branch "queue.frontmatter_unavailable" "run_queue_if_present logs fallback when frontmatter provider is unavailable"
register_branch "phase_prereq.build.todo_missing" "check_phase_prerequisites forces plan when TODO.md file is missing"
register_branch "phase_prereq.build.todo_no_unchecked" "check_phase_prerequisites forces plan when TODO.md has zero unchecked tasks"
register_branch "phase_prereq.build.todo_has_unchecked" "check_phase_prerequisites allows build when TODO.md has unchecked tasks"
register_branch "phase_prereq.plan_passthrough" "check_phase_prerequisites passes through plan phase unchanged"
register_branch "phase_prereq.review.no_builds" "check_phase_prerequisites forces build when no commits since last plan"
register_branch "phase_prereq.review.has_builds" "check_phase_prerequisites allows review when commits exist"
register_branch "sync.merged" "sync_branch merges upstream commits and logs branch_sync result=merged"
register_branch "sync.up_to_date" "sync_branch logs branch_sync result=up_to_date when already current"
register_branch "sync.fetch_failure" "sync_branch continues non-fatally when git fetch fails"
register_branch "sync.conflict" "sync_branch logs merge_conflict, writes queue file, aborts merge, returns non-zero"
register_branch "sync.disabled" "sync_branch skips when auto_merge is false"

RESOLVE_FUNC="$(extract_function resolve_healthy_provider)"
SETUP_FUNC="$(extract_function setup_gh_block)"
CLEANUP_FUNC="$(extract_function cleanup_gh_block)"
INVOKE_FUNC="$(extract_function invoke_provider)"
WAIT_FUNC="$(extract_function _wait_for_provider)"
KILL_PROVIDER_FUNC="$(extract_function kill_active_provider)"
CYCLE_RESOLVE_FUNC="$(extract_function resolve_cycle_prompt_from_plan)"
CHECK_PHASE_PREREQ_FUNC="$(extract_function check_phase_prerequisites)"
CHECK_HAS_BUILDS_FUNC="$(extract_function check_has_builds_to_review)"
FRONTMATTER_FUNC="$(extract_function parse_frontmatter)"
DURATION_FUNC="$(extract_function parse_duration_to_seconds)"
EXEC_CONTROLS_FUNC="$(extract_function resolve_execution_controls)"
ADVANCE_FUNC="$(extract_function advance_cycle_position)"
WAIT_FOR_REQUESTS_FUNC="$(extract_function wait_for_requests)"
RUN_QUEUE_FUNC="$(extract_function run_queue_if_present)"
RESOLVE_MODE_FUNC="$(extract_function resolve_iteration_mode)"
DERIVE_MODE_FUNC="$(extract_function derive_mode_from_prompt_name)"
SYNC_BRANCH_FUNC="$(extract_function sync_branch)"

if [ -z "$RESOLVE_FUNC" ] || [ -z "$SETUP_FUNC" ] || [ -z "$CLEANUP_FUNC" ] || [ -z "$INVOKE_FUNC" ] || [ -z "$WAIT_FUNC" ] || [ -z "$KILL_PROVIDER_FUNC" ]; then
    echo "FAIL: could not extract one or more target functions from $LOOP_SH"
    exit 1
fi

if [ -z "$CYCLE_RESOLVE_FUNC" ] || [ -z "$CHECK_PHASE_PREREQ_FUNC" ] || [ -z "$CHECK_HAS_BUILDS_FUNC" ] || [ -z "$FRONTMATTER_FUNC" ] || [ -z "$DURATION_FUNC" ] || [ -z "$EXEC_CONTROLS_FUNC" ] || [ -z "$ADVANCE_FUNC" ] || [ -z "$WAIT_FOR_REQUESTS_FUNC" ] || [ -z "$RUN_QUEUE_FUNC" ] || [ -z "$RESOLVE_MODE_FUNC" ] || [ -z "$DERIVE_MODE_FUNC" ]; then
    echo "FAIL: could not extract cycle/frontmatter/duration/exec-controls/advance/requests/queue functions from $LOOP_SH"
    exit 1
fi

if [ -z "$SYNC_BRANCH_FUNC" ]; then
    echo "FAIL: could not extract sync_branch from $LOOP_SH"
    exit 1
fi

eval "$RESOLVE_FUNC"
eval "$SETUP_FUNC"
eval "$CLEANUP_FUNC"
eval "$KILL_PROVIDER_FUNC"
eval "$WAIT_FUNC"
eval "$INVOKE_FUNC"
eval "$CYCLE_RESOLVE_FUNC"
eval "$CHECK_PHASE_PREREQ_FUNC"
eval "$CHECK_HAS_BUILDS_FUNC"
eval "$FRONTMATTER_FUNC"
eval "$DURATION_FUNC"
eval "$EXEC_CONTROLS_FUNC"
eval "$ADVANCE_FUNC"
eval "$WAIT_FOR_REQUESTS_FUNC"
eval "$RUN_QUEUE_FUNC"
eval "$RESOLVE_MODE_FUNC"
eval "$DERIVE_MODE_FUNC"
eval "$SYNC_BRANCH_FUNC"

ORIGINAL_PATH="$PATH"
_gh_block_dir=""
LAST_PROVIDER_ERROR=""
ACTIVE_PROVIDER_PID=""
PROVIDER_TIMEOUT=30
CLAUDE_MODEL="test"
LOG_FILE="$(mktemp)"
COVERAGE_LOG_FILE="$(mktemp)"
PROVIDER_PATH_MARKER="$(mktemp)"
FAKE_PROVIDER_DIR="$(mktemp -d)"
DC_EXEC=()
SESSION_DIR=""
WORK_DIR=""
ITERATION=1
STUCK_COUNT=0

# Minimal dependencies for tested functions.
write_log_entry() {
    local event="$1"
    shift
    local line="$event"
    while [ $# -gt 1 ]; do
        line="$line|$1=$2"
        shift 2
    done
    echo "$line" >> "$COVERAGE_LOG_FILE"
}

write_log_entry_mixed() {
    local event="$1"
    local extra_json="$2"
    echo "${event}|${extra_json}" >> "$COVERAGE_LOG_FILE"
}

write_status() { :; }
update_provider_health_on_success() { :; }
update_provider_health_on_failure() { :; }

declare -A STATUS_BY_PROVIDER=()
declare -A COOLDOWN_BY_PROVIDER=()
declare -A REASON_BY_PROVIDER=()
HEALTH_STATUS=""
HEALTH_COOLDOWN_UNTIL=""
HEALTH_FAILURE_REASON=""

get_provider_health_state() {
    local provider="$1"
    local status="${STATUS_BY_PROVIDER[$provider]-}"
    if [ -z "$status" ]; then
        return 1
    fi
    HEALTH_STATUS="$status"
    HEALTH_COOLDOWN_UNTIL="${COOLDOWN_BY_PROVIDER[$provider]-}"
    HEALTH_FAILURE_REASON="${REASON_BY_PROVIDER[$provider]-}"
    return 0
}

timestamp_to_epoch() {
    date -u -d "$1" +%s 2>/dev/null
}

SLEEP_CALLS=0
SLEEP_EXIT_CODE=0
SLEEP_HOOK=""
sleep() {
    SLEEP_CALLS=$((SLEEP_CALLS + 1))
    if [ -n "$SLEEP_HOOK" ]; then
        eval "$SLEEP_HOOK"
    fi
    return "$SLEEP_EXIT_CODE"
}

# ---------------------------------------------------------------------------
# PATH hardening branches
# ---------------------------------------------------------------------------

setup_gh_block >/dev/null
first_block_dir="$_gh_block_dir"
if [ -d "$first_block_dir" ] && [ -x "$first_block_dir/gh" ] && [ -x "$first_block_dir/gh.exe" ]; then
    cover_branch "path.setup.create"
    pass_case "setup_gh_block creates executable gh/gh.exe shims"
else
    fail_case "setup_gh_block did not create expected shims"
fi

setup_gh_block >/dev/null
second_block_dir="$_gh_block_dir"
if [ "$second_block_dir" = "$first_block_dir" ]; then
    cover_branch "path.setup.reuse"
    pass_case "setup_gh_block reuses existing shim directory"
else
    fail_case "setup_gh_block did not reuse existing shim directory"
fi

cleanup_gh_block
if [ ! -d "$first_block_dir" ] && [ -z "$_gh_block_dir" ]; then
    cover_branch "path.cleanup.remove"
    pass_case "cleanup_gh_block removes shim directory and resets marker"
else
    fail_case "cleanup_gh_block did not remove/reset state"
fi

cleanup_gh_block
if [ -z "$_gh_block_dir" ]; then
    cover_branch "path.cleanup.noop"
    pass_case "cleanup_gh_block no-op path is safe"
else
    fail_case "cleanup_gh_block no-op path mutated state"
fi

cat > "$FAKE_PROVIDER_DIR/claude" << 'SCRIPT'
#!/bin/bash
echo "$PATH" > "${ALOOP_TEST_PATH_MARKER}"
echo "ok"
exit 0
SCRIPT
chmod +x "$FAKE_PROVIDER_DIR/claude"
cat > "$FAKE_PROVIDER_DIR/opencode" << 'SCRIPT'
#!/bin/bash
echo "ok"
exit 0
SCRIPT
chmod +x "$FAKE_PROVIDER_DIR/opencode"
cat > "$FAKE_PROVIDER_DIR/gh" << 'SCRIPT'
#!/bin/bash
echo "real-gh"
exit 0
SCRIPT
chmod +x "$FAKE_PROVIDER_DIR/gh"

export ALOOP_TEST_PATH_MARKER="$PROVIDER_PATH_MARKER"
PATH="$FAKE_PROVIDER_DIR:$ORIGINAL_PATH"
pre_success_path="$PATH"

if run_invoke_provider "claude" "test prompt"; then
    assert_no_return_trap
    if [ -z "$LAST_PROVIDER_ERROR" ]; then
        cover_branch "path.invoke.success"
        pass_case "invoke_provider success branch returns 0 and clears LAST_PROVIDER_ERROR"
    else
        fail_case "invoke_provider success branch left LAST_PROVIDER_ERROR populated"
    fi
else
    fail_case "invoke_provider success branch returned non-zero"
fi

if run_invoke_provider "opencode" "test prompt"; then
    assert_no_return_trap
    cover_branch "path.invoke.opencode"
    pass_case "invoke_provider opencode success path"
else
    fail_case "invoke_provider opencode failed"
fi

provider_saw_path="$(cat "$PROVIDER_PATH_MARKER" 2>/dev/null || true)"
provider_first_dir="${provider_saw_path%%:*}"
provider_dir_present=0
if echo "$provider_saw_path" | tr ':' '\n' | grep -Fxq "$FAKE_PROVIDER_DIR"; then
    provider_dir_present=1
fi

if [ "$PATH" = "$pre_success_path" ] && [ -f "$provider_first_dir/gh" ] && grep -q "blocked by aloop" "$provider_first_dir/gh" 2>/dev/null && [ "$provider_dir_present" -eq 1 ]; then
    cover_branch "path.invoke.restore_success"
    pass_case "invoke_provider success restored PATH with shim precedence and preserved provider directory"
else
    fail_case "invoke_provider success did not enforce expected PATH behavior"
fi

cat > "$FAKE_PROVIDER_DIR/claude" << 'SCRIPT'
#!/bin/bash
echo "failure" >&2
exit 3
SCRIPT
chmod +x "$FAKE_PROVIDER_DIR/claude"

PATH="$FAKE_PROVIDER_DIR:$ORIGINAL_PATH"
pre_failure_path="$PATH"
LAST_PROVIDER_ERROR=""
run_invoke_provider "claude" "test prompt"
rc=$?
assert_no_return_trap
if [ "$rc" -ne 0 ] && echo "$LAST_PROVIDER_ERROR" | grep -q "claude exited with code 3"; then
    cover_branch "path.invoke.failure"
    pass_case "invoke_provider failure branch returns non-zero and captures stderr summary"
else
    fail_case "invoke_provider failure branch did not set expected error metadata"
fi

if [ "$PATH" = "$pre_failure_path" ]; then
    cover_branch "path.invoke.restore_failure"
    pass_case "invoke_provider failure branch restores PATH"
else
    fail_case "invoke_provider failure branch did not restore PATH"
fi

PATH="$ORIGINAL_PATH"
LAST_PROVIDER_ERROR=""
run_invoke_provider "unsupported-provider" "test prompt"
rc=$?
assert_no_return_trap
if [ "$rc" -ne 0 ] && echo "$LAST_PROVIDER_ERROR" | grep -q "unsupported provider"; then
    cover_branch "path.invoke.unsupported"
    pass_case "invoke_provider unsupported provider branch returns non-zero"
else
    fail_case "invoke_provider unsupported provider branch failed validation"
fi

# ---------------------------------------------------------------------------
# Provider health branches (resolve_healthy_provider)
# ---------------------------------------------------------------------------

SLEEP_CALLS=0
SLEEP_EXIT_CODE=0
SLEEP_HOOK=""
: > "$COVERAGE_LOG_FILE"
STATUS_BY_PROVIDER=()
COOLDOWN_BY_PROVIDER=()
REASON_BY_PROVIDER=()
RR_PROVIDERS=(claude codex)
STATUS_BY_PROVIDER[claude]="healthy"
capture_resolved_provider 0
if [ "$CAPTURED_PROVIDER" = "claude" ]; then
    cover_branch "provider.healthy"
    pass_case "resolve_healthy_provider selects healthy provider"
else
    fail_case "resolve_healthy_provider failed healthy-provider selection"
fi

SLEEP_CALLS=0
SLEEP_EXIT_CODE=0
SLEEP_HOOK=""
: > "$COVERAGE_LOG_FILE"
STATUS_BY_PROVIDER=()
COOLDOWN_BY_PROVIDER=()
REASON_BY_PROVIDER=()
RR_PROVIDERS=(claude codex)
STATUS_BY_PROVIDER[claude]="degraded"
REASON_BY_PROVIDER[claude]="auth"
STATUS_BY_PROVIDER[codex]="healthy"
capture_resolved_provider 0
if [ "$CAPTURED_PROVIDER" = "codex" ] && contains_log "provider_skipped_degraded|provider=claude|reason=auth"; then
    cover_branch "provider.degraded_skip"
    pass_case "resolve_healthy_provider skips degraded providers and logs reason"
else
    fail_case "resolve_healthy_provider degraded skip branch failed"
fi

SLEEP_CALLS=0
SLEEP_EXIT_CODE=77
SLEEP_HOOK=""
: > "$COVERAGE_LOG_FILE"
STATUS_BY_PROVIDER=()
COOLDOWN_BY_PROVIDER=()
REASON_BY_PROVIDER=()
RR_PROVIDERS=(claude codex)
STATUS_BY_PROVIDER[claude]="degraded"
REASON_BY_PROVIDER[claude]="auth"
STATUS_BY_PROVIDER[codex]="degraded"
REASON_BY_PROVIDER[codex]="quota"
(
    set -e
    resolve_healthy_provider 0 >/dev/null
) >/dev/null 2>&1
rc=$?
SLEEP_EXIT_CODE=0
if [ "$rc" -eq 77 ] && contains_log "all_providers_degraded" && contains_log "all_providers_unavailable"; then
    cover_branch "provider.all_degraded"
    pass_case "resolve_healthy_provider all-degraded branch emits degraded + unavailable events"
else
    fail_case "resolve_healthy_provider all-degraded branch failed"
fi

SLEEP_CALLS=0
SLEEP_EXIT_CODE=0
SLEEP_HOOK=""
: > "$COVERAGE_LOG_FILE"
STATUS_BY_PROVIDER=()
COOLDOWN_BY_PROVIDER=()
REASON_BY_PROVIDER=()
RR_PROVIDERS=(claude codex)
STATUS_BY_PROVIDER[claude]="cooldown"
past_epoch=$(( $(date -u +%s) - 30 ))
COOLDOWN_BY_PROVIDER[claude]="$(date -u -d "@$past_epoch" +%Y-%m-%dT%H:%M:%SZ)"
capture_resolved_provider 0
if [ "$CAPTURED_PROVIDER" = "claude" ]; then
    cover_branch "provider.cooldown_expired"
    pass_case "resolve_healthy_provider uses provider when cooldown has expired"
else
    fail_case "resolve_healthy_provider cooldown-expired branch failed"
fi

SLEEP_CALLS=0
SLEEP_EXIT_CODE=0
now_epoch=$(date -u +%s)
SLEEP_HOOK='STATUS_BY_PROVIDER[codex]="healthy"; COOLDOWN_BY_PROVIDER[codex]=""'
: > "$COVERAGE_LOG_FILE"
STATUS_BY_PROVIDER=()
COOLDOWN_BY_PROVIDER=()
REASON_BY_PROVIDER=()
RR_PROVIDERS=(claude codex)
STATUS_BY_PROVIDER[claude]="cooldown"
COOLDOWN_BY_PROVIDER[claude]="$(date -u -d "@$((now_epoch + 180))" +%Y-%m-%dT%H:%M:%SZ)"
STATUS_BY_PROVIDER[codex]="cooldown"
COOLDOWN_BY_PROVIDER[codex]="$(date -u -d "@$((now_epoch + 120))" +%Y-%m-%dT%H:%M:%SZ)"
capture_resolved_provider 0
SLEEP_HOOK=""
if [ "$CAPTURED_PROVIDER" = "codex" ] && [ "$SLEEP_CALLS" -ge 1 ] && contains_log "all_providers_unavailable"; then
    cover_branch "provider.cooldown_wait"
    pass_case "resolve_healthy_provider cooldown wait branch sleeps/logs then retries"
else
    fail_case "resolve_healthy_provider cooldown wait branch failed"
fi

trap - RETURN
PATH="$ORIGINAL_PATH"
cleanup_gh_block
rm -rf "$FAKE_PROVIDER_DIR"
rm -f "$PROVIDER_PATH_MARKER" "$LOG_FILE" "$LOG_FILE.raw" "$COVERAGE_LOG_FILE"

# ---------------------------------------------------------------------------
# Cycle resolution branches (resolve_cycle_prompt_from_plan)
# ---------------------------------------------------------------------------

CYCLE_TMPDIR="$(mktemp -d)"

# cycle.resolve.success — valid loop-plan.json at position 0
LOOP_PLAN_FILE="$CYCLE_TMPDIR/loop-plan.json"
CYCLE_POSITION=0
CYCLE_LENGTH=0
RESOLVED_PROMPT_NAME=""
cat > "$LOOP_PLAN_FILE" << 'JSON'
{"cycle":["PROMPT_plan.md","PROMPT_build.md","PROMPT_review.md"],"cyclePosition":1}
JSON
if resolve_cycle_prompt_from_plan && [ "$RESOLVED_PROMPT_NAME" = "PROMPT_build.md" ] && [ "$CYCLE_LENGTH" -eq 3 ] && [ "$CYCLE_POSITION" -eq 1 ]; then
    cover_branch "cycle.resolve.success"
    pass_case "resolve_cycle_prompt_from_plan resolves prompt from valid JSON"
else
    fail_case "resolve_cycle_prompt_from_plan did not resolve expected prompt (got: $RESOLVED_PROMPT_NAME, len=$CYCLE_LENGTH, pos=$CYCLE_POSITION)"
fi

# cycle.resolve.missing_file — file does not exist
LOOP_PLAN_FILE="$CYCLE_TMPDIR/nonexistent.json"
CYCLE_POSITION=0
RESOLVED_PROMPT_NAME=""
if ! resolve_cycle_prompt_from_plan; then
    cover_branch "cycle.resolve.missing_file"
    pass_case "resolve_cycle_prompt_from_plan returns 1 for missing file"
else
    fail_case "resolve_cycle_prompt_from_plan should have returned 1 for missing file"
fi

# cycle.resolve.invalid_cycle — empty cycle array
LOOP_PLAN_FILE="$CYCLE_TMPDIR/empty-cycle.json"
cat > "$LOOP_PLAN_FILE" << 'JSON'
{"cycle":[],"cyclePosition":0}
JSON
if ! resolve_cycle_prompt_from_plan; then
    cover_branch "cycle.resolve.invalid_cycle"
    pass_case "resolve_cycle_prompt_from_plan returns 1 for empty cycle"
else
    fail_case "resolve_cycle_prompt_from_plan should have returned 1 for empty cycle"
fi

# cycle.resolve.modulo_wrap — position > cycle length wraps correctly
LOOP_PLAN_FILE="$CYCLE_TMPDIR/wrap.json"
CYCLE_POSITION=0
RESOLVED_PROMPT_NAME=""
cat > "$LOOP_PLAN_FILE" << 'JSON'
{"cycle":["PROMPT_plan.md","PROMPT_build.md"],"cyclePosition":5}
JSON
if resolve_cycle_prompt_from_plan && [ "$RESOLVED_PROMPT_NAME" = "PROMPT_build.md" ] && [ "$CYCLE_POSITION" -eq 5 ]; then
    cover_branch "cycle.resolve.modulo_wrap"
    pass_case "resolve_cycle_prompt_from_plan wraps position 5 modulo 2 to index 1"
else
    fail_case "resolve_cycle_prompt_from_plan modulo wrap failed (got: $RESOLVED_PROMPT_NAME, pos=$CYCLE_POSITION)"
fi

rm -rf "$CYCLE_TMPDIR"

# ---------------------------------------------------------------------------
# Phase prerequisite branches (check_phase_prerequisites)
# ---------------------------------------------------------------------------

PHASE_TMPDIR="$(mktemp -d)"

# phase_prereq.build.todo_missing — file does not exist
PLAN_FILE="$PHASE_TMPDIR/nonexistent-todo-missing.md"
AFTER_PREREQ=$(check_phase_prerequisites "build")
if [ "$AFTER_PREREQ" = "plan" ]; then
    cover_branch "phase_prereq.build.todo_missing"
    pass_case "check_phase_prerequisites forces plan when TODO.md is missing"
else
    fail_case "check_phase_prerequisites should force plan when TODO.md missing (got: $AFTER_PREREQ)"
fi

# phase_prereq.build.todo_no_unchecked — file exists but all tasks checked
PLAN_FILE="$PHASE_TMPDIR/todo-all-checked.md"
echo "- [x] Done task" > "$PLAN_FILE"
AFTER_PREREQ=$(check_phase_prerequisites "build")
if [ "$AFTER_PREREQ" = "plan" ]; then
    cover_branch "phase_prereq.build.todo_no_unchecked"
    pass_case "check_phase_prerequisites forces plan when TODO.md has zero unchecked tasks"
else
    fail_case "check_phase_prerequisites should force plan with zero unchecked (got: $AFTER_PREREQ)"
fi

# phase_prereq.build.todo_has_unchecked — file exists with unchecked tasks
PLAN_FILE="$PHASE_TMPDIR/todo-with-tasks.md"
printf "%b" "- [ ] Task 1\n- [x] Done task\n" > "$PLAN_FILE"
AFTER_PREREQ=$(check_phase_prerequisites "build")
if [ "$AFTER_PREREQ" = "build" ]; then
    cover_branch "phase_prereq.build.todo_has_unchecked"
    pass_case "check_phase_prerequisites allows build when TODO.md has unchecked tasks"
else
    fail_case "check_phase_prerequisites should allow build with unchecked tasks (got: $AFTER_PREREQ)"
fi

# phase_prereq.plan_passthrough — plan phase passes through regardless
PLAN_FILE="$PHASE_TMPDIR/nonexistent-plan.md"
AFTER_PREREQ=$(check_phase_prerequisites "plan")
if [ "$AFTER_PREREQ" = "plan" ]; then
    cover_branch "phase_prereq.plan_passthrough"
    pass_case "check_phase_prerequisites passes through plan phase unchanged"
else
    fail_case "check_phase_prerequisites should pass through plan (got: $AFTER_PREREQ)"
fi

# phase_prereq.review.no_builds — review with no commits since last plan
REVIEW_TMPDIR="$(mktemp -d)"
WORK_DIR="$REVIEW_TMPDIR"
git init -q "$REVIEW_TMPDIR"
git -C "$REVIEW_TMPDIR" config user.name "Test"
git -C "$REVIEW_TMPDIR" config user.email "test@example.com"
echo "seed" > "$REVIEW_TMPDIR/seed.txt"
git -C "$REVIEW_TMPDIR" add seed.txt
git -C "$REVIEW_TMPDIR" commit -m "seed" -m "Aloop-Iteration: 0" -q
LAST_PLAN_COMMIT=$(git -C "$REVIEW_TMPDIR" rev-parse HEAD)
AFTER_PREREQ=$(check_phase_prerequisites "review")
if [ "$AFTER_PREREQ" = "build" ]; then
    cover_branch "phase_prereq.review.no_builds"
    pass_case "check_phase_prerequisites forces build when no commits since last plan"
else
    fail_case "check_phase_prerequisites should force build with no new commits (got: $AFTER_PREREQ)"
fi

# phase_prereq.review.has_builds — review with new commits since last plan
echo "new" > "$REVIEW_TMPDIR/new.txt"
git -C "$REVIEW_TMPDIR" add new.txt
git -C "$REVIEW_TMPDIR" commit -m "new build" -q
AFTER_PREREQ=$(check_phase_prerequisites "review")
if [ "$AFTER_PREREQ" = "review" ]; then
    cover_branch "phase_prereq.review.has_builds"
    pass_case "check_phase_prerequisites allows review when new commits exist"
else
    fail_case "check_phase_prerequisites should allow review with new commits (got: $AFTER_PREREQ)"
fi

rm -rf "$PHASE_TMPDIR" "$REVIEW_TMPDIR"

# ---------------------------------------------------------------------------
# Frontmatter parsing branches (parse_frontmatter)
# ---------------------------------------------------------------------------

FM_TMPDIR="$(mktemp -d)"

# frontmatter.all_fields — file with trigger field
FM_ALL="$FM_TMPDIR/all.md"
cat > "$FM_ALL" << 'EOF'
---
provider: claude
model: opus
agent: coder
reasoning: xhigh
trigger: all_tasks_done
---
Build the thing.
EOF
FRONTMATTER_PROVIDER="" FRONTMATTER_MODEL="" FRONTMATTER_AGENT="" FRONTMATTER_REASONING="" FRONTMATTER_TRIGGER=""
parse_frontmatter "$FM_ALL"
if [ "$FRONTMATTER_PROVIDER" = "claude" ] && [ "$FRONTMATTER_MODEL" = "opus" ] && [ "$FRONTMATTER_AGENT" = "coder" ] && [ "$FRONTMATTER_REASONING" = "xhigh" ] && [ "$FRONTMATTER_TRIGGER" = "all_tasks_done" ]; then
    cover_branch "frontmatter.all_fields"
    pass_case "parse_frontmatter extracts trigger-capable fields"
else
    fail_case "parse_frontmatter all_fields failed (provider=$FRONTMATTER_PROVIDER model=$FRONTMATTER_MODEL agent=$FRONTMATTER_AGENT reasoning=$FRONTMATTER_REASONING trigger=$FRONTMATTER_TRIGGER)"
fi

# frontmatter.empty — file with no frontmatter block
FM_EMPTY="$FM_TMPDIR/empty.md"
cat > "$FM_EMPTY" << 'EOF'
Just a plain prompt file with no frontmatter.
EOF
FRONTMATTER_PROVIDER="leftover" FRONTMATTER_MODEL="leftover"
parse_frontmatter "$FM_EMPTY"
if [ -z "$FRONTMATTER_PROVIDER" ] && [ -z "$FRONTMATTER_MODEL" ] && [ -z "$FRONTMATTER_AGENT" ] && [ -z "$FRONTMATTER_REASONING" ] && [ -z "$FRONTMATTER_TRIGGER" ]; then
    cover_branch "frontmatter.empty"
    pass_case "parse_frontmatter yields empty strings for no-frontmatter file"
else
    fail_case "parse_frontmatter empty failed (provider=$FRONTMATTER_PROVIDER)"
fi

# frontmatter.partial — file with only provider and reasoning
FM_PARTIAL="$FM_TMPDIR/partial.md"
cat > "$FM_PARTIAL" << 'EOF'
---
provider: opencode
reasoning: medium
---
Do the partial thing.
EOF
FRONTMATTER_PROVIDER="" FRONTMATTER_MODEL="" FRONTMATTER_AGENT="" FRONTMATTER_REASONING="" FRONTMATTER_TRIGGER=""
parse_frontmatter "$FM_PARTIAL"
if [ "$FRONTMATTER_PROVIDER" = "opencode" ] && [ -z "$FRONTMATTER_MODEL" ] && [ -z "$FRONTMATTER_AGENT" ] && [ "$FRONTMATTER_REASONING" = "medium" ] && [ -z "$FRONTMATTER_TRIGGER" ]; then
    cover_branch "frontmatter.partial"
    pass_case "parse_frontmatter handles partial frontmatter correctly"
else
    fail_case "parse_frontmatter partial failed (provider=$FRONTMATTER_PROVIDER model=$FRONTMATTER_MODEL reasoning=$FRONTMATTER_REASONING trigger=$FRONTMATTER_TRIGGER)"
fi

# frontmatter.exec_controls — file with timeout, max_retries, retry_backoff
FM_EXEC="$FM_TMPDIR/exec-controls.md"
cat > "$FM_EXEC" << 'EOF'
---
provider: claude
model: opus
timeout: 30m
max_retries: 5
retry_backoff: exponential
---
Execute with controls.
EOF
FRONTMATTER_PROVIDER="" FRONTMATTER_MODEL="" FRONTMATTER_TIMEOUT="" FRONTMATTER_MAX_RETRIES="" FRONTMATTER_RETRY_BACKOFF=""
parse_frontmatter "$FM_EXEC"
if [ "$FRONTMATTER_TIMEOUT" = "30m" ] && [ "$FRONTMATTER_MAX_RETRIES" = "5" ] && [ "$FRONTMATTER_RETRY_BACKOFF" = "exponential" ]; then
    cover_branch "frontmatter.exec_controls"
    pass_case "parse_frontmatter extracts execution control fields"
else
    fail_case "parse_frontmatter exec_controls failed (timeout=$FRONTMATTER_TIMEOUT max_retries=$FRONTMATTER_MAX_RETRIES retry_backoff=$FRONTMATTER_RETRY_BACKOFF)"
fi

rm -rf "$FM_TMPDIR"

# ---------------------------------------------------------------------------
# Duration parsing branches (parse_duration_to_seconds)
# ---------------------------------------------------------------------------

# duration.parse_seconds — plain integer
_result=$(parse_duration_to_seconds "3600")
if [ "$_result" = "3600" ]; then
    cover_branch "duration.parse_seconds"
    pass_case "parse_duration_to_seconds parses plain integer"
else
    fail_case "duration.parse_seconds failed (got '$_result', expected '3600')"
fi

# duration.parse_minutes — Nm
_result=$(parse_duration_to_seconds "30m")
if [ "$_result" = "1800" ]; then
    cover_branch "duration.parse_minutes"
    pass_case "parse_duration_to_seconds parses minutes (30m = 1800)"
else
    fail_case "duration.parse_minutes failed (got '$_result', expected '1800')"
fi

# duration.parse_hours — Nh
_result=$(parse_duration_to_seconds "2h")
if [ "$_result" = "7200" ]; then
    cover_branch "duration.parse_hours"
    pass_case "parse_duration_to_seconds parses hours (2h = 7200)"
else
    fail_case "duration.parse_hours failed (got '$_result', expected '7200')"
fi

# duration.parse_suffix_s — Ns
_result=$(parse_duration_to_seconds "90s")
if [ "$_result" = "90" ]; then
    cover_branch "duration.parse_suffix_s"
    pass_case "parse_duration_to_seconds parses seconds suffix (90s = 90)"
else
    fail_case "duration.parse_suffix_s failed (got '$_result', expected '90')"
fi

# duration.parse_empty — empty input
_result=$(parse_duration_to_seconds "")
if [ -z "$_result" ]; then
    cover_branch "duration.parse_empty"
    pass_case "parse_duration_to_seconds returns empty for empty input"
else
    fail_case "duration.parse_empty failed (got '$_result', expected empty)"
fi

# duration.parse_invalid — invalid input
_result=$(parse_duration_to_seconds "abc")
if [ -z "$_result" ]; then
    cover_branch "duration.parse_invalid"
    pass_case "parse_duration_to_seconds returns empty for invalid input"
else
    fail_case "duration.parse_invalid failed (got '$_result', expected empty)"
fi

# ---------------------------------------------------------------------------
# Execution controls resolution branches (resolve_execution_controls)
# ---------------------------------------------------------------------------

# exec_controls.timeout_frontmatter — frontmatter timeout takes precedence
FRONTMATTER_TIMEOUT="10m" FRONTMATTER_MAX_RETRIES="" FRONTMATTER_RETRY_BACKOFF=""
PROVIDER_TIMEOUT="999" MAX_PHASE_RETRIES="10"
resolve_execution_controls
if [ "$EFFECTIVE_TIMEOUT" = "600" ]; then
    cover_branch "exec_controls.timeout_frontmatter"
    pass_case "resolve_execution_controls uses frontmatter timeout (10m = 600s)"
else
    fail_case "exec_controls.timeout_frontmatter failed (got '$EFFECTIVE_TIMEOUT', expected '600')"
fi

# exec_controls.timeout_default — falls back when no frontmatter timeout
FRONTMATTER_TIMEOUT="" FRONTMATTER_MAX_RETRIES="" FRONTMATTER_RETRY_BACKOFF=""
PROVIDER_TIMEOUT="10800" MAX_PHASE_RETRIES="10"
resolve_execution_controls
if [ "$EFFECTIVE_TIMEOUT" = "10800" ]; then
    cover_branch "exec_controls.timeout_default"
    pass_case "resolve_execution_controls falls back to default timeout"
else
    fail_case "exec_controls.timeout_default failed (got '$EFFECTIVE_TIMEOUT', expected '10800')"
fi

# exec_controls.retries_frontmatter — frontmatter max_retries takes precedence
FRONTMATTER_TIMEOUT="" FRONTMATTER_MAX_RETRIES="7" FRONTMATTER_RETRY_BACKOFF=""
PROVIDER_TIMEOUT="10800" MAX_PHASE_RETRIES="10"
resolve_execution_controls
if [ "$EFFECTIVE_MAX_RETRIES" = "7" ]; then
    cover_branch "exec_controls.retries_frontmatter"
    pass_case "resolve_execution_controls uses frontmatter max_retries"
else
    fail_case "exec_controls.retries_frontmatter failed (got '$EFFECTIVE_MAX_RETRIES', expected '7')"
fi

# exec_controls.retries_default — falls back when no frontmatter max_retries
FRONTMATTER_TIMEOUT="" FRONTMATTER_MAX_RETRIES="" FRONTMATTER_RETRY_BACKOFF=""
PROVIDER_TIMEOUT="10800" MAX_PHASE_RETRIES="10"
resolve_execution_controls
if [ "$EFFECTIVE_MAX_RETRIES" = "10" ]; then
    cover_branch "exec_controls.retries_default"
    pass_case "resolve_execution_controls falls back to default max_retries"
else
    fail_case "exec_controls.retries_default failed (got '$EFFECTIVE_MAX_RETRIES', expected '10')"
fi

# exec_controls.backoff_none — explicit none
FRONTMATTER_TIMEOUT="" FRONTMATTER_MAX_RETRIES="" FRONTMATTER_RETRY_BACKOFF="none"
PROVIDER_TIMEOUT="10800" MAX_PHASE_RETRIES="10"
resolve_execution_controls
if [ "$EFFECTIVE_RETRY_BACKOFF" = "none" ]; then
    cover_branch "exec_controls.backoff_none"
    pass_case "resolve_execution_controls applies none backoff"
else
    fail_case "exec_controls.backoff_none failed (got '$EFFECTIVE_RETRY_BACKOFF', expected 'none')"
fi

# exec_controls.backoff_linear — explicit linear
FRONTMATTER_TIMEOUT="" FRONTMATTER_MAX_RETRIES="" FRONTMATTER_RETRY_BACKOFF="linear"
PROVIDER_TIMEOUT="10800" MAX_PHASE_RETRIES="10"
resolve_execution_controls
if [ "$EFFECTIVE_RETRY_BACKOFF" = "linear" ]; then
    cover_branch "exec_controls.backoff_linear"
    pass_case "resolve_execution_controls applies linear backoff"
else
    fail_case "exec_controls.backoff_linear failed (got '$EFFECTIVE_RETRY_BACKOFF', expected 'linear')"
fi

# exec_controls.backoff_exponential — explicit exponential
FRONTMATTER_TIMEOUT="" FRONTMATTER_MAX_RETRIES="" FRONTMATTER_RETRY_BACKOFF="exponential"
PROVIDER_TIMEOUT="10800" MAX_PHASE_RETRIES="10"
resolve_execution_controls
if [ "$EFFECTIVE_RETRY_BACKOFF" = "exponential" ]; then
    cover_branch "exec_controls.backoff_exponential"
    pass_case "resolve_execution_controls applies exponential backoff"
else
    fail_case "exec_controls.backoff_exponential failed (got '$EFFECTIVE_RETRY_BACKOFF', expected 'exponential')"
fi

# exec_controls.backoff_default — no frontmatter backoff, defaults to none
FRONTMATTER_TIMEOUT="" FRONTMATTER_MAX_RETRIES="" FRONTMATTER_RETRY_BACKOFF=""
PROVIDER_TIMEOUT="10800" MAX_PHASE_RETRIES="10"
resolve_execution_controls
if [ "$EFFECTIVE_RETRY_BACKOFF" = "none" ]; then
    cover_branch "exec_controls.backoff_default"
    pass_case "resolve_execution_controls defaults to none backoff"
else
    fail_case "exec_controls.backoff_default failed (got '$EFFECTIVE_RETRY_BACKOFF', expected 'none')"
fi

# ---------------------------------------------------------------------------
# advance_cycle_position branches
# ---------------------------------------------------------------------------

# advance.with_cycle_length — CYCLE_LENGTH drives modulo
CYCLE_POSITION=2
CYCLE_LENGTH=3
MODE="plan-build-review"
advance_cycle_position
if [ "$CYCLE_POSITION" -eq 0 ]; then
    cover_branch "advance.with_cycle_length"
    pass_case "advance_cycle_position wraps via CYCLE_LENGTH (2+1 mod 3 = 0)"
else
    fail_case "advance_cycle_position with CYCLE_LENGTH failed (got $CYCLE_POSITION, expected 0)"
fi

# advance.fallback_mode — CYCLE_LENGTH=0 falls back to MODE
CYCLE_POSITION=1
CYCLE_LENGTH=0
MODE="plan-build"
advance_cycle_position
if [ "$CYCLE_POSITION" -eq 0 ]; then
    cover_branch "advance.fallback_mode"
    pass_case "advance_cycle_position falls back to MODE plan-build (1+1 mod 2 = 0)"
else
    fail_case "advance_cycle_position fallback mode failed (got $CYCLE_POSITION, expected 0)"
fi

# ---------------------------------------------------------------------------
# wait_for_requests branches
# ---------------------------------------------------------------------------

REQ_TMPDIR="$(mktemp -d)"
SESSION_DIR="$REQ_TMPDIR"

# requests.wait.empty — no requests directory
rm -rf "$SESSION_DIR/requests"
wait_for_requests
cover_branch "requests.wait.empty"
pass_case "wait_for_requests returns immediately when no requests directory"

# requests.wait.success — polls until empty
mkdir -p "$SESSION_DIR/requests"
touch "$SESSION_DIR/requests/req1.json"
SLEEP_CALLS=0
SLEEP_HOOK="rm -f $SESSION_DIR/requests/req1.json"
wait_for_requests
if [ "$SLEEP_CALLS" -ge 1 ] && [ ! -f "$SESSION_DIR/requests/req1.json" ]; then
    cover_branch "requests.wait.success"
    pass_case "wait_for_requests polls until requests directory is empty"
else
    fail_case "wait_for_requests did not poll or directory not empty (sleeps=$SLEEP_CALLS)"
fi

# requests.wait.timeout — breaks loop after timeout
mkdir -p "$SESSION_DIR/requests"
touch "$SESSION_DIR/requests/req2.json"
SLEEP_CALLS=0
REQUEST_TIMEOUT=1
# Mock date to simulate timeout
date() {
    if [ "$1" = "+%s" ]; then
        if [ "$SLEEP_CALLS" -eq 0 ]; then
            echo 1000
        else
            echo 2000
        fi
    else
        command date "$@"
    fi
}
wait_for_requests
if contains_log "request_timeout"; then
    cover_branch "requests.wait.timeout"
    pass_case "wait_for_requests breaks loop after timeout"
else
    fail_case "wait_for_requests did not timeout"
fi
unset -f date

rm -rf "$REQ_TMPDIR"

# ---------------------------------------------------------------------------
# run_queue_if_present branches
# ---------------------------------------------------------------------------

QUEUE_TMPDIR="$(mktemp -d)"
SESSION_DIR="$QUEUE_TMPDIR"
WORK_DIR="$QUEUE_TMPDIR/work"
mkdir -p "$WORK_DIR"

# queue.empty — no queue directory
rm -rf "$SESSION_DIR/queue"
if ! run_queue_if_present "claude"; then
    cover_branch "queue.empty"
    pass_case "run_queue_if_present returns 1 when queue is empty"
else
    fail_case "run_queue_if_present should return 1 for empty queue"
fi

# queue.success — runs item and returns 0
mkdir -p "$SESSION_DIR/queue"
cat > "$SESSION_DIR/queue/01-test.md" << 'EOF'
Test prompt
EOF
if run_queue_if_present "claude"; then
    if [ ! -f "$SESSION_DIR/queue/01-test.md" ]; then
        cover_branch "queue.success"
        pass_case "run_queue_if_present runs item and deletes it"
    else
        fail_case "run_queue_if_present did not delete item"
    fi
else
    fail_case "run_queue_if_present failed to run existing item"
fi

# queue.frontmatter — respects frontmatter provider
cat > "$SESSION_DIR/queue/02-test.md" << 'EOF'
---
provider: opencode
---
Frontmatter test
EOF
# Mock command -v for opencode
command() {
    if [ "$2" = "opencode" ]; then
        return 0
    fi
    builtin command "$@"
}
if run_queue_if_present "claude"; then
    if contains_log "queue_override_start|iteration=1|queue_file=02-test.md|agent=queue|provider=opencode"; then
        cover_branch "queue.frontmatter"
        pass_case "run_queue_if_present respects frontmatter provider"
    else
        fail_case "run_queue_if_present did not use frontmatter provider"
    fi
else
    fail_case "run_queue_if_present failed with frontmatter"
fi
unset -f command

# queue.frontmatter_unavailable — logs fallback when frontmatter provider isn't installed
cat > "$SESSION_DIR/queue/03-test.md" << 'EOF'
---
provider: unavailable-provider
---
Fallback provider test
EOF
if run_queue_if_present "claude"; then
    if contains_log "queue_frontmatter_provider_unavailable|requested_provider=unavailable-provider|fallback_provider=claude|queue_file=03-test.md" \
        && contains_log "queue_override_start|iteration=1|queue_file=03-test.md|agent=queue|provider=claude"; then
        cover_branch "queue.frontmatter_unavailable"
        pass_case "run_queue_if_present logs and falls back when frontmatter provider is unavailable"
    else
        fail_case "run_queue_if_present did not log frontmatter provider fallback"
    fi
else
    fail_case "run_queue_if_present failed with unavailable frontmatter provider"
fi

rm -rf "$QUEUE_TMPDIR"

# ---------------------------------------------------------------------------
# sync_branch tests
# ---------------------------------------------------------------------------

# Set up a temporary git repo pair to simulate remote/local branching
SYNC_WORK_DIR="$(mktemp -d)"
SYNC_SESSION_DIR="$(mktemp -d)"
SYNC_PROMPTS_DIR="$(mktemp -d)"

# Create the "remote" bare repo and a local clone
SYNC_REMOTE_DIR="$(mktemp -d)"
git init --bare "$SYNC_REMOTE_DIR" >/dev/null 2>&1
git init "$SYNC_WORK_DIR" >/dev/null 2>&1
git -C "$SYNC_WORK_DIR" config user.email "test@test.com" >/dev/null 2>&1
git -C "$SYNC_WORK_DIR" config user.name "Test" >/dev/null 2>&1
git -C "$SYNC_WORK_DIR" remote add origin "$SYNC_REMOTE_DIR" >/dev/null 2>&1
# Seed initial commit on main
echo "init" > "$SYNC_WORK_DIR/init.txt"
git -C "$SYNC_WORK_DIR" add init.txt >/dev/null 2>&1
git -C "$SYNC_WORK_DIR" commit -m "init" >/dev/null 2>&1
git -C "$SYNC_WORK_DIR" branch -M main >/dev/null 2>&1
git -C "$SYNC_WORK_DIR" push origin main >/dev/null 2>&1
# Create a feature branch for loop's working branch
git -C "$SYNC_WORK_DIR" checkout -b feature >/dev/null 2>&1

# Write PROMPT_merge.md into prompts dir
cat > "$SYNC_PROMPTS_DIR/PROMPT_merge.md" << 'MERGEEOF'
---
agent: merge
trigger: merge_conflict
---
Resolve conflicts.
MERGEEOF

# Save original env values and swap in test values
_ORIG_WORK_DIR="${WORK_DIR:-}"
_ORIG_SESSION_DIR="${SESSION_DIR:-}"
_ORIG_PROMPTS_DIR="${PROMPTS_DIR:-}"
WORK_DIR="$SYNC_WORK_DIR"
SESSION_DIR="$SYNC_SESSION_DIR"
PROMPTS_DIR="$SYNC_PROMPTS_DIR"

# Write meta.json with auto_merge=true and base_branch=main
cat > "$SYNC_SESSION_DIR/meta.json" << 'METAEOF'
{"auto_merge": true, "base_branch": "main"}
METAEOF

# sync.up_to_date — no new commits upstream, result should be up_to_date
> "$COVERAGE_LOG_FILE"
if sync_branch; then
    if grep -q 'branch_sync' "$COVERAGE_LOG_FILE" && grep -q '"result":"up_to_date"' "$COVERAGE_LOG_FILE"; then
        cover_branch "sync.up_to_date"
        pass_case "sync_branch logs branch_sync result=up_to_date when already current"
    else
        fail_case "sync_branch did not log branch_sync result=up_to_date — log: $(cat $COVERAGE_LOG_FILE)"
    fi
else
    fail_case "sync_branch returned non-zero on up_to_date path"
fi

# sync.merged — push a new commit to upstream main, then sync
echo "upstream change" > "$SYNC_WORK_DIR/upstream.txt"
git -C "$SYNC_WORK_DIR" checkout main >/dev/null 2>&1
git -C "$SYNC_WORK_DIR" add upstream.txt >/dev/null 2>&1
git -C "$SYNC_WORK_DIR" commit -m "upstream commit" >/dev/null 2>&1
git -C "$SYNC_WORK_DIR" push origin main >/dev/null 2>&1
git -C "$SYNC_WORK_DIR" checkout feature >/dev/null 2>&1

> "$COVERAGE_LOG_FILE"
if sync_branch; then
    if grep -q 'branch_sync' "$COVERAGE_LOG_FILE" && grep -q '"result":"merged"' "$COVERAGE_LOG_FILE" && grep -q '"merged_commit_count":1' "$COVERAGE_LOG_FILE"; then
        cover_branch "sync.merged"
        pass_case "sync_branch logs branch_sync result=merged with merged_commit_count=1"
    else
        fail_case "sync_branch merge log mismatch — log: $(cat $COVERAGE_LOG_FILE)"
    fi
else
    fail_case "sync_branch returned non-zero on successful merge path"
fi

# sync.fetch_failure — break fetch by pointing origin to nonexistent path, should not fatal
git -C "$SYNC_WORK_DIR" remote set-url origin /nonexistent/path >/dev/null 2>&1
> "$COVERAGE_LOG_FILE"
if sync_branch; then
    cover_branch "sync.fetch_failure"
    pass_case "sync_branch continues non-fatally when git fetch fails"
else
    fail_case "sync_branch returned non-zero on fetch-failure path (should be non-fatal)"
fi
# Restore origin
git -C "$SYNC_WORK_DIR" remote set-url origin "$SYNC_REMOTE_DIR" >/dev/null 2>&1

# sync.conflict — manufacture a conflict: edit the same line on both branches
# feature branch: edit a file
echo "feature version" > "$SYNC_WORK_DIR/conflict.txt"
git -C "$SYNC_WORK_DIR" add conflict.txt >/dev/null 2>&1
git -C "$SYNC_WORK_DIR" commit -m "feature edit" >/dev/null 2>&1

# main branch: edit the same file differently
git -C "$SYNC_WORK_DIR" checkout main >/dev/null 2>&1
echo "main version" > "$SYNC_WORK_DIR/conflict.txt"
git -C "$SYNC_WORK_DIR" add conflict.txt >/dev/null 2>&1
git -C "$SYNC_WORK_DIR" commit -m "main edit" >/dev/null 2>&1
git -C "$SYNC_WORK_DIR" push origin main >/dev/null 2>&1
git -C "$SYNC_WORK_DIR" checkout feature >/dev/null 2>&1

mkdir -p "$SYNC_SESSION_DIR/queue"
> "$COVERAGE_LOG_FILE"
sync_branch
sync_rc=$?
if [ "$sync_rc" -ne 0 ]; then
    if grep -q 'merge_conflict' "$COVERAGE_LOG_FILE" \
        && [ -f "$SYNC_SESSION_DIR/queue/000-merge-conflict.md" ]; then
        # Verify git is clean (merge aborted)
        if ! git -C "$SYNC_WORK_DIR" diff --name-only --diff-filter=U 2>/dev/null | grep -q .; then
            cover_branch "sync.conflict"
            pass_case "sync_branch logs merge_conflict, writes queue file, aborts merge, returns non-zero"
        else
            fail_case "sync_branch did not abort merge — conflict markers still present"
        fi
    else
        fail_case "sync_branch conflict path: missing merge_conflict log or queue file"
    fi
else
    fail_case "sync_branch returned 0 on conflict path (expected non-zero)"
fi
rm -f "$SYNC_SESSION_DIR/queue/000-merge-conflict.md"

# sync.disabled — set auto_merge=false, should skip immediately
cat > "$SYNC_SESSION_DIR/meta.json" << 'METAEOF'
{"auto_merge": false, "base_branch": "main"}
METAEOF
> "$COVERAGE_LOG_FILE"
if sync_branch; then
    if ! grep -q 'branch_sync' "$COVERAGE_LOG_FILE"; then
        cover_branch "sync.disabled"
        pass_case "sync_branch skips when auto_merge is false"
    else
        fail_case "sync_branch logged branch_sync despite auto_merge=false"
    fi
else
    fail_case "sync_branch returned non-zero when auto_merge=false"
fi

# Restore env
WORK_DIR="$_ORIG_WORK_DIR"
SESSION_DIR="$_ORIG_SESSION_DIR"
PROMPTS_DIR="$_ORIG_PROMPTS_DIR"
rm -rf "$SYNC_WORK_DIR" "$SYNC_REMOTE_DIR" "$SYNC_SESSION_DIR" "$SYNC_PROMPTS_DIR"

# ---------------------------------------------------------------------------
# Final summary
# ---------------------------------------------------------------------------

covered=0
total=${#BRANCH_ORDER[@]}
for branch_id in "${BRANCH_ORDER[@]}"; do
    if [ "${BRANCH_HIT[$branch_id]}" -eq 1 ]; then
        covered=$((covered + 1))
    fi
done
coverage_percent=$((covered * 100 / total))

{
    printf '{\n'
    printf '  "generated_at": "%s",\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf '  "target": "aloop/bin/loop.sh",\n'
    printf '  "minimum_percent": %s,\n' "$MIN_BRANCH_COVERAGE"
    printf '  "summary": { "covered": %s, "total": %s, "percent": %s },\n' "$covered" "$total" "$coverage_percent"
    printf '  "branches": [\n'
    for i in "${!BRANCH_ORDER[@]}"; do
        branch_id="${BRANCH_ORDER[$i]}"
        covered_bool=$(json_bool "${BRANCH_HIT[$branch_id]}")
        comma=","
        if [ "$i" -eq $((total - 1)) ]; then
            comma=""
        fi
        printf '    { "id": "%s", "description": "%s", "covered": %s }%s\n' \
            "$branch_id" "${BRANCH_DESC[$branch_id]}" "$covered_bool" "$comma"
    done
    printf '  ]\n'
    printf '}\n'
} > "$REPORT_FILE"

echo "Branch coverage summary: $covered/$total ($coverage_percent%)"
echo "Coverage report: $REPORT_FILE"

if [ "$coverage_percent" -lt "$MIN_BRANCH_COVERAGE" ]; then
    echo "FAIL: branch coverage is below threshold ($coverage_percent% < $MIN_BRANCH_COVERAGE%)"
    FAILED=1
fi

if [ "$FAILED" -ne 0 ]; then
    echo "Shell branch-coverage harness failed."
    exit 1
fi

echo "Shell branch-coverage harness passed."
exit 0
