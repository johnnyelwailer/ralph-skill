# Architecture Conventions

> This file is seeded by `aloop setup` and should be customized for your project.
> Agents read this file to make consistent architectural decisions.

## Separation of Concerns

- **Separate I/O from logic.** Business rules should be testable without databases, APIs, or file systems.
- **Boundary pattern:** Core logic is pure; adapters handle external communication.
- **Don't leak infrastructure into domain.** Database schemas, HTTP details, and framework types stay at the edges.

Why: Coupled code means changing a database query requires changing business logic. ([Martin Fowler: Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/))

## Dependency Direction

- **Dependencies point inward.** High-level policy should not depend on low-level detail.
- **Depend on abstractions at boundaries.** Use interfaces/protocols at module edges.
- **Internal modules can depend on each other directly.** Don't over-abstract within a bounded context.

When NOT to use: Small scripts, CLI tools, or prototypes. Abstraction layers have a cost.

## Error & Resilience Patterns

| Pattern | Use When |
|---------|----------|
| **Fail fast** | Invalid state detected early — reject immediately |
| **Retry + backoff** | Transient failures (network, rate limits). Cap retries (3-5). |
| **Circuit breaker** | Downstream service is unhealthy. Stop calling, check periodically. |
| **Graceful degradation** | Non-critical feature fails — disable it, don't crash the app |
| **Idempotency** | Any operation that could be retried (payments, webhooks, queue consumers) |

References: [Microsoft: Retry Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/retry), [Microsoft: Circuit Breaker](https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker)

## Observability

- **Structured logging** (JSON). Include: timestamp, level, message, correlation ID, context.
- **Correlation IDs** across service boundaries. Pass through headers, propagate in logs.
- **Health check endpoint** (`/health` or `/healthz`). Return 200 when ready, 503 when not.
- **Monitor the four golden signals:** latency, traffic, errors, saturation.

Why: `console.log("something went wrong")` is not debugging — it's praying. ([Google SRE: Monitoring](https://sre.google/sre-book/monitoring-distributed-systems/))

## When to Split vs Keep Together

| Signal | Action |
|--------|--------|
| Team can't work without coordinating | Split into separate modules/services |
| Shared database with tight coupling | Keep together, separate later |
| Different scaling requirements | Consider splitting |
| < 3 developers | Monolith is almost always right |
| "Just in case we need to scale" | Don't split. YAGNI. |

Why: Premature decomposition creates distributed monolith — all the complexity of microservices with none of the benefits. ([Martin Fowler: Monolith First](https://martinfowler.com/bliki/MonolithFirst.html))

## Data Patterns

- **Repository pattern** for data access. Encapsulate query logic behind a clean interface.
- **Optimistic locking** for user-facing edits (version field, conflict detection).
- **Idempotency keys** for any mutating API that could be retried.
- **Event sourcing** only when you need full audit trail or temporal queries. It's complex — don't default to it.

References:
- [Martin Fowler: Patterns of Enterprise Application Architecture](https://martinfowler.com/eaaCatalog/)
- [Microsoft: Cloud Design Patterns](https://learn.microsoft.com/en-us/azure/architecture/patterns/)
- [Google SRE Book](https://sre.google/sre-book/table-of-contents/)
- [Martin Fowler: Monolith First](https://martinfowler.com/bliki/MonolithFirst.html)
