# AegisOps AI — Architecture Decision Records (ADRs)

Architecture Decision Records (ADRs) capture critical technical choices, architectural context, alternatives evaluated, and the rationale behind each foundational decision made throughout the engineering of **AegisOps AI**.

---

## Index of Architecture Decision Records

| ADR | Title | Status | Primary Rationale |
| :--- | :--- | :--- | :--- |
| **[ADR-001](ADR-001-modular-core-backend-over-microservices.md)** | Modular Core Backend over Microservices | Accepted | Avoid distributed transaction and network hop overhead; enforce modular domain boundaries in a unified NestJS codebase. |
| **[ADR-002](ADR-002-nextjs-for-operational-web-interface.md)** | Next.js for Operational Web Interface | Accepted | Server/Client boundary separation, rapid developer velocity, and optimized production bundle compilation. |
| **[ADR-003](ADR-003-nestjs-for-core-business-api.md)** | NestJS for Core Business API | Accepted | Enterprise dependency injection, modular architectural discipline, built-in validation pipelines, and native WebSocket support. |
| **[ADR-004](ADR-004-postgresql-for-relational-business-truth.md)** | PostgreSQL for Relational Business Truth | Accepted | ACID transactional guarantees, foreign key cascade safety, robust JSON querying, and schema migrations via Prisma ORM. |
| **[ADR-005](ADR-005-redis-and-bullmq-for-async-jobs-and-coordination.md)** | Redis & BullMQ for Async Jobs & Coordination | Accepted | Sub-millisecond sliding-window metric rate limiting, distributed locking, pub/sub synchronization, and reliable job queuing. |
| **[ADR-006](ADR-006-fastapi-python-boundary-for-ai-workloads.md)** | FastAPI Python Boundary for AI Workloads | Accepted | Isolate scientific libraries (scikit-learn, 
umpy, pandas) in dedicated Python environment behind typed REST contracts. |
| **[ADR-007](ADR-007-opentelemetry-and-prometheus-observability-architecture.md)** | OpenTelemetry Observability Architecture | Accepted | Industry-standard vendor-neutral telemetry ingestion protocols (OTLP/HTTP) with high-throughput Protobuf parsing. |
| **[ADR-008](ADR-008-websockets-for-real-time-incident-coordination.md)** | WebSockets for Real-Time Incident Coordination | Accepted | Low-latency bi-directional state synchronization for incident response rooms, avoiding polling overhead. |
| **[ADR-009](ADR-009-docker-compose-reproducible-local-infrastructure.md)** | Docker Compose Reproducible Local Infrastructure | Accepted | Deterministic local development environment with version-pinned PostgreSQL 16 and Redis 7 containers. |
| **[ADR-010](ADR-010-session-based-authentication.md)** | Session-Based Authentication & Multi-Tenancy | Accepted | Opaque session tokens with SHA-256 hash storage, Argon2id password hashing, and strict organization tenant scoping. |
| **[ADR-011](ADR-011-service-catalog-and-dependency-model.md)** | Service Catalog & Directed Dependency Model (DAG) | Accepted | Graph modeling of microservices with in-memory BFS cycle detection preventing circular dependency deadlocks. |
| **[ADR-012](ADR-012-active-health-probe-architecture.md)** | Active Synthetic Health Probe Architecture | Accepted | Scheduled synthetic probes with hysteresis failure thresholds preventing flapping alerts, protected by SSRF boundaries. |
| **[ADR-013](ADR-013-otlp-metrics-ingestion-buffers-and-aggregations.md)** | OTLP Ingestion Buffers & 1-Minute Aggregations | Accepted | Redis sliding-window hot telemetry buffers paired with BullMQ batch rollups (min, max, vg, p50, p90, p99). |
| **[ADR-014](ADR-014-machine-telemetry-authentication-and-cardinality-protection.md)** | Machine Telemetry Authentication & High-Cardinality Protection | Accepted | Scoped machine ingest keys with 256-bit entropy and 5,000 distinct series cardinality caps per environment. |
| **[ADR-015](ADR-015-alert-rule-evaluation-state-machine-and-deduplication.md)** | Alert Rule State Machine & Deduplication | Accepted | Pure comparison evaluators with grace delays, SHA-256 fingerprint deduplication, and atomic Redis distributed locks. |
| **[ADR-016](ADR-016-incident-correlation-and-command-model.md)** | Incident Correlation & Operational Command Model | Accepted | Topological dependency correlation scoring reducing alert noise by grouping downstream symptoms into unified incidents. |
| **[ADR-017](ADR-017-professional-operations-ux-motion-and-realtime.md)** | Professional Operations UX & Real-Time Motion | Accepted | High-density dark theme SRE console with purposeful status animations, keyboard shortcuts, and component error boundaries. |
| **[ADR-018](ADR-018-ai-assisted-rca-and-remediation-runbooks.md)** | AI-Assisted RCA & Interactive Runbooks | Accepted | Evidence-grounded root cause hypothesis generation bounded by retrieved telemetry snapshots; human-in-the-loop confirmation. |
| **[ADR-019](ADR-019-unsupervised-telemetry-anomaly-detection-and-isolation-forest-lifecycle.md)** | Isolation Forest ML Anomaly Detection Engine | Accepted | Unsupervised metric anomaly scoring, model versioning, feature window extraction, artifact hashing, and backtesting. |
| **[ADR-020](ADR-020-operational-notifications-secure-integrations-and-reliable-delivery.md)** | Operational Notifications, Integrations & Delivery | Accepted | Multi-channel delivery engine (Slack, Webhook, Email) with HMAC-SHA256 signatures, AES-256-GCM encryption, and dead-letter queues. |
| **[ADR-021](ADR-021-reliability-analytics-rollups-and-evidence-grounded-postmortems.md)** | Reliability Analytics Rollups & Postmortems | Accepted | Automated SRE metrics (MTTA/MTTI/MTTR), service SLO rollups, and audit-compliant postmortems with action item lifecycles. |