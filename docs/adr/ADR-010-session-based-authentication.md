# ADR-010: Opaque Server-Managed Sessions and Argon2id Over Stateless JWTs

## Status
Accepted

## Context
AegisOps AI is a production-grade Site Reliability Engineering and Incident Management platform handling critical infrastructure operations, alert rules, and operational telemetry. For this domain, security requirements demand:
1. Immediate session revocation capability (e.g. during suspected credential compromise, employee offboarding, or incident response escalation).
2. Elimination of client-side token storage vulnerabilities (specifically XSS exfiltration of tokens stored in `localStorage` or `sessionStorage`).
3. Resilient multi-tenant RBAC enforcement where permission updates or organization removals take effect immediately rather than waiting for JWT expiration.
4. Resistance against offline credential cracking in the event of database compromise.

Common alternatives such as purely stateless JWTs in `localStorage` introduce significant security risks: tokens cannot be immediately invalidated without distributed deny-lists, client storage is accessible to malicious scripts, and tokens often bloat headers with unrevoked claim payloads.

## Decision
1. **Opaque Server-Managed Sessions**:
   - Generate high-entropy, 256-bit random tokens using Node.js `crypto.randomBytes(32).toString('hex')`.
   - Deliver tokens exclusively via secure `HttpOnly`, `SameSite=Lax`, `path=/` cookies (`aegisops_session`).
   - Store **only the SHA-256 hash** of the session token in the PostgreSQL `sessions` table alongside metadata (`userId`, `createdAt`, `expiresAt`, `revokedAt`, `lastUsedAt`, `ipAddress`, `userAgent`).
   - The raw token is never persisted in plaintext anywhere in the database.

2. **Argon2id Password Key Derivation**:
   - Hash all passwords using Argon2id with OWASP-recommended operational parameters:
     - Memory cost: 65,536 KiB (64 MiB)
     - Time cost: 3 iterations
     - Parallelism: 4 threads
   - Password hashes are strictly omitted from all serialization layers and DTO responses.

3. **Cryptographic Invitation Tokens**:
   - Organization invitations use high-entropy 256-bit random tokens.
   - Only the SHA-256 hash is stored in `organization_invitations`.
   - Invitations enforce a strict 7-day TTL, atomic acceptance transactions, and recipient email matching.

## Consequences

### Positive
* **Immediate Revocation**: Any active session or all sessions across devices can be invalidated instantaneously via `revokedAt` timestamp updates in PostgreSQL.
* **XSS Defense**: Session tokens cannot be accessed by browser JavaScript, eliminating token exfiltration via client-side script injection.
* **Leak Resilience**: If a database backup is compromised, attackers cannot reconstruct active session tokens because only non-reversible SHA-256 hashes are stored.
* **Audit Trail**: Every authentication event, failed login attempt, and session lifecycle transition is logged to `SecurityLoggerService` for compliance and observability.

### Negative / Trade-offs
* **Stateful Lookup**: Each authenticated request requires a fast database query by indexed `token_hash`. This is mitigated by PostgreSQL B-tree indexing on `sessions(token_hash)` and connection pooling.
* **CORS & Cookie Configuration**: Cross-origin requests between Next.js and NestJS require explicit CORS configuration with `credentials: true` and matched allowed origins.

