# AegisOps AI — Platform Interface Architecture & Visual Showcase

This directory documents the primary user interfaces, component hierarchies, and visual workflows of the **AegisOps AI** platform.

---

## 01. Overview Dashboard (`/`)
High-density operational HUD providing real-time system health, active alert counts, open incident summaries, and rolling MTTA/MTTR reliability metrics.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  AEGISOPS AI   [Overview]  [Services]  [Alerts]  [Incidents]  [Settings]   (Org: Demo) │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  SYSTEM HEALTH: ● HEALTHY    SERVICES: 5/5 ONLINE    ACTIVE INCIDENTS: 0    MTTR: 27m │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────┐  ┌───────────────────────────┐  ┌─────────────────────┐ │
│  │ Active Services (5)       │  │ Firing Alerts (0)         │  │ Reliability Trend   │ │
│  │ • checkout-api      [T1]  │  │ All signal thresholds     │  │ MTTA: 300s          │ │
│  │ • payment-gateway   [T1]  │  │ within normal tolerances. │  │ MTTI: 244s          │ │
│  │ • orders-worker     [T2]  │  │                           │  │ MTTR: 1622s         │ │
│  │ • inventory-api     [T2]  │  │                           │  │ Availability: 99.8% │ │
│  └───────────────────────────┘  └───────────────────────────┘  └─────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 02. Service Observability & Dependency Graph (`/services`)
Service catalog featuring service tiers (`TIER_1`, `TIER_2`), lifecycle states, active synthetic probe health cards, and directed dependency DAG mapping.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  SERVICES > checkout-api  [Tier 1 API] [ACTIVE] [Owner: Checkout Squad]               │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  [Overview]  [Dependencies (DAG)]  [Active Probes]  [Alerts]  [Telemetry Metrics]      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  DIRECTED DEPENDENCY GRAPH (Cycle-Validated BFS):                                      │
│                                                                                        │
│     ┌─────────────────┐                                                                │
│     │  checkout-api   │ ───────────────┐                                               │
│     └────────┬────────┘                ▼                                               │
│              │                 ┌─────────────────┐                                     │
│              ▼                 │  inventory-api  │                                     │
│     ┌─────────────────┐        └─────────────────┘                                     │
│     │ payment-gateway │                                                                │
│     └─────────────────┘                                                                │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 03. Alert Engine & Rule Evaluator (`/alerts`)
Deterministic alert rules featuring sliding-window aggregators (`AVG`, `P99`, `RATE`), SHA-256 fingerprint deduplication, and 4-state finite state machine (`INACTIVE`, `PENDING`, `FIRING`, `RESOLVED`).

---

## 04. Incident Command Console (`/incidents`)
Unified incident triage workspace with live WebSocket synchronization, timeline events, responder delegation, and severity escalation.

---

## 05. AI-Assisted Root Cause Analysis (RCA)
Evidence-grounded hypothesis generation isolated in Python FastAPI, strictly bounded by retrieved operational telemetry snapshots.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  AI ROOT CAUSE ANALYSIS — INC-DEMO-9300 [STATUS: COMPLETED]                            │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  PRIMARY HYPOTHESIS:                                                                   │
│  "Third-party payment gateway endpoint timeout causing cascading thread pool            │
│   exhaustion on checkout-api workers."                                                 │
│                                                                                        │
│  Confidence: 92% (HIGH)   Reasoning Code: TOPOLOGICAL_UPSTREAM_PROPAGATION             │
│                                                                                        │
│  BOUNDED EVIDENCE ANCHORS:                                                             │
│  • [ALT-842] Payment Gateway High Latency P99 fired at 14:03 UTC                       │
│  • [ANOM-104] Isolation Forest divergence: observed 1420ms vs 118ms baseline (+1100%)    │
│  • [DEP-01] DAG Edge: checkout-api depends on payment-gateway                          │
│                                                                                        │
│  [Confirm as Root Cause]   [Reject Hypothesis]   [Execute Recommended Runbook]         │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 06. Isolation Forest Anomaly Detection
Unsupervised metric anomaly scoring extracting 4 rolling statistical features (`mean`, `p99`, `rate`, `variance`), model lifecycle versioning, and backtesting.

---

## 07. Notification Center & Integrations
Multi-channel delivery engine supporting Slack, Webhooks, and Email with HMAC-SHA256 signatures, AES-256-GCM encryption, and dead-letter queues.

---

## 08. SRE Reliability Analytics (MTTA/MTTR)
Automated Site Reliability Engineering metrics tracking Mean Time to Acknowledge (MTTA), Mean Time to Investigate (MTTI), and Mean Time to Resolve (MTTR) across 30-day rolling windows.

---

## 09. Approved Postmortem & Action Items
Audit-compliant postmortem document generator with root-cause confirmation, chronological timeline, lessons learned, immutable revision history, and assignable action items.

---

## 10. Settings & Multi-Tenant RBAC Management
Organization administration, role assignments (`OWNER`, `ADMIN`, `SRE`, `ENGINEER`, `VIEWER`), API key rotation, and security audit event logs.

