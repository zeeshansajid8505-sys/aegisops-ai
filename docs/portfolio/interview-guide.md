# AegisOps AI — Technical Interview Preparation & Architecture Defense Guide

This guide is designed to help defend the architecture, system design, and technical trade-offs of **AegisOps AI** during technical interviews for Senior Full-Stack, Backend, Distributed Systems, SRE, and AI/ML Engineering roles.

---

## 1. The Core Narrative: Why Did You Build AegisOps AI?

**Interviewer**: *"Tell me about a complex project you built and the engineering problems it solved."*

**Your Answer**:
> "In modern cloud architectures, microservices emit thousands of metric samples, traces, and logs per second. When an outage occurs, on-call responders suffer from **context fragmentation** and **alert storms**: dozens of downstream alerts fire simultaneously for a single root issue.
>
> I built **AegisOps AI** as an automated SRE control plane that closes the loop from signal to resolution:
> 1. Ingests OpenTelemetry metric telemetry and executes sliding-window alert rules.
> 2. Automatically groups cascading alert storms into a single unified incident using service dependency graph (DAG) topology.
> 3. Uses an isolated Python AI microservice to analyze telemetry snapshots and propose root-cause hypotheses—strictly bounded by supplied operational evidence to reduce unsupported conclusions.
> 4. Guides responders through interactive operational runbooks with step verification.
> 5. Tracks real-time reliability analytics (MTTA/MTTR) and generates audit-compliant postmortems with assignable action items."

---

## 2. Architecture & Technology Choices

### Q1: Why a Modular Monolith instead of Microservices?
* **Problem with premature microservices**: Network latency on internal calls, distributed transactions, eventual consistency race conditions, and heavy DevOps overhead.
* **Why NestJS Modular Monolith**: NestJS enforces strict module boundaries, dependency injection, and encapsulated domain services. The 24 business modules in AegisOps interact through strongly-typed TypeScript interfaces and in-process function calls, keeping P95 latency under 50ms while remaining cleanly separable into standalone microservices when team scale demands it.

### Q2: Why isolate the AI/ML Engine in a Python FastAPI Microservice?
* **Language ergonomics**: Python is the lingua franca of data science. Libraries like `scikit-learn`, `numpy`, and `pandas` provide battle-tested implementations of Isolation Forest, whereas Node.js ML libraries are immature or unmaintained.
* **Resource isolation**: Model training and mathematical matrix computations are CPU-intensive. Running them in a dedicated Python container prevents blocking the Node.js event loop.
* **Typed Contract**: Communication between NestJS and FastAPI occurs over HTTP REST using strict Pydantic schemas and shared TypeScript interfaces, secured by machine-to-machine internal API keys.

### Q3: Why Redis and BullMQ for Background Jobs?
* **Sliding-window metric rate limiting**: Redis sorted sets (`ZADD`/`ZREMRANGEBYSCORE`) enable sub-millisecond sliding-window rate limiters.
* **Distributed locks**: Alert rule evaluations require concurrency protection across worker instances. Redis distributed locks (`lock:alert-rule:<ruleId>`) with atomic Lua token release prevent duplicate alert evaluations.
* **BullMQ**: Provides robust Redis-backed job queues with exponential backoff retries, delayed execution, and dead-letter queues without requiring the operational complexity of Apache Kafka.

### Q4: Why PostgreSQL with Prisma ORM?
* **Relational business truth**: Organizations, memberships, services, incidents, and audit logs require strict ACID guarantees and foreign key constraints.
* **90+ Composite Indexes**: High-velocity queries filter by `organizationId + status`, `serviceId + environmentId`, and `seriesId + timestamp DESC`. Composite B-tree indexes ensure all queries execute in single-digit milliseconds.
* **Prisma ORM**: Provides end-to-end type safety from the database schema to TypeScript controllers, eliminating runtime query typos.

---

## 3. Deep Technical Dives

### Q5: How do you constrain AI hypotheses during Root Cause Analysis (RCA) to prevent hallucination?
* **Evidence-Grounding Law**: The AI model is NEVER asked to reason in the abstract. AI hypotheses are strictly constrained by supplied operational evidence.
* **Pipeline**:
  1. The incident trigger triggers the `RcaEvidenceBuilder` in NestJS.
  2. The builder extracts an **evidence snapshot**: linked firing alerts, metric anomalies (+1100% P99 latency divergence), recent deployments, and service dependency edges.
  3. The snapshot is serialized into a deterministic JSON payload with a SHA-256 fingerprint.
  4. FastAPI evaluates the evidence against graph topology and returns ranked hypotheses, each linked to specific evidence IDs.
* **Tri-State Epistemic Segregation**:
  - **Observed Fact**: Empirically recorded metric points and HTTP error codes.
  - **AI Hypothesis**: Statistically ranked possibilities with explicit confidence scores.
  - **Human-Confirmed Root Cause**: The verified cause recorded and signed off by the on-call SRE.

### Q6: How does Unsupervised Anomaly Detection work with Isolation Forest?
* **Algorithm**: Isolation Forest isolates anomalies by randomly selecting a feature and split value. Because anomalies require fewer splits to isolate, they appear closer to the root of the decision trees.
* **Feature Schema**: Rolling 5-minute windows extract 4 statistical features: `mean`, `p99_latency`, `rate_per_sec`, and `variance`.
* **Lifecycle**: Models are trained on historical baseline telemetry (minimum 30 windows), serialized into joblib artifacts, hashed (`artifactHash`), and stored in PostgreSQL with versioning (`AnomalyModelVersion`).
* **Important Distinction**: Anomaly Score (0.0 to 1.0) represents mathematical divergence from normal distribution—it is **NOT** a probability of outage.

### Q7: How is Multi-Tenant Isolation enforced?
* **Defense-in-Depth**:
  1. **Session Context**: The authenticated user's active `organizationId` is extracted from the cryptographic session token by `AuthGuard`.
  2. **Prisma Query Scoping**: Every database query explicitly includes `{ where: { organizationId } }`.
  3. **Identifier Substitution Defense**: If an attacker belonging to Org A crafts a request to `/v1/organizations/Org-A/services/<svc-id-belonging-to-Org-B>`, the query returns `404 Not Found` because the record does not match both IDs.
  4. **Automated Verification**: Covered by an automated 18-test tenant isolation and RBAC test suite (`scratch/test-tenant-and-rbac.mjs`) verifying zero cross-tenant leakage.

### Q8: What was the most challenging engineering problem you solved?
* **Alert Deduplication and Flapping Control**:
  * During a high-frequency metric spike, an alert condition might oscillate across threshold boundaries. Without hysteresis, this creates an alert storm of hundreds of firing/resolved events.
  * **Solution**: Engineered a 4-state deterministic finite state machine (`INACTIVE`, `PENDING`, `FIRING`, `RESOLVED`) with a configurable pending evaluation duration (e.g., must stay above threshold for 2 consecutive cycles) and a recovery hold duration (`clearCandidateAt`) before resolving. Alerts are deduplicated using a deterministic SHA-256 fingerprint (`hash(orgId, ruleId, metricTarget)`), ensuring exactly one active alert instance exists per failure scenario.

---

## 4. Architectural Trade-offs & Production Scaling

| Decision | Trade-off Made | Why it was the Right Choice | What changes at 100x Scale? |
| :--- | :--- | :--- | :--- |
| **BullMQ vs Kafka** | BullMQ has lower partition throughput than Kafka. | BullMQ requires only Redis, drastically simplifying deployment and local operations. | At 100,000 events/sec, ingest partition pipelines move to Kafka or AWS Kinesis. |
| **Monolith vs Microservices** | Single deployment artifact; cannot scale individual route modules independently. | Eliminates network serialization overhead and distributed transaction failures; development velocity is 5x faster. | Extract Telemetry Ingestion and Alert Evaluation into dedicated stateless container clusters. |
| **PostgreSQL vs TimescaleDB** | Standard PostgreSQL requires careful index planning for time-series data. | Standard PostgreSQL runs in any managed cloud with zero proprietary extensions. | Introduce TimescaleDB hypertables or ClickHouse for multi-billion metric point retention. |
| **Single-Region Deployment** | Cross-region failover requires multi-region database replication. | Single-region keeps operational complexity manageable for a portfolio-grade system. | Add multi-region read replicas with CockroachDB or AWS Aurora Global Database. |

