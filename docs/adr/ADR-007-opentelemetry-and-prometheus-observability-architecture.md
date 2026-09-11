# ADR-007: OpenTelemetry and Prometheus Observability Architecture

## Status
Accepted

## Context
As an incident management platform, AegisOps AI must model industry-standard telemetry collection without forcing developers to reinvent metric collection protocols.

## Decision
Adopt **OpenTelemetry (OTel)** standards for vendor-neutral tracing and metric instrumentation, combined with **Prometheus** for time-series metrics collection.

## Consequences
### Positive
* Standardized semantic conventions for HTTP requests, errors, and latencies.
* Compatibility with standard observability collectors and exporters.
* Protects PostgreSQL from becoming bloated by time-series metric samples.

### Negative / Trade-offs
* Introduces additional observability infrastructure components into the deployment topology.
* Requires bounded retention configuration to keep demo environment footprints lightweight.
