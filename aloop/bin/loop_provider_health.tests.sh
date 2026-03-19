#!/bin/bash

RESOLVE_FUNC=$(sed -n '/^resolve_healthy_provider() {/,/^}/p' aloop/bin/loop.sh)
eval "$RESOLVE_FUNC"

declare -A STATUS_BY_PROVIDER
declare -A COOLDOWN_BY_PROVIDER
declare -A REASON_BY_PROVIDER
LOG_FILE="$(mktemp)"

write_log_entry() {
    local event="$1"
    shift
    local line="$event"
    while [ $# -gt 1 ]; do
        line="$line|$1=$2"
        shift 2
    done
    echo "$line" >> "$LOG_FILE"
    return 0
}

get_provider_health_state() {
    local provider="$1"
    local status="${STATUS_BY_PROVIDER[$provider]}"
    if [ -z "$status" ]; then
        return 1
    fi
    HEALTH_STATUS="$status"
    HEALTH_COOLDOWN_UNTIL="${COOLDOWN_BY_PROVIDER[$provider]}"
    HEALTH_FAILURE_REASON="${REASON_BY_PROVIDER[$provider]}"
    return 0
}

timestamp_to_epoch() {
    date -u -d "$1" +%s 2>/dev/null
}

sleep() {
    return 77
}

contains_log() {
    local needle="$1"
    grep -Fq "$needle" "$LOG_FILE"
}

failed=0

RR_PROVIDERS=(claude codex)
STATUS_BY_PROVIDER[claude]="degraded"
REASON_BY_PROVIDER[claude]="auth"
STATUS_BY_PROVIDER[codex]="healthy"
selected_file="$(mktemp)"
resolve_healthy_provider 0 > "$selected_file"
selected="$(cat "$selected_file")"
rm -f "$selected_file"
if [ "$selected" = "codex" ] && contains_log "provider_skipped_degraded|provider=claude|reason=auth"; then
    echo "PASS: degraded provider is skipped with distinct log event"
else
    echo "FAIL: degraded provider skip behavior"
    failed=1
fi

: > "$LOG_FILE"
unset STATUS_BY_PROVIDER COOLDOWN_BY_PROVIDER REASON_BY_PROVIDER
declare -A STATUS_BY_PROVIDER
declare -A COOLDOWN_BY_PROVIDER
declare -A REASON_BY_PROVIDER
RR_PROVIDERS=(claude codex)
STATUS_BY_PROVIDER[claude]="degraded"
REASON_BY_PROVIDER[claude]="auth"
STATUS_BY_PROVIDER[codex]="degraded"
REASON_BY_PROVIDER[codex]="quota"

stderr_file="$(mktemp)"
set +e
( set -e; resolve_healthy_provider 0 >/dev/null ) 2>"$stderr_file"
rc=$?
set -e

if [ "$rc" -eq 77 ] && contains_log "all_providers_degraded" && grep -q "All providers are degraded" "$stderr_file"; then
    echo "PASS: all degraded providers emit actionable signal"
else
    echo "FAIL: all degraded actionable signal"
    failed=1
fi
rm -f "$stderr_file"
rm -f "$LOG_FILE"

if [ $failed -eq 0 ]; then
    echo "All tests passed!"
    exit 0
fi

echo "Some tests failed!"
exit 1
