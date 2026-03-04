#!/bin/bash
# Aloop Loop — Generic Multi-Provider Autonomous Coding Loop
# Usage: loop.sh --prompts-dir <path> --session-dir <path> --work-dir <path> [options]
#
# Modes:
#   plan               - planning only (gap analysis, update TODO)
#   build              - building only (implement tasks from TODO)
#   review             - review only (audit last build against quality gates)
#   plan-build         - alternating: plan -> build -> plan -> build -> ...
#   plan-build-review  - full cycle: plan -> build x3 -> review -> ... (DEFAULT)
#
# Providers:
#   claude, codex, gemini, copilot, round-robin

set -e

# ============================================================================
# DEFAULTS
# ============================================================================

PROMPTS_DIR=""
SESSION_DIR=""
WORK_DIR=""
MODE="plan-build-review"
PROVIDER="claude"
ROUND_ROBIN_PROVIDERS="claude,codex,gemini,copilot"
# Model defaults — keep in sync with ~/.aloop/config.yml (source of truth)
CLAUDE_MODEL="${ALOOP_CLAUDE_MODEL:-opus}"
CODEX_MODEL="${ALOOP_CODEX_MODEL:-gpt-5.3-codex}"
GEMINI_MODEL="${ALOOP_GEMINI_MODEL:-gemini-3.1-pro-preview}"
COPILOT_MODEL="${ALOOP_COPILOT_MODEL:-gpt-5.3-codex}"
COPILOT_RETRY_MODEL="${ALOOP_COPILOT_RETRY_MODEL:-claude-sonnet-4.6}"
MAX_ITERATIONS="${ALOOP_MAX_ITERATIONS:-50}"
MAX_STUCK="${ALOOP_MAX_STUCK:-3}"
BACKUP_ENABLED="${ALOOP_BACKUP:-false}"
PROVIDER_TIMEOUT="${ALOOP_PROVIDER_TIMEOUT:-0}"
DRY_RUN=false

# ============================================================================
# ARGUMENT PARSING
# ============================================================================

usage() {
    echo "Usage: $0 --prompts-dir <path> --session-dir <path> --work-dir <path> [options]"
    echo ""
    echo "Required:"
    echo "  --prompts-dir <path>    Directory containing PROMPT_{plan,build,review}.md"
    echo "  --session-dir <path>    Directory for session state (status.json, log.jsonl)"
    echo "  --work-dir <path>       Project working directory"
    echo ""
    echo "Options:"
    echo "  --mode <mode>           plan|build|review|plan-build|plan-build-review (default: plan-build-review)"
    echo "  --provider <provider>   claude|codex|gemini|copilot|round-robin (default: claude)"
    echo "  --round-robin <list>    Comma-separated provider list (default: claude,codex,gemini,copilot)"
    echo "  --max-iterations <n>    Maximum iterations (default: 50)"
    echo "  --max-stuck <n>         Skip task after N failures (default: 3)"
    echo "  --provider-timeout <s>  Max seconds per provider call (0 = disabled, default: 0)"
    echo "  --backup                Enable remote git backup"
    echo "  --dry-run               Print commands without executing"
    exit 1
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --prompts-dir)  PROMPTS_DIR="$2"; shift 2 ;;
        --session-dir)  SESSION_DIR="$2"; shift 2 ;;
        --work-dir)     WORK_DIR="$2"; shift 2 ;;
        --mode)         MODE="$2"; shift 2 ;;
        --provider)     PROVIDER="$2"; shift 2 ;;
        --round-robin)  ROUND_ROBIN_PROVIDERS="$2"; shift 2 ;;
        --max-iterations) MAX_ITERATIONS="$2"; shift 2 ;;
        --max-stuck)    MAX_STUCK="$2"; shift 2 ;;
        --provider-timeout) PROVIDER_TIMEOUT="$2"; shift 2 ;;
        --backup)       BACKUP_ENABLED="true"; shift ;;
        --dry-run)      DRY_RUN=true; shift ;;
        --claude-model) CLAUDE_MODEL="$2"; shift 2 ;;
        --codex-model)  CODEX_MODEL="$2"; shift 2 ;;
        --gemini-model) GEMINI_MODEL="$2"; shift 2 ;;
        --copilot-model) COPILOT_MODEL="$2"; shift 2 ;;
        *)              echo "Unknown option: $1"; usage ;;
    esac
done

# Validate required args
if [ -z "$PROMPTS_DIR" ] || [ -z "$SESSION_DIR" ] || [ -z "$WORK_DIR" ]; then
    echo "Error: --prompts-dir, --session-dir, and --work-dir are required"
    usage
fi

if [ ! -d "$PROMPTS_DIR" ]; then
    echo "Error: Prompts directory not found: $PROMPTS_DIR"
    exit 1
fi

if [ ! -d "$WORK_DIR" ]; then
    echo "Error: Work directory not found: $WORK_DIR"
    exit 1
fi

mkdir -p "$SESSION_DIR"

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

# Cross-platform sed -i
sed_i() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "$@"
    else
        sed -i "$@"
    fi
}

PLAN_FILE="$WORK_DIR/TODO.md"
STATUS_FILE="$SESSION_DIR/status.json"
LOG_FILE="$SESSION_DIR/log.jsonl"
REPORT_FILE="$SESSION_DIR/report.md"
START_TIME=$(date +%s)

# Parse round-robin providers into array
IFS=',' read -ra RR_PROVIDERS <<< "$ROUND_ROBIN_PROVIDERS"

resolve_iteration_provider() {
    local iteration=$1
    if [ "$PROVIDER" = "round-robin" ]; then
        local count=${#RR_PROVIDERS[@]}
        local index=$(( (iteration - 1) % count ))
        echo "${RR_PROVIDERS[$index]}"
    else
        echo "$PROVIDER"
    fi
}

resolve_iteration_mode() {
    local iteration=$1
    if [ "$FORCE_PLAN_NEXT" = true ]; then
        FORCE_PLAN_NEXT=false
        echo "plan"
        return
    fi
    case "$MODE" in
        plan-build)
            if (( iteration % 2 == 1 )); then echo "plan"; else echo "build"; fi
            ;;
        plan-build-review)
            # 5-step cycle: plan -> build -> build -> build -> review
            local phase=$(( (iteration - 1) % 5 ))
            case $phase in
                0) echo "plan" ;;
                1|2|3) echo "build" ;;
                4) echo "review" ;;
            esac
            ;;
        *)
            echo "$MODE"
            ;;
    esac
}

assert_provider_installed() {
    if ! command -v "$1" &>/dev/null; then
        echo "Error: CLI '$1' not found on PATH."
        exit 1
    fi
}

write_status() {
    local iteration=$1 phase=$2 provider=$3 stuck_count=$4 state=${5:-running}
    cat > "$STATUS_FILE" << EOF
{"iteration":$iteration,"phase":"$phase","provider":"$provider","stuck_count":$stuck_count,"state":"$state","updated_at":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF
}

write_log_entry() {
    local event=$1
    shift
    local data=""
    while [[ $# -gt 0 ]]; do
        if [ -n "$data" ]; then data="$data,"; fi
        data="$data\"$1\":\"$2\""
        shift 2
    done
    echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"event\":\"$event\"${data:+,$data}}" >> "$LOG_FILE"
}

# Wait for a background process with timeout (portable on macOS bash 3.2).
wait_with_timeout() {
    local pid="$1"
    local timeout_secs="$2"
    local label="$3"
    if [ "$timeout_secs" -le 0 ]; then
        # 0 or negative disables timeout (allows very long-running iterations).
        wait "$pid"
        return $?
    fi
    local start now elapsed
    start=$(date +%s)
    while kill -0 "$pid" 2>/dev/null; do
        now=$(date +%s)
        elapsed=$((now - start))
        if [ "$elapsed" -ge "$timeout_secs" ]; then
            echo "$label timed out after ${timeout_secs}s" >&2
            kill "$pid" 2>/dev/null || true
            sleep 1
            kill -9 "$pid" 2>/dev/null || true
            wait "$pid" 2>/dev/null || true
            return 124
        fi
        sleep 1
    done
    wait "$pid"
}

# ============================================================================
# PROVIDER INVOCATION
# ============================================================================

invoke_provider() {
    local provider_name=$1
    local prompt_content=$2

    case "$provider_name" in
        claude)
            (
                set -o pipefail
                echo "$prompt_content" | claude --model "$CLAUDE_MODEL" --dangerously-skip-permissions --print 2>&1 | tee -a "$LOG_FILE.raw"
            ) &
            local provider_pid=$!
            wait_with_timeout "$provider_pid" "$PROVIDER_TIMEOUT" "claude"
            local exit_code=$?
            if [ "$exit_code" -ne 0 ]; then
                echo "claude exited with code $exit_code" >&2
                return $exit_code
            fi
            ;;
        codex)
            (
                set -o pipefail
                echo "$prompt_content" | codex exec -m "$CODEX_MODEL" --dangerously-bypass-approvals-and-sandbox - 2>&1 | tee -a "$LOG_FILE.raw"
            ) &
            local provider_pid=$!
            wait_with_timeout "$provider_pid" "$PROVIDER_TIMEOUT" "codex"
            local exit_code=$?
            if [ "$exit_code" -ne 0 ]; then
                echo "codex exited with code $exit_code" >&2
                return $exit_code
            fi
            ;;
        gemini)
            if ! gemini -m "$GEMINI_MODEL" --yolo -p "$prompt_content" 2>&1 | tee -a "$LOG_FILE.raw"; then
                echo "Gemini -m $GEMINI_MODEL failed. Retrying without explicit model." >&2
                if ! gemini --yolo -p "$prompt_content" 2>&1 | tee -a "$LOG_FILE.raw"; then
                    echo "gemini failed" >&2
                    return 1
                fi
            fi
            ;;
        copilot)
            if ! copilot --model "$COPILOT_MODEL" --yolo -p "$prompt_content" 2>&1 | tee -a "$LOG_FILE.raw"; then
                echo "Copilot --model $COPILOT_MODEL failed. Retrying with $COPILOT_RETRY_MODEL." >&2
                if ! copilot --model "$COPILOT_RETRY_MODEL" --yolo -p "$prompt_content" 2>&1 | tee -a "$LOG_FILE.raw"; then
                    echo "Copilot retry failed. Trying without explicit model." >&2
                    if ! copilot --yolo -p "$prompt_content" 2>&1 | tee -a "$LOG_FILE.raw"; then
                        echo "copilot failed" >&2
                        return 1
                    fi
                fi
            fi
            ;;
        *)
            echo "Unsupported provider: $provider_name" >&2
            return 1
            ;;
    esac
}

# ============================================================================
# PLAN FILE HELPERS
# ============================================================================

count_plan_items() {
    local pattern="$1"
    if [ ! -f "$PLAN_FILE" ]; then
        echo "0"
        return
    fi
    local count
    count=$(grep -Ec "$pattern" "$PLAN_FILE" 2>/dev/null || true)
    if [ -z "$count" ]; then count="0"; fi
    echo "$count"
}

check_all_tasks_complete() {
    if [ ! -f "$PLAN_FILE" ]; then return 1; fi
    local incomplete completed stuck
    incomplete=$(count_plan_items '^[[:space:]]*- \[ \]')
    completed=$(count_plan_items '^[[:space:]]*- \[x\]')
    stuck=$(count_plan_items '^[[:space:]]*- \[S\]')
    # A session is complete only when there are no unchecked OR stuck tasks left.
    if [ "$incomplete" -eq 0 ] && [ "$stuck" -eq 0 ] && [ "$completed" -gt 0 ]; then
        return 0
    fi
    return 1
}

get_current_task() {
    if [ ! -f "$PLAN_FILE" ]; then echo ""; return; fi
    grep -E '^[[:space:]]*- \[ \]' "$PLAN_FILE" 2>/dev/null | head -1 | sed 's/^[[:space:]]*- \[ \] //' || echo ""
}

requeue_first_stuck_task_if_needed() {
    if [ ! -f "$PLAN_FILE" ]; then return; fi
    local incomplete stuck
    incomplete=$(count_plan_items '^[[:space:]]*- \[ \]')
    stuck=$(count_plan_items '^[[:space:]]*- \[S\]')
    # If everything is marked stuck, requeue one task so the loop can retry after fresh context.
    if [ "$incomplete" -eq 0 ] && [ "$stuck" -gt 0 ]; then
        sed_i '1,/^[[:space:]]*- \[S\] /s/^\([[:space:]]*\)- \[S\] /\1- [ ] /' "$PLAN_FILE"
        write_log_entry "task_requeued" "reason" "all_tasks_stuck"
        echo "Requeued one stuck task for retry."
    fi
}

# ============================================================================
# STUCK DETECTION
# ============================================================================

LAST_TASK=""
STUCK_COUNT=0
FORCE_PLAN_NEXT=false

skip_stuck_task() {
    local task="$1"
    echo ""
    echo "STUCK: Failed $MAX_STUCK times on: $task"
    echo "Marking as blocked and moving on..."

    if ! grep -q "^## Blocked" "$PLAN_FILE" 2>/dev/null; then
        echo "" >> "$PLAN_FILE"
        echo "## Blocked" >> "$PLAN_FILE"
        echo "" >> "$PLAN_FILE"
    fi
    local blocked_line="- $task (stuck after $MAX_STUCK attempts)"
    if ! grep -Fqx "$blocked_line" "$PLAN_FILE" 2>/dev/null; then
        echo "$blocked_line" >> "$PLAN_FILE"
    fi

    # Mark the first unchecked task as stuck.
    # Avoid task-text interpolation in sed replacement (can break on '/' and '&').
    sed_i '1,/^[[:space:]]*- \[ \] /s/^\([[:space:]]*\)- \[ \] /\1- [S] /' "$PLAN_FILE"

    LAST_TASK=""
    STUCK_COUNT=0
}

# ============================================================================
# ITERATION SUMMARY
# ============================================================================

print_iteration_summary() {
    local iteration_start="$1"
    local iteration_end=$(date +%s)
    local duration=$((iteration_end - iteration_start))
    local mins=$((duration / 60))
    local secs=$((duration % 60))

    cd "$WORK_DIR"

    local last_commit=$(git log -1 --format="%h %s" 2>/dev/null || echo "")
    local last_commit_time=$(git log -1 --format="%ct" 2>/dev/null || echo "0")

    local commit_msg=""
    if [ "$last_commit_time" -ge "$iteration_start" ]; then
        commit_msg="$last_commit"
    fi

    local completed total_tasks
    completed=$(count_plan_items '^[[:space:]]*- \[x\]')
    total_tasks=$(count_plan_items '^[[:space:]]*- \[')
    local pct=0
    if [ "$total_tasks" -gt 0 ]; then
        pct=$((completed * 100 / total_tasks))
    fi

    echo ""
    echo "=== Iteration $ITERATION Complete (${mins}m ${secs}s) ==="
    if [ -n "$commit_msg" ]; then
        echo "Commit: $commit_msg"
    else
        echo "Warning: No commit this iteration"
    fi
    echo "Progress: $completed/$total_tasks tasks ($pct%)"
    echo "============================================"
}

# ============================================================================
# REPORT GENERATION
# ============================================================================

generate_report() {
    local exit_reason="$1"
    local end_time=$(date +%s)
    local duration=$((end_time - START_TIME))
    local minutes=$((duration / 60))
    local seconds=$((duration % 60))

    local completed skipped remaining
    completed=$(count_plan_items '^[[:space:]]*- \[x\]')
    skipped=$(count_plan_items '^[[:space:]]*- \[S\]')
    remaining=$(count_plan_items '^[[:space:]]*- \[ \]')
    local total=$((completed + skipped + remaining))

    cd "$WORK_DIR"
    local commit_count=$(git rev-list --count HEAD 2>/dev/null || echo "0")

    cat > "$REPORT_FILE" << EOF
# Aloop Session Report

Generated: $(date '+%Y-%m-%d %H:%M:%S')

## Summary

| Metric | Value |
|--------|-------|
| Duration | ${minutes}m ${seconds}s |
| Iterations | $ITERATION |
| Mode | $MODE |
| Provider | $PROVIDER |
| Tasks Completed | $completed / $total |
| Tasks Skipped | $skipped |
| Tasks Remaining | $remaining |
| Commits | $commit_count |

## Exit Reason

$exit_reason

## Completed Tasks

$(grep -E '^[[:space:]]*- \[x\]' "$PLAN_FILE" 2>/dev/null || echo "None")

## Recent Commits

\`\`\`
$(git log --oneline -20 2>/dev/null || echo "No git history")
\`\`\`
EOF

    if [ "$skipped" -gt 0 ]; then
        echo "" >> "$REPORT_FILE"
        echo "## Skipped Tasks (stuck)" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        grep -E '^[[:space:]]*- \[S\]' "$PLAN_FILE" 2>/dev/null >> "$REPORT_FILE"
    fi

    if [ "$remaining" -gt 0 ]; then
        echo "" >> "$REPORT_FILE"
        echo "## Remaining Tasks" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        grep -E '^[[:space:]]*- \[ \]' "$PLAN_FILE" 2>/dev/null >> "$REPORT_FILE"
    fi

    echo ""
    echo "Report saved to $REPORT_FILE"
}

# ============================================================================
# REMOTE BACKUP
# ============================================================================

setup_remote_backup() {
    if [ "$BACKUP_ENABLED" != "true" ]; then
        echo "Remote backup: disabled"
        return 1
    fi

    cd "$WORK_DIR"

    if [ ! -d ".git" ]; then
        echo "Initializing git repository..."
        git init
        git add -A
        git commit -m "Initial commit" 2>/dev/null || true
    fi

    if git remote get-url origin &>/dev/null; then
        echo "Remote backup: $(git remote get-url origin)"
        return 0
    fi

    if ! command -v gh &>/dev/null; then
        echo "Warning: gh CLI not found. Remote backup disabled."
        BACKUP_ENABLED="false"
        return 1
    fi

    if ! gh auth status &>/dev/null; then
        echo "Warning: gh CLI not authenticated. Remote backup disabled."
        BACKUP_ENABLED="false"
        return 1
    fi

    local project_name=$(basename "$WORK_DIR")
    local repo_name="${project_name}-aloop-backup"
    echo "Creating private backup repo: $repo_name"

    if gh repo create "$repo_name" --private --source=. --push 2>/dev/null; then
        echo "Remote backup: https://github.com/$(gh api user -q .login)/$repo_name"
        return 0
    else
        echo "Warning: Could not create backup repo. Remote backup disabled."
        BACKUP_ENABLED="false"
        return 1
    fi
}

push_to_backup() {
    if [ "$BACKUP_ENABLED" != "true" ]; then return 0; fi
    cd "$WORK_DIR"
    if git push origin HEAD 2>/dev/null; then
        echo "Pushed to remote backup"
    else
        echo "Warning: Push to remote failed (continuing anyway)"
    fi
}

# ============================================================================
# MAIN LOOP
# ============================================================================

# Validate mode
case "$MODE" in
    plan|build|review|plan-build|plan-build-review) ;;
    *) echo "Error: Invalid mode '$MODE'"; usage ;;
esac

# Validate provider
case "$PROVIDER" in
    claude|codex|gemini|copilot|round-robin) ;;
    *) echo "Error: Invalid provider '$PROVIDER'"; usage ;;
esac

# Validate round-robin has >= 2 providers
if [ "$PROVIDER" = "round-robin" ] && [ ${#RR_PROVIDERS[@]} -lt 2 ]; then
    echo "Error: Round-robin mode requires at least two providers."
    exit 1
fi

echo ""
echo "=== Aloop Loop ==="
echo "Mode: $MODE"
echo "Provider: $PROVIDER"
echo "Work directory: $WORK_DIR"
echo "Prompts directory: $PROMPTS_DIR"
echo "Session directory: $SESSION_DIR"
if [ "$PROVIDER" = "round-robin" ]; then
    echo "Round robin order: ${RR_PROVIDERS[*]}"
fi
echo "Max iterations: $MAX_ITERATIONS"
echo "Stuck threshold: $MAX_STUCK"
echo ""

# Validate prompt files exist
case "$MODE" in
    plan-build)        required_prompts="plan build" ;;
    plan-build-review) required_prompts="plan build review" ;;
    *)                 required_prompts="$MODE" ;;
esac

for p in $required_prompts; do
    if [ ! -f "$PROMPTS_DIR/PROMPT_$p.md" ]; then
        echo "Error: Prompt file not found: $PROMPTS_DIR/PROMPT_$p.md"
        exit 1
    fi
done

# Validate providers installed
if [ "$DRY_RUN" = false ]; then
    if [ "$PROVIDER" = "round-robin" ]; then
        for p in "${RR_PROVIDERS[@]}"; do assert_provider_installed "$p"; done
    else
        assert_provider_installed "$PROVIDER"
    fi
fi

# Setup remote backup
setup_remote_backup || true

# Initialize session
write_log_entry "session_start" "mode" "$MODE" "provider" "$PROVIDER" "work_dir" "$WORK_DIR"

echo ""
echo "Starting loop..."
echo "---"
echo ""

# Cleanup on exit
cleanup() {
    local reason="${1:-interrupted}"
    echo ""
    write_status "$ITERATION" "$(resolve_iteration_mode $ITERATION)" "$(resolve_iteration_provider $ITERATION)" "$STUCK_COUNT" "$reason"
    write_log_entry "$reason" "iteration" "$ITERATION"
    generate_report "$reason"
}

trap 'cleanup "interrupted"; exit 130' INT
trap 'cleanup "error"; exit $?' ERR

ITERATION=0
while [ "$ITERATION" -lt "$MAX_ITERATIONS" ]; do
    ITERATION=$((ITERATION + 1))
    ITERATION_START=$(date +%s)
    iter_provider=$(resolve_iteration_provider $ITERATION)
    iter_mode=$(resolve_iteration_mode $ITERATION)

    # Check for live steering instruction (overrides normal mode)
    STEERING_FILE="$SESSION_DIR/STEERING.md"
    STEER_PROMPT_FILE="$PROMPTS_DIR/PROMPT_steer.md"
    if [ -f "$STEERING_FILE" ] && [ -f "$STEER_PROMPT_FILE" ]; then
        iter_mode="steer"
        FORCE_PLAN_NEXT=true
        write_log_entry "steering_detected" "iteration" "$ITERATION"
    elif [ -f "$STEERING_FILE" ]; then
        echo "Warning: STEERING.md found but PROMPT_steer.md is missing in $PROMPTS_DIR — steering skipped."
    fi

    iter_prompt_file="$PROMPTS_DIR/PROMPT_$iter_mode.md"

    # Update session status
    write_status "$ITERATION" "$iter_mode" "$iter_provider" "$STUCK_COUNT"

    # Color output by mode
    case "$iter_mode" in
        plan)   color="\033[35m" ;;  # magenta
        build)  color="\033[33m" ;;  # yellow
        review) color="\033[36m" ;;  # cyan
        steer)  color="\033[34m" ;;  # blue
        *)      color="\033[0m" ;;
    esac
    echo -e "${color}--- Iteration $ITERATION / $MAX_ITERATIONS [$(date '+%Y-%m-%d %H:%M:%S')] [$iter_provider] [$iter_mode] ---\033[0m"

    # Build mode: check completion and stuck detection
    if [ "$iter_mode" = "build" ]; then
        requeue_first_stuck_task_if_needed

        if check_all_tasks_complete; then
            echo ""
            echo "ALL TASKS COMPLETE"
            write_status "$ITERATION" "$iter_mode" "$iter_provider" 0 "completed"
            write_log_entry "all_tasks_complete" "iteration" "$ITERATION"
            generate_report "All tasks completed successfully."
            exit 0
        fi

        current_task=$(get_current_task)
        if [ -n "$current_task" ] && [ "$current_task" = "$LAST_TASK" ]; then
            STUCK_COUNT=$((STUCK_COUNT + 1))
        else
            LAST_TASK="$current_task"
            STUCK_COUNT=1
        fi

        if [ "$STUCK_COUNT" -ge "$MAX_STUCK" ] && [ -n "$current_task" ]; then
            skip_stuck_task "$current_task"
            write_log_entry "task_skipped" "task" "$current_task"
            continue
        fi

        if [ -n "$current_task" ]; then
            echo "Current task: $current_task"
        fi
    fi

    if [ "$DRY_RUN" = true ]; then
        echo "[DRY RUN] Would invoke $iter_provider with PROMPT_$iter_mode.md"
        sleep 2
        continue
    fi

    # Invoke provider
    prompt_content=$(cat "$iter_prompt_file")

    # Steer mode: stage STEERING.md in work directory for the spec-update agent
    if [ "$iter_mode" = "steer" ]; then
        cp "$STEERING_FILE" "$WORK_DIR/STEERING.md"
        echo "[Steering] Staging instruction for spec-update agent..."
    fi

    cd "$WORK_DIR"
    if invoke_provider "$iter_provider" "$prompt_content"; then
        # Steer mode: archive the processed steering file and clean up WorkDir copy
        if [ "$iter_mode" = "steer" ]; then
            archive_ts=$(date '+%Y%m%d-%H%M%S')
            archive_name="STEERING_processed_${archive_ts}.md"
            mv "$STEERING_FILE" "$(dirname "$STEERING_FILE")/$archive_name"
            rm -f "$WORK_DIR/STEERING.md"
            echo "[Steering processed — re-plan queued for next iteration]"
            write_log_entry "steering_processed" "archive" "$archive_name" "iteration" "$ITERATION"
        fi

        write_log_entry "iteration_complete" "iteration" "$ITERATION" "mode" "$iter_mode" "provider" "$iter_provider"

        if [ "$iter_mode" = "build" ]; then
            print_iteration_summary "$ITERATION_START"
            push_to_backup
        else
            echo ""
            echo "[Iteration $ITERATION complete - $iter_mode]"
        fi
    else
        echo "Warning: Iteration $ITERATION failed"
        write_log_entry "iteration_error" "iteration" "$ITERATION" "mode" "$iter_mode" "provider" "$iter_provider"
    fi

    sleep 3
done

echo ""
echo "Reached iteration limit ($MAX_ITERATIONS)"
write_status "$ITERATION" "$(resolve_iteration_mode $ITERATION)" "$(resolve_iteration_provider $ITERATION)" "$STUCK_COUNT" "limit_reached"
write_log_entry "limit_reached" "iteration" "$ITERATION" "limit" "$MAX_ITERATIONS"
generate_report "Reached iteration limit ($MAX_ITERATIONS)."

echo ""
echo "=== Aloop Loop Complete ($ITERATION iterations) ==="
