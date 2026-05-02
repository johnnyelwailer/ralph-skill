#!/bin/bash
# poll-job.sh: Poll a sandbox job for completion and retrieve output
# Usage: ./poll-job.sh <resource-group> <job-name> <execution-id> [--max-wait-seconds]
# Output: JSON with jobStatus, result, logs

set -e

RESOURCE_GROUP="${1:?Missing RESOURCE_GROUP}"
JOB_NAME="${2:?Missing JOB_NAME}"
EXECUTION_ID="${3:?Missing EXECUTION_ID}"
MAX_WAIT_SECONDS="${4:--1}"  # -1 = no limit
POLL_INTERVAL=5

# Normalize max wait
if [ "$MAX_WAIT_SECONDS" -lt 0 ]; then
  MAX_WAIT_SECONDS=300  # Default: 5 minutes
fi

ELAPSED=0
START_TIME=$(date +%s)

log_info() {
  echo "[$(date +'%Y-%m-%dT%H:%M:%SZ')] $*" >&2
}

get_job_status() {
  az containerapp job execution list \
    --resource-group "$RESOURCE_GROUP" \
    --job-name "$JOB_NAME" \
    --query "[?name=='$EXECUTION_ID'] | [0]" || echo "null"
}

get_job_logs() {
  local CONTAINER_NAME="${1:-sandbox-agent}"
  
  az containerapp job execution show \
    --resource-group "$RESOURCE_GROUP" \
    --job-name "$JOB_NAME" \
    --execution-name "$EXECUTION_ID" 2>/dev/null | jq '.properties' || echo "null"
}

poll_until_complete() {
  log_info "Polling job: $EXECUTION_ID in $RESOURCE_GROUP/$JOB_NAME"
  
  while [ $ELAPSED -lt $MAX_WAIT_SECONDS ]; do
    STATUS=$(get_job_status)
    
    if [ "$STATUS" == "null" ] || [ -z "$STATUS" ]; then
      log_info "Job not found (may still be initializing)... waiting"
      sleep $POLL_INTERVAL
      ELAPSED=$((ELAPSED + POLL_INTERVAL))
      continue
    fi
    
    JOB_STATE=$(echo "$STATUS" | jq -r '.properties.state // "unknown"' 2>/dev/null || echo "unknown")
    JOB_PROVISIONING_STATE=$(echo "$STATUS" | jq -r '.properties.provisioningState // "unknown"' 2>/dev/null || echo "unknown")
    
    log_info "Job state: $JOB_STATE, provisioning: $JOB_PROVISIONING_STATE"
    
    # Container Apps states: Running, Succeeded, Failed, Terminated
    case "$JOB_STATE" in
      Succeeded)
        log_info "Job completed successfully"
        return 0
        ;;
      Failed|Terminated)
        log_info "Job failed or was terminated"
        return 1
        ;;
      *)
        log_info "Still running... ($ELAPSED/$MAX_WAIT_SECONDS sec)"
        sleep $POLL_INTERVAL
        ELAPSED=$((ELAPSED + POLL_INTERVAL))
        ;;
    esac
  done
  
  log_info "Timeout: Job did not complete within $MAX_WAIT_SECONDS seconds"
  return 2
}

# Main polling loop
poll_until_complete
POLL_EXIT_CODE=$?

# Retrieve job details and logs
JOB_DETAILS=$(get_job_logs)

# Parse logs from Application Insights / Log Analytics
# For spike, logs are in Container App system logs; retrieve via Azure Monitor
LOG_QUERY="ContainerAppConsoleLogs_CL | where EnvironmentName_s == 'sandbox-prod' and JobName_s == '$JOB_NAME' | limit 100"

# Attempt to fetch logs via Log Analytics (requires workspace permissions)
LOGS=""
if command -v kusto-query > /dev/null 2>&1; then
  LOGS=$(az monitor log-analytics query \
    --workspace "$LOG_ANALYTICS_WORKSPACE_ID" \
    --analytics-query "$LOG_QUERY" 2>/dev/null || echo "[]")
else
  LOGS='[]'  # Fallback: no logs available
fi

# Assemble output
OUTPUT=$(cat <<EOF
{
  "executionId": "$EXECUTION_ID",
  "jobName": "$JOB_NAME",
  "resourceGroup": "$RESOURCE_GROUP",
  "pollExitCode": $POLL_EXIT_CODE,
  "elapsed": $ELAPSED,
  "status": $([ $POLL_EXIT_CODE -eq 0 ] && echo '"completed"' || echo '"failed"'),
  "jobDetails": $JOB_DETAILS,
  "logs": $LOGS,
  "retrievedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
)

echo "$OUTPUT"
exit $POLL_EXIT_CODE
