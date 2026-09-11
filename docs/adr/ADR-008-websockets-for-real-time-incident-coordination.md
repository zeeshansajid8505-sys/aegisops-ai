# ADR-008: WebSockets for Real-Time Incident State Synchronization

## Status
Accepted

## Context
During critical incidents, on-call engineers cannot wait for 30-second polling cycles to discover alert firings, incident acknowledgments, or status changes. State must sync instantly across connected browser clients.

## Decision
Implement bidirectional **WebSockets** via NestJS Gateways to push real-time updates (`incident.created`, `incident.updated`, `alert.fired`) to connected Next.js clients.

## Consequences
### Positive
* Instantaneous UI updates without manual browser refresh.
* Decreased server polling overhead under normal operating conditions.
* Real-time multi-engineer collaboration on active incident workspaces.

### Negative / Trade-offs
* WebSocket connections require persistent stateful sockets; reconnection handling and resynchronization must be managed by the frontend client.
