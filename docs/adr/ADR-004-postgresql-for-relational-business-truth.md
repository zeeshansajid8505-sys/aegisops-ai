# ADR-004: PostgreSQL as Relational Business Truth

## Status
Accepted

## Context
AegisOps AI requires strict relational integrity across organizations, users, role permissions, services, incidents, timeline events, and audit logs. Incidents must maintain referential consistency when linked to alerts and evidence.

## Decision
Use **PostgreSQL 16** managed through **Prisma ORM** as the primary relational database.

## Consequences
### Positive
* Strong ACID guarantees and relational foreign keys prevent orphaned incident data.
* Prisma provides end-to-end type safety from schema to TypeScript code.
* Support for advanced features like JSONB for flexible telemetry snapshots and Row-Level Security (RLS).
* Migration history is tracked deterministically in source control.

### Negative / Trade-offs
* Not designed for high-frequency raw time-series ingestion; telemetry metric series must be delegated to Prometheus or bounded stores rather than storing unlimited raw metrics in PostgreSQL.
