# ADR-005: Redis and BullMQ for Asynchronous Jobs and Coordination

## Status
Accepted

## Context
Operational tasks such as evaluating alert rules every 30 seconds, delivering webhooks/emails with exponential backoff retries, and aggregating analytics must not block HTTP request latency.

## Decision
Use **Redis 7** as an in-memory coordination store and **BullMQ** for robust background job processing (`apps/worker`).

## Consequences
### Positive
* Reliable job queues with built-in retries, delays, rate-limiting, and dead-letter queues (DLQ).
* Ephemeral Redis storage ensures high throughput for distributed locks and rate limits.
* Keeps the primary PostgreSQL database free from polling noise and queue churn.

### Negative / Trade-offs
* Requires maintaining a Redis instance alongside PostgreSQL.
* Job payloads must be serializable JSON; workers must handle distributed concurrency idempotently.
