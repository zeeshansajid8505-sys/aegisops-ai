# AegisOps AI — System Architecture Specification

## 1. System Context
AegisOps AI is an enterprise-grade incident management, observability, and Site Reliability Engineering (SRE) platform. It ingests high-frequency telemetry (metrics, logs, traces, deployment markers) from distributed services, detects threshold breaches and statistical anomalies, correlates related alerts into unified incidents, provides real-time incident triage dashboards, and generates evidence-grounded AI hypotheses to accelerate Mean Time to Acknowledge (MTTA) and Mean Time to Resolve (MTTR).

```
+-----------------------------------------------------------------------------------+
|                                  AEGISOPS AI                                      |
|                                                                                   |
|  +--------------------+         REST / WebSocket        +---------------------+   |
|  |  Next.js Frontend  | <=============================> |   NestJS Core API   |   |
|  |   (apps/web)       |                                 |    (apps/api)       |   |
|  +--------------------+                                 +----------+----------+   |
|                                                                    |              |
|                     +----------------------+-----------------------+              |
|                     |                      |                       |              |
|                     v                      v                       v              |
|           +-------------------+   +------------------+   +--------------------+   |
|           |  PostgreSQL 16    |   |  Redis 7 Key/Val |   | FastAPI AI Engine  |   |
|           | (Business Truth)  |   | (Queue / PubSub) |   | (apps/ai-service)  |   |
|           +-------------------+   +--------+---------+   +--------------------+   |
|                                            |                                      |
|                                            v                                      |
|                                  +-------------------+                            |
|                                  |  BullMQ Worker    |                            |
|                                  |  (apps/worker)    |                            |
|                                  +-------------------+                            |
+-----------------------------------------------------------------------------------+
```

---

## 2. Major Components & Responsibilities

### 2.1 Web Frontend (`apps/web`)
* **Technology**: Next.js 15, React 19, Tailwind CSS, Lucide Icons, TanStack Query.
* **Responsibilities**:
  * Render high-density SRE operational dashboards, service health matrices, and incident workspaces.
  * Subscribe to real-time incident lifecycle events via WebSockets.
  * Visual separation between observed facts, AI hypotheses, and confirmed root causes.
* **Boundary**: Communicates **only** with the NestJS Core API (`apps/api`). Never accesses PostgreSQL, Redis, or the Python AI service directly.

### 2.2 Core Business API (`apps/api`)
* **Technology**: Node.js, NestJS 10, TypeScript, Prisma ORM, WebSockets, OpenAPI/Swagger.
* **Responsibilities**:
  * Acts as the authoritative business engine and tenant gatekeeper.
  * Enforces multi-tenancy, authentication, and backend Role-Based Access Control (RBAC).
  * Manages Service Catalog, Alert Rules, Incident state machine, Audit logs, and Evidence assembly.
  * Enqueues async tasks to BullMQ (via Redis) and invokes the Python AI Service over internal HTTP.
* **Boundary**: Owns relational business persistence (PostgreSQL) and transient event dispatch.

### 2.3 Background Worker (`apps/worker`)
* **Technology**: Node.js, TypeScript, BullMQ, Redis.
* **Responsibilities**:
  * Decouples long-running, scheduled, or retry-heavy tasks from client request/response cycles.
  * Periodic rule evaluation, metric rollups, alert deduplication windows, email/webhook delivery, dead-letter handling.
* **Boundary**: Consumes job queues managed by Redis; reports results and status back to persistent stores.

### 2.4 AI Engine & Anomaly Service (`apps/ai-service`)
* **Technology**: Python 3.12, FastAPI, scikit-learn, Pydantic v2.
* **Responsibilities**:
  * Unsupervised metric anomaly detection using Isolation Forest across rolling statistical windows (mean, standard deviation, rate of change, percentiles).
  * Structured incident reasoning and Root-Cause Analysis (RCA) hypothesis generation based strictly on retrieved evidence packages.
* **Boundary**: Isolated behind a clean, typed REST API (`/health`, `/api/v1/anomaly/score`, `/api/v1/rca/hypothesize`).

---

## 3. Data Ownership & Storage Principles

| Data Tier | Technology | Ownership & Lifecycle |
| :--- | :--- | :--- |
| **Durable Business Truth** | PostgreSQL 16 (Prisma ORM) | Organizations, users, memberships, services, environments, alert definitions, incidents, timeline events, AI findings, audit events. Strictly transactional and ACID compliant. |
| **Transient State & Queues** | Redis 7 Alpine | BullMQ job queues, rate-limiting tokens, session cache, WebSocket pub/sub messaging channels. Ephemeral lifecycle. |
| **Time-Series Telemetry** | Prometheus & OTel Collector | High-frequency metric samples, counter/gauge points, request latency distributions. Bounded retention. |

---

## 4. Communication Boundaries & Protocols

1. **Client to Backend**: REST for standard CRUD operations; WebSockets (Socket.io/ws via NestJS Gateway) for instant push updates (e.g., `incident.created`, `alert.fired`, `service.health.changed`).
2. **Backend to AI Service**: Synchronous internal HTTP REST with strict Pydantic/DTO schema contracts, explicit timeouts, and circuit breaking.
3. **Backend to Worker**: Asynchronous queue dispatch over Redis using BullMQ jobs with idempotency keys and exponential backoff retry policies.

---

## 5. AI Boundary & Operational Guardrails

AegisOps AI strictly avoids decorative chatbots and ungrounded LLM hallucinations by enforcing these four architectural laws:

1. **Evidence Retrieval First (Grounding)**: The LLM receives a bounded, structured context package extracted from real telemetry and incident history. It is never allowed to fabricate unobserved infrastructure facts.
2. **Tri-State Epistemic Segregation**:
   * **Observed Fact**: Empirically recorded metric shifts, HTTP status codes, error traces, deploy logs.
   * **AI Hypothesis**: Statistically ranked possibilities generated by ML/LLM models, explicitly tagged with confidence (`low`, `medium`, `high`) and supporting evidence IDs.
   * **Human-Confirmed Root Cause**: The verified resolution recorded and approved by the on-call SRE.
3. **Zero Autonomous Destruction**: The AI engine cannot unilaterally execute remediation or modify production infrastructure without explicit human approval gates.
4. **Data Sanitization & Redaction**: All incoming logs and traces pass through a token/credential redaction pipeline prior to being passed to ML models or external LLM providers.

---

## 6. Security Principles & Multi-Tenancy

* **Tenant Isolation**: Every query and mutation is strictly scoped to the authenticated user\'s `organizationId`.
* **Backend RBAC**: Roles (`OWNER`, `ADMIN`, `ENGINEER`, `VIEWER`) are evaluated via NestJS guards on every protected route.
* **Secret Protection**: Zero hardcoded secrets; configuration validated on startup via `.env.example` templates; API keys hashed before storage.
* **Audit Integrity**: All privileged mutations (role changes, rule updates, incident state transitions) generate immutable `AuditEvent` records.

---

## 7. Observability Strategy

* **OpenTelemetry Instrumentation**: Distributed tracing and standard metric conventions.
* **Health & Readiness Probes**: Every tier (`apps/web`, `apps/api`, `apps/ai-service`, `apps/worker`) provides `/health`, `/ready`, and `/live` endpoints for automated orchestration checks.
* **Structured JSON Logging**: Standardized correlation IDs propagated across HTTP requests, background jobs, and AI queries.
