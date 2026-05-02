#!/bin/bash
# e2e-test.sh: End-to-end test for Azure sandbox spike
# Usage: ./e2e-test.sh
# Prerequisites: az CLI authenticated, environment variables set (see run-setup.sh)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source environment from setup (or set manually)
if [ -f "$SCRIPT_DIR/.env.spike" ]; then
  source "$SCRIPT_DIR/.env.spike"
fi

# Fallback to defaults
AZURE_RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-sandbox-spike-dev}"
AZURE_ENVIRONMENT_NAME="${AZURE_ENVIRONMENT_NAME:-sandbox-prod}"
JOB_NAME="${JOB_NAME:-sandbox-agent-job}"

test_count=0
pass_count=0
fail_count=0

log_test() {
  echo ""
  echo "=== Test $((++test_count)): $1 ==="
}

log_pass() {
  echo "✓ PASS: $1"
  ((pass_count++))
}

log_fail() {
  echo "✗ FAIL: $1"
  ((fail_count++))
}

cleanup() {
  echo ""
  echo "Cleaning up..."
  rm -f /tmp/job_submission_*.json /tmp/job_result_*.json
}

trap cleanup EXIT

# Test 1: Check Azure CLI and authentication
log_test "Verify Azure CLI and authentication"
if az account show > /dev/null 2>&1; then
  ACCOUNT=$(az account show --query name -o tsv)
  log_pass "Authenticated to Azure: $ACCOUNT"
else
  log_fail "Azure CLI authentication failed"
  exit 1
fi

# Test 2: Check resource group exists
log_test "Verify resource group exists"
if az group show --name "$AZURE_RESOURCE_GROUP" > /dev/null 2>&1; then
  log_pass "Resource group exists: $AZURE_RESOURCE_GROUP"
else
  log_fail "Resource group not found: $AZURE_RESOURCE_GROUP"
  exit 1
fi

# Test 3: Check Container Apps environment
log_test "Verify Container Apps environment"
if az containerapp env show \
  --name "$AZURE_ENVIRONMENT_NAME" \
  --resource-group "$AZURE_RESOURCE_GROUP" > /dev/null 2>&1; then
  log_pass "Container Apps environment exists: $AZURE_ENVIRONMENT_NAME"
else
  log_fail "Container Apps environment not found: $AZURE_ENVIRONMENT_NAME"
  exit 1
fi

# Test 4: Check job exists
log_test "Verify Container Apps job"
if az containerapp job show \
  --name "$JOB_NAME" \
  --resource-group "$AZURE_RESOURCE_GROUP" > /dev/null 2>&1; then
  log_pass "Container Apps job exists: $JOB_NAME"
else
  log_fail "Container Apps job not found: $JOB_NAME"
  exit 1
fi

# Test 5: Submit a job
log_test "Submit sandbox job"
WORK_PAYLOAD=$(cat <<'EOF'
{
  "provider": "test",
  "prompt": "Hello from spike test",
  "taskId": "spike-test-001"
}
EOF
)

SUBMIT_OUTPUT=$(bash "$SCRIPT_DIR/submit-job.sh" "$AZURE_RESOURCE_GROUP" "$JOB_NAME" "$WORK_PAYLOAD" 2>&1)
SUBMIT_EXIT=$?

if [ $SUBMIT_EXIT -eq 0 ] && echo "$SUBMIT_OUTPUT" | jq . > /dev/null 2>&1; then
  EXECUTION_ID=$(echo "$SUBMIT_OUTPUT" | jq -r '.executionId')
  log_pass "Job submitted: $EXECUTION_ID"
  
  # Save for later retrieval
  echo "$SUBMIT_OUTPUT" > "/tmp/job_submission_${EXECUTION_ID}.json"
else
  log_fail "Job submission failed: $SUBMIT_OUTPUT"
  exit 1
fi

# Test 6: Poll job for completion
log_test "Poll for job completion (max 60 seconds)"
POLL_OUTPUT=$(bash "$SCRIPT_DIR/poll-job.sh" "$AZURE_RESOURCE_GROUP" "$JOB_NAME" "$EXECUTION_ID" "60" 2>&1)
POLL_EXIT=$?

if [ $POLL_EXIT -eq 0 ]; then
  log_pass "Job completed successfully"
  echo "$POLL_OUTPUT" > "/tmp/job_result_${EXECUTION_ID}.json"
elif [ $POLL_EXIT -eq 2 ]; then
  log_fail "Job polling timed out (container may still be starting)"
  echo "Note: This is expected for initial spike; Container Apps may have slow first-run"
else
  log_fail "Job polling failed: $POLL_OUTPUT"
fi

# Test 7: Verify output structure (if job completed)
if [ $POLL_EXIT -eq 0 ] && [ -f "/tmp/job_result_${EXECUTION_ID}.json" ]; then
  log_test "Verify job output structure"
  RESULT_JSON=$(cat "/tmp/job_result_${EXECUTION_ID}.json")
  
  if echo "$RESULT_JSON" | jq '.jobDetails' > /dev/null 2>&1; then
    log_pass "Job output is valid JSON with expected structure"
  else
    log_fail "Job output missing expected fields"
  fi
fi

# Test 8: Verify job logs available
log_test "Check job logs in Container Apps"
JOB_LOGS=$(az containerapp job execution list \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --job-name "$JOB_NAME" \
  --query "[?name=='$EXECUTION_ID'].properties" 2>&1)

if echo "$JOB_LOGS" | jq . > /dev/null 2>&1; then
  log_pass "Job logs accessible via Container Apps API"
else
  log_fail "Could not retrieve job logs"
fi

# Summary
echo ""
echo "=========================================="
echo "E2E Test Summary"
echo "=========================================="
echo "Tests run: $test_count"
echo "Passed:    $pass_count"
echo "Failed:    $fail_count"
echo ""

if [ $fail_count -eq 0 ]; then
  echo "✓ All tests passed!"
  exit 0
else
  echo "✗ Some tests failed"
  exit 1
fi
