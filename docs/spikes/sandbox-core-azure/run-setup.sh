#!/bin/bash
# run-setup.sh: Complete Azure infrastructure setup for sandbox spike
# Usage: ./run-setup.sh [--dry-run] [--skip-verification]
# This script runs through Phase 1 & 3 of the spike plan

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRY_RUN=false
SKIP_VERIFICATION=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --skip-verification)
      SKIP_VERIFICATION=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# =============================================================================
# Configuration
# =============================================================================

echo "📋 Azure Sandbox Spike Setup"
echo "========================================"
echo ""

# User-configurable (change as needed)
read -p "Enter Azure Subscription ID (or press Enter for current): " SUBSCRIPTION_INPUT
if [ -z "$SUBSCRIPTION_INPUT" ]; then
  AZURE_SUBSCRIPTION_ID=$(az account show --query id -o tsv)
else
  AZURE_SUBSCRIPTION_ID="$SUBSCRIPTION_INPUT"
fi

read -p "Enter Resource Group name (default: sandbox-spike-dev): " RG_INPUT
AZURE_RESOURCE_GROUP="${RG_INPUT:-sandbox-spike-dev}"

read -p "Enter Azure Region (default: westeurope, allowed: switzerlandnorth|switzerlandwest|westeurope|northeurope): " REGION_INPUT
AZURE_LOCATION="${REGION_INPUT:-westeurope}"

read -p "Enter Container Apps environment name (default: sandbox-prod): " ENV_INPUT
AZURE_ENVIRONMENT_NAME="${ENV_INPUT:-sandbox-prod}"

# Derived names
PROVISIONER_IDENTITY="sandbox-provisioner"
SANDBOX_RUNTIME_IDENTITY="sandbox-runtime"
AZURE_LOG_ANALYTICS_WORKSPACE="sandbox-spike-logs"
AZURE_CONTAINER_REGISTRY="sandboxspikeacr$(date +%s | tail -c 6)"

echo ""
echo "Configuration:"
echo "  Subscription:       $AZURE_SUBSCRIPTION_ID"
echo "  Resource Group:     $AZURE_RESOURCE_GROUP"
echo "  Region:             $AZURE_LOCATION"
echo "  Environment:        $AZURE_ENVIRONMENT_NAME"
echo "  Provisioner ID:     $PROVISIONER_IDENTITY"
echo "  Runtime ID:         $SANDBOX_RUNTIME_IDENTITY"
echo ""

if [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN] Exiting before making changes"
  exit 0
fi

# =============================================================================
# Phase 1: Bootstrap Infrastructure
# =============================================================================

echo "🚀 Phase 1: Bootstrap Infrastructure"
echo "========================================"

# Step 1: Set subscription
az account set --subscription "$AZURE_SUBSCRIPTION_ID"
echo "✓ Subscription selected: $(az account show --query name -o tsv)"

# Step 2: Create resource group
echo "Creating resource group: $AZURE_RESOURCE_GROUP"
az group create \
  --name "$AZURE_RESOURCE_GROUP" \
  --location "$AZURE_LOCATION" \
  --tags environment=spike purpose=sandbox-testing > /dev/null
echo "✓ Resource group created"

# Step 3: Register providers
echo "Registering Azure providers..."
az provider register --namespace Microsoft.App --wait > /dev/null 2>&1 &
az provider register --namespace Microsoft.OperationalInsights --wait > /dev/null 2>&1 &
az provider register --namespace Microsoft.ContainerRegistry --wait > /dev/null 2>&1 &
wait
echo "✓ Providers registered"

# Step 4: Create Log Analytics workspace
echo "Creating Log Analytics workspace: $AZURE_LOG_ANALYTICS_WORKSPACE"
az monitor log-analytics workspace create \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --workspace-name "$AZURE_LOG_ANALYTICS_WORKSPACE" > /dev/null
AZURE_LOG_ANALYTICS_WORKSPACE_ID=$(az monitor log-analytics workspace show \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --workspace-name "$AZURE_LOG_ANALYTICS_WORKSPACE" \
  --query id -o tsv)
echo "✓ Log Analytics workspace created: $AZURE_LOG_ANALYTICS_WORKSPACE"

# Step 5: Create Container Registry
echo "Creating Container Registry: $AZURE_CONTAINER_REGISTRY"
az acr create \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$AZURE_CONTAINER_REGISTRY" \
  --sku Basic > /dev/null
AZURE_CONTAINER_REGISTRY_LOGIN_SERVER=$(az acr show \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$AZURE_CONTAINER_REGISTRY" \
  --query loginServer -o tsv)
echo "✓ Container Registry created: $AZURE_CONTAINER_REGISTRY_LOGIN_SERVER"

# =============================================================================
# Phase 2: Create Managed Identities and Role Assignments
# =============================================================================

echo ""
echo "🔐 Phase 2: Managed Identities & RBAC"
echo "========================================"

# Create Provisioner Identity
echo "Creating provisioner identity: $PROVISIONER_IDENTITY"
az identity create \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$PROVISIONER_IDENTITY" > /dev/null
PROVISIONER_CLIENT_ID=$(az identity show \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$PROVISIONER_IDENTITY" \
  --query clientId -o tsv)
PROVISIONER_IDENTITY_ID=$(az identity show \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$PROVISIONER_IDENTITY" \
  --query id -o tsv)
echo "✓ Provisioner identity created: $PROVISIONER_IDENTITY"

# Create Sandbox Runtime Identity
echo "Creating runtime identity: $SANDBOX_RUNTIME_IDENTITY"
az identity create \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$SANDBOX_RUNTIME_IDENTITY" > /dev/null
SANDBOX_RUNTIME_CLIENT_ID=$(az identity show \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$SANDBOX_RUNTIME_IDENTITY" \
  --query clientId -o tsv)
SANDBOX_RUNTIME_IDENTITY_ID=$(az identity show \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$SANDBOX_RUNTIME_IDENTITY" \
  --query id -o tsv)
echo "✓ Runtime identity created: $SANDBOX_RUNTIME_IDENTITY"

# Assign Provisioner role (Contributor on RG for spike)
echo "Assigning roles to provisioner (Contributor)..."
az role assignment create \
  --assignee "$PROVISIONER_CLIENT_ID" \
  --role "Contributor" \
  --scope "/subscriptions/$AZURE_SUBSCRIPTION_ID/resourceGroups/$AZURE_RESOURCE_GROUP" > /dev/null
echo "✓ Provisioner role assigned"

# Assign Runtime roles (AcrPull + Monitoring Reader)
echo "Assigning roles to runtime identity (AcrPull, Monitoring Reader)..."
REGISTRY_ID=$(az acr show \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$AZURE_CONTAINER_REGISTRY" \
  --query id -o tsv)
az role assignment create \
  --assignee "$SANDBOX_RUNTIME_CLIENT_ID" \
  --role "AcrPull" \
  --scope "$REGISTRY_ID" > /dev/null
az role assignment create \
  --assignee "$SANDBOX_RUNTIME_CLIENT_ID" \
  --role "Monitoring Reader" \
  --scope "/subscriptions/$AZURE_SUBSCRIPTION_ID/resourceGroups/$AZURE_RESOURCE_GROUP" > /dev/null
echo "✓ Runtime roles assigned"

# =============================================================================
# Phase 3: Container Apps Environment
# =============================================================================

echo ""
echo "📦 Phase 3: Container Apps Environment"
echo "========================================"

LA_WORKSPACE_KEY=$(az monitor log-analytics workspace get-shared-keys \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --workspace-name "$AZURE_LOG_ANALYTICS_WORKSPACE" \
  --query primarySharedKey -o tsv)

echo "Creating Container Apps environment: $AZURE_ENVIRONMENT_NAME"
az containerapp env create \
  --name "$AZURE_ENVIRONMENT_NAME" \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --logs-workspace-id "$AZURE_LOG_ANALYTICS_WORKSPACE_ID" \
  --logs-workspace-key "$LA_WORKSPACE_KEY" > /dev/null
echo "✓ Container Apps environment created"

# =============================================================================
# Verification
# =============================================================================

if [ "$SKIP_VERIFICATION" = false ]; then
  echo ""
  echo "✅ Verification"
  echo "========================================"
  
  echo "Resource Group:"
  az group show --name "$AZURE_RESOURCE_GROUP" --query "[name, location]" -o tsv | sed 's/^/  /'
  
  echo ""
  echo "Managed Identities:"
  az identity list --resource-group "$AZURE_RESOURCE_GROUP" --query "[*].name" -o tsv | sed 's/^/  /'
  
  echo ""
  echo "Container Apps Environment:"
  az containerapp env show \
    --name "$AZURE_ENVIRONMENT_NAME" \
    --resource-group "$AZURE_RESOURCE_GROUP" \
    --query "[name, provisioningState]" -o tsv | sed 's/^/  /'
fi

# =============================================================================
# Save environment for scripts
# =============================================================================

ENV_FILE="$SCRIPT_DIR/.env.spike"
cat > "$ENV_FILE" <<EOF
# Auto-generated by run-setup.sh
export AZURE_SUBSCRIPTION_ID="$AZURE_SUBSCRIPTION_ID"
export AZURE_RESOURCE_GROUP="$AZURE_RESOURCE_GROUP"
export AZURE_LOCATION="$AZURE_LOCATION"
export AZURE_ENVIRONMENT_NAME="$AZURE_ENVIRONMENT_NAME"
export AZURE_LOG_ANALYTICS_WORKSPACE_ID="$AZURE_LOG_ANALYTICS_WORKSPACE_ID"
export AZURE_CONTAINER_REGISTRY="$AZURE_CONTAINER_REGISTRY"
export AZURE_CONTAINER_REGISTRY_LOGIN_SERVER="$AZURE_CONTAINER_REGISTRY_LOGIN_SERVER"
export PROVISIONER_IDENTITY="$PROVISIONER_IDENTITY"
export PROVISIONER_CLIENT_ID="$PROVISIONER_CLIENT_ID"
export PROVISIONER_IDENTITY_ID="$PROVISIONER_IDENTITY_ID"
export SANDBOX_RUNTIME_IDENTITY="$SANDBOX_RUNTIME_IDENTITY"
export SANDBOX_RUNTIME_CLIENT_ID="$SANDBOX_RUNTIME_CLIENT_ID"
export SANDBOX_RUNTIME_IDENTITY_ID="$SANDBOX_RUNTIME_IDENTITY_ID"
EOF

chmod 600 "$ENV_FILE"
echo ""
echo "✓ Environment saved to: $ENV_FILE"

# =============================================================================
# Summary
# =============================================================================

echo ""
echo "🎉 Setup Complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "  1. Build container image: docker build -t $AZURE_CONTAINER_REGISTRY_LOGIN_SERVER/sandbox-agent:v0.1 ."
echo "  2. Push to registry: docker push $AZURE_CONTAINER_REGISTRY_LOGIN_SERVER/sandbox-agent:v0.1"
echo "  3. Deploy Container Apps Job (see Phase 3 docs)"
echo "  4. Run E2E tests: ./e2e-test.sh"
echo ""
echo "To cleanup: az group delete --name $AZURE_RESOURCE_GROUP --yes --no-wait"
echo ""
