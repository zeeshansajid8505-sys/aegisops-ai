# ADR-015: Alert Rule Evaluation Engine, Sliding Windows, Deterministic State Machine, and Deduplication

## Status
Accepted

## Context
Following the implementation of the Phase 3 metric ingestion pipeline (hot Redis buffer, multi-tier PostgreSQL retention, and canonical attribute hashing), AegisOps AI requires a robust, scalable alerting engine to continuously monitor metric streams against static anomaly thresholds and drive alert state transitions.

Building an enterprise-grade alerting engine introduces several technical challenges:
1. **Time Window Precision & Clock Jitter**: Telemetry arriving asynchronously may experience network delays. Evaluating windows at the current millisecond can introduce false "NO_DATA" spikes.
2. **Mathematical Correctness Across Instrument Types**: Inappropriate aggregations (such as computing percentiles over monotonic counters or rate over gauges) cause meaningless values. Counter resets in monotonic counters must be handled seamlessly.
3. **High-Cardinality Rule Evaluation**: Evaluating hundreds of dimensional series per rule requires strict safety caps to prevent worker thread saturation.
4. **State Machine Flapping & Hysteresis**: Transient metric spikes can cause alert flapping. A deterministic state machine with pending and recovery hysteresis windows is required.
5. **Alert Deduplication**: Consecutive evaluation cycles that remain in a firing state must not spam duplicate firing events or create runaway alert instances.
6. **Concurrent Evaluation & Race Conditions**: Recurring scheduler jobs and manual "Evaluate Now" triggers must not concurrently evaluate the same rule and corrupt state.
7. **Infrastructure Error vs Metric Absence**: Failure of evaluation infrastructure (e.g. database connectivity errors) must never be conflated with genuine metric "NO_DATA".

## Decision

### 1. Dedicated Asynchronous Queue & Distributed Locking
- **Dedicated Queue**: Alert rule evaluations are decoupled from ingestion and scheduled via a dedicated BullMQ queue: `alert-rule-evaluation`.
- **Scheduled & Immediate Jobs**: Each enabled rule is registered as a repeatable BullMQ job running at its configured `evaluationIntervalSeconds`. Immediate manual evaluations use unique `runId` tokens.
- **Distributed Concurrency Control**: Before executing a rule evaluation, workers acquire a Redis distributed lock (`lock:alert-rule:<ruleId>`) with a 60-second TTL and unique ownership token. Locks are safely and atomically released using a Lua script that verifies token ownership.

### 2. Sliding Window Calculation & Watermark Delay
- **Evaluation Grace Period**: Windows end at `currentTime - ALERT_EVALUATION_DELAY_SECONDS` (default 10s) to account for in-flight telemetry transit without missing delayed points.
- **Hybrid Data Retrieval**: Workers query the Redis sorted set hot buffer first, and PostgreSQL `metric_points` or 1-minute rollups for older data, merging seamlessly into a chronological sequence.
- **Pure Operators**:
  - `AVG`, `MIN`, `MAX`, `SUM`, `LAST`.
  - `RATE`: Computes delta per second over window duration, detecting counter resets (where (v_t < v_{t-1})) and treating the reset value as positive progress from zero.
  - `P50`, `P90`, `P99`: Uses histogram explicit bound linear interpolation when available, falling back to nearest-rank scalar percentiles.
- **Instrument Compatibility**: Aggregations are strictly validated against metric instrument types (`GAUGE`, `SUM`, `HISTOGRAM`). Incompatible configurations are rejected at the API boundary with `400 Bad Request`.

### 3. Dimensional Filtering & Multi-Series Modes
- **Attribute Filters**: Rules support up to 8 exact match filters (`EQUALS`, `NOT_EQUALS`) against metric series attributes.
- **Evaluation Modes**:
  - `PER_SERIES`: Evaluates every matching time-series independently. Cardinality is capped at `ALERT_MAX_INSTANCES_PER_RULE=200` to protect worker memory.
  - `AGGREGATE_SERIES`: Two-stage evaluation: first computes window aggregation per series, then collapses all series via a secondary reduction (`AVG`, `MIN`, `MAX`, `SUM`) before evaluating threshold.

### 4. Deterministic State Machine & Deduplication
- **States**: `INACTIVE`, `PENDING`, `FIRING`, `RESOLVED`.
- **Pending Window**: If breached and `pendingDurationSeconds > 0`, transitions to `PENDING`. Emits `PENDING_STARTED`. If condition clears before duration elapses, returns to `INACTIVE` with `PENDING_CLEARED`.
- **Firing & Deduplication**: Once pending duration elapses (or immediately if `pendingDurationSeconds == 0`), transitions to `FIRING` and emits a single `FIRING_STARTED` event.
  - **Deduplication Guarantee**: Subsequent consecutive evaluation cycles while in `FIRING` update observed values and timestamps but emit **zero** duplicate events.
- **Recovery Hysteresis**: When metric recovers to normal, if `recoveryDurationSeconds > 0`, alert enters a recovery hold recorded via `clearCandidateAt`. If breached again during this hold, `clearCandidateAt` is reset. When the full recovery window elapses, transitions to `INACTIVE` and emits `RESOLVED`.
- **No-Data Policies**: Explicitly configured per rule:
  - `IGNORE`: Maintains existing state without modification.
  - `OK`: Treats lack of data as healthy, resolving any active alert.
  - `ALERT`: Treats lack of data as a violation, initiating pending/firing.
- **Error Isolation**: Evaluation infrastructure errors (`ERROR`) do not alter alert states or emit spurious events.

### 5. Deterministic SHA-256 Fingerprinting
- Each alert instance is identified by a deterministic 64-character hex SHA-256 hash calculated from canonical parameters:
  - `PER_SERIES`: `org:<orgId>|rule:<ruleId>|svc:<serviceId>|env:<envId>|target:series:<seriesId>`
  - `AGGREGATE_SERIES`: `org:<orgId>|rule:<ruleId>|svc:<serviceId>|env:<envId>|target:aggregate`
- Guarantees 1:1 binding between alert instances and physical metric sources, preventing duplicate instances in the database.

## Consequences

### Positive
* **Zero Alert Spam**: Consecutive evaluations update active instances in place without emitting redundant notifications.
* **Flap Resistance**: Configurable pending and recovery hold windows eliminate flapping on noisy telemetry.
* **Safety Under High Cardinality**: Hard limits prevent accidental cardinality explosions from crashing background workers.
* **Deterministic Behavior**: Pure evaluation functions and state reducers are completely isolated and verified by extensive unit test suites.
* **Operator Visibility**: Detailed evaluation history records observed values, sample counts, and execution durations for 14 days before automatic pruning.

### Negative / Trade-offs
* **Evaluation Delay**: The 10-second watermark delay adds a 10-second latency floor before real-time telemetry is evaluated.
* **Cardinality Cap**: Series beyond the 200 limit in `PER_SERIES` mode are omitted until filters are narrowed.
