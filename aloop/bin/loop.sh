#!/bin/bash
# Aloop Loop — Generic Multi-Provider Autonomous Coding Loop
# Usage: loop.sh --prompts-dir <path> --session-dir <path> --work-dir <path> [options]
#
# Modes:
#   plan               - planning only (gap analysis, update TODO)
#   build              - building only (implement tasks from TODO)
#   review             - review only (audit last build against quality gates)
#   plan-build         - alternating: plan -> build -> plan -> build -> ...
#   plan-build-review  - full cycle: plan -> build x5 -> qa -> review -> ... (DEFAULT)
#
# Providers:
#   claude, codex, gemini, copilot, round-robin

# NOTE: Do NOT use "set -e" — the main loop must survive provider failures,
# transient errors in helper functions, and unexpected exit codes.  Every
# critical path uses explicit "if / ||" guards instead.

# Defense in depth: clear CLAUDECODE from the process environment at script entry.
unset CLAUDECODE

# ============================================================================
# DEFAULTS
# ============================================================================

PROMPTS_DIR=""
SESSION_DIR=""
WORK_DIR=""
MODE="plan-build-review"
PROVIDER="claude"
ROUND_ROBIN_PROVIDERS="claude,opencode,codex,gemini,copilot"
# Model defaults — keep in sync with ~/.aloop/config.yml (source of truth)
CLAUDE_MODEL="${ALOOP_CLAUDE_MODEL:-opus}"
CODEX_MODEL="${ALOOP_CODEX_MODEL:-gpt-5.3-codex}"
GEMINI_MODEL="${ALOOP_GEMINI_MODEL:-gemini-3.1-pro-preview}"
COPILOT_MODEL="${ALOOP_COPILOT_MODEL:-gpt-5.3-codex}"
COPILOT_RETRY_MODEL="${ALOOP_COPILOT_RETRY_MODEL:-claude-sonnet-4.6}"
MAX_ITERATIONS="${ALOOP_MAX_ITERATIONS:-50}"
MAX_STUCK="${ALOOP_MAX_STUCK:-3}"
BACKUP_ENABLED="${ALOOP_BACKUP:-false}"
DRY_RUN=false
DANGEROUSLY_SKIP_CONTAINER=false
LAUNCH_MODE="start"
PROVIDER_TIMEOUT="${ALOOP_PROVIDER_TIMEOUT:-28800}"
PROVIDER_HEALTH_DIR="${ALOOP_HEALTH_DIR:-$HOME/.aloop/health}"
HEALTH_LOCK_RETRY_DELAYS=(0.05 0.10 0.15 0.20 0.25)
SESSION_ID=""

# ============================================================================
# ARGUMENT PARSING
# ============================================================================

usage() {
    echo "Usage: $0 --prompts-dir <path> --session-dir <path> --work-dir <path> [options]"
    echo ""
    echo "Required:"
    echo "  --prompts-dir <path>    Directory containing PROMPT_{plan,build,qa,review}.md"
    echo "  --session-dir <path>    Directory for session state (status.json, log.jsonl)"
    echo "  --work-dir <path>       Project working directory"
    echo ""
    echo "Options:"
    echo "  --mode <mode>           plan|build|review|plan-build|plan-build-review (default: plan-build-review)"
    echo "  --provider <provider>   claude|codex|gemini|copilot|round-robin (default: claude)"
    echo "  --round-robin <list>    Comma-separated provider list (default: claude,codex,gemini,copilot)"
    echo "  --max-iterations <n>    Maximum iterations (default: 50)"
    echo "  --max-stuck <n>         Skip task after N failures (default: 3)"
    echo "  --launch-mode <mode>    start|restart|resume (default: start)"
    echo "  --backup                Enable remote git backup"
    echo "  --dry-run               Print commands without executing"
    echo "  --dangerously-skip-container  Skip devcontainer routing (agents run on host)"
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
        --backup)       BACKUP_ENABLED="true"; shift ;;
        --dry-run)      DRY_RUN=true; shift ;;
        --dangerously-skip-container) DANGEROUSLY_SKIP_CONTAINER=true; shift ;;
        --claude-model) CLAUDE_MODEL="$2"; shift 2 ;;
        --codex-model)  CODEX_MODEL="$2"; shift 2 ;;
        --gemini-model) GEMINI_MODEL="$2"; shift 2 ;;
        --copilot-model) COPILOT_MODEL="$2"; shift 2 ;;
        --launch-mode)  LAUNCH_MODE="$2"; shift 2 ;;
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

# Validate launch mode
case "$LAUNCH_MODE" in
    start|restart|resume) ;;
    *) echo "Error: Invalid launch mode: $LAUNCH_MODE (must be start, restart, or resume)"; exit 1 ;;
esac

mkdir -p "$SESSION_DIR"

# ============================================================================
# DEVCONTAINER AUTO-ROUTING — detect and route provider calls through container
# ============================================================================

DEVCONTAINER_ACTIVE=false
DC_EXEC=()
DEVCONTAINER_JSON_PATH="$WORK_DIR/.devcontainer/devcontainer.json"

initialize_devcontainer_routing() {
    if [ ! -f "$DEVCONTAINER_JSON_PATH" ]; then
        echo "No devcontainer found. Run /aloop:devcontainer to set up isolated agent execution."
        return
    fi

    if [ "$DANGEROUSLY_SKIP_CONTAINER" = "true" ]; then
        echo "WARNING: DANGER: Running agents directly on host without container isolation. Agents have full access to your filesystem, network, and credentials." >&2
        return
    fi

    # Check if devcontainer CLI is available
    if ! command -v devcontainer >/dev/null 2>&1; then
        echo "WARNING: devcontainer CLI not found on PATH. Running agents directly on host. Install with: npm install -g @devcontainers/cli" >&2
        return
    fi

    # Check if container is already running
    echo "Checking devcontainer status..."
    if devcontainer exec --workspace-folder "$WORK_DIR" -- echo ok >/dev/null 2>&1; then
        echo "Devcontainer already running."
    else
        echo "Starting devcontainer..."
        if ! devcontainer up --workspace-folder "$WORK_DIR" >/dev/null 2>&1; then
            echo "WARNING: devcontainer up failed. Running agents directly on host." >&2
            return
        fi
        echo "Devcontainer started successfully."
    fi

    DEVCONTAINER_ACTIVE=true
    DC_EXEC=(devcontainer exec --workspace-folder "$WORK_DIR")
    echo "Provider calls will be routed through devcontainer."
}

initialize_devcontainer_routing

# ============================================================================
# SESSION LOCKING — prevent multiple loops on same session files
# ============================================================================

SESSION_LOCK_FILE="$SESSION_DIR/session.lock"

check_session_lock_alive() {
    [ -f "$SESSION_LOCK_FILE" ] || return 1
    local lock_pid
    lock_pid=$(head -1 "$SESSION_LOCK_FILE" 2>/dev/null | tr -d '[:space:]')
    [ -n "$lock_pid" ] || return 1
    # Check if the process is still running
    kill -0 "$lock_pid" 2>/dev/null
}

if check_session_lock_alive; then
    existing_pid=$(head -1 "$SESSION_LOCK_FILE" | tr -d '[:space:]')
    echo "Error: Session is already locked by PID $existing_pid (still alive). Another loop is running on this session directory: $SESSION_DIR" >&2
    exit 1
fi

# Write our PID to the lockfile
echo $$ > "$SESSION_LOCK_FILE"

# Update meta.json and active.json with current PID so dashboard can track us
if [ -f "$SESSION_DIR/meta.json" ] && command -v python3 >/dev/null 2>&1; then
    python3 -c "
import json, os
# Update meta.json
mp = os.path.join('$SESSION_DIR', 'meta.json')
with open(mp) as f: m = json.load(f)
m['pid'] = $$
with open(mp, 'w') as f: json.dump(m, f, indent=2)
# Update active.json
ap = os.path.join(os.path.expanduser('~'), '.aloop', 'active.json')
if os.path.isfile(ap):
    with open(ap) as f: a = json.load(f)
    sid = m.get('session_id', os.path.basename('$SESSION_DIR'))
    if isinstance(a, dict) and sid in a:
        a[sid]['pid'] = $$
    elif isinstance(a, list):
        for e in a:
            if isinstance(e, dict) and e.get('session_id') == sid:
                e['pid'] = $$
    with open(ap, 'w') as f: json.dump(a, f, indent=2)
" 2>/dev/null || true
fi

remove_session_lock() {
    if [ -f "$SESSION_LOCK_FILE" ]; then
        local lock_pid
        lock_pid=$(head -1 "$SESSION_LOCK_FILE" 2>/dev/null | tr -d '[:space:]')
        if [ "$lock_pid" = "$$" ]; then
            rm -f "$SESSION_LOCK_FILE"
        fi
    fi
}

# ============================================================================
# PROVIDER PROCESS TRACKING — kill hung/zombie provider on timeout or exit
# ============================================================================

ACTIVE_PROVIDER_PID=""

kill_active_provider() {
    if [ -n "$ACTIVE_PROVIDER_PID" ]; then
        if kill -0 "$ACTIVE_PROVIDER_PID" 2>/dev/null; then
            # Kill process group to include children
            kill -- -"$ACTIVE_PROVIDER_PID" 2>/dev/null || kill "$ACTIVE_PROVIDER_PID" 2>/dev/null || true
            echo "Warning: Killed active provider process tree (PID $ACTIVE_PROVIDER_PID)" >&2
        fi
        ACTIVE_PROVIDER_PID=""
    fi
}

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
LOOP_PLAN_FILE="$SESSION_DIR/loop-plan.json"
STATUS_FILE="$SESSION_DIR/status.json"
LOG_FILE="$SESSION_DIR/log.jsonl"
REPORT_FILE="$SESSION_DIR/report.md"
ARTIFACTS_DIR="$SESSION_DIR/artifacts"
START_TIME=$(date +%s)
RUN_ID=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || python3 -c 'import uuid; print(uuid.uuid4())' 2>/dev/null || date +%s%N)

# Ensure raw output log exists before offset reads (avoids missing-file warnings).
touch "$LOG_FILE.raw"

# Runtime version: read version.json written by install.ps1
RUNTIME_VERSION_DIR="${ALOOP_RUNTIME_DIR:-$HOME/.aloop}"
RUNTIME_VERSION_FILE="$RUNTIME_VERSION_DIR/version.json"
RUNTIME_COMMIT=""
RUNTIME_INSTALLED_AT=""
if [ -f "$RUNTIME_VERSION_FILE" ]; then
    RUNTIME_COMMIT=$(grep -o '"commit":"[^"]*"' "$RUNTIME_VERSION_FILE" 2>/dev/null | head -1 | sed 's/"commit":"//;s/"//')
    RUNTIME_INSTALLED_AT=$(grep -o '"installed_at":"[^"]*"' "$RUNTIME_VERSION_FILE" 2>/dev/null | head -1 | sed 's/"installed_at":"//;s/"//')
fi

DASHBOARD_PID=""
DASHBOARD_URL=""

# Parse round-robin providers into array
IFS=',' read -ra RR_PROVIDERS <<< "$ROUND_ROBIN_PROVIDERS"

substitute_prompt_placeholders() {
    local prompt_text="$1"
    prompt_text="${prompt_text//\{\{SESSION_DIR\}\}/$SESSION_DIR}"
    prompt_text="${prompt_text//\{\{ITERATION\}\}/$ITERATION}"
    prompt_text="${prompt_text//\{\{ARTIFACTS_DIR\}\}/$ARTIFACTS_DIR}"
    # Backward compatibility for existing custom prompts.
    prompt_text="${prompt_text//<session-dir>/$SESSION_DIR}"
    prompt_text="${prompt_text//iter-<N>/iter-$ITERATION}"
    printf '%s' "$prompt_text"
}

# Re-read provider list from meta.json each iteration (supports hot-reload)
refresh_providers_from_meta() {
    local meta_file="$SESSION_DIR/meta.json"
    if [ ! -f "$meta_file" ]; then
        return
    fi
    # Extract enabled_providers array as comma-separated string using python
    # (no jq dependency — python3 is always available)
    local new_providers
    new_providers=$(python3 -c "
import json, sys
try:
    with open('$meta_file') as f:
        m = json.load(f)
    providers = m.get('enabled_providers') or m.get('round_robin_order')
    if providers:
        print(','.join(providers))
except Exception:
    sys.exit(1)
" 2>/dev/null) || return
    if [ -n "$new_providers" ]; then
        local old_csv
        old_csv="$(IFS=,; echo "${RR_PROVIDERS[*]}")"
        if [ "$new_providers" != "$old_csv" ]; then
            IFS=',' read -ra RR_PROVIDERS <<< "$new_providers"
            # Re-validate availability
            local available=()
            for p in "${RR_PROVIDERS[@]}"; do
                if command -v "$p" &>/dev/null; then
                    available+=("$p")
                fi
            done
            if [ ${#available[@]} -gt 0 ]; then
                RR_PROVIDERS=("${available[@]}")
                write_log_entry "providers_refreshed" \
                    "old" "$old_csv" \
                    "new" "$(IFS=,; echo "${RR_PROVIDERS[*]}")"
            fi
        fi
    fi
}

resolve_iteration_provider() {
    local iteration=$1
    if [ "$PROVIDER" = "round-robin" ]; then
        local count=${#RR_PROVIDERS[@]}
        resolve_healthy_provider "$RR_NEXT_INDEX"
    else
        echo "$PROVIDER"
    fi
}

resolve_iteration_mode() {
    local iteration=$1
    RESOLVED_PROMPT_NAME=""
    # Queue overrides replace the old forceReviewNext/forcePlanNext flags.
    # Queue consumption happens in run_queue_if_present() before we get here.
    if resolve_cycle_prompt_from_plan; then
            RESOLVED_MODE=$(derive_mode_from_prompt_name "$RESOLVED_PROMPT_NAME")
        else
            case "$MODE" in
                plan-build)
                    if (( CYCLE_POSITION % 2 == 0 )); then RESOLVED_MODE="plan"; else RESOLVED_MODE="build"; fi
                    ;;
                plan-build-review)
                    # 8-step cycle: plan -> build x5 -> qa -> review
                    local phase=$(( CYCLE_POSITION % 8 ))
                    case $phase in
                        0) RESOLVED_MODE="plan" ;;
                        1|2|3|4|5) RESOLVED_MODE="build" ;;
                        6) RESOLVED_MODE="qa" ;;
                        7) RESOLVED_MODE="review" ;;
                    esac
                    ;;
                *)
                    RESOLVED_MODE="$MODE"
                    ;;
            esac
        fi

    # Phase prerequisite guards (Rule 2)
    RESOLVED_MODE=$(check_phase_prerequisites "$RESOLVED_MODE")
}

check_phase_prerequisites() {
    local requested_phase="$1"
    local actual_phase="$requested_phase"

    if [ "${ALOOP_SKIP_PHASE_GUARDS:-}" = "true" ]; then
        echo "$actual_phase"
        return
    fi

    if [ "$requested_phase" = "build" ]; then
        # build phase requires TODO.md with at least one unchecked task
        if [ -f "${PLAN_FILE:-}" ]; then
            local unchecked
            unchecked=$(grep -c '^\s*- \[ \]' "$PLAN_FILE" 2>/dev/null) || unchecked=0
            if [ "$unchecked" -eq 0 ]; then
                actual_phase="plan"
                write_log_entry "phase_prerequisite_miss" "requested" "build" "actual" "plan" "reason" "no_tasks"
                echo "Warning: No unchecked tasks in TODO.md — forcing plan phase" >&2
            fi
        else
            # TODO.md missing or unreadable — treat as zero tasks, force plan
            actual_phase="plan"
            write_log_entry "phase_prerequisite_miss" "requested" "build" "actual" "plan" "reason" "no_tasks"
            echo "Warning: TODO.md not found — forcing plan phase" >&2
        fi
    fi

    if [ "$requested_phase" = "review" ]; then
        # review phase requires at least one commit since last plan iteration
        if [ -d "${WORK_DIR:-}/.git" ] && ! check_has_builds_to_review; then
            actual_phase="build"
            write_log_entry "phase_prerequisite_miss" "requested" "review" "actual" "build" "reason" "no_builds"
            echo "Warning: No builds since last plan — forcing build phase" >&2
        fi
    fi

    echo "$actual_phase"
}

check_has_builds_to_review() {
    # If we don't have a plan commit recorded, but we have ANY commits since session start,
    # we allow review. If no commits at all since session start, force build.
    # Actually, SPEC says "compare HEAD against stored last-plan-commit".
    if [ -z "$LAST_PLAN_COMMIT" ]; then
        # Fallback: if no lastPlanCommit is recorded, check if there are any non-harness commits
        # since iteration 0.
        local session_start_sha
        session_start_sha=$(git -C "$WORK_DIR" log --grep="Aloop-Iteration: 0" --format="%h" -n 1 2>/dev/null || echo "")
        if [ -n "$session_start_sha" ]; then
            local new_commits
            new_commits=$(git -C "$WORK_DIR" log "${session_start_sha}..HEAD" --oneline 2>/dev/null | wc -l)
            if [ "$new_commits" -gt 0 ]; then return 0; fi
        fi
        return 1
    fi

    local current_head
    current_head=$(git -C "$WORK_DIR" rev-parse HEAD 2>/dev/null || echo "")
    if [ "$current_head" = "$LAST_PLAN_COMMIT" ]; then
        return 1 # No new commits since last plan
    fi
    return 0 # There are new commits
}

derive_mode_from_prompt_name() {
    local prompt_name="$1"
    local base
    base=$(basename "$prompt_name")
    base="${base%.md}"
    base="${base#PROMPT_}"
    echo "${base%%_*}"
}

resolve_cycle_prompt_from_plan() {
    if [ ! -f "$LOOP_PLAN_FILE" ]; then
        return 1
    fi
    local parsed
    parsed=$(python3 - "$LOOP_PLAN_FILE" "$CYCLE_POSITION" <<'PY'
import json, sys
path = sys.argv[1]
fallback_pos = int(sys.argv[2])
with open(path, encoding="utf-8") as f:
    payload = json.load(f)
cycle = payload.get("cycle")
if not isinstance(cycle, list) or not cycle:
    raise SystemExit(1)
cycle = [entry for entry in cycle if isinstance(entry, str) and entry.strip()]
if not cycle:
    raise SystemExit(1)
raw_pos = payload.get("cyclePosition", fallback_pos)
try:
    cycle_pos = int(raw_pos)
except Exception:
    cycle_pos = fallback_pos
index = cycle_pos % len(cycle)
print(cycle_pos)
print(len(cycle))
print(cycle[index].strip())
print(payload.get("lastPlanCommit", ""))
PY
) || return 1
    local parsed_cycle_pos parsed_cycle_len parsed_prompt_name parsed_last_plan_commit
    parsed_cycle_pos=$(printf '%s\n' "$parsed" | sed -n '1p')
    parsed_cycle_len=$(printf '%s\n' "$parsed" | sed -n '2p')
    parsed_prompt_name=$(printf '%s\n' "$parsed" | sed -n '3p')
    parsed_last_plan_commit=$(printf '%s\n' "$parsed" | sed -n '4p')
    CYCLE_POSITION="${parsed_cycle_pos:-$CYCLE_POSITION}"
    CYCLE_LENGTH="${parsed_cycle_len:-0}"
    RESOLVED_PROMPT_NAME="$parsed_prompt_name"
    LAST_PLAN_COMMIT="$parsed_last_plan_commit"
    return 0
}

persist_loop_plan_state() {
    if [ ! -f "$LOOP_PLAN_FILE" ]; then
        return
    fi
    if check_all_tasks_complete; then
        ALL_TASKS_MARKED_DONE=true
    else
        ALL_TASKS_MARKED_DONE=false
    fi
    python3 - "$LOOP_PLAN_FILE" "$CYCLE_POSITION" "$ITERATION" "$ALL_TASKS_MARKED_DONE" "$LAST_PLAN_COMMIT" <<'PY'
import json, os, sys, tempfile
path, cycle_pos, iteration, all_done, last_commit = sys.argv[1:]
with open(path, encoding="utf-8") as f:
    payload = json.load(f)
payload["cyclePosition"] = int(cycle_pos)
payload["iteration"] = int(iteration)
payload["allTasksMarkedDone"] = all_done.lower() == "true"
payload["lastPlanCommit"] = last_commit
fd, tmp = tempfile.mkstemp(prefix=".loop-plan.", suffix=".json", dir=os.path.dirname(path))
os.close(fd)
with open(tmp, "w", encoding="utf-8") as f:
    json.dump(payload, f, indent=2)
    f.write("\n")
os.replace(tmp, path)
PY
}

parse_frontmatter() {
    local file="$1"
    FRONTMATTER_PROVIDER=$(sed -n '/^---$/,/^---$/{ /^provider:/s/provider: *//p }' "$file" | head -n1)
    FRONTMATTER_MODEL=$(sed -n '/^---$/,/^---$/{ /^model:/s/model: *//p }' "$file" | head -n1)
    FRONTMATTER_AGENT=$(sed -n '/^---$/,/^---$/{ /^agent:/s/agent: *//p }' "$file" | head -n1)
    FRONTMATTER_REASONING=$(sed -n '/^---$/,/^---$/{ /^reasoning:/s/reasoning: *//p }' "$file" | head -n1)
    FRONTMATTER_COLOR=$(sed -n '/^---$/,/^---$/{ /^color:/s/color: *//p }' "$file" | head -n1)
    FRONTMATTER_TRIGGER=$(sed -n '/^---$/,/^---$/{ /^trigger:/s/trigger: *//p }' "$file" | head -n1)
    FRONTMATTER_PROVIDER="${FRONTMATTER_PROVIDER:-}"
    FRONTMATTER_MODEL="${FRONTMATTER_MODEL:-}"
    FRONTMATTER_AGENT="${FRONTMATTER_AGENT:-}"
    FRONTMATTER_REASONING="${FRONTMATTER_REASONING:-}"
    FRONTMATTER_COLOR="${FRONTMATTER_COLOR:-}"
    FRONTMATTER_TRIGGER="${FRONTMATTER_TRIGGER:-}"
}

advance_cycle_position() {
    if [ -n "${CYCLE_LENGTH:-}" ] && [ "$CYCLE_LENGTH" -gt 0 ] 2>/dev/null; then
        CYCLE_POSITION=$(( (CYCLE_POSITION + 1) % CYCLE_LENGTH ))
        return
    fi
    case "$MODE" in
        plan-build) CYCLE_POSITION=$(( (CYCLE_POSITION + 1) % 2 )) ;;
        plan-build-review) CYCLE_POSITION=$(( (CYCLE_POSITION + 1) % 8 )) ;;
    esac
}

register_iteration_success() {
    local iteration_mode="$1"
    local was_forced="$2"

    PHASE_RETRY_PHASE=""
    PHASE_RETRY_CONSECUTIVE=0
    PHASE_RETRY_FAILURE_REASONS=()

    if { [ "$MODE" = "plan-build" ] || [ "$MODE" = "plan-build-review" ]; } \
        && [ "$was_forced" != true ]; then
        advance_cycle_position
    fi
}

write_phase_retry_exhausted_entry() {
    local phase="$1"
    local consecutive_failures="$2"
    local max_phase_retries="$3"
    shift 3
    python3 - "$LOG_FILE" "$RUN_ID" "$phase" "$consecutive_failures" "$max_phase_retries" "$@" <<'PY'
import datetime
import json
import sys

log_path, run_id, phase, consecutive, max_retries, *reasons = sys.argv[1:]
entry = {
    "timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "run_id": run_id,
    "event": "phase_retry_exhausted",
    "phase": phase,
    "consecutive_failures": int(consecutive),
    "max_phase_retries": int(max_retries),
    "failure_reasons": reasons,
}
with open(log_path, "a", encoding="utf-8") as fh:
    json.dump(entry, fh, ensure_ascii=False)
    fh.write("\n")
PY
}

register_iteration_failure() {
    local iteration_mode="$1"
    local error_text="$2"

    if ! { [ "$MODE" = "plan-build" ] || [ "$MODE" = "plan-build-review" ]; }; then
        return
    fi
    if ! { [ "$iteration_mode" = "plan" ] || [ "$iteration_mode" = "build" ] || [ "$iteration_mode" = "qa" ] || [ "$iteration_mode" = "review" ]; }; then
        return
    fi

    if [ "$PHASE_RETRY_PHASE" = "$iteration_mode" ]; then
        PHASE_RETRY_CONSECUTIVE=$((PHASE_RETRY_CONSECUTIVE + 1))
    else
        PHASE_RETRY_PHASE="$iteration_mode"
        PHASE_RETRY_CONSECUTIVE=1
        PHASE_RETRY_FAILURE_REASONS=()
    fi

    PHASE_RETRY_FAILURE_REASONS+=("$error_text")
    while [ "${#PHASE_RETRY_FAILURE_REASONS[@]}" -gt "$MAX_PHASE_RETRIES" ]; do
        PHASE_RETRY_FAILURE_REASONS=("${PHASE_RETRY_FAILURE_REASONS[@]:1}")
    done

    if [ "$PHASE_RETRY_CONSECUTIVE" -ge "$MAX_PHASE_RETRIES" ]; then
        echo "Warning: Phase '$iteration_mode' failed $PHASE_RETRY_CONSECUTIVE times; advancing cycle position."
        write_phase_retry_exhausted_entry \
            "$iteration_mode" \
            "$PHASE_RETRY_CONSECUTIVE" \
            "$MAX_PHASE_RETRIES" \
            "${PHASE_RETRY_FAILURE_REASONS[@]}"
        advance_cycle_position
        PHASE_RETRY_PHASE=""
        PHASE_RETRY_CONSECUTIVE=0
        PHASE_RETRY_FAILURE_REASONS=()
    fi
}

assert_provider_installed() {
    if ! command -v "$1" &>/dev/null; then
        echo "Error: CLI '$1' not found on PATH."
        exit 1
    fi
}

assert_copilot_auth() {
    if echo "$1" | grep -Eiq "No authentication information found|Failed to log in to github\.com|run the '/login' command|not logged in"; then
        echo "copilot is not authenticated. Run 'copilot' then use the /login slash command." >&2
        return 1
    fi
}

write_status() {
    local iteration=$1 phase=$2 provider=$3 stuck_count=$4 state=${5:-running}
    local iter_started="${ITERATION_START_ISO:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
    cat > "$STATUS_FILE" << EOF
{"iteration":$iteration,"phase":"$phase","provider":"$provider","stuck_count":$stuck_count,"state":"$state","updated_at":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","iteration_started_at":"$iter_started"}
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
    echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"run_id\":\"$RUN_ID\",\"event\":\"$event\"${data:+,$data}}" >> "$LOG_FILE"
}

# ============================================================================
# PROVIDER HEALTH PRIMITIVES
# ============================================================================

ensure_provider_health_dir() {
    mkdir -p "$PROVIDER_HEALTH_DIR"
}

get_provider_health_path() {
    local provider_name
    provider_name=$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')
    ensure_provider_health_dir
    echo "$PROVIDER_HEALTH_DIR/$provider_name.json"
}

acquire_provider_health_lock() {
    local path="$1"
    local provider_name="$2"
    local operation_name="$3"
    local lock_dir="${path}.lock"
    local retries=${#HEALTH_LOCK_RETRY_DELAYS[@]}
    local i
    for ((i=0; i<retries; i++)); do
        if mkdir "$lock_dir" 2>/dev/null; then
            echo "$lock_dir"
            return 0
        fi
        sleep "${HEALTH_LOCK_RETRY_DELAYS[$i]}"
    done
    write_log_entry "health_lock_failed" \
        "provider" "$provider_name" \
        "operation" "$operation_name" \
        "path" "$path" \
        "retries" "$retries"
    return 1
}

release_provider_health_lock() {
    local lock_dir="$1"
    if [ -n "$lock_dir" ] && [ -d "$lock_dir" ]; then
        rmdir "$lock_dir" 2>/dev/null || true
    fi
}

provider_health_defaults() {
    HEALTH_STATUS="healthy"
    HEALTH_LAST_SUCCESS=""
    HEALTH_LAST_FAILURE=""
    HEALTH_FAILURE_REASON=""
    HEALTH_CONSECUTIVE_FAILURES=0
    HEALTH_COOLDOWN_UNTIL=""
}

json_escape() {
    printf '%s' "$1" \
        | sed 's/\\/\\\\/g; s/"/\\"/g' \
        | sed "s/$(printf '\t')/\\\\t/g" \
        | sed "s/$(printf '\r')/\\\\r/g" \
        | awk 'NR==1{printf "%s",$0} NR>1{printf "\\n%s",$0}'
}

json_nullable_string() {
    if [ -n "$1" ]; then
        printf '"%s"' "$(json_escape "$1")"
    else
        printf 'null'
    fi
}

extract_json_string_field() {
    local raw="$1"
    local key="$2"
    local value
    value=$(printf '%s' "$raw" | sed -n "s/.*\"$key\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" | head -n 1)
    printf '%s' "$value"
}

extract_json_number_field() {
    local raw="$1"
    local key="$2"
    local value
    value=$(printf '%s' "$raw" | sed -n "s/.*\"$key\"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p" | head -n 1)
    printf '%s' "$value"
}

get_provider_health_state() {
    local provider_name="$1"
    local path
    path=$(get_provider_health_path "$provider_name")
    provider_health_defaults
    if [ ! -f "$path" ]; then
        return 0
    fi

    local lock_dir
    lock_dir=$(acquire_provider_health_lock "$path" "$provider_name" "read") || return 1
    local raw=""
    raw=$(cat "$path" 2>/dev/null || true)
    release_provider_health_lock "$lock_dir"

    if [ -z "${raw//[[:space:]]/}" ]; then
        return 0
    fi

    local status
    status=$(extract_json_string_field "$raw" "status")
    if [ -n "$status" ]; then HEALTH_STATUS="$status"; fi

    local last_success
    last_success=$(extract_json_string_field "$raw" "last_success")
    if [ -n "$last_success" ]; then HEALTH_LAST_SUCCESS="$last_success"; fi

    local last_failure
    last_failure=$(extract_json_string_field "$raw" "last_failure")
    if [ -n "$last_failure" ]; then HEALTH_LAST_FAILURE="$last_failure"; fi

    local failure_reason
    failure_reason=$(extract_json_string_field "$raw" "failure_reason")
    if [ -n "$failure_reason" ]; then HEALTH_FAILURE_REASON="$failure_reason"; fi

    local consecutive_failures
    consecutive_failures=$(extract_json_number_field "$raw" "consecutive_failures")
    if [ -n "$consecutive_failures" ]; then HEALTH_CONSECUTIVE_FAILURES="$consecutive_failures"; fi

    local cooldown_until
    cooldown_until=$(extract_json_string_field "$raw" "cooldown_until")
    if [ -n "$cooldown_until" ]; then HEALTH_COOLDOWN_UNTIL="$cooldown_until"; fi
    return 0
}

set_provider_health_state() {
    local provider_name="$1"
    local status="$2"
    local last_success="$3"
    local last_failure="$4"
    local failure_reason="$5"
    local consecutive_failures="$6"
    local cooldown_until="$7"
    local path
    path=$(get_provider_health_path "$provider_name")
    local lock_dir
    lock_dir=$(acquire_provider_health_lock "$path" "$provider_name" "write") || return 1

    local tmp_file="${path}.tmp.$$"
    cat > "$tmp_file" << EOF
{"status":"$(json_escape "$status")","last_success":$(json_nullable_string "$last_success"),"last_failure":$(json_nullable_string "$last_failure"),"failure_reason":$(json_nullable_string "$failure_reason"),"consecutive_failures":$consecutive_failures,"cooldown_until":$(json_nullable_string "$cooldown_until")}
EOF
    mv "$tmp_file" "$path"
    release_provider_health_lock "$lock_dir"
    return 0
}

get_provider_cooldown_seconds() {
    local failures="$1"
    case "$failures" in
        1) echo 0 ;;
        2) echo 120 ;;
        3) echo 300 ;;
        4) echo 900 ;;
        5) echo 1800 ;;
        *) echo 3600 ;;
    esac
}

classify_provider_failure() {
    local lower
    lower=$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')
    if printf '%s' "$lower" | grep -Eq '429|rate.limit|too many requests'; then echo "rate_limit"; return; fi
    if printf '%s' "$lower" | grep -Eq 'cannot launch inside another session'; then echo "concurrent_cap"; return; fi
    if printf '%s' "$lower" | grep -Eq 'auth|unauthorized|invalid.*(token|key)|expired.*(token|key)|(token|key).*expired'; then echo "auth"; return; fi
    if printf '%s' "$lower" | grep -Eq 'timeout|connection.*refused|network'; then echo "timeout"; return; fi
    echo "unknown"
}

timestamp_to_epoch() {
    date -u -d "$1" +%s 2>/dev/null
}

update_provider_health_on_success() {
    local provider_name="$1"
    if ! get_provider_health_state "$provider_name"; then
        return
    fi
    local was_unhealthy="$HEALTH_STATUS"
    local now
    now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    set_provider_health_state "$provider_name" "healthy" "$now" "$HEALTH_LAST_FAILURE" "$HEALTH_FAILURE_REASON" 0 "" || return
    if [ "$was_unhealthy" != "healthy" ]; then
        write_log_entry "provider_recovered" \
            "provider" "$provider_name" \
            "previous_status" "$was_unhealthy"
    fi
}

update_provider_health_on_failure() {
    local provider_name="$1"
    local error_text="$2"
    if ! get_provider_health_state "$provider_name"; then
        return
    fi
    local reason failures now_epoch now cooldown_secs new_status cooldown_until
    reason=$(classify_provider_failure "$error_text")
    failures=$((HEALTH_CONSECUTIVE_FAILURES + 1))
    now_epoch=$(date -u +%s)
    now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    cooldown_until=""

    if [ "$reason" = "auth" ]; then
        new_status="degraded"
    else
        if [ "$reason" = "concurrent_cap" ]; then
            cooldown_secs=120
        else
            cooldown_secs=$(get_provider_cooldown_seconds "$failures")
        fi
        if [ "$cooldown_secs" -gt 0 ]; then
            new_status="cooldown"
            cooldown_until=$(date -u -d "@$((now_epoch + cooldown_secs))" +%Y-%m-%dT%H:%M:%SZ)
        else
            new_status="$HEALTH_STATUS"
        fi
    fi

    set_provider_health_state "$provider_name" "$new_status" "$HEALTH_LAST_SUCCESS" "$now" "$reason" "$failures" "$cooldown_until" || return

    if [ "$new_status" = "degraded" ]; then
        write_log_entry "provider_degraded" \
            "provider" "$provider_name" \
            "reason" "$reason" \
            "consecutive_failures" "$failures"
    elif [ "$new_status" = "cooldown" ]; then
        write_log_entry "provider_cooldown" \
            "provider" "$provider_name" \
            "reason" "$reason" \
            "consecutive_failures" "$failures" \
            "cooldown_until" "$cooldown_until"
    fi
}

resolve_healthy_provider() {
    local start_index="$1"
    local count=${#RR_PROVIDERS[@]}
    while true; do
        local earliest_cooldown_epoch=""
        local available_provider=""
        local degraded_count=0
        local all_degraded_reasons=""
        local i
        for ((i=0; i<count; i++)); do
            local idx=$(( (start_index + i) % count ))
            local p="${RR_PROVIDERS[$idx]}"
            if ! get_provider_health_state "$p"; then
                available_provider="$p"
                break
            fi
            if [ "$HEALTH_STATUS" = "healthy" ]; then
                available_provider="$p"
                break
            fi
            if [ "$HEALTH_STATUS" = "degraded" ]; then
                degraded_count=$((degraded_count + 1))
                local degraded_reason="${HEALTH_FAILURE_REASON:-unknown}"
                if [ -n "$all_degraded_reasons" ]; then
                    all_degraded_reasons="${all_degraded_reasons},${p}:${degraded_reason}"
                else
                    all_degraded_reasons="${p}:${degraded_reason}"
                fi
                write_log_entry "provider_skipped_degraded" \
                    "provider" "$p" \
                    "reason" "$degraded_reason"
                continue
            fi
            if [ "$HEALTH_STATUS" = "cooldown" ] && [ -n "$HEALTH_COOLDOWN_UNTIL" ]; then
                local cooldown_epoch now_epoch
                cooldown_epoch=$(timestamp_to_epoch "$HEALTH_COOLDOWN_UNTIL")
                if [ -z "$cooldown_epoch" ]; then
                    available_provider="$p"
                    break
                fi
                now_epoch=$(date -u +%s)
                if [ "$now_epoch" -ge "$cooldown_epoch" ]; then
                    available_provider="$p"
                    break
                fi
                if [ -z "$earliest_cooldown_epoch" ] || [ "$cooldown_epoch" -lt "$earliest_cooldown_epoch" ]; then
                    earliest_cooldown_epoch="$cooldown_epoch"
                fi
            fi
        done

        if [ -n "$available_provider" ]; then
            # Advance RR_NEXT_INDEX to the slot AFTER the one we picked,
            # so the next iteration starts from the next provider — no repeats
            # even when unhealthy providers were skipped.
            local picked_idx
            for ((picked_idx=0; picked_idx<count; picked_idx++)); do
                if [ "${RR_PROVIDERS[$picked_idx]}" = "$available_provider" ]; then
                    RR_NEXT_INDEX=$(( (picked_idx + 1) % count ))
                    break
                fi
            done
            echo "$available_provider"
            return
        fi

        local sleep_secs=60
        local providers_csv
        providers_csv="$(IFS=,; echo "${RR_PROVIDERS[*]}")"
        if [ "$degraded_count" -eq "$count" ]; then
            write_log_entry "all_providers_degraded" \
                "providers" "$providers_csv" \
                "reasons" "$all_degraded_reasons"
            echo "Warning: All providers are degraded. Fix auth/quota issues (for example, rerun provider login) and retry." >&2
        fi
        if [ -n "$earliest_cooldown_epoch" ]; then
            local now_epoch remaining
            now_epoch=$(date -u +%s)
            remaining=$((earliest_cooldown_epoch - now_epoch))
            if [ "$remaining" -gt 1 ]; then
                sleep_secs="$remaining"
            else
                sleep_secs=1
            fi
        fi
        write_log_entry "all_providers_unavailable" \
            "providers" "$providers_csv" \
            "sleep_seconds" "$sleep_secs"
        if [ -n "$earliest_cooldown_epoch" ]; then
            echo "Warning: All providers unavailable. Sleeping ${sleep_secs}s until cooldown expires..." >&2
        else
            echo "Warning: All providers unavailable. Sleeping ${sleep_secs}s before retry..." >&2
        fi
        sleep "$sleep_secs"
    done
}

find_dashboard_port() {
    if ! command -v node >/dev/null 2>&1; then
        return 1
    fi
    node -e "const net=require('net');const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const a=s.address();console.log(a&&typeof a==='object'?a.port:'');s.close();});s.on('error',()=>process.exit(1));"
}

start_dashboard() {
    local runtime_dir="${ALOOP_RUNTIME_DIR:-$HOME/.aloop}"
    local cli_entry="$runtime_dir/cli/aloop.mjs"
    if [ ! -f "$cli_entry" ]; then
        echo "Warning: Dashboard CLI not found at $cli_entry. Continuing without dashboard."
        return
    fi

    local dashboard_port
    dashboard_port=$(find_dashboard_port 2>/dev/null || true)
    if [ -z "$dashboard_port" ]; then
        echo "Warning: Unable to reserve dashboard port. Continuing without dashboard."
        return
    fi

    node "$cli_entry" dashboard --port "$dashboard_port" --session-dir "$SESSION_DIR" --workdir "$WORK_DIR" >> "$SESSION_DIR/dashboard.stdout.log" 2>> "$SESSION_DIR/dashboard.stderr.log" &
    DASHBOARD_PID=$!
    sleep 1
    if ! kill -0 "$DASHBOARD_PID" 2>/dev/null; then
        echo "Warning: Dashboard exited early. Check $SESSION_DIR/dashboard.stderr.log"
        DASHBOARD_PID=""
        return
    fi

    DASHBOARD_URL="http://127.0.0.1:$dashboard_port"
    echo "Dashboard URL: $DASHBOARD_URL"
}

stop_dashboard() {
    if [ -z "$DASHBOARD_PID" ]; then
        return
    fi
    if kill -0 "$DASHBOARD_PID" 2>/dev/null; then
        kill "$DASHBOARD_PID" 2>/dev/null || true
        wait "$DASHBOARD_PID" 2>/dev/null || true
    fi
    DASHBOARD_PID=""
}

# ============================================================================
# PROVIDER INVOCATION
# ============================================================================

_gh_block_dir=""
setup_gh_block() {
    if [ -n "$_gh_block_dir" ]; then
        echo "$_gh_block_dir"
        return
    fi
    _gh_block_dir="$(mktemp -d)"
    cat > "$_gh_block_dir/gh" << 'GHBLOCK'
#!/bin/sh
echo "gh: blocked by aloop PATH hardening" >&2
exit 127
GHBLOCK
    chmod +x "$_gh_block_dir/gh"
    # Also block gh.exe on Windows/MSYS
    cp "$_gh_block_dir/gh" "$_gh_block_dir/gh.exe"
    chmod +x "$_gh_block_dir/gh.exe"
    echo "$_gh_block_dir"
}
cleanup_gh_block() {
    if [ -n "$_gh_block_dir" ] && [ -d "$_gh_block_dir" ]; then
        rm -rf "$_gh_block_dir"
        _gh_block_dir=""
    fi
}

# Wait for ACTIVE_PROVIDER_PID with timeout.
# Returns the process exit code, or 124 on timeout (matching GNU timeout convention).
# Uses wall-clock time so mocked sleep in tests doesn't cause false timeouts.
_wait_for_provider() {
    local deadline=$(( $(date +%s) + PROVIDER_TIMEOUT ))
    while kill -0 "$ACTIVE_PROVIDER_PID" 2>/dev/null; do
        if [ "$(date +%s)" -ge "$deadline" ]; then
            kill_active_provider
            ACTIVE_PROVIDER_PID=""
            return 124
        fi
        sleep 1
    done
    wait "$ACTIVE_PROVIDER_PID" 2>/dev/null
    local rc=$?
    ACTIVE_PROVIDER_PID=""
    return $rc
}

invoke_provider() {
    local provider_name=$1
    local prompt_content=$2
    local model_override="${3:-}"
    local tmp_stderr
    tmp_stderr=$(mktemp)

    # PATH hardening: prepend gh-blocking shim directory so gh resolves to a
    # non-functional wrapper while provider binaries in the same directories
    # remain reachable.
    local gh_block_dir
    gh_block_dir="$(setup_gh_block)"
    local saved_path="$PATH"
    export ALOOP_ORIGINAL_PATH="$PATH"
    PATH="$gh_block_dir:$PATH"
    export PATH
    local invoke_rc=0
    local copilot_output_file=""
    local exit_code=0

    # Provenance: export for prepare-commit-msg hook
    export ALOOP_AGENT="${iter_mode:-unknown}"
    export ALOOP_ITERATION="${ITERATION:-0}"
    export ALOOP_SESSION="${SESSION_ID:-unknown}"

    case "$provider_name" in
        claude)
            local claude_model="${model_override:-$CLAUDE_MODEL}"
            LAST_PROVIDER_MODEL="$claude_model"
            {
                echo "$prompt_content" | env -u CLAUDECODE "${DC_EXEC[@]}" claude --model "$claude_model" --dangerously-skip-permissions --print 2> >(tee "$tmp_stderr" -a "$LOG_FILE.raw" >&2) | tee -a "$LOG_FILE.raw"
                exit ${PIPESTATUS[1]}
            } &
            ACTIVE_PROVIDER_PID=$!
            _wait_for_provider
            exit_code=$?
            if [ "$exit_code" -eq 124 ]; then
                LAST_PROVIDER_ERROR="claude timed out after $PROVIDER_TIMEOUT seconds"
                echo "claude timed out after $PROVIDER_TIMEOUT seconds" >&2
                invoke_rc=1
            elif [ "$exit_code" -ne 0 ]; then
                LAST_PROVIDER_ERROR="claude exited with code $exit_code. Stderr: $(cat "$tmp_stderr")"
                echo "claude exited with code $exit_code" >&2
                invoke_rc=$exit_code
            else
                LAST_PROVIDER_ERROR=""
            fi
            ;;
        codex)
            local codex_model="${model_override:-$CODEX_MODEL}"
            LAST_PROVIDER_MODEL="$codex_model"
            {
                echo "$prompt_content" | env -u CLAUDECODE "${DC_EXEC[@]}" codex exec -m "$codex_model" --dangerously-bypass-approvals-and-sandbox - 2> >(tee "$tmp_stderr" -a "$LOG_FILE.raw" >&2) | tee -a "$LOG_FILE.raw"
                exit ${PIPESTATUS[1]}
            } &
            ACTIVE_PROVIDER_PID=$!
            _wait_for_provider
            exit_code=$?
            if [ "$exit_code" -eq 124 ]; then
                LAST_PROVIDER_ERROR="codex timed out after $PROVIDER_TIMEOUT seconds"
                echo "codex timed out after $PROVIDER_TIMEOUT seconds" >&2
                invoke_rc=1
            elif [ "$exit_code" -ne 0 ]; then
                LAST_PROVIDER_ERROR="codex exited with code $exit_code. Stderr: $(cat "$tmp_stderr")"
                echo "codex exited with code $exit_code" >&2
                invoke_rc=$exit_code
            else
                LAST_PROVIDER_ERROR=""
            fi
            ;;
        opencode)
            LAST_PROVIDER_MODEL="${model_override:-opencode-default}"
            local opencode_args=()
            if [ -n "${model_override:-}" ]; then
                opencode_args+=(-m "$model_override")
            fi
            {
                echo "$prompt_content" | env -u CLAUDECODE "${DC_EXEC[@]}" opencode run "${opencode_args[@]}" 2> >(tee "$tmp_stderr" -a "$LOG_FILE.raw" >&2) | tee -a "$LOG_FILE.raw"
                exit ${PIPESTATUS[1]}
            } &
            ACTIVE_PROVIDER_PID=$!
            _wait_for_provider
            exit_code=$?
            if [ "$exit_code" -eq 124 ]; then
                LAST_PROVIDER_ERROR="opencode timed out after $PROVIDER_TIMEOUT seconds"
                echo "opencode timed out after $PROVIDER_TIMEOUT seconds" >&2
                invoke_rc=1
            elif [ "$exit_code" -ne 0 ]; then
                LAST_PROVIDER_ERROR="opencode exited with code $exit_code. Stderr: $(cat "$tmp_stderr")"
                echo "opencode exited with code $exit_code" >&2
                invoke_rc=$exit_code
            else
                LAST_PROVIDER_ERROR=""
            fi
            ;;
        gemini)
            local gemini_model="${model_override:-$GEMINI_MODEL}"
            LAST_PROVIDER_MODEL="$gemini_model"
            {
                env -u CLAUDECODE "${DC_EXEC[@]}" gemini -m "$gemini_model" --yolo -p "$prompt_content" 2> >(tee "$tmp_stderr" -a "$LOG_FILE.raw" >&2) | tee -a "$LOG_FILE.raw"
                exit ${PIPESTATUS[0]}
            } &
            ACTIVE_PROVIDER_PID=$!
            _wait_for_provider
            exit_code=$?
            if [ "$exit_code" -eq 124 ]; then
                LAST_PROVIDER_ERROR="gemini timed out after $PROVIDER_TIMEOUT seconds"
                echo "gemini timed out after $PROVIDER_TIMEOUT seconds" >&2
                invoke_rc=1
            elif [ "$exit_code" -ne 0 ]; then
                echo "Gemini -m $GEMINI_MODEL failed. Retrying without explicit model." >&2
                {
                    env -u CLAUDECODE "${DC_EXEC[@]}" gemini --yolo -p "$prompt_content" 2> >(tee "$tmp_stderr" -a "$LOG_FILE.raw" >&2) | tee -a "$LOG_FILE.raw"
                    exit ${PIPESTATUS[0]}
                } &
                ACTIVE_PROVIDER_PID=$!
                _wait_for_provider
                exit_code=$?
                if [ "$exit_code" -eq 124 ]; then
                    LAST_PROVIDER_ERROR="gemini timed out after $PROVIDER_TIMEOUT seconds"
                    invoke_rc=1
                elif [ "$exit_code" -ne 0 ]; then
                    LAST_PROVIDER_ERROR="gemini failed. Stderr: $(cat "$tmp_stderr")"
                    echo "gemini failed" >&2
                    invoke_rc=1
                else
                    LAST_PROVIDER_ERROR=""
                fi
            else
                LAST_PROVIDER_ERROR=""
            fi
            ;;
        copilot)
            local copilot_model="${model_override:-$COPILOT_MODEL}"
            LAST_PROVIDER_MODEL="$copilot_model"
            copilot_output_file=$(mktemp)
            {
                env -u CLAUDECODE "${DC_EXEC[@]}" copilot --model "$copilot_model" --yolo -p "$prompt_content" 2> >(tee "$tmp_stderr" -a "$LOG_FILE.raw" >&2) | tee -a "$LOG_FILE.raw" "$copilot_output_file"
                exit ${PIPESTATUS[0]}
            } &
            ACTIVE_PROVIDER_PID=$!
            _wait_for_provider
            exit_code=$?
            if [ "$exit_code" -eq 124 ]; then
                LAST_PROVIDER_ERROR="copilot timed out after $PROVIDER_TIMEOUT seconds"
                echo "copilot timed out after $PROVIDER_TIMEOUT seconds" >&2
                invoke_rc=1
            elif [ "$exit_code" -ne 0 ]; then
                echo "Copilot --model $copilot_model failed. Retrying with $COPILOT_RETRY_MODEL." >&2
                {
                    env -u CLAUDECODE "${DC_EXEC[@]}" copilot --model "$COPILOT_RETRY_MODEL" --yolo -p "$prompt_content" 2> >(tee "$tmp_stderr" -a "$LOG_FILE.raw" >&2) | tee -a "$LOG_FILE.raw" "$copilot_output_file"
                    exit ${PIPESTATUS[0]}
                } &
                ACTIVE_PROVIDER_PID=$!
                _wait_for_provider
                exit_code=$?
                if [ "$exit_code" -eq 124 ]; then
                    LAST_PROVIDER_ERROR="copilot timed out after $PROVIDER_TIMEOUT seconds"
                    invoke_rc=1
                elif [ "$exit_code" -ne 0 ]; then
                    echo "Copilot retry failed. Trying without explicit model." >&2
                    {
                        env -u CLAUDECODE "${DC_EXEC[@]}" copilot --yolo -p "$prompt_content" 2> >(tee "$tmp_stderr" -a "$LOG_FILE.raw" >&2) | tee -a "$LOG_FILE.raw" "$copilot_output_file"
                        exit ${PIPESTATUS[0]}
                    } &
                    ACTIVE_PROVIDER_PID=$!
                    _wait_for_provider
                    exit_code=$?
                    if [ "$exit_code" -eq 124 ]; then
                        LAST_PROVIDER_ERROR="copilot timed out after $PROVIDER_TIMEOUT seconds"
                        invoke_rc=1
                    elif [ "$exit_code" -ne 0 ]; then
                        LAST_PROVIDER_ERROR="copilot failed. Stderr: $(cat "$tmp_stderr")"
                        echo "copilot failed" >&2
                        invoke_rc=1
                    fi
                fi
            fi
            if [ "$invoke_rc" -eq 0 ]; then
                local copilot_output_text
                copilot_output_text=$(cat "$copilot_output_file")
                if ! assert_copilot_auth "$copilot_output_text"; then
                    LAST_PROVIDER_ERROR="copilot not authenticated. Stderr: $(cat "$tmp_stderr")"
                    invoke_rc=1
                else
                    LAST_PROVIDER_ERROR=""
                fi
            fi
            ;;
        *)
            LAST_PROVIDER_ERROR="unsupported provider: $provider_name"
            echo "Unsupported provider: $provider_name" >&2
            invoke_rc=1
            ;;
    esac

    PATH="$saved_path"
    export PATH
    unset ALOOP_ORIGINAL_PATH
    if [ -n "$copilot_output_file" ]; then
        rm -f "$copilot_output_file"
    fi
    rm -f "$tmp_stderr"
    return "$invoke_rc"
}

# ============================================================================
# PLAN FILE HELPERS
# ============================================================================

check_all_tasks_complete() {
    if [ ! -f "$PLAN_FILE" ]; then return 1; fi
    # grep -c exits 1 (no matches) outputting "0"; split declaration from assignment
    # so || fallback doesn't capture the grep stdout twice
    local incomplete
    incomplete=$(grep -c '^\s*- \[ \]' "$PLAN_FILE" 2>/dev/null) || incomplete=0
    if [ "$incomplete" -eq 0 ]; then
        local completed
        completed=$(grep -c '^\s*- \[x\]' "$PLAN_FILE" 2>/dev/null) || completed=0
        if [ "$completed" -gt 0 ]; then return 0; fi
    fi
    return 1
}

get_current_task() {
    if [ ! -f "$PLAN_FILE" ]; then echo ""; return; fi
    grep '^\s*- \[ \]' "$PLAN_FILE" 2>/dev/null | head -1 | sed 's/.*- \[ \] //' || echo ""
}


# ============================================================================
# STUCK DETECTION
# ============================================================================

LAST_TASK=""
STUCK_COUNT=0
RR_NEXT_INDEX=0
ALL_TASKS_MARKED_DONE=false
RESOLVED_MODE=""
ITERATION_COMMITS=""
ITERATION_COMMIT_COUNT="0"
CYCLE_POSITION=0
RESOLVED_PROMPT_NAME=""
CYCLE_LENGTH=0
PHASE_RETRY_PHASE=""
PHASE_RETRY_CONSECUTIVE=0
PHASE_RETRY_FAILURE_REASONS=()
MAX_PHASE_RETRIES=2
LAST_PROVIDER_ERROR=""
LAST_PROVIDER_MODEL=""
LAST_ITER_MODE="$MODE"
LAST_PROOF_ITERATION=0
FRONTMATTER_PROVIDER=""
FRONTMATTER_MODEL=""
FRONTMATTER_AGENT=""
FRONTMATTER_REASONING=""
FRONTMATTER_COLOR=""
FRONTMATTER_TRIGGER=""

color_name_to_ansi() {
    local name="${1:-}"
    case "$(echo "$name" | tr '[:upper:]' '[:lower:]')" in
        red)          echo "\033[31m" ;;
        green)        echo "\033[32m" ;;
        yellow)       echo "\033[33m" ;;
        blue)         echo "\033[34m" ;;
        magenta)      echo "\033[35m" ;;
        cyan)         echo "\033[36m" ;;
        brightcyan)   echo "\033[96m" ;;
        white)        echo "\033[37m" ;;
        *)            echo "\033[37m" ;;  # default white
    esac
}

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
    echo "- $task (stuck after $MAX_STUCK attempts)" >> "$PLAN_FILE"

    local escaped_task
    escaped_task=$(printf '%s\n' "$task" | sed 's/[[\.*^$()+?{|/]/\\&/g')
    sed_i "s/- \[ \] ${escaped_task}/- [S] $task/" "$PLAN_FILE"

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

    # Collect ALL commits made during this iteration (agent may commit multiple times)
    local commits=""
    local commit_count=0
    commits=$(git log --after="$((iteration_start - 1))" --format="%h %s" 2>/dev/null || echo "")
    if [ -n "$commits" ]; then
        commit_count=$(echo "$commits" | wc -l | tr -d ' ')
    fi

    local completed
    local total_tasks
    completed=$(grep -c '^\s*- \[x\]' "$PLAN_FILE" 2>/dev/null) || completed=0
    total_tasks=$(grep -c '^\s*- \[' "$PLAN_FILE" 2>/dev/null) || total_tasks=0
    local pct=0
    if [ "$total_tasks" -gt 0 ]; then
        pct=$((completed * 100 / total_tasks))
    fi

    echo ""
    echo "=== Iteration $ITERATION Complete (${mins}m ${secs}s) ==="
    if [ -n "$commits" ]; then
        if [ "$commit_count" -eq 1 ]; then
            echo "Commit: $commits"
        else
            echo "Commits ($commit_count):"
            echo "$commits" | while IFS= read -r c; do echo "  $c"; done
        fi
    else
        echo "Warning: No commits this iteration"
    fi
    echo "Progress: $completed/$total_tasks tasks ($pct%)"
    echo "============================================"

    # Export for log entry (pipe-separated for structured logging)
    ITERATION_COMMITS=$(echo "$commits" | head -10 | tr '\n' '|' | sed 's/|$//')
    ITERATION_COMMIT_COUNT="$commit_count"
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

    local completed
    local skipped
    local remaining
    completed=$(grep -c '^\s*- \[x\]' "$PLAN_FILE" 2>/dev/null) || completed=0
    skipped=$(grep -c '^\s*- \[S\]' "$PLAN_FILE" 2>/dev/null) || skipped=0
    remaining=$(grep -c '^\s*- \[ \]' "$PLAN_FILE" 2>/dev/null) || remaining=0
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

$(grep '^\s*- \[x\]' "$PLAN_FILE" 2>/dev/null || echo "None")

## Recent Commits

\`\`\`
$(git log --oneline -20 2>/dev/null || echo "No git history")
\`\`\`
EOF

    if [ "$skipped" -gt 0 ]; then
        echo "" >> "$REPORT_FILE"
        echo "## Skipped Tasks (stuck)" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        grep '^\s*- \[S\]' "$PLAN_FILE" 2>/dev/null >> "$REPORT_FILE"
    fi

    if [ "$remaining" -gt 0 ]; then
        echo "" >> "$REPORT_FILE"
        echo "## Remaining Tasks" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        grep '^\s*- \[ \]' "$PLAN_FILE" 2>/dev/null >> "$REPORT_FILE"
    fi

    echo ""
    echo "Report saved to $REPORT_FILE"
}

# ============================================================================
# PROVENANCE COMMIT TRAILERS
# ============================================================================

# Install a prepare-commit-msg hook that appends Aloop provenance trailers
# (Aloop-Agent, Aloop-Iteration, Aloop-Session) to every commit made in the
# worktree.  The hook reads environment variables set by invoke_provider().
setup_provenance_hook() {
    local hooks_dir="$WORK_DIR/.git/hooks"
    if [ ! -d "$WORK_DIR/.git" ]; then
        return
    fi
    mkdir -p "$hooks_dir"
    cat > "$hooks_dir/prepare-commit-msg" << 'PROVENANCE_HOOK'
#!/bin/sh
# Aloop provenance trailer hook — appends agent/iteration/session trailers.
COMMIT_MSG_FILE="$1"
if [ -z "$ALOOP_AGENT" ] || [ -z "$ALOOP_ITERATION" ] || [ -z "$ALOOP_SESSION" ]; then
    exit 0
fi
if grep -q "^Aloop-Session:" "$COMMIT_MSG_FILE" 2>/dev/null; then
    exit 0
fi
{
    echo ""
    echo "Aloop-Agent: $ALOOP_AGENT"
    echo "Aloop-Iteration: $ALOOP_ITERATION"
    echo "Aloop-Session: $ALOOP_SESSION"
} >> "$COMMIT_MSG_FILE"
PROVENANCE_HOOK
    chmod +x "$hooks_dir/prepare-commit-msg"
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
        local trailer_session="${SESSION_ID:-$(basename "$SESSION_DIR")}"
        git commit -m "Initial commit" \
            -m "Aloop-Agent: harness" \
            -m "Aloop-Iteration: 0" \
            -m "Aloop-Session: $trailer_session" 2>/dev/null || true
    fi

    if remote_url=$(git remote get-url origin 2>/dev/null); then
        echo "Remote backup: $(normalize_remote_backup_url "$remote_url")"
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
        local created_remote_url
        created_remote_url=$(git remote get-url origin 2>/dev/null || true)
        if [ -n "$created_remote_url" ]; then
            echo "Remote backup: $(normalize_remote_backup_url "$created_remote_url")"
        else
            local created_repo_web_url
            created_repo_web_url=$(gh repo view "$repo_name" --json url -q .url 2>/dev/null || true)
            if [ -n "$created_repo_web_url" ]; then
                echo "Remote backup: $created_repo_web_url"
            else
                echo "Remote backup: $repo_name"
            fi
        fi
        return 0
    else
        echo "Warning: Could not create backup repo. Remote backup disabled."
        BACKUP_ENABLED="false"
        return 1
    fi
}

normalize_remote_backup_url() {
    local remote_url="$1"
    remote_url="${remote_url//$'\r'/}"
    remote_url="${remote_url//$'\n'/}"

    if [[ "$remote_url" =~ ^git@([^:]+):(.+)$ ]]; then
        local host="${BASH_REMATCH[1]}"
        local path="${BASH_REMATCH[2]}"
        path="${path%.git}"
        echo "https://$host/$path"
        return
    fi

    if [[ "$remote_url" =~ ^ssh://git@([^/]+)/(.+)$ ]]; then
        local host="${BASH_REMATCH[1]}"
        local path="${BASH_REMATCH[2]}"
        path="${path%.git}"
        echo "https://$host/$path"
        return
    fi

    if [[ "$remote_url" =~ ^https?:// ]]; then
        echo "${remote_url%.git}"
        return
    fi

    echo "$remote_url"
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
    plan-build-review) required_prompts="plan build qa review" ;;
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
        available=()
        for p in "${RR_PROVIDERS[@]}"; do
            if command -v "$p" &>/dev/null; then
                available+=("$p")
            else
                echo "Warning: round-robin: '$p' not found on PATH — skipping."
            fi
        done
        if [ ${#available[@]} -eq 0 ]; then
            echo "Error: round-robin: no providers are installed. Install at least one of: $(IFS=,; echo "${RR_PROVIDERS[*]}")"
            exit 1
        fi
        if [ ${#available[@]} -lt ${#RR_PROVIDERS[@]} ]; then
            echo -e "\033[33mround-robin will use: $(IFS=,; echo "${available[*]}")\033[0m"
        fi
        RR_PROVIDERS=("${available[@]}")
    else
        assert_provider_installed "$PROVIDER"
    fi
fi

if [ "$PROVIDER" = "round-robin" ]; then
    provider_count=${#RR_PROVIDERS[@]}
    if [ "$provider_count" -lt 1 ]; then
        provider_count=1
    fi
    calculated_retries=$((provider_count * 2))
    if [ "$calculated_retries" -lt 2 ]; then
        MAX_PHASE_RETRIES=2
    else
        MAX_PHASE_RETRIES="$calculated_retries"
    fi
else
    MAX_PHASE_RETRIES=2
fi

# Setup remote backup
SESSION_ID=$(basename "$SESSION_DIR")
setup_remote_backup || true
start_dashboard
setup_provenance_hook

# Initialize session
write_log_entry "session_start" "mode" "$MODE" "provider" "$PROVIDER" "work_dir" "$WORK_DIR" "launch_mode" "$LAUNCH_MODE" "runtime_commit" "$RUNTIME_COMMIT" "runtime_installed_at" "$RUNTIME_INSTALLED_AT" "devcontainer" "$DEVCONTAINER_ACTIVE"

# Log container bypass if devcontainer exists but was skipped
if [ "$DANGEROUSLY_SKIP_CONTAINER" = "true" ] && [ -f "$DEVCONTAINER_JSON_PATH" ]; then
    write_log_entry "container_bypass" "reason" "dangerously_skip_container_flag"
fi

# ============================================================================
# LAUNCH MODE — start / restart / resume
# ============================================================================

if [ "$LAUNCH_MODE" = "resume" ]; then
    if [ -f "$STATUS_FILE" ]; then
        resume_iteration=$(sed -nE 's/.*"iteration"[[:space:]]*:[[:space:]]*([0-9]+).*/\1/p' "$STATUS_FILE" | head -1)
        resume_phase=$(sed -nE 's/.*"phase"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' "$STATUS_FILE" | head -1)
        if [ -n "$resume_iteration" ] && [ "$resume_iteration" -gt 0 ] 2>/dev/null; then
            # Resume from the same iteration (re-try it since it may not have completed)
            ITERATION=$((resume_iteration - 1))
            # Calculate cycle position from phase
            if [ "$MODE" = "plan-build-review" ]; then
                case "$resume_phase" in
                    plan)   CYCLE_POSITION=0 ;;
                    build)  CYCLE_POSITION=1 ;;
                    qa)     CYCLE_POSITION=6 ;;
                    review) CYCLE_POSITION=7 ;;
                    *)      CYCLE_POSITION=0 ;;
                esac
            elif [ "$MODE" = "plan-build" ]; then
                case "$resume_phase" in
                    plan)  CYCLE_POSITION=0 ;;
                    build) CYCLE_POSITION=1 ;;
                    *)     CYCLE_POSITION=0 ;;
                esac
            fi
            echo "Resuming from iteration $resume_iteration (phase: $resume_phase)"
            write_log_entry "session_resume" "resume_iteration" "$resume_iteration" "resume_phase" "$resume_phase" "resume_cycle_position" "$CYCLE_POSITION"
        else
            echo "Warning: Could not parse status.json for resume — starting from beginning."
        fi
    else
        echo "Warning: No status.json found for resume — starting from beginning."
    fi
elif [ "$LAUNCH_MODE" = "restart" ]; then
    echo "Restarting session (keeping existing work, starting from iteration 1)"
    write_log_entry "session_restart"
fi

# Prime cycle position from loop-plan.json if present.
resolve_cycle_prompt_from_plan >/dev/null 2>&1 || true

echo ""
echo "Starting loop..."
echo "---"
echo ""

# Wait for pending requests before next iteration
wait_for_requests() {
    if [ "${ALOOP_SKIP_WAIT:-}" = "true" ]; then return 0; fi
    local requests_dir="$SESSION_DIR/requests"
    if [ -d "$requests_dir" ] && ls "$requests_dir"/*.json 2>/dev/null | grep -q .; then
        local count
        count=$(ls "$requests_dir"/*.json | wc -l)
        write_log_entry "waiting_for_requests" "count" "$count"
        echo "Waiting for $count pending requests to be processed..."
        local wait_start
        wait_start=$(date +%s)
        local timeout=${REQUEST_TIMEOUT:-300}
        while ls "$requests_dir"/*.json 2>/dev/null | grep -q .; do
            sleep 2
            local elapsed
            elapsed=$(( $(date +%s) - wait_start ))
            if [ "$elapsed" -gt "$timeout" ]; then
                write_log_entry "request_timeout" "elapsed" "$elapsed"
                echo "Warning: Timeout waiting for requests to be processed ($elapsed s)"
                break
            fi
        done
        echo "Requests processed."
    fi
}

run_queue_if_present() {
    local iter_provider="$1"
    # Check queue/ folder for override prompts (takes priority over cycle)
    local QUEUE_DIR="$SESSION_DIR/queue"
    local QUEUE_ITEM=""
    if [ -d "$QUEUE_DIR" ]; then
        QUEUE_ITEM=$(find "$QUEUE_DIR" -maxdepth 1 -name '*.md' -type f 2>/dev/null | sort | head -n1)
    fi

    if [ -n "$QUEUE_ITEM" ] && [ -f "$QUEUE_ITEM" ]; then
        local QUEUE_BASENAME
        QUEUE_BASENAME=$(basename "$QUEUE_ITEM")
        echo ""
        echo -e "\033[34m--- Queue Override: $QUEUE_BASENAME [$(date '+%Y-%m-%d %H:%M:%S')] [$iter_provider] ---\033[0m"

        parse_frontmatter "$QUEUE_ITEM"
        local queue_iter_mode="${FRONTMATTER_AGENT:-queue}"
        local queue_iter_provider="$iter_provider"
        if [ -n "$FRONTMATTER_PROVIDER" ]; then
            if command -v "$FRONTMATTER_PROVIDER" >/dev/null 2>&1; then
                queue_iter_provider="$FRONTMATTER_PROVIDER"
            else
                write_log_entry "queue_frontmatter_provider_unavailable" \
                    "requested_provider" "$FRONTMATTER_PROVIDER" \
                    "fallback_provider" "$iter_provider" \
                    "queue_file" "$QUEUE_BASENAME"
            fi
        fi

        write_status "$ITERATION" "$queue_iter_mode" "$queue_iter_provider" 0
        write_log_entry "queue_override_start" "iteration" "$ITERATION" "queue_file" "$QUEUE_BASENAME" "agent" "$queue_iter_mode" "provider" "$queue_iter_provider"

        local queue_prompt_content
        queue_prompt_content=$(cat "$QUEUE_ITEM")
        cd "$WORK_DIR"
        if invoke_provider "$queue_iter_provider" "$queue_prompt_content" "$FRONTMATTER_MODEL"; then
            update_provider_health_on_success "$queue_iter_provider"
            if [ "$queue_iter_mode" = "plan" ]; then
                LAST_PLAN_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "")
            fi
            rm -f "$QUEUE_ITEM"
            write_log_entry "queue_override_complete" "iteration" "$ITERATION" "queue_file" "$QUEUE_BASENAME" "provider" "$queue_iter_provider"
            echo ""
            echo "[Queue override complete: $QUEUE_BASENAME]"
        else
            update_provider_health_on_failure "$queue_iter_provider" "${LAST_PROVIDER_ERROR:-provider_failed}"
            rm -f "$QUEUE_ITEM"
            write_log_entry "queue_override_error" "iteration" "$ITERATION" "queue_file" "$QUEUE_BASENAME" "provider" "$queue_iter_provider" "error" "${LAST_PROVIDER_ERROR:-provider_failed}"
            echo "Warning: Queue override iteration failed for $QUEUE_BASENAME"
        fi

        wait_for_requests
        sleep 3
        return 0
    fi
    return 1
}

# Cleanup on exit
cleanup() {
    local reason="${1:-interrupted}"
    local state="${2:-$reason}"
    kill_active_provider
    remove_session_lock
    stop_dashboard
    cleanup_gh_block
    echo ""
    write_status "$ITERATION" "$LAST_ITER_MODE" "$(resolve_iteration_provider $ITERATION)" 0 "$state"
    write_log_entry "$reason" "iteration" "$ITERATION"
    generate_report "$reason"
}

trap 'cleanup "interrupted" "stopped"; exit 130' INT
# NOTE: No ERR trap — the main loop must survive transient errors.
# Provider failures and helper errors are handled via explicit if/|| guards.
trap 'kill_active_provider; remove_session_lock' EXIT

ITERATION=0
while [ "$ITERATION" -lt "$MAX_ITERATIONS" ]; do
    ITERATION=$((ITERATION + 1))
    ITERATION_START=$(date +%s)
    ITERATION_START_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    # Hot-reload provider list from meta.json (supports runtime changes)
    if [ "$PROVIDER" = "round-robin" ]; then
        refresh_providers_from_meta
    fi
    iter_provider=$(resolve_iteration_provider $ITERATION)

    if run_queue_if_present "$iter_provider"; then
        continue
    fi

    # Call directly (not via subshell) so flag-clearing affects the main shell
    resolve_iteration_mode "$ITERATION" > /dev/null
    iter_mode="$RESOLVED_MODE"
    LAST_ITER_MODE="$iter_mode"

    if [ -n "$RESOLVED_PROMPT_NAME" ]; then
        iter_prompt_file="$PROMPTS_DIR/$RESOLVED_PROMPT_NAME"
    else
        iter_prompt_file="$PROMPTS_DIR/PROMPT_$iter_mode.md"
    fi

    if [ ! -f "$iter_prompt_file" ]; then
        echo "Error: Prompt file not found: $iter_prompt_file" >&2
        write_log_entry "iteration_error" "iteration" "$ITERATION" "mode" "$iter_mode" "provider" "$iter_provider" "model" "$LAST_PROVIDER_MODEL" "error" "prompt_missing"
        break
    fi

    parse_frontmatter "$iter_prompt_file"
    if [ -n "$FRONTMATTER_AGENT" ]; then
        iter_mode="$FRONTMATTER_AGENT"
        LAST_ITER_MODE="$iter_mode"
    fi
    if [ -n "$FRONTMATTER_PROVIDER" ]; then
        if command -v "$FRONTMATTER_PROVIDER" >/dev/null 2>&1; then
            iter_provider="$FRONTMATTER_PROVIDER"
        else
            write_log_entry "frontmatter_provider_unavailable" \
                "requested_provider" "$FRONTMATTER_PROVIDER" \
                "fallback_provider" "$iter_provider" \
                "prompt_file" "$iter_prompt_file"
        fi
    fi
    write_log_entry "frontmatter_applied" \
        "prompt_file" "$iter_prompt_file" \
        "agent" "${FRONTMATTER_AGENT:-}" \
        "provider" "${FRONTMATTER_PROVIDER:-}" \
        "model" "${FRONTMATTER_MODEL:-}" \
        "reasoning" "${FRONTMATTER_REASONING:-}" \
        "color" "${FRONTMATTER_COLOR:-}" \
        "trigger" "${FRONTMATTER_TRIGGER:-}"

    # Update session status
    write_status "$ITERATION" "$iter_mode" "$iter_provider" 0
    persist_loop_plan_state

    # Color output from frontmatter (data-driven), defaulting to white
    if [ -n "$FRONTMATTER_COLOR" ]; then
        color=$(color_name_to_ansi "$FRONTMATTER_COLOR")
    else
        color="\033[37m"  # default white
    fi
    echo -e "${color}--- Iteration $ITERATION / $MAX_ITERATIONS [$(date '+%Y-%m-%d %H:%M:%S')] [$iter_provider] [$iter_mode] ---\033[0m"

    # Build mode: stuck detection and task display
    if [ "$iter_mode" = "build" ]; then
        if check_all_tasks_complete; then
            write_log_entry "tasks_marked_complete" "iteration" "$ITERATION"
        fi

        current_task=$(get_current_task)
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

    prompt_content="$(substitute_prompt_placeholders "$prompt_content")"

    cd "$WORK_DIR"
    # Record LOG_FILE.raw offset so we can extract per-iteration output after
    _raw_offset_before=$(wc -c < "$LOG_FILE.raw" 2>/dev/null || echo 0)
    if invoke_provider "$iter_provider" "$prompt_content" "$FRONTMATTER_MODEL"; then
        _iter_duration="$(( $(date +%s) - ITERATION_START ))s"
        update_provider_health_on_success "$iter_provider"
        register_iteration_success "$iter_mode" false
        if [ "$iter_mode" = "plan" ]; then
            LAST_PLAN_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "")
        fi
        persist_loop_plan_state
        STUCK_COUNT=0
        LAST_TASK=""

        # If build completed all tasks, inject review into queue instead of exiting
        if [ "$iter_mode" = "build" ] && [ "$ALL_TASKS_MARKED_DONE" = "true" ]; then
            local queue_dir="$SESSION_DIR/queue"
            local review_prompt="$PROMPTS_DIR/PROMPT_review.md"
            if [ -f "$review_prompt" ] && [ -d "$queue_dir" ] || mkdir -p "$queue_dir"; then
                cp "$review_prompt" "$queue_dir/001-force-review.md"
                write_log_entry "queue_inject" "iteration" "$ITERATION" "reason" "all_tasks_done" "prompt" "PROMPT_review.md"
                echo "[All tasks marked done — review queued for next iteration]"
            fi
        fi

        # Capture all commits made during this iteration (any agent may commit)
        ITERATION_COMMITS=""
        ITERATION_COMMIT_COUNT="0"
        print_iteration_summary "$ITERATION_START"

        write_log_entry "iteration_complete" "iteration" "$ITERATION" "mode" "$iter_mode" "provider" "$iter_provider" "model" "$LAST_PROVIDER_MODEL" "duration" "$_iter_duration" "commits" "$ITERATION_COMMIT_COUNT" "commit_log" "$ITERATION_COMMITS"

        echo ""
        echo "[Iteration $ITERATION complete - $iter_mode]"
    else
        _iter_duration="$(( $(date +%s) - ITERATION_START ))s"
        update_provider_health_on_failure "$iter_provider" "${LAST_PROVIDER_ERROR:-provider_failed}"
        register_iteration_failure "$iter_mode" "${LAST_PROVIDER_ERROR:-provider_failed}"
        persist_loop_plan_state
        echo "Warning: Iteration $ITERATION failed"
        write_log_entry "iteration_error" "iteration" "$ITERATION" "mode" "$iter_mode" "provider" "$iter_provider" "model" "$LAST_PROVIDER_MODEL" "duration" "$_iter_duration" "error" "${LAST_PROVIDER_ERROR:-unknown}"
    fi

    # Extract per-iteration output from LOG_FILE.raw for dashboard parsing
    mkdir -p "$SESSION_DIR/artifacts/iter-$ITERATION"
    _raw_offset_after=$(wc -c < "$LOG_FILE.raw" 2>/dev/null || echo 0)
    if [ "$_raw_offset_after" -gt "$_raw_offset_before" ]; then
        tail -c +"$((_raw_offset_before + 1))" "$LOG_FILE.raw" | head -c "$((_raw_offset_after - _raw_offset_before))" > "$SESSION_DIR/artifacts/iter-$ITERATION/output.txt" 2>/dev/null
    fi

    wait_for_requests
    sleep 3
done

echo ""
echo "Reached iteration limit ($MAX_ITERATIONS)"
write_status "$ITERATION" "$LAST_ITER_MODE" "$(resolve_iteration_provider $ITERATION)" 0 "stopped"
write_log_entry "limit_reached" "iteration" "$ITERATION" "limit" "$MAX_ITERATIONS"
generate_report "Reached iteration limit ($MAX_ITERATIONS)."
stop_dashboard

echo ""
echo "=== Aloop Loop Complete ($ITERATION iterations) ==="
