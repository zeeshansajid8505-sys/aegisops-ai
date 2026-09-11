# ADR-012: Active Health Probe Architecture, Hysteresis State Machine, and SSRF Hardening

## Status
Accepted

## Context
AegisOps AI requires active, synthetic health monitoring of microservices and runtime environments to identify outages before passive telemetry or end users report them. In designing active probe execution for a multi-tenant platform:
1. **Flapping & False Positives**: Transient network spikes or brief GC pauses can cause single-probe failures. Toggling service health on a single probe failure causes alert fatigue and thrashing.
2. **Server-Side Request Forgery (SSRF)**: Allowing users to configure health check endpoints (URLs and host:ports) introduces severe attack vectors, including exfiltration of cloud metadata (`169.254.169.254`) and intranet port scanning.
3. **Multi-Protocol Realism**: Modern microservices utilize both REST/HTTP APIs and gRPC binary RPC interfaces. Probing must execute actual network protocols without artificial mocks.
4. **Execution Scalability**: Health probes across thousands of services require non-blocking, distributed scheduling and execution decoupled from the core HTTP API server.

## Decision
1. **Real Multi-Protocol Probe Execution**:
   - **HTTP Probes**: Executed via standard Node.js Fetch API with configurable HTTP methods (`GET`, `HEAD`), expected HTTP status code ranges (e.g. `200..299`), and explicit timeout cancellation (`AbortSignal.timeout(timeoutMs)`).
   - **gRPC Probes**: Implemented using standard `grpc.health.v1.Health/Check` unary protocol over `@grpc/grpc-js` with compact wire-serialized protobuf payloads and TLS configuration.
   - Mock responses are strictly prohibited in production code.

2. **Hysteresis State Machine**:
   - To eliminate health status flapping, state transitions are governed by configurable hysteresis thresholds:
     - `successThreshold` (default: 2 consecutive successes to transition to `HEALTHY`).
     - `failureThreshold` (default: 3 consecutive failures to transition to `UNHEALTHY`).
   - If a probe is failing but hasn't reached `failureThreshold`, or recovering but hasn't reached `successThreshold`, its state is marked `DEGRADED`.
   - Transition counters reset immediately upon alternating probe outcomes.

3. **Hierarchical Health Aggregation**:
   - **Environment Level**: Evaluates enabled probes. Any critical probe failure or all probes failing drives the environment to `UNHEALTHY`. Mixed states yield `DEGRADED`.
   - **Service Level**: Evaluates active environments. If active `PRODUCTION` environments exist, overall service health is derived strictly from production environments. Otherwise, derived from all active environments. Severity ordering: `UNHEALTHY` > `DEGRADED` > `UNKNOWN` > `HEALTHY`.

4. **SSRF Defense-in-Depth**:
   - **Protocol Whitelist**: Only `http:` and `https:` schemes are permitted for HTTP probes; file, ftp, gopher, and custom schemes are rejected.
   - **DNS Pre-Resolution**: Hostnames are resolved to IP addresses before initiating requests to inspect every resolved entry.
   - **Cloud Metadata Prohibition**: Link-local cloud metadata addresses (`169.254.169.254`, `169.254.170.2`, `fd00:ec2::254`) are unconditionally blocked in all environments.
   - **Private IP & Loopback Filter**: RFC1918 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10`) and loopback (`127.0.0.0/8`, `::1`) targets are blocked by default unless `PROBE_ALLOW_PRIVATE_TARGETS=true` is explicitly configured for controlled dev environments.
   - **Redirect Suppression**: HTTP redirects are set to `redirect: 'manual'` to prevent redirect-based SSRF bypasses.
   - **Payload Safety**: Response bodies are never stored in the database; only latency, status codes, and sanitised failure messages are recorded.

5. **Decoupled Asynchronous Scheduling via BullMQ**:
   - `ProbeScheduler` in `apps/worker` discovers due probes from PostgreSQL and enqueues jobs to Redis via BullMQ (`health-probes` queue).
   - Time-slotted deterministic job IDs prevent duplicate enqueuing during overlapping scheduler cycles.
   - BullMQ workers process probes concurrently according to configured concurrency limits.
   - Users can trigger immediate on-demand runs via the API "Run Now" endpoint.

## Consequences

### Positive
* **Stability**: Hysteresis eliminates spurious alert flapping during transient blips.
* **Security**: Multi-layer SSRF validation prevents platform infrastructure and cloud credential compromise.
* **Protocol Accuracy**: Native gRPC and HTTP executions reflect true production connectivity.
* **Decoupled Scaling**: Background probe execution runs independently of the core business API without saturating web event loops.

### Negative / Trade-offs
* **DNS Resolution Overhead**: Pre-resolving DNS before every probe adds a sub-millisecond lookup, though DNS caching minimizes this impact.
* **State Complexity**: Storing separate `HealthProbeState` and time-series `HealthProbeRun` records requires transactional writes, but provides both low-latency status reads and historical auditability.

