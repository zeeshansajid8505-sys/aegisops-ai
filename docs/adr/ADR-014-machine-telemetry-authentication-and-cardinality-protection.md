# ADR-014: Machine Telemetry Authentication, Attribute Sanitization, and High-Cardinality Protection

## Status
Accepted

## Context
Exposing an open HTTP metric receiver introduces significant security, abuse, and reliability risks:
1. **Machine Authentication vs Human Sessions**: Human users authenticate via interactive logins and HttpOnly session cookies. Telemetry collectors and microservices authenticate non-interactively in high-frequency batch loops.
2. **Tenant Spoofing**: Telemetry payloads often report metadata such as `service.name` and `deployment.environment`. Relying on client-reported metadata for multi-tenant routing allows malicious or misconfigured clients to pollute other services or organizations.
3. **Sensitive Data Leakage**: Developers frequently inadvertently include authorization tokens, passwords, database credentials, or session cookies in OpenTelemetry resource or span attributes.
4. **Cardinality Explosions**: Highly dynamic attribute values (e.g. user IDs, order IDs, or timestamps as attribute keys) can cause exponential growth in time-series combinations, exhausting memory and crashing database indexes.
5. **Denial-of-Service / Resource Exhaustion**: Large compressed payloads (zip-bombs) or high point submission frequencies can overwhelm ingestion servers.

## Decision
1. **Cryptographically Scoped Telemetry Ingest Keys**:
   - Machine authentication uses distinct API tokens prefixed with `aeg_ing_` containing 256 bits of cryptographically secure entropy (`crypto.randomBytes(32)`).
   - Keys are explicitly scoped to an `organizationId`, `serviceId`, and `environmentId`.
   - **One-Time Secret Disclosure**: The raw key is returned exactly once in the response when created.
   - **Zero Plaintext Storage**: The database only stores the SHA-256 hash (`keyHash`) and an 8-character prefix (`keyPrefix`) for UI identification.
   - **Immutable Binding**: Ingested metrics are tagged and authorized strictly according to the database-verified key. Client-provided resource attributes (e.g. `service.name`) cannot override the server's tenant boundary.

2. **Automated Sensitive Label Sanitization**:
   - All incoming attributes are inspected against a case-insensitive regular expression:
     `/password|secret|token|authorization|bearer|cookie|credential|private[_-]?key|api[_-]?key/i`
   - Matched values are unconditionally replaced with `"[REDACTED]"`.
   - Structural limits: maximum 32 attributes per metric data point, attribute keys clamped to 128 characters, and attribute values clamped to 512 characters.

3. **High-Cardinality Guard & Series Fingerprinting**:
   - Attribute keys are sorted alphabetically and serialized into canonical JSON to guarantee that key order does not create redundant series fingerprints.
   - A SHA-256 hash of the canonical JSON string serves as the unique `seriesHash`.
   - A hard limit of **5,000 active series per environment** is enforced. If an incoming metric point would create a new series beyond the 5,000 threshold, the series is rejected, an ingestion warning is logged, and existing series continue uninterrupted.

4. **Multi-Dimension Rate Limiting**:
   - Rate limiting is enforced via atomic Redis counters per key:
     - **Request Quota**: Default 120 requests per minute (`telemetry:ratelimit:rpm:<keyId>:<minute>`).
     - **Points Quota**: Default 100,000 data points per minute (`telemetry:ratelimit:pts:<keyId>:<minute>`).
   - Requests exceeding quotas are rejected with `429 Too Many Requests` and a standard `Retry-After` header.

5. **Clock Skew & Payload Size Validation**:
   - Uncompressed payload size is restricted to 8 MiB max.
   - Data points must have timestamps within the valid window: no older than 300 seconds (5 minutes in the past) and no more than 60 seconds into the future.
   - Non-finite numbers (`NaN`, `+Infinity`, `-Infinity`) are rejected.

## Consequences

### Positive
* **Zero Credential Exposure**: Plaintext ingest keys cannot be extracted even in the event of a database compromise.
* **Guaranteed Multi-Tenancy**: Machine telemetry data is strictly bounded to the authorized tenant and service environment.
* **Leak Protection**: Passwords and tokens in metric labels are automatically redacted before storage or display.
* **Explosion Resistance**: Cardinality caps protect PostgreSQL indices and Redis memory from combinatorial explosion.

### Negative / Trade-offs
* **Key Re-issuance Requirement**: If a user loses their raw ingest key, they cannot retrieve it and must revoke it and issue a new key.
* **Cardinality Rejection**: New metric attribute dimensions beyond the 5,000 series cap will be dropped until unused series are cleaned up or limits are reconfigured.

