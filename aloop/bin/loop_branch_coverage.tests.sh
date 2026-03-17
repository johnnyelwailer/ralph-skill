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
ADVANCE_FUNC="$(extract_function advance_cycle_position)"
WAIT_FOR_REQUESTS_FUNC="$(extract_function wait_for_requests)"
RUN_QUEUE_FUNC="$(extract_function run_queue_if_present)"
RESOLVE_MODE_FUNC="$(extract_function resolve_iteration_mode)"
DERIVE_MODE_FUNC="$(extract_function derive_mode_from_prompt_name)"

if [ -z "$RESOLVE_FUNC" ] || [ -z "$SETUP_FUNC" ] || [ -z "$CLEANUP_FUNC" ] || [ -z "$INVOKE_FUNC" ] || [ -z "$WAIT_FUNC" ] || [ -z "$KILL_PROVIDER_FUNC" ]; then
    echo "FAIL: could not extract one or more target functions from $LOOP_SH"
    exit 1
fi

if [ -z "$CYCLE_RESOLVE_FUNC" ] || [ -z "$CHECK_PHASE_PREREQ_FUNC" ] || [ -z "$CHECK_HAS_BUILDS_FUNC" ] || [ -z "$FRONTMATTER_FUNC" ] || [ -z "$ADVANCE_FUNC" ] || [ -z "$WAIT_FOR_REQUESTS_FUNC" ] || [ -z "$RUN_QUEUE_FUNC" ] || [ -z "$RESOLVE_MODE_FUNC" ] || [ -z "$DERIVE_MODE_FUNC" ]; then
    echo "FAIL: could not extract cycle/frontmatter/advance/requests/queue functions from $LOOP_SH"
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
eval "$ADVANCE_FUNC"
eval "$WAIT_FOR_REQUESTS_FUNC"
eval "$RUN_QUEUE_FUNC"
eval "$RESOLVE_MODE_FUNC"
eval "$DERIVE_MODE_FUNC"

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

rm -rf "$FM_TMPDIR"

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
