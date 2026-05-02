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

## DIY Runner / VPS Option

VPS and dedicated-server providers are a separate pricing category. They are not managed sandbox products; they are cheap always-on worker capacity where aloop, or the user, must provide the sandbox runtime.

This option is still important because it supports a practical DIY use case:

- a user wants to host their own runner
- a small team wants one or more cheap workers
- an organization wants compute under its own account without buying Azure
- a power user wants to attach spare VPS/dedicated capacity to the aloop control plane

Approximate public low-end pricing for always-on capacity:

| Provider | Example shape | Approx. monthly cost | Read |
|---|---:|---:|---|
| Hetzner Cloud | `2 vCPU / 4 GB` shared VPS | about `EUR 4-6` depending current plan/region | Best raw price/performance signal; shared CPU and region availability need benchmarking. |
| Akamai/Linode | `2 CPU / 4 GB / 80 GB` shared CPU | about `$5` | Very cheap listed shared-CPU plan; verify current availability and performance. |
| OVHcloud VPS | `4 vCore / 8 GB` entry VPS range | from about `$6-10` | More RAM for the price; good cheap worker candidate. |
| Scaleway | `3 vCPU / 4 GB` development instance | about `EUR 14.45` | EU-friendly cloud API; pricier than Hetzner/OVH for this shape. |
| Vultr | `2 vCPU / 4 GB` cloud compute | about `$20` | More expensive, but broad regions and familiar cloud UX. |
| DigitalOcean | `2 vCPU / 4 GB` Basic Droplet | about `$24` | Simple and reliable developer UX; expensive versus budget VPS providers. |
| Hetzner dedicated | e.g. `64 GB` dedicated server class | roughly tens of EUR/month | Better for dense worker pools and KVM/Firecracker; less elastic than VPS. |

The raw cost gap is large: Azure's documented always-warm `2 vCPU / 4 GiB` dynamic-session baseline is `$103.68/month`, while cheap VPS providers can offer similar headline resources for single-digit to low-double-digit monthly prices.

That does not make the products equivalent. A DIY runner must own:

- worker registration and lease heartbeats
- per-session sandbox creation and teardown
- crash cleanup and orphan reaping
- image/template distribution
- worktree hydration and artifact upload
- log streaming back to the control plane
- secret injection with short-lived, scoped credentials
- host patching and base image updates
- network egress policy and abuse controls
- quota enforcement across multiple sessions sharing one host

Recommended design shape:

1. Add a `self-hosted-worker` or `vps-worker` backend behind `SandboxAdapter`.
2. The control plane remains authoritative for sessions, budgets, tracker access, and secrets.
3. Each worker registers with a long-lived node credential, but each session receives only a short-lived job token.
4. The worker runs each session inside rootless Docker, gVisor, Incus/LXD, or Firecracker when KVM is available.
5. Provider and tracker credentials are never stored permanently on the worker; the worker receives only scoped per-run material.
6. A single VPS can run one or a few sandboxes; a dedicated server can run a denser pool.

Practical read:

- Use Azure first for the managed hosted backend.
- Add DIY workers for users who want low monthly cost and accept operational responsibility.
- Prefer dedicated servers over very cheap shared VPS for untrusted or high-concurrency workloads, because KVM availability, noisy-neighbor behavior, and sustained CPU are more predictable.
- Treat budget VPS as excellent personal/dev capacity, not as a production multi-tenant security boundary without additional hardening.

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

Recommendation: continue the Azure backend as the first production-grade managed hosted sandbox path, while keeping `SandboxAdapter` neutral enough to test Cloudflare Sandbox SDK and Freestyle as cost/performance comparators. In parallel, document a `self-hosted-worker` path for DIY VPS/dedicated runners; it is economically compelling, but it should be presented as user-operated capacity rather than as the same class of managed sandbox service.

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
- Hetzner Cloud pricing and price adjustment: https://www.hetzner.com/cloud/ and https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/
- Akamai/Linode pricing: https://www.linode.com/pricing/
- OVHcloud VPS pricing: https://www.ovhcloud.com/en/vps/
- Scaleway virtual instances pricing: https://www.scaleway.com/en/pricing/virtual-instances/
- Vultr pricing: https://www.vultr.com/pricing/
- DigitalOcean Droplet pricing: https://www.digitalocean.com/pricing/droplets
