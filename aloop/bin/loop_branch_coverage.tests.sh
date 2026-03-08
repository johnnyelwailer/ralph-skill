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
register_branch "path.invoke.restore_success" "invoke_provider success restores PATH and keeps provider dir reachable"
register_branch "path.invoke.failure" "invoke_provider claude non-zero sets LAST_PROVIDER_ERROR and returns non-zero"
register_branch "path.invoke.restore_failure" "invoke_provider failure restores PATH"
register_branch "path.invoke.unsupported" "invoke_provider unsupported provider path returns non-zero"
register_branch "provider.healthy" "resolve_healthy_provider selects healthy provider immediately"
register_branch "provider.degraded_skip" "resolve_healthy_provider skips degraded provider and logs event"
register_branch "provider.all_degraded" "resolve_healthy_provider emits all_providers_degraded signal when all degraded"
register_branch "provider.cooldown_expired" "resolve_healthy_provider treats expired cooldown provider as available"
register_branch "provider.cooldown_wait" "resolve_healthy_provider waits/logs when all providers are in active cooldown"

RESOLVE_FUNC="$(extract_function resolve_healthy_provider)"
SETUP_FUNC="$(extract_function setup_gh_block)"
CLEANUP_FUNC="$(extract_function cleanup_gh_block)"
INVOKE_FUNC="$(extract_function invoke_provider)"
WAIT_FUNC="$(extract_function _wait_for_provider)"
KILL_PROVIDER_FUNC="$(extract_function kill_active_provider)"

if [ -z "$RESOLVE_FUNC" ] || [ -z "$SETUP_FUNC" ] || [ -z "$CLEANUP_FUNC" ] || [ -z "$INVOKE_FUNC" ] || [ -z "$WAIT_FUNC" ] || [ -z "$KILL_PROVIDER_FUNC" ]; then
    echo "FAIL: could not extract one or more target functions from $LOOP_SH"
    exit 1
fi

eval "$RESOLVE_FUNC"
eval "$SETUP_FUNC"
eval "$CLEANUP_FUNC"
eval "$KILL_PROVIDER_FUNC"
eval "$WAIT_FUNC"
eval "$INVOKE_FUNC"

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
