import io
import hashlib
import base64
import joblib
import numpy as np
from typing import Dict, List, Any, Optional
from sklearn.ensemble import IsolationForest

MAX_ARTIFACT_SIZE_BYTES = 2 * 1024 * 1024  # 2 MiB strict limit
DECISION_BOUNDARY_THRESHOLD = 65.0  # Normalized score >= 65 is ANOMALOUS

class AnomalyEngineError(Exception):
    """Base exception for anomaly engine errors."""
    pass

class ArtifactIntegrityError(AnomalyEngineError):
    """Raised when model artifact hash fails verification."""
    pass

class ArtifactSizeError(AnomalyEngineError):
    """Raised when model artifact exceeds bounded storage."""
    pass

class InsufficientDataError(AnomalyEngineError):
    """Raised when sample count is insufficient for training."""
    pass

class IsolationForestEngine:
    """Deterministic, unsupervised ML anomaly detection using Isolation Forest."""

    def __init__(self):
        self._model_cache: Dict[str, Any] = {}

    def train(
        self,
        detector_id: str,
        feature_names: List[str],
        feature_matrix: List[List[float]],
        contamination: float = 0.02,
        random_state: int = 42,
    ) -> Dict[str, Any]:
        """Train an Isolation Forest model over baseline telemetry features."""
        if not feature_matrix or len(feature_matrix) < 5:
            raise InsufficientDataError(
                f"Insufficient training samples: got {len(feature_matrix) if feature_matrix else 0}, minimum 5 required"
            )

        X = np.array(feature_matrix, dtype=np.float64)
        if X.ndim != 2 or X.shape[1] != len(feature_names):
            raise ValueError(
                f"Feature matrix shape {X.shape} does not match feature names count {len(feature_names)}"
            )

        # Handle any NaN/Inf values by imputing with column median
        for col_idx in range(X.shape[1]):
            col = X[:, col_idx]
            nan_mask = np.isnan(col) | np.isinf(col)
            if np.any(nan_mask):
                valid_vals = col[~nan_mask]
                median_val = np.median(valid_vals) if len(valid_vals) > 0 else 0.0
                X[nan_mask, col_idx] = median_val

        # Train deterministic Isolation Forest
        clf = IsolationForest(
            n_estimators=200,
            contamination=contamination,
            random_state=random_state,
            n_jobs=1,  # Deterministic execution
        )
        clf.fit(X)

        # Also store basic training distribution statistics for feature attribution
        train_means = np.mean(X, axis=0).tolist()
        train_stds = np.std(X, axis=0).tolist()

        model_payload = {
            "model": clf,
            "feature_names": feature_names,
            "means": train_means,
            "stds": train_stds,
            "sample_count": len(X),
            "contamination": contamination,
            "detector_id": detector_id,
        }

        # Serialize using joblib
        buffer = io.BytesIO()
        joblib.dump(model_payload, buffer, compress=3)
        artifact_bytes = buffer.getvalue()

        # Check size constraints
        artifact_size = len(artifact_bytes)
        if artifact_size > MAX_ARTIFACT_SIZE_BYTES:
            raise ArtifactSizeError(
                f"Serialized model artifact size {artifact_size} bytes exceeds maximum allowed {MAX_ARTIFACT_SIZE_BYTES} bytes"
            )

        # Compute SHA-256 hash
        artifact_hash = hashlib.sha256(artifact_bytes).hexdigest()
        artifact_base64 = base64.b64encode(artifact_bytes).decode("ascii")

        # Cache in-memory for immediate scoring requests
        self._model_cache[artifact_hash] = model_payload

        return {
            "detector_id": detector_id,
            "algorithm": "IsolationForest",
            "algorithm_version": "1.9.0",
            "feature_schema_version": "anomaly-feature-v1",
            "feature_names": feature_names,
            "sample_count": len(X),
            "contamination": contamination,
            "artifact_base64": artifact_base64,
            "artifact_hash": artifact_hash,
            "artifact_size_bytes": artifact_size,
        }

    def _load_model(self, artifact_base64: str, artifact_hash: str) -> Dict[str, Any]:
        """Validate SHA-256 hash and load model payload."""
        if artifact_hash in self._model_cache:
            return self._model_cache[artifact_hash]

        try:
            artifact_bytes = base64.b64decode(artifact_base64.encode("ascii"))
        except Exception as e:
            raise ValueError(f"Invalid base64 encoding: {e}")

        computed_hash = hashlib.sha256(artifact_bytes).hexdigest()
        if computed_hash.lower() != artifact_hash.lower():
            raise ArtifactIntegrityError(
                f"Artifact SHA-256 hash mismatch! Expected: {artifact_hash}, computed: {computed_hash}"
            )

        if len(artifact_bytes) > MAX_ARTIFACT_SIZE_BYTES:
            raise ArtifactSizeError(
                f"Artifact size {len(artifact_bytes)} exceeds maximum allowable limit {MAX_ARTIFACT_SIZE_BYTES} bytes"
            )

        buffer = io.BytesIO(artifact_bytes)
        payload = joblib.load(buffer)
        self._model_cache[artifact_hash] = payload
        return payload

    def score(
        self,
        artifact_base64: str,
        artifact_hash: str,
        feature_vector: Dict[str, float],
        feature_names: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Score a single feature window against the trained Isolation Forest model."""
        payload = self._load_model(artifact_base64, artifact_hash)
        clf = payload["model"]
        expected_features = payload.get("feature_names", feature_names or [])

        # Build feature vector in exact order
        values = []
        for feat in expected_features:
            val = feature_vector.get(feat, 0.0)
            if np.isnan(val) or np.isinf(val):
                val = 0.0
            values.append(float(val))

        X = np.array([values], dtype=np.float64)

        # Raw decision function: positive = inlier (normal), negative = outlier (anomalous)
        raw_score = float(clf.decision_function(X)[0])

        # Continuous monotonic normalization to [0, 100]:
        # raw_score >= 0 (inlier): maps [0.25, 0.0] -> [0.0, 50.0]
        # raw_score < 0 (outlier): maps [0.0, -0.15] -> [65.0, 100.0]
        if raw_score >= 0.0:
            normalized_score = max(0.0, 50.0 - (raw_score * 200.0))
        else:
            normalized_score = min(100.0, 65.0 + (abs(raw_score) * 250.0))

        normalized_score = round(normalized_score, 2)
        is_anomalous = raw_score < 0.0 or normalized_score >= DECISION_BOUNDARY_THRESHOLD
        classification = "ANOMALOUS" if is_anomalous else "NORMAL"

        # Feature contributions: compute z-scores against training distribution
        contributions = []
        means = payload.get("means", [])
        stds = payload.get("stds", [])
        for idx, feat in enumerate(expected_features):
            val = values[idx]
            m = means[idx] if idx < len(means) else 0.0
            s = stds[idx] if idx < len(stds) else 1.0
            z_score = abs((val - m) / (s if s > 1e-9 else 1.0))
            contributions.append({
                "feature": feat,
                "currentValue": round(val, 4),
                "baselineMean": round(m, 4),
                "zScore": round(float(z_score), 2),
            })

        # Sort by largest z-score descending
        contributions.sort(key=lambda c: c["zScore"], reverse=True)

        return {
            "rawScore": raw_score,
            "normalizedScore": normalized_score,
            "result": classification,
            "isAnomalous": is_anomalous,
            "classification": classification,
            "topContributingFeatures": contributions[:5],
        }

    def batch_score(
        self,
        artifact_base64: str,
        artifact_hash: str,
        feature_windows: List[Dict[str, float]],
        feature_names: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """Score multiple consecutive windows (e.g. for backtesting)."""
        results = []
        for window in feature_windows:
            scored = self.score(artifact_base64, artifact_hash, window, feature_names)
            results.append(scored)
        return results
