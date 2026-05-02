#!/usr/bin/env bash
# create-session-pool.sh — Create a Dynamic Sessions pool backed by our custom container
# Run AFTER the container image has been pushed to ACR.
set -euo pipefail

SUB="${AZURE_SUBSCRIPTION_ID:-<your-subscription-id>}"
RG="${AZURE_RESOURCE_GROUP:-sandbox-spike-dev}"
LOC="${AZURE_LOCATION:-switzerlandnorth}"
ACR="${AZURE_CONTAINER_REGISTRY:-<your-acr-name>}"
IMG_TAG="v0.1"
IMG="$ACR.azurecr.io/sandbox-playwright:$IMG_TAG"
ENV_ID="/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.App/managedEnvironments/${AZURE_ENVIRONMENT_NAME:-sandbox-prod-explicit}"
KV_URL="${KEY_VAULT_URL:-https://<your-keyvault>.vault.azure.net/}"
RUNTIME_ID=$(az identity show -g $RG -n sandbox-runtime --query id -o tsv)
POOL_NAME="sandbox-playwright-pool"

echo "Runtime identity: $RUNTIME_ID"
echo "Creating session pool '$POOL_NAME'..."

BODY=$(cat <<JSON
{
  "location": "$LOC",
  "identity": {
    "type": "UserAssigned",
    "userAssignedIdentities": {
      "$RUNTIME_ID": {}
    }
  },
  "properties": {
    "containerType": "CustomContainer",
    "environmentId": "$ENV_ID",
    "poolManagementType": "Dynamic",
    "customContainerTemplate": {
      "containers": [
        {
          "name": "sandbox-agent",
          "image": "$IMG",
          "resources": { "cpu": 2, "memory": "4Gi" },
          "env": [
            { "name": "KEY_VAULT_URL", "value": "$KV_URL" }
          ]
        }
      ],
      "registries": [
        {
          "server": "$ACR.azurecr.io",
          "identity": "$RUNTIME_ID"
        }
      ]
    },
    "dynamicPoolConfiguration": {
      "executionType": "Timed",
      "cooldownPeriodInSeconds": 300
    },
    "sessionNetworkConfiguration": {
      "status": "EgressEnabled"
    },
    "maxConcurrentSessions": 5,
    "readySessionInstances": 1
  }
}
JSON
)

URL="https://management.azure.com/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.App/sessionPools/$POOL_NAME?api-version=2025-07-01"

az rest --method PUT --url "$URL" --body "$BODY" --headers "Content-Type=application/json"

echo ""
echo "✅ Session pool creation submitted. Check provisioningState with:"
echo "  az rest --method GET --url \"$URL\" --query properties.provisioningState -o tsv"
