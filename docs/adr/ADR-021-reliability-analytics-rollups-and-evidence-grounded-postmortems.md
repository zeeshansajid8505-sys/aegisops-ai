# ADR-021: Reliability Analytics Rollups, Metric Mathematical Truth, Evidence-Grounded Postmortems, and Human Approval Workflows

## Status
Accepted

## Context
As AegisOps AI matured through Phase 9 (notification routing, Slack/webhook integrations, and delivery audits), operations teams required longitudinal insights into service reliability, incident response performance, and evidence-grounded postmortem tracking:
1. **Metric Integrity & Truth**: SRE dashboards in industry often suffer from vanity metrics—displaying fabricated "99.99% uptime" or claiming "0ms MTTR" when incidents lack resolution timestamps. Metric calculations must adhere to strict mathematical truth, omitting unrecorded timestamps rather than corrupting averages with zero or imaginary durations.
2. **Percentile Reliability Under Sparse Data**: P50 (median) and P90 metrics can be wildly misleading when calculated over 1 or 2 incidents. A rigorous statistical threshold is required before rendering percentiles to prevent erroneous operational decisions.
3. **High-Performance Querying & Scale**: Dynamically re-aggregating thousands of incident events across arbitrary 7-day, 30-day, and 90-day windows strains relational databases. A rollup strategy is needed that balances historical storage efficiency with real-time accuracy.
4. **Evidence Grounding vs AI Hallucination**: AI assistants can hypothesize potential root causes, but operational postmortems require indisputable, evidence-backed accountability. Human-confirmed root causes must maintain supreme authority over speculative machine hypotheses. AI must never possess authority to self-approve postmortems.
5. **Post-Approval Immutability & Audit Trail**: SRE compliance requires that once a postmortem is formally approved, it cannot be silently modified. Any subsequent edit must capture an immutable revision record, increment the version, and require re-approval.
6. **Navigation Cohesion**: Top-level platform navigation must remain strictly limited to the 5 primary views (`Overview`, `Services`, `Alerts`, `Incidents`, `Settings`) without cluttering the interface with dedicated top-level analytics or reporting tabs.

---

## Decision

### 1. Mathematical Truth in Incident Response Metrics
All response metrics (MTTA, MTTI, MTTM, MTTR) enforce strict mathematical validity:
- **Mean Time to Acknowledge (MTTA)**: $\frac{1}{N_{ack}} \sum (t_{ack} - t_{detected})$ for incidents where $t_{ack} \ge t_{detected}$.
- **Mean Time to Investigate (MTTI)**: $\frac{1}{N_{inv}} \sum (t_{investigating} - t_{detected})$ for incidents where investigation began.
- **Mean Time to Mitigate (MTTM)**: $\frac{1}{N_{mit}} \sum (t_{mitigated} - t_{detected})$ for incidents where mitigation was recorded.
- **Mean Time to Resolve (MTTR)**: $\frac{1}{N_{res}} \sum (t_{resolved} - t_{detected})$ for incidents where resolution was confirmed.
- **Missing Timestamp Handling**: If an incident lacks an acknowledged, mitigated, or resolved timestamp, it is **strictly excluded** from both the numerator and denominator. It does NOT contribute zero seconds or distort the average.
- **Zero-Sample Representation**: If qualifying count $N = 0$, the API explicitly returns `null`. The web UI renders `"N/A"` rather than misleading zero durations.
- **Percentile Threshold Rule ($\ge 5$ Samples)**: P50 and P90 durations are computed using nearest-rank percentile calculation strictly when $N \ge 5$. If $N < 5$, the API returns `null`, and the UI displays `"Insufficient Data"`.

---

### 2. Pre-Aggregated Daily Rollups & Hybrid Query Architecture
- **Schema Model**: `ReliabilityDailyRollup` stores daily counts, duration sums, distributions, and sample counts partitioned by `organizationId`, `serviceId` (nullable for organization-wide rollups), and `bucketDate` (UTC midnight).
- **Unique Idempotency Key**: `rollupKey = "${organizationId}:${serviceId || 'all'}:${YYYY-MM-DD}"`.
- **Hybrid Real-Time Querying**:
  - Historical days within the time range (`7d`, `30d`, `90d`) are fetched directly from indexed `ReliabilityDailyRollup` records.
  - The active current day is computed dynamically on-the-fly from live PostgreSQL incident and alert tables.
  - Results are combined into seamless trend lines and aggregates without requiring batch rollups to execute every second.
- **Scheduled Computation**: BullMQ worker runs periodic background rollup sweeps across all tenant organizations.

---

### 3. Evidence-Grounded Postmortem Generation & Human Authority
- **Deterministic Evidence Collation**: `EvidenceBuilderService` builds a reproducible postmortem evidence bundle:
  - Chronological incident milestones (`detectedAt`, `acknowledgedAt`, `mitigatedAt`, `resolvedAt`).
  - Linked alert episodes, triggering rules, peak severities, and correlation scores.
  - Telemetry anomaly findings detected during the incident window.
  - SRE responder roster, notes, and mitigation commands executed.
  - Deterministic SHA-256 evidence fingerprint (`fingerprint = sha256(incident_events)`).
- **Human Authority Principle**:
  - If a human commander confirmed a root cause during the incident, it is marked as authoritative: `**Confirmed Root Cause (Authoritative)**: <human summary>`.
  - If unconfirmed, the postmortem explicitly notes: `*Root cause not yet confirmed by incident commander.*`
  - AI hypotheses are included strictly in a dedicated `AI-Assisted Diagnostic Context` section, labeled as hypotheses and never presented as verified facts.
  - AI is strictly prohibited from approving postmortems.

---

### 4. Revision Immutability and Approval Workflow
- **Postmortem Status State Machine**:
  `DRAFT` $\rightarrow$ `IN_REVIEW` $\rightarrow$ `APPROVED`.
- **Role-Based Authorization**:
  - `DRAFT` generation and content editing: `OWNER`, `ADMIN`, `SRE`, `ENGINEER`.
  - `APPROVED` action: Restricted strictly to human `OWNER`, `ADMIN`, and `SRE`.
- **Automatic Archival & Version Bumping**:
  - Modifying an `APPROVED` postmortem triggers automatic archival: the current postmortem state, author, and timestamp are saved into `PostmortemRevision`.
  - The active postmortem version increments ($v \rightarrow v + 1$), status resets to `IN_REVIEW`, and `approvedAt` is cleared.

---

### 5. Postmortem Action Items & Preventive Accountability
- **Schema Model**: `PostmortemActionItem` tracks preventive engineering work originating from the postmortem.
- **Attributes**: `title`, `description`, `priority` (`P0`, `P1`, `P2`, `P3`), `status` (`OPEN`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`), `ownerMembershipId`, and `dueDate`.
- **Automatic Completion Tracking**: Setting status to `COMPLETED` automatically records the `completedAt` UTC timestamp; transitioning back to `OPEN` clears `completedAt`.

---

### 6. Seamless Navigation Integration
Primary navigation remains strictly 5 items:
- **`Overview`**: Compact 30-day reliability snapshot card strip below operational summary.
- **`Services -> [Service] -> Reliability`**: Service reliability metrics tab showing MTTA/MTTR trends, P50/P90, severity distributions, and potential recurrence patterns.
- **`Incidents -> [Incident]`**: Postmortem & Action Items panel integrated directly into the Incident Command Console.

---

## Consequences

### Positive
- Metric honesty prevents operational blindness and erroneous executive reporting.
- Fast, scalable time-range queries via indexed daily rollups with zero lag for current-day events.
- Audit-compliant postmortems with verifiable evidence fingerprints and revision histories.
- Human authority guarantees clear accountability without AI overreach.

### Negative / Trade-offs
- Percentiles require at least 5 qualifying samples before displaying, meaning sparse incident services will show "Insufficient Data" rather than estimates.
- Post-approval edits require re-approval by an authorized human SRE or Admin.

