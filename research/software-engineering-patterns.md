# Software Engineering Patterns & Principles Reference

Technology-agnostic patterns, architectures, and principles. All URLs verified via web search.

---

## 1. Architectural Patterns

### Separation of Concerns / Layered Architecture

**What:** Divide a system into distinct layers (presentation, domain logic, data access) where each layer has a single responsibility and only depends on the layer below it. This reduces coupling and makes each layer independently testable and replaceable.

**When to use:** Almost always -- it is a foundational organizing principle. Even small applications benefit from separating UI from business logic from persistence.

**When NOT to use:** Extremely simple scripts or throwaway prototypes where the overhead of multiple layers is not justified.

**References:**
- [Presentation Domain Data Layering - Martin Fowler](https://martinfowler.com/bliki/PresentationDomainDataLayering.html)
- [Separation of Concerns - Martin Fowler (IEEE Software)](https://martinfowler.com/ieeeSoftware/separation.pdf)
- [Layering Principles - Martin Fowler](https://martinfowler.com/bliki/LayeringPrinciples.html)

---

### Dependency Inversion / Dependency Injection

**What:** High-level modules should not depend on low-level modules; both should depend on abstractions. Dependency Injection is the practical mechanism: instead of a class creating its own dependencies, they are provided ("injected") from the outside via constructor, setter, or interface injection.

**When to use:** When you need testable, loosely coupled components. Essential for any non-trivial application where you want to swap implementations (e.g., real database vs. in-memory for testing).

**When NOT to use:** Overly simple programs with few dependencies. Introducing a DI container for a 50-line script adds complexity with no benefit.

**References:**
- [Inversion of Control Containers and the Dependency Injection Pattern - Martin Fowler](https://www.martinfowler.com/articles/injection.html)
- [DIP in the Wild - Martin Fowler](https://martinfowler.com/articles/dipInTheWild.html)
- [Inversion of Control - Martin Fowler](https://martinfowler.com/bliki/InversionOfControl.html)

---

### Hexagonal Architecture (Ports & Adapters)

**What:** Structure an application so the domain core has no dependencies on external systems (databases, UIs, APIs). The core defines "ports" (interfaces), and "adapters" implement those ports for specific technologies. Dependencies point inward: UI -> domain <- data source.

**When to use:** When you need to isolate business logic from infrastructure concerns, support multiple delivery mechanisms (CLI, web, API), or achieve high testability of domain logic.

**When NOT to use:** CRUD-heavy applications with minimal domain logic, where the indirection adds complexity without meaningful benefit.

**References:**
- [Hexagonal Architecture - Alistair Cockburn](https://alistair.cockburn.us/hexagonal-architecture)
- [Hexagonal Rails - Martin Fowler](https://martinfowler.com/articles/badri-hexagonal/)
- [Presentation Domain Data Layering - Martin Fowler](https://martinfowler.com/bliki/PresentationDomainDataLayering.html)

---

### Event-Driven Architecture

**What:** Systems communicate by producing and consuming events rather than direct synchronous calls. Components react to things that have happened rather than being told what to do. Key variants include event notification, event-carried state transfer, and event sourcing.

**When to use:** When you need loose coupling between services, asynchronous processing, high scalability, or when multiple consumers need to react to the same business event.

**When NOT to use:** Simple request/response flows where synchronous calls are sufficient. Event-driven systems are harder to debug and reason about due to eventual consistency and distributed state.

**References:**
- [What Do You Mean by "Event-Driven"? - Martin Fowler](https://martinfowler.com/articles/201701-event-driven.html)
- [Event Collaboration - Martin Fowler](https://martinfowler.com/eaaDev/EventCollaboration.html)
- [Domain Event - Martin Fowler](https://martinfowler.com/eaaDev/DomainEvent.html)

---

### CQRS (Command Query Responsibility Segregation)

**What:** Use separate models for reading data (queries) and writing data (commands). The write model enforces business rules and invariants; the read model is optimized for queries and may be denormalized. Often paired with event sourcing but does not require it.

**When to use:** When read and write workloads have very different performance or structural requirements, or when the domain is complex enough that a single model for both reads and writes becomes unwieldy.

**When NOT to use:** Most systems. Martin Fowler explicitly warns that "for most systems CQRS adds risky complexity." Only consider it for genuinely complex domains with asymmetric read/write patterns.

**References:**
- [CQRS - Martin Fowler](https://martinfowler.com/bliki/CQRS.html)
- [Event Sourcing - Martin Fowler](https://martinfowler.com/eaaDev/EventSourcing.html)
- [Cloud Design Patterns - Microsoft](https://learn.microsoft.com/en-us/azure/architecture/patterns/)

---

### Domain-Driven Design (Bounded Contexts, Aggregates)

**What:** Model software around the business domain. A Bounded Context defines a clear boundary within which a particular domain model applies -- the same term (e.g., "Account") can mean different things in different contexts. An Aggregate is a cluster of domain objects treated as a single unit for data changes, with one entity serving as the aggregate root.

**When to use:** Complex domains with rich business rules, multiple teams working on the same system, or when clear module boundaries are needed to manage large codebases.

**When NOT to use:** Simple CRUD applications, small teams with a single straightforward domain, or early-stage products where the domain is not yet well understood.

**References:**
- [Bounded Context - Martin Fowler](https://martinfowler.com/bliki/BoundedContext.html)
- [DDD Aggregate - Martin Fowler](https://martinfowler.com/bliki/DDD_Aggregate.html)
- [Domain Driven Design - Martin Fowler](https://martinfowler.com/bliki/DomainDrivenDesign.html)

---

### Microservices vs. Monolith Decision Criteria

**What:** Microservices decompose an application into independently deployable services, each owning its data and communicating over the network. Monoliths deploy as a single unit. The key insight from Fowler: almost all successful microservice stories started as monoliths that were broken up; almost all systems built as microservices from scratch ended up in serious trouble.

**When to use microservices:** Large teams needing independent deployment, different scaling requirements per component, polyglot persistence needs, or when organizational structure demands autonomous teams.

**When to use a monolith:** New projects (start here), small teams, domains not yet well understood, or when operational complexity of distributed systems is not justified. "Don't even consider microservices unless you have a system that's too complex to manage as a monolith."

**References:**
- [Monolith First - Martin Fowler](https://martinfowler.com/bliki/MonolithFirst.html)
- [Microservice Trade-Offs - Martin Fowler](https://martinfowler.com/articles/microservice-trade-offs.html)
- [Microservice Premium - Martin Fowler](https://martinfowler.com/bliki/MicroservicePremium.html)
- [Microservices - Martin Fowler](https://martinfowler.com/articles/microservices.html)

---

## 2. Design Patterns (Gang of Four + Modern)

### When to Use Key Patterns

**Factory:** Use when object creation logic is complex, when the caller should not know the concrete class, or when you need to return different subtypes based on input. Avoid when a simple constructor suffices -- factories for trivial objects add indirection without benefit.

**Strategy:** Use when you have a family of interchangeable algorithms and want to select one at runtime (e.g., different sorting methods, pricing rules, validation strategies). Avoid when you only have one or two algorithms that rarely change.

**Observer:** Use when multiple objects need to react to state changes in another object without tight coupling (e.g., UI updates, event buses). Avoid when the notification chain becomes hard to debug or when synchronous callbacks create performance issues.

**Adapter:** Use when you need to make an existing class work with an interface it was not designed for (e.g., wrapping a third-party library). Avoid when you can simply modify the source interface.

**Decorator:** Use when you need to add behavior to objects dynamically without modifying the original class (e.g., adding logging, caching, or validation wrapping). Avoid when deep nesting of decorators makes the call stack hard to follow.

**References:**
- [Design Patterns Catalog - Refactoring Guru](https://refactoring.guru/design-patterns/catalog)
- [Strategy Pattern - Refactoring Guru](https://refactoring.guru/design-patterns/strategy)
- [Decorator Pattern - Refactoring Guru](https://refactoring.guru/design-patterns/decorator)
- [Design Patterns - SourceMaking](https://sourcemaking.com/design_patterns)

---

### Anti-Patterns to Avoid

**God Object:** A single class that knows too much or does too much, accumulating unrelated responsibilities. Violates Single Responsibility Principle. Fix by decomposing into focused classes.

**Singleton Abuse:** Using Singleton for global state rather than genuine "exactly one instance" scenarios. Creates hidden dependencies, makes testing difficult, and introduces tight coupling. Prefer dependency injection instead.

**Shotgun Surgery:** A single logical change requires modifications scattered across many classes/files. Indicates poor cohesion. Fix by consolidating related logic and applying the "package by feature" principle.

**References:**
- [God Object - Wikipedia](https://en.wikipedia.org/wiki/God_object)
- [Shotgun Surgery - Refactoring Guru](https://refactoring.guru/smells/shotgun-surgery)
- [Code Smells - Refactoring Guru](https://refactoring.guru/refactoring/smells)

---

### Composition Over Inheritance

**What:** Build behavior by composing objects (has-a) rather than extending class hierarchies (is-a). Objects delegate to contained components rather than inheriting from parent classes. This produces more flexible, loosely coupled designs because you can change behavior by swapping components at runtime.

**When to use:** Default to composition. Use inheritance only when there is a true "is-a" relationship and the base class is explicitly designed for extension.

**When NOT to use:** Genuine type hierarchies where polymorphism through inheritance is the clearest model (e.g., a `Shape` base class with `Circle` and `Rectangle`).

**References:**
- [Composition over Inheritance - Wikipedia](https://en.wikipedia.org/wiki/Composition_over_inheritance)
- [Designed Inheritance - Martin Fowler](https://martinfowler.com/bliki/DesignedInheritance.html)
- [Design Patterns (GoF) - Wikipedia](https://en.wikipedia.org/wiki/Design_Patterns)

---

## 3. Error Handling Patterns

### Fail Fast

**What:** Detect errors as early as possible and immediately report them rather than allowing bad state to propagate. Validate inputs at boundaries, check preconditions at function entry, and crash loudly on invariant violations rather than silently corrupting data.

**When to use:** Always, as a default philosophy. Especially important at system boundaries (API inputs, configuration loading, startup checks).

**When NOT to use:** User-facing flows where you need to collect all validation errors before responding (batch validation), though even here you should still fail fast internally.

**References:**
- [Fail Fast - Martin Fowler (IEEE Software)](https://martinfowler.com/ieeeSoftware/failFast.pdf)
- [Self-Preservation - Microsoft Azure Well-Architected Framework](https://learn.microsoft.com/en-us/azure/well-architected/reliability/self-preservation)

---

### Circuit Breaker

**What:** Wraps calls to an external service and monitors failures. After a threshold of failures, the circuit "opens" and immediately returns an error (or fallback) without attempting the call, preventing cascading failures. After a timeout period, the circuit moves to "half-open" and allows a test request through.

**When to use:** Any call to an external service or dependency that can fail or become slow. Essential in distributed systems to prevent one slow service from taking down the entire system.

**When NOT to use:** In-process calls that are unlikely to fail due to network or infrastructure issues.

**References:**
- [Circuit Breaker Pattern - Microsoft Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker)
- [Application Resiliency Patterns - Microsoft](https://learn.microsoft.com/en-us/dotnet/architecture/cloud-native/application-resiliency-patterns)

---

### Retry with Exponential Backoff

**What:** On transient failure, retry the operation with progressively increasing delays (e.g., 1s, 2s, 4s, 8s) plus random jitter. This prevents thundering herd problems where many clients retry simultaneously and overwhelm the recovering service.

**When to use:** Transient failures (network timeouts, temporary unavailability, rate limiting responses). Always pair with a maximum retry count and circuit breaker.

**When NOT to use:** Permanent failures (authentication errors, validation errors, 4xx status codes). Retrying non-transient errors wastes resources and delays error reporting.

**References:**
- [Retry Pattern - Microsoft Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/patterns/retry)
- [Retry Storm Anti-Pattern - Microsoft](https://learn.microsoft.com/en-us/azure/architecture/antipatterns/retry-storm/)

---

### Graceful Degradation

**What:** When a component fails, the system continues operating with reduced functionality rather than failing entirely. For example, if a recommendation engine is down, show a static list instead; if a cache is unavailable, fall back to the database.

**When to use:** Any user-facing system where partial service is better than no service. Critical for systems with multiple dependencies of varying importance.

**When NOT to use:** When partial results would be misleading or dangerous (e.g., financial calculations where incomplete data produces incorrect totals).

**References:**
- [Self-Preservation Strategies - Microsoft Azure Well-Architected](https://learn.microsoft.com/en-us/azure/well-architected/reliability/self-preservation)
- [Reliability Design Patterns - Microsoft Azure Well-Architected](https://learn.microsoft.com/en-us/azure/well-architected/reliability/design-patterns)

---

### Error Boundaries / Blast Radius Containment (Bulkhead Pattern)

**What:** Isolate components into separate pools of resources (thread pools, connection pools, processes) so that a failure in one component cannot cascade and consume all shared resources. Named after ship bulkheads that contain flooding to one compartment.

**When to use:** Any system calling multiple downstream services. Especially important when some dependencies are less reliable than others.

**When NOT to use:** Single-dependency systems where there is nothing to isolate from.

**References:**
- [Bulkhead Pattern - Microsoft Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead)
- [Reliability Design Patterns - Microsoft Azure Well-Architected](https://learn.microsoft.com/en-us/azure/well-architected/reliability/design-patterns)

---

## 4. Data Patterns

### Repository Pattern

**What:** Mediates between the domain and data mapping layers using a collection-like interface. Domain code interacts with repositories as if they were in-memory collections of objects, hiding the details of data access (SQL, API calls, file I/O) behind an interface.

**When to use:** When you want to decouple domain logic from persistence technology, enable testing with in-memory fakes, or support multiple data sources.

**When NOT to use:** Simple CRUD applications where the repository is just a thin pass-through to the ORM, adding a layer of indirection without meaningful abstraction.

**References:**
- [Repository - Martin Fowler (PoEAA)](https://martinfowler.com/eaaCatalog/repository.html)
- [Catalog of Patterns of Enterprise Application Architecture](https://martinfowler.com/eaaCatalog/)

---

### Unit of Work

**What:** Maintains a list of objects affected by a business transaction and coordinates writing out changes and resolving concurrency problems. Tracks which objects were created, modified, or deleted during a business operation, then persists all changes in a single transaction.

**When to use:** When multiple entities must be persisted atomically within a single business operation, and you want to batch database operations for efficiency.

**When NOT to use:** Simple single-entity operations where explicit save calls are sufficient.

**References:**
- [Unit of Work - Martin Fowler (PoEAA)](https://martinfowler.com/eaaCatalog/unitOfWork.html)
- [Catalog of Patterns of Enterprise Application Architecture](https://martinfowler.com/eaaCatalog/)

---

### Optimistic vs. Pessimistic Locking

**Optimistic locking:** Assume conflicts are rare. Read data without locking, then at write time check whether someone else modified it (using a version number or timestamp). If there is a conflict, reject the write and let the caller retry. Works well for low-contention, high-throughput scenarios.

**Pessimistic locking:** Lock the record when reading, preventing others from modifying it until the lock is released. Better for high-contention scenarios where conflicts are frequent, but reduces throughput and risks deadlocks.

**When to use optimistic:** Web applications, read-heavy workloads, user-facing forms. Default to optimistic.

**When to use pessimistic:** Inventory systems, financial transactions, or any scenario where conflicts are frequent and the cost of retrying is high.

**References:**
- [Optimistic Concurrency - Microsoft ADO.NET](https://learn.microsoft.com/en-us/dotnet/framework/data/adonet/optimistic-concurrency)
- [Concurrency in Blob Storage - Microsoft Azure](https://learn.microsoft.com/en-us/azure/storage/blobs/concurrency-manage)

---

### Idempotency Patterns

**What:** An operation is idempotent if performing it multiple times produces the same result as performing it once. Critical for reliability in distributed systems where messages can be delivered more than once. Implemented via idempotency keys/tokens that are checked before processing.

**When to use:** Any API that can be retried (payment processing, message handlers, webhook receivers). Essential for at-least-once delivery systems.

**When NOT to use:** Truly idempotent-by-nature operations (pure reads, DELETE of a specific resource) don't need extra machinery.

**References:**
- [Make Mutating Operations Idempotent - AWS Well-Architected Reliability Pillar](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_prevent_interaction_failure_idempotent.html)
- [AWS Well-Architected Reliability Pillar](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/welcome.html)

---

### Event Sourcing Basics

**What:** Instead of storing current state, store a sequence of events that represent every state change. Current state is derived by replaying events. The event log becomes the authoritative source of truth, enabling temporal queries ("what was the state at time T?"), audit trails, and rebuilding projections.

**When to use:** Audit-critical domains (finance, healthcare), systems needing temporal queries, or when paired with CQRS for complex read/write separation.

**When NOT to use:** Simple CRUD domains, systems where current state is all that matters, or teams unfamiliar with eventual consistency. Event sourcing significantly increases complexity.

**References:**
- [Event Sourcing - Martin Fowler](https://martinfowler.com/eaaDev/EventSourcing.html)
- [Focusing on Events - Martin Fowler](https://martinfowler.com/eaaDev/EventNarrative.html)
- [CQRS - Martin Fowler](https://martinfowler.com/bliki/CQRS.html)

---

## 5. Concurrency Patterns

### Producer-Consumer

**What:** Decouple work production from work processing using a queue or buffer. Producers add items to the queue; consumers take items and process them independently. This allows producers and consumers to operate at different rates and provides natural backpressure.

**When to use:** Background job processing, message queues, any scenario where work generation and work processing have different throughput characteristics.

**When NOT to use:** When immediate synchronous response is required and the overhead of a queue is not justified.

**References:**
- [Competing Consumers Pattern - Microsoft Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/patterns/competing-consumers)
- [Cloud Design Patterns - Microsoft](https://learn.microsoft.com/en-us/azure/architecture/patterns/)

---

### Rate Limiting / Throttling / Debouncing

**Rate limiting:** Cap the number of requests a client can make in a time window. Protects services from abuse and ensures fair resource allocation.

**Throttling:** The server-side mechanism to enforce limits by rejecting or queuing excess requests. Can shed load gracefully (e.g., returning 429 status).

**Debouncing:** Delay processing until input has stabilized (e.g., wait 300ms after the last keystroke before triggering a search). Reduces unnecessary work from rapid repeated inputs.

**When to use:** Public APIs (rate limiting), any shared resource (throttling), UI event handlers like search-as-you-type (debouncing).

**When NOT to use:** Internal-only services with trusted, capacity-planned callers may not need rate limiting. Debouncing is inappropriate for events that must be processed immediately.

**References:**
- [Rate Limiting Pattern - Microsoft Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/patterns/rate-limiting-pattern)
- [Throttling Pattern - Microsoft Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/patterns/throttling)

---

### Semaphore / Mutex Concepts

**Mutex (mutual exclusion):** Ensures only one thread/process can access a critical section at a time. The thread that acquires the lock must be the one to release it.

**Semaphore:** Allows up to N concurrent accesses to a resource (a mutex is a semaphore with N=1). Useful for limiting concurrent database connections, file handles, or API calls.

**When to use:** Any shared mutable state that could be corrupted by concurrent access. Connection pool limiting, file access coordination.

**When NOT to use:** When you can use immutable data structures or message-passing concurrency models instead, which avoid shared state entirely.

**References:**
- [Semaphore - Wikipedia](https://en.wikipedia.org/wiki/Semaphore_(programming))
- [Mutual Exclusion - Wikipedia](https://en.wikipedia.org/wiki/Mutual_exclusion)

---

### Async Patterns (Promises, Futures, Channels)

**Promises/Futures:** Represent a value that will be available later. Allow non-blocking code by chaining operations (then/await) that execute when the result is ready, without blocking the calling thread.

**Channels:** Typed conduits for passing messages between concurrent processes (goroutines, coroutines). Provide synchronization without shared memory: "Don't communicate by sharing memory; share memory by communicating."

**When to use:** I/O-bound operations (network calls, file reads), UI responsiveness, concurrent task coordination.

**When NOT to use:** CPU-bound computation that needs true parallelism (use thread pools or worker processes instead). Avoid async for trivially synchronous operations where it adds complexity without benefit.

**References:**
- [Futures and Promises - Wikipedia](https://en.wikipedia.org/wiki/Futures_and_promises)
- [Competing Consumers Pattern - Microsoft](https://learn.microsoft.com/en-us/azure/architecture/patterns/competing-consumers)

---

## 6. Code Organization

### Feature-Based vs. Layer-Based Folder Structure

**Layer-based:** Organize by technical role (`controllers/`, `services/`, `models/`). Every feature is scattered across multiple directories.

**Feature-based:** Organize by business capability (`user-auth/`, `billing/`, `notifications/`). Each directory contains all layers for that feature.

**When to use feature-based:** Default choice for most applications. Makes it easy to find all code related to a feature, supports team autonomy, and makes features independently deployable if you move to microservices later.

**When to use layer-based:** Small applications with few features, or shared libraries/frameworks where the "feature" is the technical capability itself.

**References:**
- [Screaming Architecture - Robert C. Martin (Clean Coder Blog)](https://blog.cleancoder.com/uncle-bob/2011/09/30/Screaming-Architecture.html)
- [Presentation Domain Data Layering - Martin Fowler](https://martinfowler.com/bliki/PresentationDomainDataLayering.html)

---

### Colocation Principle

**What:** Keep related things together. Tests next to the code they test. Styles next to the component they style. Types next to the functions that use them. When you need to understand or change a feature, everything is in one place.

**When to use:** Always, as a guiding principle. It reduces cognitive load and makes code navigation intuitive.

**When NOT to use:** Shared utilities or cross-cutting concerns that genuinely serve multiple features should live in a shared location rather than being arbitrarily colocated with one feature.

**References:**
- [Screaming Architecture - Robert C. Martin](https://blog.cleancoder.com/uncle-bob/2011/09/30/Screaming-Architecture.html)
- [Conway's Law - Martin Fowler](https://martinfowler.com/bliki/ConwaysLaw.html)

---

### Module Boundaries / Public API Surfaces

**What:** Each module should expose a minimal public interface and hide internal implementation details. Consumers depend only on the public API, allowing internals to change freely. Enforce this through explicit exports, package-private visibility, or barrel files.

**When to use:** Any multi-module codebase. Define clear boundaries early; they are hard to retrofit.

**When NOT to use:** Single-module applications where everything is internal.

**References:**
- [Refactoring Module Dependencies - Martin Fowler](https://martinfowler.com/articles/refactoring-dependencies.html)
- [Bounded Context - Martin Fowler](https://martinfowler.com/bliki/BoundedContext.html)

---

## 7. General Principles

### SOLID (Brief, Practical)

| Principle | One-Liner | Practical Meaning |
|---|---|---|
| **S**ingle Responsibility | One reason to change | A class/module should do one thing. If you can't name it without "and," split it. |
| **O**pen/Closed | Open for extension, closed for modification | Add behavior by adding new code (strategies, decorators), not changing existing code. |
| **L**iskov Substitution | Subtypes must be substitutable | If function works with base type, it must work with any derived type without surprises. |
| **I**nterface Segregation | No fat interfaces | Clients should not be forced to depend on methods they don't use. Many small interfaces > one large one. |
| **D**ependency Inversion | Depend on abstractions | High-level policy should not depend on low-level detail. Both depend on interfaces. |

**References:**
- [SOLID - Wikipedia](https://en.wikipedia.org/wiki/SOLID)
- [DIP in the Wild - Martin Fowler](https://martinfowler.com/articles/dipInTheWild.html)

---

### YAGNI (You Aren't Gonna Need It)

**What:** Don't build features or abstractions until you actually need them. Originated from Extreme Programming. Speculative generality leads to unused code, added complexity, and maintenance burden.

**When to apply:** Always, as a default stance. Build the simplest thing that works, then refactor when real requirements emerge.

**When NOT to apply:** Known architectural constraints (e.g., you know you need authentication, you know you need audit logging) should be planned for.

**References:**
- [YAGNI - Wikipedia](https://en.wikipedia.org/wiki/You_aren%27t_gonna_need_it)
- [YAGNI - Martin Fowler](https://martinfowler.com/bliki/Yagni.html)

---

### KISS (Keep It Simple, Stupid)

**What:** The simplest solution that works is usually the best. Complexity is the enemy of reliability. Every layer of abstraction, every framework, every pattern added should earn its place by solving a real problem.

**When to apply:** Always. Especially when choosing between a "clever" solution and a "boring" one -- pick boring.

**References:**
- [KISS Principle - Wikipedia](https://en.wikipedia.org/wiki/KISS_principle)

---

### Principle of Least Surprise (Least Astonishment)

**What:** A component should behave in the way that users (including developer-users of an API) expect it to. Function names should accurately describe what they do. Side effects should be obvious. Conventions should be followed.

**When to apply:** Always. Especially when naming functions, designing APIs, choosing default values, and handling edge cases.

**References:**
- [Principle of Least Astonishment - Wikipedia](https://en.wikipedia.org/wiki/Principle_of_least_astonishment)

---

### Tell, Don't Ask

**What:** Instead of asking an object for its data and then making decisions based on that data, tell the object what to do. This keeps behavior with the data it operates on and prevents logic from leaking into callers.

**When to apply:** Object-oriented design where behavior and data should be colocated. Helps enforce encapsulation.

**When NOT to apply:** Data transfer objects, view models, or pure data structures that are intentionally behavior-free.

**References:**
- [Tell Don't Ask - Martin Fowler](https://martinfowler.com/bliki/TellDontAsk.html)

---

### Law of Demeter (Principle of Least Knowledge)

**What:** An object should only talk to its immediate collaborators, not reach through them to their collaborators. Avoid chains like `order.getCustomer().getAddress().getCity()`. Instead, ask the order directly for what you need.

**When to apply:** Any object-oriented code. Reduces coupling and makes refactoring safer.

**When NOT to apply:** Fluent builder APIs and method chaining that return `this` are not violations (each call returns the same object). Also, navigating pure data structures (DTOs, JSON) is generally acceptable.

**References:**
- [Law of Demeter - Wikipedia](https://en.wikipedia.org/wiki/Law_of_Demeter)

---

### Fail-Safe Defaults

**What:** When a system fails or encounters an unknown situation, it should default to a safe/secure state. Access should be denied by default (allowlist over blocklist). Missing configuration should cause startup failure, not silent fallback to insecure defaults.

**When to apply:** Security decisions, permission systems, configuration management, any situation where the "wrong default" could cause harm.

**References:**
- [Fail-safe - Wikipedia](https://en.wikipedia.org/wiki/Fail-safe)
- [Fail Fast - Martin Fowler (IEEE Software)](https://martinfowler.com/ieeeSoftware/failFast.pdf)

---

## 8. Observability & Operations

### Structured Logging (JSON Logs)

**What:** Emit logs as structured data (typically JSON) with consistent fields (timestamp, level, message, service, request_id) rather than free-form text strings. Structured logs can be parsed, filtered, aggregated, and correlated by log management systems without fragile regex parsing.

**When to use:** All production systems. Unstructured text logs are acceptable only for local development.

**When NOT to use:** Never skip structured logging in production. Even CLI tools benefit from structured output when consumed by other tools.

**References:**
- [Monitoring Distributed Systems - Google SRE Book](https://sre.google/sre-book/monitoring-distributed-systems/)
- [Monitoring - Google SRE Workbook](https://sre.google/workbook/monitoring/)
- [OpenTelemetry Logs](https://opentelemetry.io/docs/concepts/signals/logs/)

---

### Correlation IDs / Distributed Tracing

**What:** Assign a unique ID to each request at the entry point and propagate it through all downstream service calls, log entries, and queue messages. This allows you to trace a single user request across multiple services and reconstruct the full call chain. OpenTelemetry standardizes this with trace IDs and span IDs.

**When to use:** Any system with more than one service or asynchronous processing step. Non-negotiable for microservices.

**When NOT to use:** Single-process applications where a thread/request ID suffices.

**References:**
- [Traces - OpenTelemetry](https://opentelemetry.io/docs/concepts/signals/traces/)
- [Context Propagation - OpenTelemetry](https://opentelemetry.io/docs/concepts/context-propagation/)
- [Observability Primer - OpenTelemetry](https://opentelemetry.io/docs/concepts/observability-primer/)
- [Monitoring Distributed Systems - Google SRE Book](https://sre.google/sre-book/monitoring-distributed-systems/)

---

### Health Checks

**What:** Expose HTTP endpoints (typically `/health` or `/healthz`) that report whether a service and its critical dependencies are functioning. Used by load balancers, orchestrators (Kubernetes), and monitoring systems to route traffic and trigger alerts or restarts.

**Types:** Liveness checks (is the process alive?), readiness checks (can it serve traffic?), and deep/dependency checks (are databases, caches, and downstream services reachable?).

**When to use:** Every deployed service. Liveness and readiness checks are required for container orchestration.

**When NOT to use:** Never skip health checks. Even batch jobs should report their status.

**References:**
- [Health Endpoint Monitoring Pattern - Microsoft Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/patterns/health-endpoint-monitoring)
- [Observability - Microsoft Azure Well-Architected Framework](https://learn.microsoft.com/en-us/azure/well-architected/operational-excellence/observability)

---

### Feature Flags

**What:** Runtime switches that enable or disable features without deploying new code. Categories include release toggles (hide unfinished features), experiment toggles (A/B testing), ops toggles (kill switches), and permission toggles (role-based access). Must be actively managed -- remove flags that are no longer needed.

**When to use:** Trunk-based development, gradual rollouts, A/B testing, operational safety (kill switch for new features).

**When NOT to use:** Don't use as a permanent configuration mechanism. Feature flags should be short-lived. Long-lived flags accumulate technical debt and make code paths hard to reason about.

**References:**
- [Feature Toggles (aka Feature Flags) - Martin Fowler](https://martinfowler.com/articles/feature-toggles.html)
- [Feature Flag - Martin Fowler](https://martinfowler.com/bliki/FeatureFlag.html)

---

### Blue-Green / Canary Deployments

**Blue-green:** Maintain two identical production environments. Deploy to the inactive one, verify it works, then switch traffic. Enables instant rollback by switching back.

**Canary:** Deploy to a small subset of servers/users first, monitor for errors and performance regressions, then gradually increase traffic. Provides real-world validation with limited blast radius.

**When to use blue-green:** When you need instant rollback capability and can afford to run two environments.

**When to use canary:** When you want to validate with real traffic but limit risk. Better for large-scale systems where full blue-green duplication is expensive.

**When NOT to use either:** Database schema migrations that are not backward-compatible make both patterns difficult. Plan schema changes to be additive/backward-compatible first.

**References:**
- [Blue Green Deployment - Martin Fowler](https://martinfowler.com/bliki/BlueGreenDeployment.html)
- [Canary Release - Martin Fowler](https://martinfowler.com/bliki/CanaryRelease.html)
- [Dark Launching - Martin Fowler](https://martinfowler.com/bliki/DarkLaunching.html)
