# AegisOps AI — Live Demonstration Scripts

This document provides structured walkthrough scripts for presenting **AegisOps AI** across three different time budgets and audience profiles:
1. **60-Second Recruiter / Executive Summary**
2. **5-Minute Full-Stack Engineering Walkthrough**
3. **10-Minute Deep Technical SRE & System Design Defense**

---

## Script 1: 60-Second Recruiter / Executive Demo

**Goal**: Deliver a memorable, high-impact overview of problem, solution, and technical craftsmanship.

> "AegisOps AI is a production-grade Site Reliability Engineering and incident response platform. In modern microservice architectures, when an outage occurs, engineers are flooded with alert noise and lose critical minutes trying to figure out which downstream service caused the failure.
>
> AegisOps solves this by ingesting OpenTelemetry metrics, evaluating sliding-window alert rules, and applying topological correlation to group cascading alert storms into a single unified incident.
>
> It then uses an evidence-grounded Python AI microservice to analyze telemetry snapshots and propose root-cause hypotheses—strictly bounded by supplied operational evidence, reducing unsupported conclusions.
>
> Responders execute interactive runbooks right from the console, resolve the issue, and the system automatically updates reliability metrics (MTTA/MTTR) and drafts an audit-ready postmortem with action items.
>
> The stack uses Next.js 15, NestJS 10, PostgreSQL with over 90 composite indexes, Redis with BullMQ queues, and Python FastAPI with Isolation Forest machine learning.
>
> *(Note: All live demo data represents a deterministic synthetic demonstration scenario).*"

---

## Script 2: 5-Minute Engineering Walkthrough

**Goal**: Demonstrate the end-to-end incident engineering lifecycle through the user interface.

### Step 1: Service Catalog & Dependency DAG (1 min)
1. Navigate to **Services** (`/services`).
2. Show the service registry: `checkout-api` (Tier 1 API), `payment-gateway`, `orders-worker`, `inventory-api`.
3. Open `checkout-api` and switch to the **Dependencies** tab.
4. Point out the directed acyclic graph (DAG): `checkout-api -> payment-gateway`.
5. Explain: *"Our backend runs cycle-detection on every dependency update using an in-memory BFS to prevent deadlocks."*

### Step 2: Observability & Anomaly Detection (1 min)
1. Navigate to the **Observability** tab on `checkout-api`.
2. Highlight metric charts: `http.server.request.duration` (P99 latency).
3. Point out the **Anomaly Finding**: *"Notice the anomaly indicator at 14:02 UTC. Our Python AI service continuously evaluates telemetry using an Isolation Forest model, detecting a +1100% P99 divergence before threshold alerts even fired."*

### Step 3: Alert Engine & Correlation (1 min)
1. Navigate to **Alerts** (`/alerts`).
2. Show active alert rules: `Payment Gateway High Latency P99` and `Checkout Service Error Rate High`.
3. Explain the state machine: *"Alerts transition through INACTIVE -> PENDING -> FIRING -> RESOLVED with hysteresis hold times to prevent flapping."*
4. Show how 4 related alerts were automatically correlated into a single incident based on dependency topology.

### Step 4: Incident Command Console & AI RCA (1 min)
1. Navigate to **Incidents** (`/incidents`) and open `[checkout-api] Upstream Payment Gateway Latency Degradation`.
2. Point out the **Evidence-Grounded AI Root Cause Analysis**:
   - Primary Hypothesis: *"Third-party payment gateway endpoint timeout causing cascading thread pool exhaustion on checkout-api."*
   - Confidence: **92% (High)**.
   - Explain AI Safety: *"Notice that the AI cannot declare a root cause—it only presents a hypothesis with supporting telemetry evidence. Only the human Incident Commander can confirm the root cause."*
3. Show the **Interactive Runbook**: *"Investigate Upstream Latency"* with 5 completed steps.

### Step 5: Reliability Metrics & Postmortem (1 min)
1. Navigate to **Overview** (`/`).
2. Show MTTA (Mean Time to Acknowledge), MTTR (Mean Time to Resolve), and service availability rollups.
3. Open the **Approved Postmortem**:
   - Executive summary, timeline, root cause, contributing factors.
   - 3 tracked Action Items with assignees and due dates.
   - Immutable revision history v1.

---

## Script 3: 10-Minute Deep Technical & System Design Defense

**Goal**: Walk a senior engineering interviewer through architecture, concurrency, security, and trade-offs.

### Key Discussion Points:
1. **Monolith vs Microservices**: Why NestJS modular monolith over microservices? (Eliminates distributed transaction complexity, network serialization latency, and complex deployment coordination while maintaining clean domain boundaries).
2. **Python AI Boundary**: Why isolate Python in FastAPI? (Allows scikit-learn, numpy, and scientific libraries to run in their native runtime while keeping the core business API type-safe in TypeScript).
3. **Queue Architecture**: How BullMQ handles distributed locks, backpressure, and exponential backoff retry policies.
4. **Database Indexing**: Explain the rationale behind the 90+ composite indexes in Prisma schema (`organizationId + status`, `serviceId + environmentId`, `seriesId + timestamp DESC`).
5. **Security Controls**: Walk through the 18/18 verified security tests: CSRF Origin guard, session cookie hardening (HttpOnly, SameSite), auth rate limiting (sliding window), and SSRF validation against cloud metadata.

