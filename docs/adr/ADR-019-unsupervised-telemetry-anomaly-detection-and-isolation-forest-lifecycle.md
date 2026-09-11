# ADR-019: Unsupervised Telemetry Anomaly Detection, Isolation Forest Model Lifecycle, and Proactive RCA Evidence Integration

## Status
Accepted

## Context
Across Phases 0 through 7, AegisOps AI established an enterprise-grade site reliability engineering (SRE) foundation:
- Multi-tenant organization boundaries and role-based access control.
- Service catalog with directed acyclic dependency graphs and topological cycle prevention.
- Synthetic HTTP/gRPC health probes with SSRF validation and hysteresis transitions.
- OpenTelemetry streaming metric ingestion, cardinality protection, and sliding-window alert evaluation.
- Incident correlation engine with monotonic severity escalation and audit timelines.
- Topology-aware AI Root Cause Analysis (RCA) and human-in-the-loop remediation runbooks.

While static threshold alert rules (`AlertRule`) effectively catch known failure modes (e.g. CPU > 85%, Error Rate > 5%), modern distributed microservices frequently suffer from subtle, multi-metric degradation:
1. **Statistical Drift & Multi-Metric Correlation**: Cascading issues often manifest as simultaneous subtle deviations across latency, memory allocation, and connection counts before any single metric breaches a hard alert threshold.
2. **Alert Fatigue & Threshold Calibration**: Setting static thresholds too tight generates excessive false alarms; setting them too loose allows outages to brew undetected.
3. **Contaminated Operational Baselines**: Training statistical or machine-learning models naively across historical telemetry bakes past outages into the "healthy" baseline, rendering future detection blind to similar failures.
4. **Risk of Autonomous AI Actions**: Autonomous incident creation or unsupervised automated remediation from experimental ML creates severe operational instability.

## Decision

### 1. Unsupervised Machine-Learning with scikit-learn Isolation Forest
AegisOps AI implements an unsupervised telemetry anomaly detection engine powered by scikit-learn `IsolationForest`:
- **Deterministic Parameters**: Every model instance trains with `n_estimators=200`, `contamination=0.02` (configurable per preset), `random_state=42`, and `n_jobs=-1` for multi-core parallelism.
- **Metric-Aware Feature Window Extraction**:
  - Sliding time windows (e.g. 300 seconds) are transformed into rich statistical feature vectors.
  - Gauges extract 10 statistical features (`mean`, `std`, `min`, `max`, `p50`, `p90`, `p99`, `rate_of_change`, `acceleration`, `sample_count`).
  - Counters/Sums extract 7 rate features (`rate_mean`, `rate_std`, `delta`, `min`, `max`, `acceleration`, `sample_count`).
  - Histograms extract 9 distribution features (`mean`, `variance`, `min`, `max`, `p50`, `p90`, `p99`, `skewness_proxy`, `sample_count`).
- **Normalized Anomaly Score (0–100)**:
  - Isolation Forest `decision_function(X)` produces negative scores for outliers and positive for inliers.
  - Raw scores are monotonically transformed onto a standardized 0–100 scale where $\le 50.0$ represents normal baseline and $\ge 65.0$ represents anomalous statistical deviation.
  - Explicit terminology is enforced throughout the platform: **"Anomaly Score"** and **"Statistical Deviation"**. Terminology such as "Outage Probability" or "Failure Probability" is strictly prohibited.
- **Feature Attribution via Baseline Z-Scores**:
  - Each evaluation computes z-score deviations against the healthy training baseline mean and standard deviation for each feature.
  - Highest z-score dimensions are surfaced as explainable feature attributions, explaining *why* the window was flagged.

### 2. Clean Baseline Outage Filtering
To guarantee models learn true healthy behavior rather than historical incidents:
- **Outage Interval Masking (`CleanBaselineFilter`)**:
  - The training pipeline queries historical `FIRING` alert episodes and active incident intervals for the service within the lookback window.
  - A 5-minute pre-incident and 5-minute post-incident buffer is added around every outage window.
  - Historical telemetry points overlapping with masked intervals are strictly excluded from the training dataset.
- **Minimum Data Requirements**:
  - Detectors require at least 30 valid feature windows after masking. If telemetry is insufficient, the model status is recorded as `INSUFFICIENT_DATA` rather than fitting on corrupted or trivial samples.

### 3. Binary Model Artifact Security & Storage
- Trained Isolation Forest models are serialized using `joblib` with gzip level 3 compression in memory.
- **Strict Size Boundary**: Model binary blobs are limited to $\le 2\text{ MiB}$. If an artifact exceeds this limit, training fails gracefully with a size constraint error.
- **SHA-256 Integrity Verification**: Every trained artifact records a SHA-256 cryptographic hash. Prior to deserialization for scoring, the worker verifies the artifact hash against the database record.
- **Zero Binary Exposure to Browser**: Model binaries are stored internally in PostgreSQL byte columns (`AnomalyModelVersion.artifactData`) and never sent over public REST APIs or to web browsers.

### 4. Hysteresis State Machine
To eliminate flapping from transient telemetry blips, findings are managed by an operational hysteresis state machine:
- **State Flow**: `NORMAL` $\leftrightarrow$ `PENDING` $\to$ `ANOMALOUS` $\to$ `RESOLVED`.
- **Pending Hysteresis**: Requires $K$ consecutive anomalous evaluation windows before transitioning to `ANOMALOUS`.
  - Conservative Preset: $K=3$ consecutive evaluations.
  - Balanced Preset: $K=2$ consecutive evaluations.
  - Sensitive Preset: $K=1$ evaluation.
- **Recovery Hysteresis**: Requires $R$ consecutive normal evaluations before transitioning from `ANOMALOUS` to `RESOLVED`.
- Every transition emits an audit event (`AnomalyEvent`) and dispatches real-time WebSocket notifications to the service room.

### 5. Proactive Evidence Integration (No Autonomous Incidents)
- **Zero Autonomous Incidents or Shell Mutations**: Anomaly findings act strictly as proactive signals and evidence. They NEVER auto-create incidents, auto-start runbooks, restart containers, or mutate alert rules.
- **AI Root Cause Analysis (RCA) Grounding**:
  - When an incident is investigated on a service, `RcaEvidenceBuilder` queries active `ANOMALOUS` findings for the primary service and its upstream dependencies.
  - Active anomaly findings are fed into the FastAPI RCA engine as observed evidence facts (`ANOMALY_SIGNAL`).
  - The RCA scoring engine rewards candidates with active anomaly signals (`PROACTIVE_ANOMALY_DETECTED` +25 pts), accelerating root-cause localization without human hallucination.

### 6. Operator Feedback Loop
- SREs and on-call engineers can submit operational feedback directly on any finding (`USEFUL`, `FALSE_POSITIVE`, `EXPECTED_BEHAVIOR`, `UNSURE`) with optional notes.
- Feedback is stored in `AnomalyFeedback` records and displayed in the finding drawer to assist team knowledge sharing and future model calibration.

### 7. Contextual UI Architecture (Zero Clutter)
- Anomaly detection is nested contextually under `Services → [serviceId] → Observability → Anomalies` subtab.
- No top-level "Anomalies" or "ML" navigation links clutter the primary application header.
- The root `Overview → Needs Attention` section displays only high-priority active anomaly findings bounded to at most 3–5 items, deep-linking directly to `/services/[serviceId]?tab=observability&subtab=anomalies`.

## Consequences
- **Positive**:
  - SREs gain automated early-warning detection for complex, multi-metric performance degradation.
  - Models remain robust against past outages via clean baseline masking.
  - Explainable feature attribution removes the "black box" nature of ML anomaly detection.
  - Zero autonomous mutations prevent runaway actions or automated damage to infrastructure.
  - Strict network and binary boundaries preserve multi-tenant security and minimize browser payload overhead.
- **Trade-offs**:
  - Requires scheduled BullMQ workers to run periodic evaluations and model retraining jobs.
  - Services without historical telemetry must ingest metrics before models can be trained.

