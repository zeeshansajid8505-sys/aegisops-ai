# Changelog

All notable changes to the **AegisOps AI** platform are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-09-09

### Added
- **Core Multi-Tenant Authentication & RBAC**: Session-based authentication with Argon2id password hashing, cryptographically hashed session tokens, organization isolation, and 5-tier role-based access control (OWNER, ADMIN, SRE, ENGINEER, VIEWER).
- **Service Catalog & Dependency Graph (DAG)**: Comprehensive service registry with service tiers, types, lifecycle states, and cycle-detected directed acyclic dependency tracking.
- **Active Synthetic Health Probes**: Scheduled synthetic HTTP/gRPC health probes with multi-threshold hysteresis state machines and SSRF protection.
- **OTLP/HTTP Telemetry Ingestion Engine**: High-throughput OpenTelemetry metric receiver supporting JSON and Protobuf with Redis hot buffers, automated 1-minute aggregations, and cardinality capping.
- **Deterministic Alert Rule Engine**: Sliding-window metric evaluations (AVG, MIN, MAX, SUM, RATE, percentiles P50/P90/P99), SHA-256 fingerprint deduplication, and distributed Redis locking.
- **Incident Lifecycle & Command Console**: Incident correlation from alert storms, state machine (OPEN, INVESTIGATING, MITIGATED, RESOLVED), timeline audit trail, and commander delegation.
- **Evidence-Grounded AI Root Cause Analysis (RCA)**: Python FastAPI scientific microservice generating bounded root-cause hypotheses strictly grounded in retrieved telemetry evidence snapshots.
- **Operational Runbooks**: Structured interactive runbook creation, automated incident step recommendations, and responder execution tracking.
- **Unsupervised ML Anomaly Detection Engine**: Isolation Forest metric anomaly detection with model training lifecycles, artifact hash validation, sensitivity presets, and backtesting.
- **Real-Time WebSocket Operations**: Socket.IO authenticated gateway streaming real-time incident updates, alert state changes, and service health transitions across organization rooms.
- **Enterprise Notification Fan-Out & Integrations**: Multi-channel delivery pipeline supporting Slack, Webhooks, and Email with HMAC-SHA256 signatures, exponential backoff retries, and dead-letter queues.
- **Site Reliability Analytics & Postmortems**: Automated MTTA/MTTI/MTTM/MTTR tracking, service reliability rollups, and audit-compliant postmortems with human approval workflows and action item tracking.
- **Deterministic Demo Dataset Seeder**: pnpm demo:seed CLI script provisioning realistic services, dependencies, active alerts, runbooks, anomaly findings, and approved postmortems.

### Security
- Zero high-severity npm vulnerabilities (all transitive CVEs patched via pnpm.overrides).
- Origin and Referer verification guard (OriginCsrfGuard) blocking cross-site request forgery on mutating session requests.
- Auth rate limiting guard (AuthRateLimiterGuard) enforcing sliding-window brute-force protection (HTTP 429 + Retry-After: 60s).
- Comprehensive Server-Side Request Forgery (SSRF) boundary blocking cloud metadata IP (169.254.169.254), IPv6 variants, link-local, and RFC1918 private subnets.
- Internal machine-to-machine header authentication (x-internal-service-key) securing FastAPI microservice endpoints.
- AES-256-GCM authenticated encryption for webhook signing secrets and integration credentials at rest.
- Automatic redaction of passwords, tokens, API keys, and authorization headers across structured logs and telemetry tags.
- HTTP security headers middleware enforcing X-Content-Type-Options: nosniff, X-Frame-Options: SAMEORIGIN, CSP, and HSTS.

### Performance
- P95 query latencies below 100ms across all core endpoints (GET /services, GET /incidents, GET /alerts, GET /reliability/summary).
- High-concurrency load verification: 25 parallel requests served under 600ms total wall time.
- Over 90 composite database indexes in Prisma schema covering hot query filters, sorting, and foreign keys.
- TanStack Query caching on the frontend with tuned stale times and immediate non-retry on 401/403/404 responses.

### Architecture
- Clean modular monolith pattern in NestJS 10 with clear bounded contexts across 24 business modules.
- Strict isolation of compute-heavy scientific workloads behind a dedicated Python 3.12 FastAPI micro-boundary.
- Asynchronous event-driven background processing via Redis 7 and BullMQ queues with graceful worker lifecycle management.
- Dual-channel communication: REST API for deterministic commands, Socket.IO WebSockets for low-latency operational state synchronization.

### Documentation
- 21 comprehensive Architecture Decision Records (ADR-001 through ADR-021) in docs/adr/.
- Master ADR index in docs/adr/README.md.
- Detailed system architecture specification in docs/architecture/architecture.md.
- Complete production deployment guide in docs/deployment/production-deployment.md.
- Operational demo script covering 60s, 5m, and 10m walkthroughs in docs/demo/demo-script.md.
- Technical interview preparation guide and architectural FAQ in docs/portfolio/interview-guide.md.
- Recruiter and hiring manager case study in docs/portfolio/case-study.md.
- ATS-optimized resume entries and bullet points in docs/portfolio/cv-entry.md.