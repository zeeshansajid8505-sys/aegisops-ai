# ADR-001: Modular Core Backend Instead of Distributed Microservices

## Status
Accepted

## Context
In building AegisOps AI as a solo software engineering portfolio project, there is a temptation to decompose every domain (auth, alerts, incidents, services) into distinct microservices. However, for a single developer, microservices introduce distributed system failure modes, network latency, distributed transactions, repeated auth verification, and heavy deployment friction without real load justification.

## Decision
Adopt a **Modular Monolith** architecture for the core business application (`apps/api`) built on NestJS, while isolating the Python AI service (`apps/ai-service`) and background processing (`apps/worker`) as distinct processes.

## Consequences
### Positive
* Single transactional boundary with PostgreSQL and atomic database migrations.
* Simple local development with zero distributed tracing overhead for core business flows.
* Strong modularity enforced via NestJS dependency injection and module encapsulation.
* Easy future extraction of individual modules if scale demands.

### Negative / Trade-offs
* All core business modules share a single runtime and process deployment.
* Shared dependencies require careful version alignment.
