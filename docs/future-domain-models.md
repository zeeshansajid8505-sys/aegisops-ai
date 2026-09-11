# AegisOps AI — Future Domain Models & Schema Map

> **Notice**: As dictated by Phase 0 engineering constraints, this document freezes the data architecture for future phases. These models will be implemented systematically during Phase 2 (Authentication & Tenancy) and subsequent domain milestones.

---

## 1. Domain Entities & Database Mapping

```
+------------------+         +------------------+         +------------------+
|   Organization   | 1 --- * |    Membership    | * --- 1 |       User       |
+--------+---------+         +------------------+         +------------------+
         |
         +--- 1:N ---> [ Team ]
         +--- 1:N ---> [ Service ] ------------+
         +--- 1:N ---> [ AlertRule ] ----------+--- 1:N ---> [ AlertEvent ]
         +--- 1:N ---> [ Incident ] <----------+                   |
         |                   |                                     |
         |                   +--- 1:N ---> [ IncidentAlert ] <-----+ (Many-to-Many)
         |                   +--- 1:N ---> [ IncidentTimelineEvent ]
         |                   +--- 1:N ---> [ IncidentEvidence ]
         |                   +--- 1:N ---> [ AIFinding ]
         |                   +--- 1:1 ---> [ Postmortem ]
         |
         +--- 1:N ---> [ NotificationTarget ] --- 1:N ---> [ NotificationDelivery ]
         +--- 1:N ---> [ AuditEvent ]
```

---

## 2. Entity Specifications

### 2.1 Tenancy & Identity
* **`Organization`**: Tenant boundary. Holds org slug, display name, tier, plan limits, and timestamps.
* **`User`**: Global user identity. Email, hashed password, MFA settings, full name, avatar, account lockout counters.
* **`Membership`**: Relates `User` to `Organization` with specific role (`OWNER`, `ADMIN`, `ENGINEER`, `VIEWER`) and invited/active state.
* **`Team`**: Optional functional group within an organization (e.g. "Platform SRE", "Checkout Backend") for alert routing.

### 2.2 Service Catalog & Telemetry
* **`Service`**: Monitored software system or microservice. Holds name, slug, description, tier (Tier-1 critical, Tier-2, Tier-3), repository URL, team ownership.
* **`ServiceEnvironment`**: Specific deployment target (`production`, `staging`, `canary`) with endpoint URL and health check config.
* **`TelemetrySource`**: API keys or collector tokens used by external demo agents or OTel Collectors to push metrics/logs.

### 2.3 Detection & Alerts
* **`AlertRule`**: Threshold or ML anomaly definition. Metric name, comparator (`GT`, `LT`, `EQ`), threshold value, evaluation window (minutes), severity (`SEV-1` to `SEV-4`), cooldown duration, enabled state.
* **`AlertEvent`**: Individual alert firing record. Timestamp, triggered value, threshold at trigger, status (`FIRING`, `RESOLVED`), fingerprint hash.

### 2.4 Incident Lifecycle
* **`Incident`**: Correlated operational incident. Title, summary, severity (`SEV-1` to `SEV-4`), status (`OPEN`, `ACKNOWLEDGED`, `INVESTIGATING`, `MITIGATED`, `RESOLVED`), assignee user ID, MTTA, MTTR metrics.
* **`IncidentAlert`**: Join table linking multiple `AlertEvent` records to a parent `Incident`.
* **`IncidentTimelineEvent`**: Sequential audit timeline (alerts fired, status changes, engineer comments, AI analysis generation, resolution notes).
* **`IncidentEvidence`**: Snapshots of metrics, log excerpts, trace IDs, and deployment diffs captured around the incident start time.

### 2.5 AI Findings & SRE Learning
* **`AIFinding`**: Structured output from the AI incident analyst. Stored hypotheses, evidence reference IDs, recommended investigation steps, confidence score, model version.
* **`Postmortem`**: Human-reviewed learning document. Root cause, contributing factors, timeline summary, preventative action items, signed off by SRE owner.

### 2.6 Notifications & Audit
* **`NotificationTarget`**: Webhook URLs (Slack, Discord, PagerDuty) or email distribution lists.
* **`NotificationDelivery`**: Delivery attempt status (`PENDING`, `DELIVERED`, `FAILED`), retry count, response payload, error message.
* **`AuditEvent`**: Tamper-evident log of privileged actions (role grants, rule adjustments, incident status mutations).

---

## 3. Indexing & Integrity Strategies

1. **Multi-Tenant Composite Indexes**:
   * `(organization_id, status)` on `incidents` for rapid active incident querying.
   * `(service_id, environment)` on `services` and `alert_rules`.
2. **Time-Series Ordering Indexes**:
   * `(incident_id, created_at ASC)` on `incident_timeline_events`.
   * `(organization_id, created_at DESC)` on `audit_events`.
3. **Correlation Fingerprint Indexes**:
   * `(organization_id, fingerprint, status)` on `alert_events` to power O(1) deduplication lookups.
