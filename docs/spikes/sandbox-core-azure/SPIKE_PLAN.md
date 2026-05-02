# Azure Sandbox-Core Spike: Proof of Concept

**Goal:** Prove that Azure Container Apps Jobs can execute lightweight sandboxes with minimal, scoped permissions and feed results back to the daemon.

**Context:** 
- Current arch (spec/daemon.md, spec/devcontainer.md): v1 is host execution + local devcontainer; v2 is sandbox-core local Docker; future is hosted backends.
- No SandboxAdapter, sandbox-core interface, or Azure integration exists yet.
- This spike is infrastructure + integration proof, not product-level integration.

---

## Scope

### In Scope
1. **Secure Azure setup:** dedicated RG, provisioner identity (OIDC), sandbox runtime identity (least privilege)
2. **Container Apps Jobs infra:** environment, job definition, managed identity assignment
3. **Minimal sandbox container:** aloop agent + provider CLI stub that echoes a result
4. **Daemon integration stub:** trigger a real job, poll/stream result back
5. **End-to-end verification:** submit work → job runs → result returned to daemon

### Out of Scope
- Full sandbox-core abstraction and SandboxAdapter interface
- Multi-region, autoscaling, cost optimization, production hardening
- Advanced networking (custom VNets, private endpoints) — use defaults for spike
- Real model provider calls; use mock provider in container
- Artifact handling, cleanup automation, policy enforcement

---

## Phases

### Phase 1: Azure Infrastructure Setup (Secure Foundation)
**Deliverable:** Documented, repeatable setup script + manual verification checklist.

**Steps:**
1. Bootstrap: Create RG, register providers, create Log Analytics workspace
2. Create provisioner managed identity (scoped to RG) with Contributor role (temporary for spike; later locked down)
3. Create sandbox runtime managed identity with AcrPull + Log Analytics Reader
4. Create Container Apps environment
5. Document OIDC + workload identity federation setup (defer actual setup; document path)
6. Create role assignment for provisioner identity to create/manage jobs

**Inputs needed:** Azure subscription, CLI access, resource naming convention.

**Exit criteria:** RG + identities created, roles verified, Container Apps environment ready.

---

### Phase 2: Minimal Sandbox Container
**Deliverable:** Docker image that mimics aloop agent behavior; pushed to ACR or public registry.

**Steps:**
1. Create Dockerfile: lightweight base, aloop-agent stub + provider CLI stub
2. Agent listens on stdout for work payload (JSON), runs provider, outputs result (JSON)
3. Build and push to registry (e.g., ACR or Docker Hub for dev)
4. Test locally via Docker run

**Image behavior:**
```
Input:  {"provider": "test", "prompt": "Hello, world"}
Output: {"result": "Mock response", "provider": "test", "status": "success"}
```

**Exit criteria:** Image builds, runs locally, produces JSON output.

---

### Phase 3: Container Apps Jobs + Daemon Integration
**Deliverable:** Working job definition, trigger script, result polling.

**Steps:**
1. Define Container Apps Job in Bicep or Azure CLI
2. Assign sandbox runtime managed identity to job
3. Write daemon integration stub: CLI command to submit job, parse response
4. Implement polling loop (simple: check job status every 5s for 60s)
5. Extract logs and output from job execution

**Integration point:**
- Daemon calls `azure-submit-job.sh` with work payload (provider, prompt)
- Script submits job, returns job ID
- Daemon polls for completion, retrieves output from Container App Logs

**Exit criteria:** Job submits, runs, completes, result retrieved.

---

### Phase 4: End-to-End Verification
**Deliverable:** E2E test script + passing run.

**Steps:**
1. Create test script: daemon → job submit → poll → verify output
2. Run 3–5 times to confirm repeatability
3. Verify managed identity permissions work (no stored credentials in container)
4. Check audit logs in Azure for security posture
5. Clean up resources and document cleanup steps

**Exit criteria:** E2E test passes 3/3 times, no credential leaks, resource cleanup verified.

---

## Definition of Done

- [ ] Spike plan (this doc) approved and committed
- [ ] Azure setup documented and tested (manual walkthrough works)
- [ ] Dockerfile builds, runs locally, produces correct output
- [ ] Container Apps Job defined and deployable
- [ ] Daemon integration script (submit job, poll result) written and tested
- [ ] E2E test passes 3/3 runs
- [ ] Security checklist: managed identities verified, no secrets in images, logs reviewed
- [ ] Spike report: what worked, blockers, next steps for product integration

---

## Key Design Decisions

1. **Managed identity over secrets:** No credentials in images; rely on OIDC + workload identity (requires CI/CD setup for full implementation).
2. **Container Apps Jobs over ACI:** Jobs are finite run-to-completion; simpler than ACI + status polling.
3. **Polling vs. event-driven:** Polling for spike (simpler). Event Grid / Service Bus for production.
4. **Minimal permissions:** Sandbox runtime identity can only pull images, read logs; cannot create/destroy resources or assume other roles.
5. **Log Analytics for debugging:** Use CA built-in logging; simpler than custom storage.

---

## Next Steps After Spike

1. Define SandboxAdapter interface in spec/
2. Implement Azure backend for sandbox-core
3. Refactor daemon to use sandbox-core abstraction
4. Add multi-provider secrets management (Key Vault integration)
5. Add cleanup / timeout enforcement
6. Integrate with aloop control loop (orchestrator, scheduler)

---

## Time Estimate

- Phase 1: 30–45 min
- Phase 2: 20–30 min
- Phase 3: 45–60 min
- Phase 4: 20–30 min
- **Total: ~2.5–2.75 hours**

---

## Risk & Mitigation

| Risk | Mitigation |
|------|-----------|
| Managed identity RBAC misconfigured | Test permissions before spike; use az role check |
| Container Apps Job auth fails | Pre-create identities; verify assignment in portal |
| Polling timeout on slow container start | Increase polling window, pre-warm environment |
| Artifact collection / logging complex | Use Container App built-in logs; defer advanced logging |
