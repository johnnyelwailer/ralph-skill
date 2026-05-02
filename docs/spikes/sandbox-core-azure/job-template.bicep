// Bicep template for Container Apps Job (Sandbox execution)
// Usage: az deployment group create --template-file job-template.bicep --parameters @params.bicepparam

param location string = resourceGroup().location
param environmentName string
param jobName string
param containerImage string
param containerRegistryUrl string = ''
param containerPort int = 8080
param sandboxRuntimeIdentityId string
param cpuCores string = '0.5'
param memory string = '1Gi'
param replicaRetryLimit int = 1
param replicaTimeout int = 300

resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: environmentName
}

// If using private registry, create ACR pull secret
resource registryCredential 'Microsoft.App/jobs/secrets@2024-03-01' = if (!empty(containerRegistryUrl)) {
  parent: containerAppsJob
  name: 'acr-creds'
  properties: {
    value: containerRegistryUrl
  }
}

resource containerAppsJob 'Microsoft.App/jobs@2024-03-01' = {
  name: jobName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${sandboxRuntimeIdentityId}': {}
    }
  }
  properties: {
    environmentId: containerAppsEnvironment.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: replicaTimeout
      replicaRetryLimit: replicaRetryLimit
      registries: !empty(containerRegistryUrl) ? [
        {
          server: containerRegistryUrl
          identity: sandboxRuntimeIdentityId
        }
      ] : []
    }
    template: {
      containers: [
        {
          image: containerImage
          name: 'sandbox-agent'
          env: [
            {
              name: 'LOG_LEVEL'
              value: 'info'
            }
          ]
          resources: {
            cpu: json(cpuCores)
            memory: memory
          }
        }
      ]
    }
  }
}

output jobId string = containerAppsJob.id
output jobName string = containerAppsJob.name
