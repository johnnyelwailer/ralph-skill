# Azure Setup Guide: Secure Sandbox Execution

This guide walks you through setting up a dedicated Azure resource group with minimal, scoped permissions for sandbox execution.

## Prerequisites

- Azure subscription with active credits§
- `az` CLI installed and authenticated: `az login` (MFA preferred)
- `jq` for JSON parsing (optional, for parsing CLI output)
- Resource naming convention (e.g., `sandbox-spike-[env]`)

## Phase 1: Bootstrap Infrastructure

### Step 1.1: Set Environment Variables

```bash
#!/bin/bash
set -e

# User-configurable
export AZURE_SUBSCRIPTION_ID="<your-subscription-id>"
export AZURE_RESOURCE_GROUP="sandbox-spike-dev"
export AZURE_LOCATION="eastus"  # or your preferred region
export AZURE_ENVIRONMENT_NAME="sandbox-prod"
export AZURE_CONTAINER_REGISTRY="sandboxspikeacr"  # must be globally unique
export AZURE_LOG_ANALYTICS_WORKSPACE="sandbox-spike-logs"

# Derived names
export PROVISIONER_IDENTITY="sandbox-provisioner"
export SANDBOX_RUNTIME_IDENTITY="sandbox-runtime"

# Verify subscription
az account set --subscription "$AZURE_SUBSCRIPTION_ID"
echo "Using subscription: $(az account show --query name -o tsv)"
```

### Step 1.2: Create Resource Group

```bash
az group create \
  --name "$AZURE_RESOURCE_GROUP" \
  --location "$AZURE_LOCATION"

echo "✓ Resource group created: $AZURE_RESOURCE_GROUP"
```

### Step 1.3: Register Required Providers

```bash
# Register Container Apps and related providers
az provider register --namespace Microsoft.App
az provider register --namespace Microsoft.OperationalInsights
az provider register --namespace Microsoft.ContainerRegistry

# Wait for registration (usually quick)
echo "Waiting for provider registration..."
sleep 5

# Verify registration
az provider show --namespace Microsoft.App --query "registrationState" -o tsv
```

### Step 1.4: Create Log Analytics Workspace

```bash
az monitor log-analytics workspace create \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --workspace-name "$AZURE_LOG_ANALYTICS_WORKSPACE"

export AZURE_LOG_ANALYTICS_WORKSPACE_ID=$(az monitor log-analytics workspace show \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --workspace-name "$AZURE_LOG_ANALYTICS_WORKSPACE" \
  --query id -o tsv)

echo "✓ Log Analytics workspace: $AZURE_LOG_ANALYTICS_WORKSPACE_ID"
```

### Step 1.5: Create Container Registry (Optional, for Dev)

```bash
# For dev spike, you can use Docker Hub or public registry
# For persistent setup, create ACR in RG

az acr create \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$AZURE_CONTAINER_REGISTRY" \
  --sku Basic

export AZURE_CONTAINER_REGISTRY_LOGIN_SERVER=$(az acr show \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$AZURE_CONTAINER_REGISTRY" \
  --query loginServer -o tsv)

echo "✓ Container Registry: $AZURE_CONTAINER_REGISTRY_LOGIN_SERVER"
```

## Phase 2: Create Managed Identities and Role Assignments

### Step 2.1: Create Provisioner Managed Identity

```bash
# Used for provisioning/debugging during spike; in prod, this would be scoped further
az identity create \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$PROVISIONER_IDENTITY"

export PROVISIONER_IDENTITY_ID=$(az identity show \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$PROVISIONER_IDENTITY" \
  --query id -o tsv)

export PROVISIONER_CLIENT_ID=$(az identity show \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$PROVISIONER_IDENTITY" \
  --query clientId -o tsv)

echo "✓ Provisioner identity: $PROVISIONER_IDENTITY_ID"
echo "  Client ID: $PROVISIONER_CLIENT_ID"
```

### Step 2.2: Create Sandbox Runtime Managed Identity

```bash
# This identity is used by the actual sandbox container
# Minimal permissions: ACR pull, Log Analytics read, Key Vault secrets read (if needed)

az identity create \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$SANDBOX_RUNTIME_IDENTITY"

export SANDBOX_RUNTIME_IDENTITY_ID=$(az identity show \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$SANDBOX_RUNTIME_IDENTITY" \
  --query id -o tsv)

export SANDBOX_RUNTIME_CLIENT_ID=$(az identity show \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$SANDBOX_RUNTIME_IDENTITY" \
  --query clientId -o tsv)

echo "✓ Sandbox runtime identity: $SANDBOX_RUNTIME_IDENTITY_ID"
echo "  Client ID: $SANDBOX_RUNTIME_CLIENT_ID"
```

### Step 2.3: Assign Roles to Provisioner Identity

```bash
# For spike: Contributor on the resource group (temporary, for rapid iteration)
# For production: fine-grained roles (Container Apps Job Creator, etc.)

az role assignment create \
  --assignee "$PROVISIONER_CLIENT_ID" \
  --role "Contributor" \
  --scope "/subscriptions/$AZURE_SUBSCRIPTION_ID/resourceGroups/$AZURE_RESOURCE_GROUP"

echo "✓ Provisioner role: Contributor (temporary for spike)"
```

### Step 2.4: Assign Roles to Sandbox Runtime Identity

```bash
# AcrPull: pull images from the registry
if [ ! -z "$AZURE_CONTAINER_REGISTRY" ]; then
  export REGISTRY_ID=$(az acr show \
    --resource-group "$AZURE_RESOURCE_GROUP" \
    --name "$AZURE_CONTAINER_REGISTRY" \
    --query id -o tsv)

  az role assignment create \
    --assignee "$SANDBOX_RUNTIME_CLIENT_ID" \
    --role "AcrPull" \
    --scope "$REGISTRY_ID"

  echo "✓ Sandbox runtime role: AcrPull on $AZURE_CONTAINER_REGISTRY"
fi

# Monitoring Reader: read logs
az role assignment create \
  --assignee "$SANDBOX_RUNTIME_CLIENT_ID" \
  --role "Monitoring Reader" \
  --scope "/subscriptions/$AZURE_SUBSCRIPTION_ID/resourceGroups/$AZURE_RESOURCE_GROUP"

echo "✓ Sandbox runtime role: Monitoring Reader"
```

## Phase 3: Container Apps Environment

### Step 3.1: Create Container Apps Environment

```bash
az containerapp env create \
  --name "$AZURE_ENVIRONMENT_NAME" \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --logs-workspace-id "$AZURE_LOG_ANALYTICS_WORKSPACE_ID" \
  --logs-workspace-key "$(az monitor log-analytics workspace get-shared-keys \
    --resource-group "$AZURE_RESOURCE_GROUP" \
    --workspace-name "$AZURE_LOG_ANALYTICS_WORKSPACE" \
    --query primarySharedKey -o tsv)"

export CONTAINER_APP_ENV_ID=$(az containerapp env show \
  --name "$AZURE_ENVIRONMENT_NAME" \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --query id -o tsv)

echo "✓ Container Apps environment: $CONTAINER_APP_ENV_ID"
```

### Step 3.2: Create Custom Container Session Pool

This spike was verified against Azure Container Apps custom container sessions, not the built-in `PythonLTS` session type.

Important implementation details that were required for a working pool:

- Use resource type `Microsoft.App/sessionPools` with API version `2025-07-01`
- Set `properties.poolManagementType` to `Dynamic`
- Put `maxConcurrentSessions` and `readySessionInstances` under `properties.scaleConfiguration`
- Put `lifecycleType` and `cooldownPeriodInSeconds` under `properties.dynamicPoolConfiguration.lifecycleConfiguration`
- Put `ingress.targetPort` inside `properties.customContainerTemplate`
- Use `registryCredentials`, not `registries`
- Set `managedIdentitySettings[].lifecycle` to `Main` so the runtime identity is available during session execution

```bash
export SESSION_POOL_NAME="sandbox-playwright-pool"
export SESSION_POOL_IMAGE="$AZURE_CONTAINER_REGISTRY_LOGIN_SERVER/sandbox-playwright:v0.1"

cat > /tmp/session-pool.json <<EOF
{
  "location": "$AZURE_LOCATION",
  "identity": {
    "type": "UserAssigned",
    "userAssignedIdentities": {
      "$SANDBOX_RUNTIME_IDENTITY_ID": {}
    }
  },
  "properties": {
    "containerType": "CustomContainer",
    "poolManagementType": "Dynamic",
    "environmentId": "$CONTAINER_APP_ENV_ID",
    "customContainerTemplate": {
      "containers": [
        {
          "name": "sandbox-agent",
          "image": "$SESSION_POOL_IMAGE",
          "resources": {
            "cpu": 2,
            "memory": "4Gi"
          },
          "env": [
            {
              "name": "KEY_VAULT_URL",
              "value": "${KEY_VAULT_URL:-https://<your-keyvault>.vault.azure.net/}"
            }
          ]
        }
      ],
      "ingress": {
        "targetPort": 8080
      },
      "registryCredentials": {
        "server": "$AZURE_CONTAINER_REGISTRY_LOGIN_SERVER",
        "identity": "$SANDBOX_RUNTIME_IDENTITY_ID"
      }
    },
    "dynamicPoolConfiguration": {
      "lifecycleConfiguration": {
        "lifecycleType": "Timed",
        "cooldownPeriodInSeconds": 300
      }
    },
    "scaleConfiguration": {
      "maxConcurrentSessions": 5,
      "readySessionInstances": 1
    },
    "sessionNetworkConfiguration": {
      "status": "EgressEnabled"
    },
    "managedIdentitySettings": [
      {
        "identity": "$SANDBOX_RUNTIME_IDENTITY_ID",
        "lifecycle": "Main"
      }
    ]
  }
}
EOF

az rest \
  --method PUT \
  --url "https://management.azure.com/subscriptions/$AZURE_SUBSCRIPTION_ID/resourceGroups/$AZURE_RESOURCE_GROUP/providers/Microsoft.App/sessionPools/$SESSION_POOL_NAME?api-version=2025-07-01" \
  --headers "Content-Type=application/json" \
  --body @/tmp/session-pool.json
```

### Step 3.3: Grant Local User Access To The Pool

ARM `Owner` access was not sufficient for local execution against the pool management endpoint. The signed-in user also needed the data-plane role `Azure ContainerApps Session Executor` on the session pool itself.

```bash
export SESSION_POOL_ID="/subscriptions/$AZURE_SUBSCRIPTION_ID/resourceGroups/$AZURE_RESOURCE_GROUP/providers/Microsoft.App/sessionPools/$SESSION_POOL_NAME"
export SIGNED_IN_USER_OBJECT_ID=$(az ad signed-in-user show --query id -o tsv)

az role assignment create \
  --assignee-object-id "$SIGNED_IN_USER_OBJECT_ID" \
  --assignee-principal-type User \
  --role "Azure ContainerApps Session Executor" \
  --scope "$SESSION_POOL_ID"
```

### Step 3.4: Call The Pool Correctly

The working flow for custom container sessions was not `POST /api/sessions` followed by calls into `/api/sessions/<id>/...`.

The verified contract was:

- Call the container endpoint exposed by the pool directly
- Pass `?identifier=<session-id>` on every request
- Reuse the same identifier to keep the session warm

Examples:

```bash
export SESSION_POOL_ENDPOINT=$(az rest \
  --method GET \
  --url "https://management.azure.com/subscriptions/$AZURE_SUBSCRIPTION_ID/resourceGroups/$AZURE_RESOURCE_GROUP/providers/Microsoft.App/sessionPools/$SESSION_POOL_NAME?api-version=2025-07-01" \
  --query properties.poolManagementEndpoint -o tsv)

export SESSION_TOKEN=$(az account get-access-token \
  --scope "https://dynamicsessions.io/.default" \
  --query accessToken -o tsv)

export SESSION_ID="manual-probe-1"

curl -H "Authorization: Bearer $SESSION_TOKEN" \
  "$SESSION_POOL_ENDPOINT/health?identifier=$SESSION_ID"

curl -H "Authorization: Bearer $SESSION_TOKEN" \
  "$SESSION_POOL_ENDPOINT/metrics?identifier=$SESSION_ID"

curl -X POST \
  -H "Authorization: Bearer $SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}' \
  "$SESSION_POOL_ENDPOINT/run-test?identifier=$SESSION_ID"
```

### Step 3.5: Verified Spike Findings

What was proven end to end:

- Local user auth works with Azure CLI / `DefaultAzureCredential` once `Azure ContainerApps Session Executor` is granted on the pool
- The custom container can run Node.js, .NET, and Playwright in one session image
- Headless Playwright execution and screenshot capture work through the pool
- Cold and warm timings can be measured through `/metrics`, `/warm-probe`, and `/run-test`

Observed benchmark results from successful runs:

- Allocation to first healthy response under parallel load: roughly `23s` to `80s`
- Container-reported cold-start: roughly `0.26s` to `13.6s`
- Cold `/run-test`: roughly `1.66s` to `1.95s`
- Warm `/warm-probe`: roughly `130ms` to `138ms`
- Warm `/run-test`: roughly `0.93s` to `1.18s`
- Warm `/run-test` was about `43%` faster than cold on the successful 3-session run

Known gap from the spike:

- Key Vault access from inside the session container was not yet passing; `secretProbe.ok` remained `false`

### Step 3.6: Cost Baseline

Measured pricing model used in the spike:

- `2 vCPU / 4 GiB`
- `$0.000040` per second
- `$0.00240` per minute

Estimated monthly baseline if one session-equivalent stays up `24/7`:

- `24 hours`: `$3.456`
- `30 days`: `$103.68`
- `31 days`: `$107.14`

With `readySessionInstances=1`, treat this as the approximate always-on baseline. Multiply linearly for more continuously warm capacity.

## Phase 4: Verification Checklist

```bash
#!/bin/bash
echo "=== Azure Setup Verification ==="

# Check RG
echo "1. Resource Group:"
az group show --name "$AZURE_RESOURCE_GROUP" --query "[name, location]" -o tsv

# Check identities
echo ""
echo "2. Managed Identities:"
az identity list --resource-group "$AZURE_RESOURCE_GROUP" --query "[*].name" -o tsv

# Check role assignments
echo ""
echo "3. Role Assignments (Provisioner):"
az role assignment list \
  --assignee "$PROVISIONER_CLIENT_ID" \
  --scope "/subscriptions/$AZURE_SUBSCRIPTION_ID/resourceGroups/$AZURE_RESOURCE_GROUP" \
  --query "[*].[roleDefinitionName]" -o tsv

echo ""
echo "4. Role Assignments (Sandbox Runtime):"
az role assignment list \
  --assignee "$SANDBOX_RUNTIME_CLIENT_ID" \
  --scope "/subscriptions/$AZURE_SUBSCRIPTION_ID/resourceGroups/$AZURE_RESOURCE_GROUP" \
  --query "[*].[roleDefinitionName]" -o tsv

# Check Container Apps Environment
echo ""
echo "5. Container Apps Environment:"
az containerapp env show \
  --name "$AZURE_ENVIRONMENT_NAME" \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --query "[name, provisioningState]" -o tsv

echo ""
echo "✓ Setup verification complete"
```

## Phase 5: OIDC / Workload Identity Federation Setup (For CI/CD)

This is **not needed for local dev spike**, but documented for production GitHub Actions integration.

### Concept
Instead of provisioner client secret, use OIDC to trust GitHub Actions:
1. Create workload identity federation on provisioner identity
2. GitHub Actions signs requests with ACTIONS_ID_TOKEN_REQUEST_TOKEN
3. Azure validates token against GitHub's public key
4. No secrets stored; credentials are ephemeral

### Setup (Deferred)
```bash
# Example: Create OIDC trust for GitHub
# Later, configure in GitHub repo secrets + workflow

az identity federated-credentials create \
  --name "github-spike" \
  --identity-name "$PROVISIONER_IDENTITY" \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --issuer "https://token.actions.githubusercontent.com" \
  --subject "repo:your-org/your-repo:ref:refs/heads/main" \
  --audiences "api://AzureADTokenExchange"
```

---

## Security Checklist

- [ ] Provisioner identity permissions reviewed and scoped (Contributor → specific roles later)
- [ ] Sandbox runtime identity has **no** subscription-wide roles
- [ ] Sandbox runtime identity cannot create/delete/modify resources
- [ ] No service principal secrets or connection strings in code or images
- [ ] Log Analytics workspace audit logs enabled and reviewed
- [ ] Network policies configured (if using custom VNets; deferred for spike)
- [ ] OIDC federation validated for GitHub Actions (if using)

---

## Cleanup

When spike is complete:

```bash
# Delete resource group (deletes all contained resources)
az group delete --name "$AZURE_RESOURCE_GROUP" --yes --no-wait

echo "Resource group deletion initiated. Check Azure Portal for completion."
```

---

## References

- [Azure Container Apps Jobs Documentation](https://learn.microsoft.com/en-us/azure/container-apps/jobs)
- [Managed Identity in Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity)
- [Azure Workload Identity Federation](https://learn.microsoft.com/en-us/azure/active-directory/workload-identities/workload-identity-federation)
- [Azure CLI Reference](https://learn.microsoft.com/en-us/cli/azure/)
