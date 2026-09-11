# ADR-016: Deterministic Multi-Alert Incident Correlation, State Machine Topology, and SRE Command Console

## Status
Accepted

## Context
Following the completion of the Phase 4 alert rule evaluation engine (sliding windows, multi-series aggregations, and deterministic state transitions), AegisOps AI monitors high-frequency telemetry across distributed service topologies. When an upstream or downstream infrastructure dependency degrades, cascading failures often trigger multiple alerts concurrently across interconnected services (e.g. checkout API latency, database connection pool exhaustion, and payment gateway timeouts).

Without automated correlation and structured incident management, SREs and on-call engineers face severe challenges:
1. **Alert Fatigue and Fragmentation**: Multiple firing alerts spawn disjointed investigation threads, confusing incident responders and delaying mean time to acknowledge (MTTA) and mean time to resolve (MTTR).
2. **Duplicate Incident Creation & Concurrency Races**: Alerts firing within seconds of each other across dependent services could generate multiple independent incidents if evaluated concurrently without strict coordination.
3. **Episode Collision**: Recurring alert conditions (e.g. an alert that fires, clears, and fires again hours later) must not accidentally attach to old, closed incidents or fail due to reused alert instance IDs.
4. **Severity Inversion & Hysteresis**: As cascading failures worsen, the incident severity must escalate automatically to reflect the highest severity alert, but must **never** de-escalate automatically when one of several alerts recovers.
5. **Premature Auto-Resolution**: When metric values recover below threshold, alerts clear. However, operational incidents require human verification, mitigation cleanup, and postmortem documentation; auto-resolving incidents based solely on metric absence is unacceptable in enterprise SRE operations.

## Decision

### 1. Pure Deterministic Incident State Machine
- **States**: `OPEN`, `ACKNOWLEDGED`, `INVESTIGATING`, `MITIGATED`, `RESOLVED`.
- **Allowed Transitions**:
  - `OPEN -> ACKNOWLEDGED`
  - `OPEN -> INVESTIGATING`
  - `ACKNOWLEDGED -> INVESTIGATING`
  - `ACKNOWLEDGED -> MITIGATED`
  - `INVESTIGATING -> MITIGATED`
  - `INVESTIGATING -> RESOLVED`
  - `MITIGATED -> INVESTIGATING` (mitigation regression)
  - `MITIGATED -> RESOLVED`
  - `RESOLVED -> INVESTIGATING` (explicit human reopening)
- **Arbitrary Transitions Rejected**: Direct transitions like `OPEN -> RESOLVED` or `RESOLVED -> OPEN` are rejected with `400 Bad Request`.
- **Idempotent Acknowledgement**: Transitioning an incident to `ACKNOWLEDGED` when it has already been acknowledged or advanced into investigation returns the current state idempotently without creating redundant events.

### 2. Authoritative Episode Identity Binding
- Rather than binding correlation directly to `alertInstanceId` (which persists across multiple firing cycles), `IncidentAlert` strictly binds to the immutable `FIRING_STARTED` `AlertEvent` ID (`triggerAlertEventId`) with a PostgreSQL unique constraint.
- When an alert condition clears and fires again in the future, it generates a fresh `AlertEvent` with a unique ID, representing a distinct operational episode that will not collide with historical attachments.

### 3. Multi-Factor Correlation Scoring & Deterministic Tie-Breaking
- Incoming firing alert episodes are evaluated against active candidate incidents (`OPEN`, `ACKNOWLEDGED`, `INVESTIGATING`, `MITIGATED`) within the same organization and environment whose `lastSignalAt` is within `INCIDENT_CORRELATION_WINDOW_SECONDS=600` (10 minutes).
- **Correlation Factors**:
  - **Same Service**: (+100 points) Alert belongs to a service already involved in the incident.
  - **Direct 1-Hop Dependency**: (+70 points) Alert service is an upstream dependency or downstream dependent of a service in the incident.
  - **Same Owner Team**: (+20 points) Alert service shares team ownership with the incident or primary service.
  - **Temporal Proximity**:
    - \(\Delta t \le 120s\): +30 points
    - \(\Delta t \le 300s\): +20 points
    - \(\Delta t \le 600s\): +10 points
    - \(\Delta t > 600s\): 0 points (excluded from candidates)
- **Correlation Threshold**: Candidates scoring \(\ge 70\) points are eligible for correlation. If no candidate reaches 70 points, a new `AUTOMATED` incident is created.
- **Deterministic Tie-Breaking**:
  1. Highest total correlation score
  2. Most recent `lastSignalAt`
  3. Highest incident severity rank (`CRITICAL > ERROR > WARNING > INFO`)
  4. Lexicographical incident ID comparison (`localeCompare`)

### 4. Monotonic Severity Escalation
- Mathematical severity ordering: `CRITICAL (4) > ERROR (3) > WARNING (2) > INFO (1)`.
- When an alert joins an incident, if its severity rank exceeds the incident's current severity, the incident severity is automatically escalated and a `SEVERITY_ESCALATED` audit event is recorded.
- Zero auto-de-escalation is allowed: when an alert recovers or a lower-severity alert joins, the incident maintains its peak escalated severity until explicitly modified by human operators.

### 5. Transactional Outbox & Environment Distributed Locking
- **Outbox Pattern**: When `AlertWorker` transitions an alert to `FIRING_STARTED` or `RESOLVED`, it inserts an `IncidentCorrelationTrigger` record into PostgreSQL within the same atomic Prisma transaction.
- **Outbox Relayer**: `IncidentCorrelationRelayer` continuously checks for pending triggers and enqueues jobs into BullMQ queue `incident-correlation` with deduplicated job IDs (`corr:${alertEventId}`).
- **Environment-Scoped Distributed Locking**: `IncidentCorrelationWorker` acquires a Redis lock on `lock:incident-correlation:<organizationId>:<environmentId>` with a 30-second TTL before evaluating candidates. This guarantees serialized correlation evaluation per environment, preventing concurrent firing alerts across dependent microservices from spawning duplicate incidents.

### 6. Signals-Cleared Semantics vs. Human Resolution
- When all linked alert episodes for an incident reach `RESOLVED`, the incident's `allSignalsClearedAt` timestamp is set and an `ALL_LINKED_SIGNALS_CLEARED` timeline event is logged.
- The incident **remains in its active status** (`INVESTIGATING` or `MITIGATED`).
- Resolving an incident requires an explicit human action via `POST /resolve` with a mandatory `resolutionSummary` explaining the remediation.

### 7. SRE Incident Command Console
- Built in Next.js 15 App Router under `/incidents` (high-density operational catalog) and `/incidents/[incidentId]` (command console).
- Provides instant explainability for every correlated alert through "Why Correlated?" badges (`SAME_SERVICE (+100)`, `DIRECT_DEPENDENCY (+70)`, `TIME_PROXIMITY (+30)`).
- Provides complete commander assignment, responder roster management, manual alert linking/unlinking, and an immutable chronological audit trail.

## Consequences

### Positive
- Prevents incident proliferation during cascading outages by grouping topology-related alerts.
- Eliminates duplicate incident creation through Redis distributed locking and atomic outbox triggers.
- Guarantees complete auditability with immutable timeline records for state transitions, severity escalations, and responder commands.
- Separates transient metric recovery (`allSignalsClearedAt`) from operational resolution (`status = RESOLVED`), ensuring human verification.

### Negative
- Cross-environment incidents (e.g. staging alerts correlating into production) are intentionally prohibited by design.
- Multi-hop dependencies (>1 hop) are not correlated by default to avoid over-grouping unrelated cascading effects.

