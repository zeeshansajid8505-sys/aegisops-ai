# ADR-011: Service Catalog, Team Ownership, and Directed Dependency Graph (DAG)

## Status
Accepted

## Context
In microservice architectures and site reliability engineering, understanding service ownership, operational critical paths, blast radius, and failure propagation is paramount. An incident in an upstream service often triggers cascading failures in downstream dependents. Without a centralized, strongly typed service catalog and an explicit dependency graph:
1. Ownership during Sev-1 outages is ambiguous, delaying Mean Time to Acknowledge (MTTA).
2. Service dependencies become opaque, preventing automated root cause analysis and blast radius modeling.
3. Circular dependencies (loops) can be introduced undetected, causing deadlocks, cascading retry storms, and unresolvable startup order deadlocks.
4. Multi-tenant SaaS isolation must strictly prevent cross-tenant service linkage or data leakage.

## Decision
1. **Strongly Typed Relational Service Model**:
   - Persist services in PostgreSQL with explicit `serviceType` (API, Worker, WebApp, Database, etc.), `tier` (TIER_1 Mission-Critical, TIER_2 Standard, TIER_3 Supporting), and `lifecycleStatus` (DEVELOPMENT, ACTIVE, DEPRECATED, RETIRED).
   - Scoped strictly by `organizationId`, enforcing compound unique constraints `(organization_id, slug)`.
   - Explicit team ownership mapping (`ownerTeamId`) linking to organization-scoped teams.
   - Deletion safeguards prevent deleting teams that currently own services until reallocated.

2. **Directed Service Dependency Model (DAG)**:
   - Dependencies are modeled as directed edges: `A -> B` defines "Source Service A depends on Target Service B".
   - Under this definition:
     - **Upstream**: Target services that A depends on (must be healthy for A to function).
     - **Downstream**: Source services that depend on A (represent the blast radius if A suffers an outage).
   - Edges include operational metadata: `dependencyType` (`SYNCHRONOUS`, `ASYNCHRONOUS`, `DATA`, `INFRASTRUCTURE`, `OTHER`) and `isCritical` boolean flag.

3. **In-Memory Cycle Detection Algorithm**:
   - Before committing any dependency edge `source -> target`, the system checks for circular dependency formation.
   - Self-dependencies (`source === target`) are rejected immediately.
   - A Breadth-First Search (BFS) traverses existing edges starting from `target` to determine if `source` is already reachable. If reachable, adding `source -> target` would complete a cycle.
   - Cycle detection runs inside a PostgreSQL transaction, preventing concurrent race conditions. If a cycle is detected, the transaction aborts with HTTP 400 `BadRequestException` detailing the exact cycle path.

4. **Multi-Tenant Boundary Enforcement**:
   - Both `sourceService` and `targetService` must belong to the caller's verified `organizationId`.
   - Cross-organization dependency edge creation is strictly prohibited and returns HTTP 404/400.

## Consequences

### Positive
* **Deterministic Blast Radius**: Downstream dependencies can be traversed instantly to calculate incident blast radius and notify affected engineering teams.
* **Deadlock Prevention**: Strict DAG enforcement eliminates circular call loops and distributed initialization deadlocks.
* **Accountability**: Every catalogued service is mapped to an owner team and tier, allowing prioritized alert escalation and routing in subsequent phases.
* **Strict Multi-Tenancy**: Organization boundaries are enforced at the database foreign key and query predicate levels.

### Negative / Trade-offs
* **Graph Scale in Application Layer**: BFS cycle detection traverses edges in memory. Given microservice topologies within an organization typically range from dozens to hundreds of services, this is sub-millisecond, but very large graphs (10,000+ edges) would eventually benefit from recursive CTEs in PostgreSQL or native graph engines.

