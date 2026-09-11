# ADR-017: Professional Operations UX Consolidation, Motion & Interaction System, and WebSocket Real-Time Event Delivery

## Status
Accepted

## Context
Across Phases 0 through 5, AegisOps AI developed comprehensive backend systems: multi-tenant authentication, service catalog topology with DAG cycle detection, synthetic health probes with SSRF protection, streaming OTLP metric ingestion with cardinality defense, sliding-window alert evaluation, and deterministic multi-alert incident correlation with monotonic severity escalation.

However, as features expanded, the product user experience developed operational friction:
1. **Navigation Fragmentation**: Internal development terminology (e.g. "Phase 1", "Phase 2", milestone badges) leaked into navigation and footers, creating a prototype aesthetic rather than an enterprise SRE product.
2. **Tab Overload**: The Service Detail screen grew to over 7 top-level tabs, scattering critical operational telemetry and health indicators across disparate views.
3. **Stale Operational Awareness**: Operators had to manually refresh or wait for periodic polling cycles to detect newly fired alerts, incoming incidents, or health probe state changes.
4. **Scattered Administrative Settings**: Profile, organization configuration, team management, and member permissions were disjointed across different URL paths.
5. **Lack of Interaction Hierarchy**: UI transitions lacked purposeful motion, tactile button feedback, and accessibility compliance for reduced-motion preferences.

## Decision

### 1. Strict 5-Primary Navigation System
- Consolidated the application layout to exactly five primary navigation items:
  - **Overview** (`/`): Real-time operations cockpit, system health summary, and prioritized Needs Attention queue.
  - **Services** (`/services`): Complete service catalog with health probes, environment bindings, and dependency graphs.
  - **Alerts** (`/alerts`): Active and historical alert instances, firing state transitions, and rule definitions.
  - **Incidents** (`/incidents`): Live incident command console, correlation trees, responder assignments, and timeline audits.
  - **Settings** (`/settings`): Consolidated administrative configuration.
- Removed all internal development tags ("Phase 1", "Phase 2", "Phase 5 Complete", milestone badges) from the user interface and footers.
- Added a persistent real-time connection status pill (`LIVE`, `RECONNECTING`, `OFFLINE`) and an organization context switcher in the global header.

### 2. Bounded Operations Overview API (`GET /api/v1/organizations/:organizationId/operations/overview`)
- Replaced multiple disjointed frontend queries with a single, bounded operations overview endpoint.
- Executes bounded concurrent queries via `Promise.all`:
  - Services with active environment health probes
  - Active firing/pending alerts
  - Active incidents (`OPEN`, `ACKNOWLEDGED`, `INVESTIGATING`, `MITIGATED`)
  - Critical incidents count
  - Grouped alert counts by service (`alertInstance.groupBy`)
  - Grouped incident counts by service (`incident.groupBy`)
  - Recent operational timeline events
- **Zero N+1 Queries**: All counts and relations are resolved in the initial batch queries.
- Dynamically aggregates service health using `aggregateServiceHealth` across production and non-production environments.
- Synthesizes a prioritized **Needs Attention** feed:
  - Priority 1 (CRITICAL): P1 critical incidents and completely down/unhealthy services
  - Priority 2 (HIGH): Error-level incidents, degraded services, and SEV_1 firing alerts
  - Priority 3 (MEDIUM): Warning alerts and standard investigations

### 3. WebSocket Real-Time Event Delivery Architecture
- Implemented `RealtimeGateway` using NestJS `@WebSocketGateway` and Socket.IO.
- **Session Authentication**:
  - Handshake extracts the HTTP-only `aegisops_session` cookie directly from socket connection headers (`client.handshake.headers.cookie`).
  - Validates session token against `SessionService`. Unauthenticated or expired connections are immediately rejected.
- **Strict Multi-Tenant Room Isolation**:
  - `organization:<orgId>`: Subscriptions validated against `prisma.membership`.
  - `service:<orgId>:<serviceId>`: Subscriptions validated against both membership and service tenant ownership.
  - `incident:<orgId>:<incidentId>`: Subscriptions validated against both membership and incident tenant ownership.
  - Cross-tenant subscription attempts return explicit errors and reject room joining.
- **Redis Pub/Sub Horizontal Scaling Backplane**:
  - `RealtimeEventPublisher` publishes events to Redis channel `aegisops:realtime:events`.
  - Gateways subscribe to Redis and broadcast envelopes to local socket rooms, enabling seamless horizontal multi-instance scaling.
  - Local in-process fallback emitter guarantees immediate delivery in single-node testing environments.
- **Reactive TanStack Query Invalidation**:
  - Frontend hooks (`useRealtimeOrganization`, `useRealtimeService`, `useRealtimeIncident`) listen for domain events (`incident.created`, `incident.severity.updated`, `alert.fired`, `service.health.updated`) and selectively invalidate query caches rather than maintaining volatile duplicated client state.

### 4. Motion & Interaction Design System (`lib/motion.ts`)
- Standardized motion tokens:
  - Durations: `fast: 0.15s`, `normal: 0.25s`, `moderate: 0.35s`, `slow: 0.5s`
  - Easings: `standard: [0.2, 0.0, 0, 1.0]`, `entrance: [0.0, 0.0, 0.2, 1]`, `exit: [0.4, 0.0, 1, 1]`
- Accessible Motion: Full compliance with `prefers-reduced-motion`; animated transitions automatically collapse to instant opacity fades when reduced-motion is requested.
- Micro-Interactions: Tactile button feedback (`scale: 0.98`), subtle badge fades, and non-distracting live status indicators without neon or gratuitous styling.

### 5. Consolidated Service Detail Experience
- Consolidated 7+ sprawling tabs into 4 focused sections:
  1. **Overview**: Key metadata, operational tier, environment health matrix, and active incidents.
  2. **Observability**: Live health probes, OTLP metrics stream, firing alerts, and probe history.
  3. **Dependencies**: Upstream dependencies, downstream dependents, and interactive topology graph.
  4. **Configuration**: Service settings, telemetry ingestion keys, and environment variables.

### 6. Consolidated Settings Hierarchy (`/settings`)
- Replaced scattered configuration routes with a unified tabbed console:
  - **Organization**: Workspace name, slug, tier, and creation metadata.
  - **Members**: Role management (Owner, Admin, Member, Viewer), user list, and pending invites.
  - **Teams**: Engineering teams, responder rosters, and service ownership bindings.
  - **Profile**: User display name, email, and authentication info.
  - **Security**: Session controls, active login locations, and sign-out actions.

## Consequences
- **Positive**: Operators obtain instantaneous situational awareness on page load. All state updates propagate via real-time WebSocket events in sub-second latency.
- **Positive**: Clean 5-item navigation and consolidated service details reduce cognitive friction during active incident response.
- **Positive**: Tenant security is maintained across both HTTP and WebSocket boundaries through identical session cookie validation and database ownership checks.
- **Compliance**: Zero JWTs stored in client storage; zero N+1 database queries; zero external message queue dependencies beyond existing Redis.

