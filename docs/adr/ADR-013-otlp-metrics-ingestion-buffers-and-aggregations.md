# ADR-013: OTLP Metrics Ingestion, Hot Buffers, and Rollup Aggregation Architecture

## Status
Accepted

## Context
AegisOps AI requires high-throughput telemetry metric ingestion conforming to OpenTelemetry standards (OTLP/HTTP) to observe microservice health, calculate latency percentiles, and drive automated incident response.
Key architectural challenges:
1. **Architectural Simplicity vs Performance**: Introducing external specialized time-series databases (TimescaleDB, ClickHouse, InfluxDB, or Kafka) would increase operational overhead, deployment complexity, and infrastructure cost for a single-developer architecture.
2. **OTLP Standard Compliance**: Telemetry agents and standard OpenTelemetry Collectors must be able to push metrics directly using standard OTLP/HTTP protocols (`POST /api/v1/telemetry/otlp/v1/metrics`) over both JSON and binary Protobuf (`ExportMetricsServiceRequest`) with optional gzip compression.
3. **Write Path Scalability & Fast Query Latency**: Ingesting raw metric points directly into relational storage synchronously would saturate HTTP worker threads. Conversely, querying recent dashboard metrics directly from large historical tables creates database bottlenecks.

## Decision
1. **Durable Core on PostgreSQL 16 + Redis 7 + BullMQ**:
   - Rather than adopting external time-series engines, AegisOps AI utilizes **PostgreSQL 16** as the durable source of truth, **Redis 7** for sliding-window hot metric buffers, and **BullMQ** for asynchronous batch ingestion.
   - Incoming OTLP payloads are parsed, validated, and enqueued into BullMQ (`telemetry-metrics-ingest` queue) in chunks of 250–500 points, returning immediately to the client with `200 OK` (or `{ partialSuccess: ... }`).

2. **Dual-Protocol Ingestion (Protobuf & JSON)**:
   - The OTLP endpoint accepts both `application/x-protobuf` and `application/json`.
   - Binary Protobuf requests are decoded using compiled OpenTelemetry protobuf definitions (`protobufjs`), and responses are encoded as valid `ExportMetricsServiceResponse` buffers.
   - `Content-Encoding: gzip` is decompressed dynamically with an 8 MiB decompression size limit guard to prevent zip-bomb vulnerabilities.

3. **Metric Instrument Normalization**:
   - Supported instruments:
     - `GAUGE`: Point-in-time measurements (CPU, memory, active jobs).
     - `SUM`: Monotonic cumulative counters (requests total, error count) and delta counters.
     - `HISTOGRAM`: Latency distributions with explicit boundary buckets (`bucketCounts`, `explicitBounds`, `min`, `max`, `sum`, `count`).
   - Timestamps exceeding 32-bit integer ranges are processed safely using `BigInt` nanosecond representations (`timeUnixNano`) alongside standard indexed `DateTime` columns.

4. **Tiered Query Engine & Redis Hot Buffers**:
   - Background workers push recent metric points directly into Redis lists (`telemetry:hot:<orgId>:<envId>:<seriesId>`) capped at 100 points per series with 1-hour TTL.
   - The SRE query engine queries the Redis hot buffer first for sub-minute recent metrics, falling back to PostgreSQL `metric_points` for raw historical data.
   - Rollup queries (`1m`, `5m`, `1h`) query the pre-aggregated `metric_rollups_minute` table, which maintains `min`, `max`, `sum`, `avg`, `sampleCount`, and calculated percentiles (`p50`, `p90`, `p99`).

5. **Automated Data Retention Cleanup**:
   - Background worker runs an hourly retention sweep:
     - Raw metric points: 7-day retention.
     - 1-minute rollups: 30-day retention.
     - Ingestion audit events: 7-day retention.

## Consequences

### Positive
* **Zero Additional Infrastructure**: Runs completely on existing PostgreSQL and Redis containers without adding Kafka, ClickHouse, or TimescaleDB.
* **OpenTelemetry Native**: Compatible with standard OpenTelemetry collectors, SDKs, and third-party agents.
* **Low Latency**: Redis hot buffers provide sub-millisecond query responses for live operational consoles.
* **Resilient**: BullMQ queue decouples high-volume metric ingestion spikes from database write capacity.

### Negative / Trade-offs
* **Relational Storage Footprint**: Storing billions of raw points in PostgreSQL long-term is cost-ineffective; therefore, the strict 7-day raw retention policy and 1-minute rollups are essential to control disk usage.

