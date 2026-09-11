# ADR-003: NestJS for Authoritative Business API

## Status
Accepted

## Context
The platform needs structured dependency injection, strict request validation, declarative RBAC guards, built-in WebSocket gateways, and clean testing utilities. Unstructured frameworks like basic Express lack convention and lead to fragmented codebases.

## Decision
Use **NestJS 10** with TypeScript as the core business API framework (`apps/api`).

## Consequences
### Positive
* Out-of-the-box support for Dependency Injection, Modules, Controllers, and Services.
* Built-in validation pipes (`class-validator`), guards, and interceptors for RBAC and tenant isolation.
* First-class OpenAPI (Swagger) generation from TypeScript decorators.
* Clear testing conventions with `@nestjs/testing` and Jest.

### Negative / Trade-offs
* Slightly heavier footprint and boilerplate compared to minimal Express or Fastify.
* Requires adherence to TypeScript decorator metadata conventions.
