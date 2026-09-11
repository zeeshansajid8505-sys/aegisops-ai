# AegisOps AI — Phase 11 Threat Model & Trust Boundaries

## 1. System Overview & Trust Boundaries

AegisOps AI is an enterprise-grade AI-powered Incident Management, Observability, and Site Reliability Engineering platform. The platform operates across six primary runtime components:

```
+-----------------------------------------------------------------------------------------+
|                                  UNTRUSTED CLIENT ZONE                                  |
|                                                                                         |
|   +-----------------------+                    +------------------------------------+   |
|   |  Browser Client       |                    |  Telemetry Agents / OTLP Exporters |   |
|   |  (React/Next.js SPA)  |                    |  (HTTP/gRPC Ingestion)             |   |
|   +-----------+-----------+                    +-----------------+------------------+   |
+---------------|--------------------------------------------------|----------------------+
                | [Trust Boundary 1: Browser -> Edge / API]        | [Trust Boundary 6: Telemetry]
                | Cookies, Bearer Auth, WebSocket, CORS            | Bearer Token (Hashed Ingest Key)
+---------------v--------------------------------------------------v----------------------+
|                                   DMZ / INGRESS LAYER                                   |
|                                                                                         |
|   +-----------------------+                    +------------------------------------+   |
|   |  Next.js Web (SSR/SPA)| <----------------> |  NestJS Core Business API          |   |
|   |  (Port 3000)          |                    |  (Port 3001)                       |   |
|   +-----------------------+                    +--+------------------+--------------+   |
+---------------------------------------------------|------------------|------------------+
                                                    |                  |
           [Trust Boundary 2: API -> DB]            |                  | [Trust Boundary 3: Internal Queues]
           Parameterized Prisma Queries             |                  | Redis Auth / Isolated Keys
                                                    |                  |
+---------------------------------------------------v------------------v------------------+
|                                    INTERNAL DATA TIER                                   |
|                                                                                         |
|   +-----------------------+                    +------------------------------------+   |
|   |  PostgreSQL 16        |                    |  Redis 7 (BullMQ & Pub/Sub)        |   |
|   |  (Port 5432)          |                    |  (Port 6379)                       |   |
|   +-----------------------+                    +-----------------+------------------+   |
+------------------------------------------------------------------|----------------------+
                                                                   |
                                    [Trust Boundary 4: Worker Bus] | BullMQ Job Payloads
                                                                   v
+-----------------------------------------------------------------------------------------+
|                                  BACKGROUND EXECUTION TIER                              |
|                                                                                         |
|   +-----------------------+                    +------------------------------------+   |
|   |  BullMQ Worker Daemon |                    |  FastAPI AI/ML Inference Service   |   |
|   |  (Async Schedulers)   | <----------------> |  (Port 8000, Internal Pre-shared Key) |
|   +-----------+-----------+                    +------------------------------------+   |
+---------------|-------------------------------------------------------------------------+
                | [Trust Boundary 5: Outbound External Integrations]
                | SSRF Filtering, HMAC-SHA256 Signatures, AES-GCM Decryption
                v
+-----------------------------------------------------------------------------------------+
|                                EXTERNAL THIRD-PARTY SERVICES                            |
|                                                                                         |
|   - Slack Incoming Webhooks (Block Kit)                                                 |
|   - Customer Custom HTTP Webhooks                                                       |
|   - SMTP Servers (Operational Email)                                                    |
+-----------------------------------------------------------------------------------------+
```

---

## 2. Threat Analysis by Boundary

### Trust Boundary 1: Browser Client $\leftrightarrow$ NestJS Core API / WebSocket Gateway
- **Threat 1.1: Session Theft & Credential Sniffing**:
  - *Mitigation*: Opaque 256-bit cryptographically random tokens (`crypto.randomBytes(32).toString('base64url')`). Stored strictly in `HttpOnly`, `SameSite=Lax`, and `Secure` (in production) cookies. Token hashes (`SHA-256`) are stored in PostgreSQL; raw session tokens are never stored in the database.
- **Threat 1.2: Session Fixation**:
  - *Mitigation*: Login creates a fresh database session record and overwrites any existing session cookie with a newly generated token.
- **Threat 1.3: Cross-Site Request Forgery (CSRF)**:
  - *Mitigation*: Enforce `Origin` and `Referer` validation for all mutating HTTP verbs (`POST`, `PUT`, `PATCH`, `DELETE`) carrying session cookies. Validate target hostname against configured whitelist.
- **Threat 1.4: Cross-Origin Resource Sharing (CORS) Bypass**:
  - *Mitigation*: Explicit origin matching without wildcard fallback when `credentials: true` is active. Disallow untrusted cross-origin requests.
- **Threat 1.5: Credential Brute-Force & Denial of Service**:
  - *Mitigation*: IP-based sliding window rate limiter on `/v1/auth/login`, `/v1/auth/register`, and `/v1/invitations/accept` (10 requests/minute).
- **Threat 1.6: Account Enumeration**:
  - *Mitigation*: Uniform authentication response error messages ("Invalid email or password"). Consistent Argon2 hashing verification to prevent timing leaks.
- **Threat 1.7: WebSocket Unauthorized Room Snooping**:
  - *Mitigation*: Socket connections require validated session cookie upon handshake (`handleConnection`). Subscription messages (`subscribe:organization`, `subscribe:service`, `subscribe:incident`) verify database membership and tenant scoping before joining Socket.IO rooms.

---

### Trust Boundary 2: NestJS API $\leftrightarrow$ PostgreSQL Relational Database
- **Threat 2.1: Multi-Tenant Data Leakage**:
  - *Mitigation*: Strict route guards (`OrganizationMemberGuard`) extract `organizationId` from validated context and enforce tenancy. All Prisma queries explicitly filter by `organizationId`. Composite foreign keys guarantee that services, alerts, incidents, and postmortems cannot reference entities outside their owning organization.
- **Threat 2.2: SQL Injection**:
  - *Mitigation*: All queries use Prisma ORM parameterized queries and prepared statements. Zero dynamic raw SQL string interpolation.
- **Threat 2.3: Connection Starvation & Pool Exhaustion**:
  - *Mitigation*: Singleton `PrismaService` connection management with lifecycle hooks (`onModuleInit`, `enableShutdownHooks`). Graceful backoff on connection saturation.

---

### Trust Boundary 3 & 4: NestJS / Worker $\leftrightarrow$ Redis & BullMQ Queues
- **Threat 3.1: Queue Tampering & Poison Pill Injection**:
  - *Mitigation*: Redis requires authentication. BullMQ jobs serialize typed JSON payloads validated by consumer workers.
- **Threat 3.2: Infinite Retry Loops & Resource Exhaustion**:
  - *Mitigation*: Bounded retry policies (max 3-5 retries with exponential backoff and jitter). Deterministically failing jobs transition to `FAILED` state and emit structured diagnostic error logs without blocking queue concurrency.
- **Threat 3.3: Duplicate Job Processing**:
  - *Mitigation*: Deterministic idempotency keys (`jobId = ${ruleId}:${bucket}:${timestamp}`) across alert evaluation, rollup calculation, and notification dispatch.
- **Threat 3.4: Redis Connection Failure**:
  - *Mitigation*: Isolated Redis clients for BullMQ vs Pub/Sub. Auto-reconnect strategies with exponential backoff; `/api/ready` correctly reports degraded status when Redis is disconnected.

---

### Trust Boundary 5: Worker / API $\leftrightarrow$ External Third-Party Webhooks & Integrations
- **Threat 5.1: Server-Side Request Forgery (SSRF) to Internal Metadata & Networks**:
  - *Mitigation*: `SSRFValidatorService` enforces strict `http:` and `https:` protocols. Resolves DNS hostnames and blocks:
    - Cloud metadata IPs (`169.254.169.254`, `instance-data`, `metadata.google.internal`).
    - Loopback IPs (`127.0.0.0/8`, `::1`).
    - Private RFC1918 subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
    - Carrier-grade NAT (`100.64.0.0/10`) and IPv6 ULA/link-local.
- **Threat 5.2: Redirect SSRF**:
  - *Mitigation*: Outbound HTTP dispatchers enforce `redirect: 'manual'` or re-validate redirect target URLs against the SSRF filter prior to following redirects.
- **Threat 5.3: Webhook Payload Tampering & Replay**:
  - *Mitigation*: Outbound webhooks include cryptographic headers:
    - `X-AegisOps-Signature`: HMAC-SHA256 digest (`sha256=<hex>`) computed with the tenant's decrypted signing secret.
    - `X-AegisOps-Timestamp`: Fresh ISO 8601 UTC timestamp.
    - `X-AegisOps-Event-Id`: Canonical UUIDv4 event ID for receiver-side deduplication.
- **Threat 5.4: Secret Leakage at Rest & in Logs**:
  - *Mitigation*: Webhook URLs and signing secrets are encrypted at rest with authenticated `AES-256-GCM` (96-bit IV, 128-bit authentication tag). REST API responses strictly return masked strings (`••••••••` + last 4 characters). Central log redactor sanitizes all secrets.

---

### Trust Boundary 6: Telemetry Exporters $\leftrightarrow$ OTLP Ingestion API
- **Threat 6.1: Unauthorized Telemetry Ingestion**:
  - *Mitigation*: `MachineTelemetryAuthGuard` verifies pre-shared ingest keys (`aeg_ing_...`). Raw keys are never stored; database contains SHA-256 hashes bound to specific `organizationId`, `serviceId`, and `environmentId`.
- **Threat 6.2: Decompression Bomb (Zip Bomb)**:
  - *Mitigation*: Ingestion enforces a strict `8 MiB` maximum uncompressed size (`maxOutputLength: 8388608`) on gzip decompression. Payloads exceeding this limit fail fast with HTTP 413 Payload Too Large.
- **Threat 6.3: High-Cardinality Denial of Service**:
  - *Mitigation*: `CardinalityGuardService` enforces bounded series per service and limits active distinct attribute labels. Drops or truncates high-cardinality label values.
- **Threat 6.4: Rate Limiting & Backpressure**:
  - *Mitigation*: Per-key token bucket rate limiting (10,000 points/second) with HTTP 429 Too Many Requests response.

---

### Trust Boundary 7: NestJS / Worker $\leftrightarrow$ FastAPI AI Inference Service
- **Threat 7.1: Unauthorized Internal Mutation & Inference**:
  - *Mitigation*: All mutation and inference endpoints on FastAPI require pre-shared `X-Internal-Service-Key`. Browser session cookies alone are rejected with HTTP 401 Unauthorized.
- **Threat 7.2: Model Artifact Deserialization Attacks**:
  - *Mitigation*: Model weights and metadata are validated for size bounds ($< 50\text{ MB}$), verified with SHA-256 checksums, and isolated within local storage directories. No arbitrary Python pickle uploads from untrusted clients.
- **Threat 7.3: Machine Learning Hallucination Overriding Human Decision**:
  - *Mitigation*: Strict Human Authority Principle. AI hypotheses are contextually sequestered. Human-confirmed root causes retain supreme authority. AI is strictly prohibited from approving postmortems.

