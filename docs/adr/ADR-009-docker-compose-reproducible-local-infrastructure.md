# ADR-009: Docker and Docker Compose for Reproducible Local Development

## Status
Accepted

## Context
AegisOps AI depends on multiple backing services (PostgreSQL 16, Redis 7). Requiring evaluators or developers to manually install and configure each service locally produces "works on my machine" failures.

## Decision
Provide **Dockerfiles** for all services and a unified **Docker Compose** environment (`infrastructure/docker/docker-compose.yml`) for local dependencies.

## Consequences
### Positive
* Single command startup for all backing storage and queuing infrastructure.
* Exact environment parity between local development and CI/CD pipelines.
* Clean teardown and volume resetting for repeatable automated testing.

### Negative / Trade-offs
* Requires Docker Desktop / daemon installed on the host machine.
* Additional container resource overhead on low-spec developer hardware.
