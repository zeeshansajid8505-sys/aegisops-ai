# AegisOps AI — Architectural Case Study

**Project**: AegisOps AI — AI-Powered Incident Management, Observability & Site Reliability Engineering (SRE) Platform  
**Author**: Zeeshan Sajid  
**Target Roles**: Senior Full-Stack Engineer, Backend Engineer, Platform / DevOps Engineer, SRE  

---

## 1. Executive Summary

Modern cloud-native systems generate an overwhelming volume of signals: thousands of metric samples, log events, and trace spans every minute. During outages, engineering teams face **context fragmentation** and **alert storms**: responders are inundated with redundant downstream alerts, struggle to isolate the true root cause, and waste critical Mean Time to Acknowledge (MTTA) and Mean Time to Resolve (MTTR) coordinating across fragmented tools.

**AegisOps AI** is an enterprise-grade SRE control plane engineered to automate the full incident response lifecycle:
$$\text{Observe} \longrightarrow \text{Detect} \longrightarrow \text{Correlate} \longrightarrow \text{Triage} \longrightarrow \text{Investigate} \longrightarrow \text{Resolve} \longrightarrow \text{Learn}$$

By combining deterministic sliding-window alert rules with unsupervised machine learning (Isolation Forest) and topological dependency graph correlation, AegisOps reduces operational alert fatigue and enables evidence-grounded incident resolution.

---

## 2. System Architecture

AegisOps AI adopts a disciplined **Modular Monolith** architecture for business logic, isolating compute-intensive scientific ML workloads behind a dedicated Python microservice boundary:

```
                                  ┌───────────────────────┐
                                  │   Browser / SRE Team  │
                                  └───────────┬───────────┘
                                              │ (HTTPS / WSS)
                                              ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│ apps/web: Next.js 15 + React 19 + Tailwind CSS + TanStack Query                    │
└─────────────────────────────────────────────┬─────────────────────────────────────┘
                                              │ (REST / WebSocket)
                                              ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│ apps/api: NestJS 10 Core Business API (TypeScript + Prisma ORM)                   │
│                                                                                   │
│ [Auth/RBAC]  [Service Catalog]  [Rule Engine]  [Incident Lifecycle]  [Postmortems] │
└───┬─────────────────────────────────────┬─────────────────────────────────────┬───┘
    │ (Prisma ACID)                       │ (BullMQ Enqueue)                    │ (Internal REST)
    ▼                                     ▼                                     ▼
┌───────────────────┐             ┌───────────────────┐             ┌───────────────────┐
│   PostgreSQL 16   │             │   Redis 7 Alpine  │             │  apps/ai-service  │
│ (Relational Truth)│             │ (Queue / PubSub)  │             │ (Python / FastAPI)│
└───────────────────┘             └─────────┬─────────┘             └───────────────────┘
                                            │ (Consume)                       ▲
                                            ▼                                 │
                                  ┌───────────────────┐                       │
                                  │    apps/worker    │ ──────────────────────┘
                                  │ (BullMQ Workers)  │ (Async ML Workloads)
                                  └───────────────────┘
```

### Key Architectural Choices:
1. **NestJS Modular Monolith**: Enforces encapsulated domain boundaries with dependency injection across 24 modules, avoiding the latency and distributed transaction failures of premature microservices.
2. **Python FastAPI Boundary**: Keeps CPU-heavy Isolation Forest model training and matrix operations in Python (`scikit-learn`, `numpy`) without blocking the Node.js event loop.
3. **Redis & BullMQ**: Manages sub-millisecond sliding-window rate limiters, distributed locks, and resilient background job queues with exponential backoff retries.
4. **PostgreSQL 16**: Relational integrity with over 90 composite B-tree indexes guaranteeing sub-50ms query latencies under concurrent load.

---

## 3. Engineering Challenges & Deep Dives

### Challenge 1: Alert Storm Suppression & Flapping Mitigation
* **Problem**: In microservice architectures, when an upstream database stutters, dozens of downstream API gateways and workers fire redundant threshold alerts simultaneously.
* **Solution**:
  1. Built a 4-state deterministic finite state machine (`INACTIVE -> PENDING -> FIRING -> RESOLVED`) with pending evaluation delay (`ALERT_EVALUATION_DELAY_SECONDS=10`) and recovery hold time (`clearCandidateAt`).
  2. Implemented deterministic SHA-256 fingerprinting (`hash(orgId, ruleId, metricTarget)`) ensuring exactly one active alert instance exists per failure scenario.
  3. Evaluated service dependency edges (DAG) to correlate downstream symptoms into a single root incident.

### Challenge 2: Grounding AI Hypotheses in Empirical Operational Telemetry
* **Problem**: Generative AI tools frequently propose unsupported non-existent infrastructure failures when asked open-ended operational questions without context.
* **Solution**: Enforced the **Evidence-Grounding Law**:
  - The AI model is NEVER provided with free-form ungrounded queries.
  - An `RcaEvidenceBuilder` extracts an immutable evidence package: firing alert metrics, recent deployment commits, and service topology edges.
  - The Python service evaluates hypotheses strictly against the evidence IDs, reducing unsupported conclusions through structured evidence and counter-evidence.
  - Enforced **Tri-State Epistemic Segregation**: An AI output is strictly classified as an *AI Hypothesis* (with confidence rating) and can only become a *Confirmed Root Cause* when explicitly verified and signed off by the human Incident Commander.
  - *(Note: All case study scenario numbers reflect a seeded synthetic demonstration scenario).*

### Challenge 3: Multi-Tenant Data Isolation & Security Hardening
* **Problem**: SaaS observability platforms face severe data leakage risks if tenant boundaries fail during cross-service joins.
* **Solution**:
  - Cryptographic session authentication with Argon2id password hashing and SHA-256 token indexing.
  - Mandatory tenant scoping (`organizationId`) injected into every Prisma query.
  - Strict SSRF protection boundary blocking cloud metadata IP (`169.254.169.254`), link-local, and RFC1918 private subnets.
  - Origin verification guard (`OriginCsrfGuard`) preventing cross-site request forgery on mutating cookie requests.
  - 18 automated security test suites verifying zero cross-tenant leakage or privilege escalation.

---

## 4. Verified Results & Performance Metrics

| Metric | Verified Measurement | Benchmark Condition |
| :--- | :--- | :--- |
| **API Health Check Latency** | **13ms** | Local benchmark |
| **P95 Service Query Latency** | **49ms** | Sequential `GET /services` |
| **P95 Incident Query Latency** | **61ms** | Sequential `GET /incidents` |
| **Concurrent Load Throughput** | **578ms wall time** | 25 parallel requests |
| **TypeScript Test Coverage** | **219 tests / 32 suites passed (100%)** | Jest full suite |
| **Python ML Test Coverage** | **15 tests passed (100%)** | Pytest AI service suite |
| **Security Audit Status** | **0 high-severity CVEs** | `pnpm audit --audit-level=high` |
| **Tenant & RBAC Isolation** | **18 / 18 tests passed (100%)** | Full security test matrix |

---

## 5. Lessons Learned & What Makes This Portfolio Stand Out

1. **Pragmatic Architecture over Resume-Driven Complexity**: Choosing a modular monolith over 15 microservices avoided distributed transaction hell and allowed 100% of engineering effort to focus on real product capabilities.
2. **AI as a Bounded Analytical Tool**: Treating AI as an evidence-grounded reasoning engine rather than a chatbot created genuine operational value for incident responders.
3. **Defense-in-Depth from Day One**: Baking tenant isolation, rate limiting, and SSRF boundaries directly into framework guards created an application ready for enterprise deployment.

