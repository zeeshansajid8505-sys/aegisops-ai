# AegisOps AI — ATS-Optimized Resume & CV Entries

Use these pre-formatted resume sections, bullet points, and portfolio descriptions tailored for Senior Full-Stack Engineer, Backend Engineer, Platform / DevOps Engineer, and SRE job applications.

---

## 1. One-Line Project Summary
> **AegisOps AI**: Production-grade Site Reliability Engineering and incident management platform integrating OpenTelemetry metric ingestion, topological alert correlation, evidence-grounded AI root cause analysis, and automated postmortems across a Next.js 15, NestJS 10, PostgreSQL, Redis, and Python FastAPI distributed architecture.

---

## 2. 3-Bullet Resume Version (Space-Constrained)

* **Architected & deployed** an enterprise-grade Site Reliability Engineering (SRE) platform using **NestJS 10**, **Next.js 15**, **PostgreSQL 16**, and **Redis 7**, reducing Mean Time to Acknowledge (MTTA) through automated sliding-window alert correlation across microservice dependency DAGs.
* **Engineered** an evidence-grounded AI Root Cause Analysis (RCA) and unsupervised anomaly detection engine in **Python FastAPI** utilizing **scikit-learn (Isolation Forest)**, achieving sub-100ms anomaly scoring while constraining AI hypotheses to empirical operational context and requiring human confirmation.
* **Hardened** system security and database performance by designing 90+ composite PostgreSQL indexes (sub-50ms P95 latency under concurrent load), implementing RFC1918/metadata SSRF boundaries, sliding-window auth rate limiters, and 18-test verified multi-tenant RBAC isolation.

---

## 3. 5-Bullet Resume Version (Detailed / Primary Project)

* **Distributed SRE Architecture**: Engineered an end-to-end incident management platform across a modular NestJS monolith, Next.js 15 App Router frontend, and an isolated Python 3.12 FastAPI scientific microservice, managing the full incident lifecycle from signal ingestion to postmortem review.
* **High-Throughput Telemetry Pipeline**: Built an OpenTelemetry-compatible (OTLP/HTTP) metric ingestion receiver with binary Protobuf parsing, Redis sliding-window hot buffers, BullMQ asynchronous 1-minute rollups, and high-cardinality protection (capped at 5,000 series per environment).
* **Machine Learning & AI RCA Guardrails**: Developed an unsupervised metric anomaly detection pipeline using Isolation Forest with automated feature extraction, and an evidence-grounded Root Cause Analysis engine enforcing tri-state epistemic boundaries (Observed Fact, AI Hypothesis, Human-Confirmed Cause).
* **Security & Multi-Tenant Isolation**: Implemented a defense-in-depth security model including Argon2id session authentication, Origin/CSRF verification guards, SSRF protection against cloud metadata endpoints (`169.254.169.254`), AES-256-GCM webhook secret encryption, and verified zero cross-tenant leakage across 18 automated security test suites.
* **Database & Concurrency Optimization**: Optimized PostgreSQL queries via Prisma ORM with over 90 composite B-tree indexes, achieving sub-100ms P95 query latencies and 25-concurrent-request throughput under 600ms wall time; prevented alert flapping through a 4-state deterministic state machine with Redis distributed locks.

---

## 4. Skills & Technologies Section

* **Languages**: TypeScript (Strict), Python 3.12, SQL, HTML5/CSS3.
* **Backend & Systems**: Node.js, NestJS 10, Express, Python FastAPI, BullMQ, Redis 7 (Sorted Sets, Pub/Sub, Distributed Locks), REST, WebSockets (Socket.IO), OpenTelemetry (OTLP/Protobuf).
* **Frontend**: Next.js 15 (App Router, Server/Client Components), React 19, Tailwind CSS, TanStack Query, Lucide Icons.
* **Databases & ORM**: PostgreSQL 16, Prisma ORM, Database Index Optimization (Composite B-Tree), Data Migration Pipelines.
* **Data Science & ML**: scikit-learn (Isolation Forest), NumPy, Pandas, Pydantic v2.
* **DevOps & Testing**: Docker, Docker Compose, GitHub Actions CI/CD, Jest (32 test suites, 219 tests), Pytest (15 tests), Turborepo, pnpm Workspaces.
* **Security & Reliability**: RBAC, Multi-Tenant Data Isolation, CSRF/SSRF Mitigation, Argon2id, AES-256-GCM, MTTA/MTTR Analytics, SRE Runbooks, Postmortems.

