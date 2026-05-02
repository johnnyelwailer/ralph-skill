# Azure Sandbox-Core Spike: Quick Start

This directory contains the complete proof-of-concept setup for running aloop sandbox workloads on **Azure Container Apps Jobs** with minimal, scoped permissions.

## Overview

**Goal:** Prove that Azure Container Apps Jobs can execute lightweight sandboxes with least-privilege managed identities and securely return results to the daemon.

**Outcome Target:** 
- ✅ Real Azure resource group with sandbox infrastructure
- ✅ Managed identities with no credentials in images
- ✅ Container image that runs mock aloop agent workload
- ✅ Job submission and result polling integration
- ✅ E2E verification with repeatable test

## Files in This Spike

| File | Purpose |
|------|---------|
| `SPIKE_PLAN.md` | Full spike plan: scope, phases, risks, estimates |
| `AZURE_SETUP.md` | Detailed Azure setup guide with security considerations |
| `run-setup.sh` | Orchestrated setup script (Phases 1–3 automated) |
| `submit-job.sh` | Submit a sandbox job to Container Apps |
| `poll-job.sh` | Poll for job completion and retrieve results |
| `e2e-test.sh` | End-to-end verification test |
| `Dockerfile` | Minimal sandbox agent container image |
| `agent.js` | Mock aloop agent that processes work payloads |
| `job-template.bicep` | IaC template for Container Apps Job definition |

## Quick Start

### Prerequisites

```bash
# Check Azure CLI
az --version

# Authenticate
az login --use-device-code  # or `az login` for interactive

# Verify you can create resources in your subscription
az account show
```

### Step 1: Run Automated Setup (5–10 minutes)

```bash
cd docs/spikes/sandbox-core-azure

# Make scripts executable
chmod +x run-setup.sh submit-job.sh poll-job.sh e2e-test.sh

# Run setup (will prompt for subscription, RG name, region)
./run-setup.sh

# Or dry-run to see what will be created
./run-setup.sh --dry-run
```

**What this does:**
- ✓ Creates resource group in your preferred region
- ✓ Registers Azure providers (App, OperationalInsights, ContainerRegistry)
- ✓ Creates Log Analytics workspace
- ✓ Creates Container Registry
- ✓ Creates provisioner managed identity (Contributor role on RG)
- ✓ Creates sandbox runtime managed identity (AcrPull + Monitoring Reader)
- ✓ Creates Container Apps environment linked to Log Analytics
- ✓ Saves environment variables to `.env.spike`

### Step 2: Build and Push Container Image (5 minutes)

```bash
# Source environment from setup
source .env.spike

# Build locally (requires Docker)
docker build -t sandbox-agent:v0.1 .

# Tag for registry
docker tag sandbox-agent:v0.1 "$AZURE_CONTAINER_REGISTRY_LOGIN_SERVER/sandbox-agent:v0.1"

# Login to ACR (uses managed identity in production; for dev, use admin credentials)
az acr login --name "$AZURE_CONTAINER_REGISTRY"

# Push
docker push "$AZURE_CONTAINER_REGISTRY_LOGIN_SERVER/sandbox-agent:v0.1"
```

### Step 3: Deploy Container Apps Job (5 minutes)

Using Bicep template:

```bash
# Create deployment parameters
cat > job-params.json <<EOF
{
  "environmentName": { "value": "$AZURE_ENVIRONMENT_NAME" },
  "jobName": { "value": "sandbox-agent-job" },
  "containerImage": { "value": "$AZURE_CONTAINER_REGISTRY_LOGIN_SERVER/sandbox-agent:v0.1" },
  "containerRegistryUrl": { "value": "$AZURE_CONTAINER_REGISTRY_LOGIN_SERVER" },
  "sandboxRuntimeIdentityId": { "value": "$SANDBOX_RUNTIME_IDENTITY_ID" }
}
EOF

# Deploy using Bicep
az deployment group create \
  --template-file job-template.bicep \
  --parameters @job-params.json \
  --resource-group "$AZURE_RESOURCE_GROUP"
```

Or use Azure CLI directly:

```bash
az containerapp job create \
  --name "sandbox-agent-job" \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --environment "$AZURE_ENVIRONMENT_NAME" \
  --image "$AZURE_CONTAINER_REGISTRY_LOGIN_SERVER/sandbox-agent:v0.1" \
  --trigger-type Manual \
  --replica-timeout 300 \
  --replica-retry-limit 1 \
  --cpu 0.5 \
  --memory "1Gi" \
  --assign-identity "$SANDBOX_RUNTIME_IDENTITY_ID"
```

### Step 4: Run E2E Tests (5–10 minutes)

```bash
./e2e-test.sh
```

**What this tests:**
1. ✓ Azure CLI authentication
2. ✓ Resource group exists
3. ✓ Container Apps environment exists
4. ✓ Job definition exists
5. ✓ Submit a job to the queue
6. ✓ Poll for completion
7. ✓ Verify output structure
8. ✓ Check logs are accessible

Expected output:
```
Test 1: Verify Azure CLI and authentication
✓ PASS: Authenticated to Azure: Example Account

Test 2: Verify resource group exists
✓ PASS: Resource group exists: sandbox-spike-dev

...

========================================
E2E Test Summary
========================================
Tests run: 8
Passed:    8
Failed:    0

✓ All tests passed!
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  aloop Daemon (or test harness)                         │
│  Calls: submit-job.sh with work payload                 │
└──────────────────┬──────────────────────────────────────┘
                   │ (JSON work: provider, prompt, taskId)
                   ▼
┌─────────────────────────────────────────────────────────┐
│  submit-job.sh (Daemon Integration)                     │
│  • Validates JSON payload                               │
│  • Calls: az containerapp job start                      │
│  • Returns: executionId, jobExecutionId                 │
└──────────────────┬──────────────────────────────────────┘
                   │ (job submitted to Azure)
                   ▼
┌─────────────────────────────────────────────────────────┐
│  Azure Container Apps Jobs                              │
│  • Managed identity: sandbox-runtime                     │
│  • Image: sandbox-agent:v0.1                            │
│  • Timeout: 300s, Retry: 1                              │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  Sandbox Agent Container                                │
│  • Reads WORK_PAYLOAD env var (or stdin)                │
│  • Calls mock provider (test, openai, anthropic, etc.)  │
│  • Outputs JSON: { taskId, provider, result, status }   │
│  • Logs to stdout (captured by Container Apps)          │
└──────────────────┬──────────────────────────────────────┘
                   │ (execution completes)
                   ▼
┌─────────────────────────────────────────────────────────┐
│  poll-job.sh (Daemon Integration)                       │
│  • Polls: az containerapp job execution list             │
│  • Waits for: Succeeded, Failed, or Terminated state    │
│  • Retrieves: logs, job details                         │
│  • Returns: JSON result + logs                          │
└──────────────────┬──────────────────────────────────────┘
                   │ (result returned to daemon)
                   ▼
┌─────────────────────────────────────────────────────────┐
│  aloop Daemon (or test harness)                         │
│  Processes result (success/failure, next work item)     │
└─────────────────────────────────────────────────────────┘
```

## Managed Identity Security

### Provisioner Identity
- **Role:** `Contributor` on resource group (for spike; prod would be fine-grained)
- **Use:** Setup, debugging, teardown
- **Scope:** Resource group only
- **No secrets stored:** Uses OIDC for CI/CD (e.g., GitHub Actions)

### Sandbox Runtime Identity
- **Roles:** `AcrPull`, `Monitoring Reader`
- **Use:** Run inside container; pull images, write logs
- **Scope:** Resource group only
- **Cannot:** Create/delete resources, assume other roles, access subscriptions
- **Secrets:** None; all data passed via environment or secure parameters

## Troubleshooting

### Setup Fails at Provider Registration

```bash
# Providers may take time to register
az provider list --query "[?registrationState=='NotRegistered'].namespace"
```

### Container Image Push Fails

```bash
# Verify ACR login
az acr login --name "$AZURE_CONTAINER_REGISTRY"

# Check if image exists
az acr repository list --name "$AZURE_CONTAINER_REGISTRY"
```

### Job Execution Hangs or Times Out

- Container Apps may have slow startup on first run
- Check logs: `az containerapp job execution show --resource-group ... --job-name ... --execution-name ...`
- Increase polling timeout in `poll-job.sh` if needed (default: 5 min)

### Managed Identity Permissions Denied

```bash
# Verify role assignments
az role assignment list --assignee "$SANDBOX_RUNTIME_CLIENT_ID" --scope "$RESOURCE_GROUP_ID"

# Check role details
az role definition show --name "AcrPull"
```

## Next Steps After Spike

1. **Integrate with SandboxAdapter** (spec/): Define abstract interface for sandbox lifecycle
2. **Refactor daemon** to use sandbox-core backend (daemon-routes, scheduler)
3. **Add secret management:** Key Vault integration for provider API keys
4. **Event-driven triggers:** Event Grid / Service Bus instead of polling
5. **Multi-region support:** Load balancing, failover
6. **Production OIDC:** Replace spike Contributor role with fine-grained permissions
7. **Artifact handling:** Collect and cache sandbox outputs (models, traces)
8. **Cleanup automation:** Resource quotas, idle timeout, policy enforcement

## Cleanup

```bash
# Delete all resources
source .env.spike
az group delete --name "$AZURE_RESOURCE_GROUP" --yes --no-wait

# Verify (takes a few minutes)
az group list --query "[*].name" | grep -i sandbox

# Or manually via Portal -> Resource Groups -> delete
```

## References

- [Spike Plan](SPIKE_PLAN.md)
- [Azure Setup Guide](AZURE_SETUP.md)
- [Container Apps Jobs Docs](https://learn.microsoft.com/en-us/azure/container-apps/jobs)
- [Managed Identity in Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity)
- [OIDC in GitHub Actions](https://learn.microsoft.com/en-us/azure/active-directory/workload-identities/workload-identity-federation-create-trust)

---

**Last Updated:** May 2, 2026  
**Status:** Ready for execution
