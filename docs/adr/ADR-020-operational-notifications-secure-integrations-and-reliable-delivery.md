# ADR-020: Operational Notifications, Secure Integrations, SSRF Protection, and Reliable Delivery Retries

## Status
Accepted

## Context
As AegisOps AI evolved through Phase 8 (telemetry anomaly detection and ML model lifecycles), real-time alerts and incidents were tracked in-memory and visualized within the active dashboard. However, production site reliability engineering demands reliable, multi-channel outbound event routing to page on-call engineers, notify external collaboration systems, and dispatch programmatic webhooks:
1. **Confidential Integration Secrets**: Integrations like Slack Incoming Webhooks and custom HTTP webhook shared secrets must never be stored in cleartext or leaked through REST APIs or server logs.
2. **SSRF and Metadata Exfiltration Risk**: External webhooks and integration test ping endpoints can be manipulated to target internal cloud infrastructure (AWS/GCP/Azure link-local metadata `169.254.169.254`, container runtime endpoints, or internal RFC1918 subnets).
3. **Webhook Authenticity & Tampering**: Outbound webhook consumers need cryptographic proof of authenticity and timestamp freshness to prevent replay attacks.
4. **Alert Storms & Fan-Out Cascades**: Cascading system degradations can trigger hundreds of simultaneous alerts, overwhelming email servers, exceeding external API rate limits (e.g. Slack rate limits), and flooding on-call engineers.
5. **Transient Network Failures & Auditability**: Downstream endpoints experience transient 5xx errors and connection timeouts. SRE teams require delivery traces, status histories, and deterministic exponential retries respecting standard `Retry-After` headers.
6. **Navigation Cohesion**: AegisOps AI enforces a strict 5-item top-level navigation model (`Overview`, `Services`, `Alerts`, `Incidents`, `Settings`). Notifications and Integrations must not pollute primary navigation.

## Decision

### 1. In-App Notification Center & Header Bell
- **User Interface**: Integrated into the global top header via `<NotificationBell />`. Features real-time unread counter badge, popover tray with quick filters, mark-as-read, mark-all-as-read, and deep links into incidents, alerts, or anomaly findings.
- **Sub-Tab Navigation**: Administrative surfaces are housed cleanly under `Settings`:
  - `Settings -> Integrations`: Connection management (Slack, Webhook, Email), webhook URLs, signing secrets, status indicators, and test ping modal.
  - `Settings -> Notification Policies`: Multi-channel dispatch rules, event type filters, minimum severity thresholds, and anti-storm cooldown timers.
  - `Settings -> Delivery History`: Full delivery audit logs with collapsible HTTP response traces, status badges, timestamps, and error diagnostics.
  - `Settings -> Notification Preferences`: User-level channel toggles (In-App, Email, Slack) and individual minimum severity overrides.

### 2. Authenticated Secret Encryption at Rest (AES-256-GCM)
- **Encryption Scheme**: Integration secrets (`webhookUrl`, `signingSecret`) are encrypted at rest using authenticated `AES-256-GCM` with a 96-bit cryptographically random IV (Initialization Vector) and a 128-bit authentication tag.
- **Key Hierarchy**: Master key derived from `INTEGRATION_ENCRYPTION_KEY` environment variable.
- **Zero-Exposure Policy**:
  - Decrypted secrets are NEVER returned by API endpoints.
  - Integration models expose a deterministic `secretMask` (`••••••••` + last 4 characters) for user identification.
  - API responses strictly return the masked string and sanitize all logging output.

### 3. Comprehensive Server-Side Request Forgery (SSRF) Validation
- Outbound delivery and test ping endpoints execute strict IP and DNS validation via `SSRFValidatorService`:
  - Enforces `http:` or `https:` protocols only.
  - Resolves target hostnames against DNS and evaluates all resolved IPv4 and IPv6 addresses.
  - Strictly blocks link-local metadata IP (`169.254.169.254`), loopback addresses (`127.0.0.0/8`, `::1`), private RFC1918 subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), and carrier-grade NAT blocks.
  - An explicit opt-in environment override `WEBHOOK_ALLOW_PRIVATE_TARGETS=true` is provided strictly for local development and integration test suites.

### 4. Cryptographically Signed Outbound Webhooks (HMAC-SHA256)
- Outbound webhook requests carry cryptographic headers:
  - `X-AegisOps-Signature`: HMAC-SHA256 digest (`sha256=<hex_digest>`) calculated over the raw payload string using the integration's decrypted secret.
  - `X-AegisOps-Timestamp`: ISO 8601 UTC timestamp of the delivery dispatch.
  - `X-AegisOps-Event-Id`: Canonical event identifier to facilitate idempotency at the receiver.
  - `Content-Type`: `application/json`.
- Consumers verify payload integrity and freshness, rejecting payloads older than 5 minutes or with mismatched digests.

### 5. Multi-Channel Providers & Slack Block Kit
- **Slack Provider**: Formats incident, alert, and anomaly payloads into structured Slack Block Kit messages with severity-colored banners (`#DC2626` Critical, `#F59E0B` High/Warning, `#10B981` Resolved), context metadata fields, and action buttons linking directly to AegisOps dashboard entities.
- **Email Provider**: Generates clean, responsive HTML operational alert emails containing incident summary, severity badge, affected service, and direct action links.
- **Webhook Provider**: Transmits standardized JSON event envelopes matching `@aegisops/types`.

### 6. Event Routing Policies, Deduplication, & Anti-Storm Cooldown
- **Policy Engine**: Matches incoming operational events (`incident.created`, `incident.severity.updated`, `incident.resolved`, `anomaly.detected`, `anomaly.resolved`) against enabled `NotificationPolicy` rules within the organization.
- **Deduplication Fingerprints**: Evaluates unique fingerprint `event_type:entity_id:severity` to prevent redundant dispatch of identical operational states.
- **Anti-Storm Cooldown**: Configurable per-policy cooldown window (e.g. 300 seconds). Subsequent identical events during active cooldown are suppressed and logged as suppressed without exhausting external provider quotas.

### 7. Reliable Asynchronous Delivery via BullMQ & Bounded Exponential Retries
- Dispatches are enqueued into a dedicated Redis queue: `notification-delivery`.
- **Worker Execution**: `NotificationDeliveryWorker` handles delivery asynchronously, decoupling API response times from downstream network latency.
- **Retry Backoff**:
  - Maximum 3 attempts with bounded exponential backoff ($1\text{s}, 4\text{s}, 16\text{s}$).
  - Respects HTTP 429 `Retry-After` headers from rate-limiting endpoints (capped at 60 seconds).
  - Terminal 4xx client errors (e.g. 401 Unauthorized, 404 Not Found) fail immediately without wasteful retries.
  - Full audit trail: Each attempt creates a `NotificationDeliveryAttempt` record with HTTP status code, request duration in milliseconds, and error diagnostics.

## Consequences

### Positive
- Unified, enterprise-grade notification architecture servicing both human on-call operators and automated webhook consumers.
- Complete protection against secret exfiltration and SSRF attacks targeting internal infrastructure.
- Zero clutter to primary navigation; full operational management retained within `Settings` and the global header.
- Resilient delivery against downstream outages with deterministic retry semantics and full audit traces.

### Negative / Trade-offs
- Setting up external delivery requires configuring an active Redis broker for BullMQ.
- Development environments require `WEBHOOK_ALLOW_PRIVATE_TARGETS=true` to test webhooks against local loopback listeners.

