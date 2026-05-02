#!/bin/bash
# submit-job.sh: Submit a sandbox job to Azure Container Apps
# Usage: ./submit-job.sh <resource-group> <job-name> <payload-json>
# Output: JSON with jobId, status, submittedAt

set -e

RESOURCE_GROUP="${1:?Missing RESOURCE_GROUP}"
JOB_NAME="${2:?Missing JOB_NAME}"
PAYLOAD="${3:?Missing PAYLOAD (JSON)}"

# Validation: payload must be valid JSON
if ! echo "$PAYLOAD" | jq . > /dev/null 2>&1; then
  echo "Error: PAYLOAD is not valid JSON" >&2
  exit 1
fi

# Generate execution context
EXECUTION_ID="sandbox-$(date +%s%N | sha256sum | cut -c1-12)"
SUBMITTED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Optional: log payload for debugging
# echo "[DEBUG] Job: $EXECUTION_ID, Payload: $PAYLOAD" >&2

# Submit the job
# Note: Container Apps Jobs require passing environment variables or input via other means
# For spike, we'll use az containerapp job start and pass data via environment
JOB_RESPONSE=$(az containerapp job start \
  --resource-group "$RESOURCE_GROUP" \
  --name "$JOB_NAME" \
  --environment-variables "WORK_PAYLOAD=$PAYLOAD" "EXECUTION_ID=$EXECUTION_ID" 2>&1)

if [ $? -ne 0 ]; then
  echo "Error: Failed to submit job" >&2
  echo "$JOB_RESPONSE" >&2
  exit 1
fi

# Extract job execution ID from response
JOB_EXECUTION_ID=$(echo "$JOB_RESPONSE" | jq -r '.properties.executionId // .name // "unknown"' 2>/dev/null || echo "unknown")

# Output result
OUTPUT=$(cat <<EOF
{
  "executionId": "$EXECUTION_ID",
  "jobExecutionId": "$JOB_EXECUTION_ID",
  "resourceGroup": "$RESOURCE_GROUP",
  "jobName": "$JOB_NAME",
  "status": "submitted",
  "submittedAt": "$SUBMITTED_AT",
  "payload": $PAYLOAD
}
EOF
)

echo "$OUTPUT"
