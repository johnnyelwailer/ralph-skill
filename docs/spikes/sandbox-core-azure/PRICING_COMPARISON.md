# Hosted Sandbox Pricing Comparison

Created: 2026-05-02

This note compares the Azure sandbox spike cost baseline against current public pricing for adjacent hosted sandbox providers. The goal is not to pick a permanent backend, but to decide whether Azure Container Apps dynamic sessions are economically plausible enough to remain the default hosted-sandbox target.

## Baseline

The Azure spike measured and documented this working profile:

- Runtime: Azure Container Apps dynamic sessions, custom container session pool
- Shape: `2 vCPU / 4 GiB`
- Metered rate used by the spike: `$0.000040/sec`
- Equivalent rate: `$0.00240/min`, `$0.144/hr`
- One continuously warm session-equivalent for 30 days: `$103.68`

With `readySessionInstances=1`, this is the approximate always-warm baseline. More warm capacity scales linearly. With `readySessionInstances=0`, the baseline can go to zero, but the first request pays cold allocation/startup latency.

## Normalized Comparison

Assumptions:

- Normalize to `2 vCPU / 4 GiB` where the provider allows it.
- Use 720 hours for a 30-day month.
- Exclude model/API tokens, egress, logs, object storage, and registry costs unless they are part of the sandbox compute price.
- For active-CPU providers, show both idle-heavy and CPU-heavy cases.
- Public SaaS prices can change; verify before committing spend.

| Provider | Relevant product | Billing model | Approx. hourly cost | Approx. 720h cost | Read |
|---|---|---:|---:|---:|---|
| Azure | Container Apps dynamic sessions | Provisioned vCPU + GiB seconds | `$0.144` | `$103.68` | Competitive, especially with Azure identity/network/security already needed. |
| Cua | Cloud sandboxes | CPU + RAM + disk wall time | `$0.0444` for listed Linux Small | `$31.97` | Cheapest listed profile, but product is optimized for computer-use/desktop agents, not just headless coding sandboxes. |
| Freestyle | VMs / sandboxes | vCPU + RAM wall time | `$0.132` | `$95.21` | Slightly cheaper than Azure on pure compute; full-VM ergonomics and pause/resume are interesting. |
| E2B | Sandboxes | vCPU + RAM wall time | `$0.1656` | `$119.23` | Direct coding-sandbox fit; more expensive than Azure before any plan/base fees. |
| Daytona | Sandboxes | vCPU + RAM + disk wall time | `$0.1656` plus disk after free tier | `$119.23` plus disk after free tier | Similar core rate to E2B; strong snapshot/devbox ergonomics. |
| Cloudflare | Containers + Sandbox SDK | Active CPU + provisioned RAM/disk | `$0.050` at 10% CPU, `$0.180` at 100% CPU for exact `2v/4GiB` math | `$41` to `$135` + Workers Paid plan | Strong for idle-heavy agents; real instance shapes may force more RAM/disk. |
| Vercel | Sandbox | Active CPU + provisioned memory | `$0.195` at 10% CPU, `$0.426` at 100% CPU | `$141` to `$306` | Active CPU helps, but memory pricing makes long-running sandboxes costlier. |
| Modal | Sandboxes | Physical core + RAM wall time | `$0.239` using 1 physical core + 4 GiB | `$171.85` | Great infra; not the cheapest CPU sandbox path. |
| Runloop | Devboxes | CPU + RAM + storage wall time | `$0.320` for 2 CPU / 4 GiB / 8 GB disk | `$230.07` | Strong SWE-agent product surface; materially more expensive. |
| Sandchest | Firecracker sandboxes | vCPU + RAM wall time | `$0.082` to `$0.100` for 2v/4GiB | `$72` to `$108` before/after plan effects | Cheap and relevant; less mature signal than Azure/E2B/Daytona/Cloudflare. |

## Cloudflare Note

Cloudflare is now a serious alternative. Cloudflare Containers and Sandbox SDK reached GA in April 2026, and the Sandbox SDK includes command execution, file management, preview URLs, interactive terminals, backup/restore, and agent-oriented workflows.

The pricing difference is the main wrinkle:

- CPU is billed by active vCPU time.
- Memory and disk are billed by provisioned resources while the container is running.
- Sandbox SDK also uses Workers and Durable Objects, and logs/egress can add cost.

For mostly idle agents, Cloudflare can undercut Azure. For CPU-heavy work, Azure is competitive or cheaper. Also, Cloudflare's listed container shapes do not include an exact `2 vCPU / 4 GiB` instance; the nearest 2-vCPU shape is larger (`2 vCPU / 8 GiB / 16 GB disk`), which pushes a realistic always-on cost closer to `$70/month` at 10% CPU or `$163/month` at 100% CPU, plus the Workers Paid plan.

## Conclusion

Azure pricing is competitive enough to keep as the primary hosted-sandbox target.

The current Azure baseline is not a pricing outlier. It is cheaper than E2B, Daytona, Modal, Runloop, and Vercel for a continuously warm `2 vCPU / 4 GiB` sandbox. Freestyle and Cua can be cheaper on listed rates, and Cloudflare can be cheaper for idle-heavy workloads, but Azure has strong compensating advantages for aloop:

- first-party managed identity and scoped resource groups
- Key Vault, private networking, Azure Monitor, and policy integration
- owner-controlled infrastructure instead of third-party sandbox tenancy
- dynamic-session warm pools with subsecond warm allocation
- clear path from spike to `SandboxAdapter`

Recommendation: continue the Azure backend as the first production-grade hosted sandbox path, while keeping `SandboxAdapter` neutral enough to test Cloudflare Sandbox SDK and Freestyle as cost/performance comparators.

## Sources

- Azure spike baseline: `AZURE_SETUP.md` Step 3.6 and `benchmark-sessions.sh`
- Azure dynamic sessions: https://learn.microsoft.com/en-us/azure/container-apps/sessions
- Azure Container Apps pricing: https://azure.microsoft.com/en-us/pricing/details/container-apps/
- Cloudflare Containers pricing: https://developers.cloudflare.com/containers/pricing/
- Cloudflare Sandbox SDK pricing: https://developers.cloudflare.com/sandbox/platform/pricing/
- Cloudflare Containers/Sandbox GA: https://developers.cloudflare.com/changelog/post/2026-04-13-containers-sandbox-ga/
- E2B pricing: https://e2b.dev/pricing
- Daytona pricing: https://www.daytona.io/pricing
- Modal sandboxes pricing: https://modal.com/products/sandboxes
- Runloop pricing: https://runloop.ai/pricing
- Vercel Sandbox pricing: https://vercel.com/docs/vercel-sandbox/pricing
- Freestyle pricing: https://www.freestyle.sh/pricing
- Cua pricing: https://cua.ai/pricing
- Sandchest pricing: https://www.sandchest.com/pricing
