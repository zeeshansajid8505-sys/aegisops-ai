import pytest
import numpy as np
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings
from app.services.anomaly_engine import IsolationForestEngine, ArtifactIntegrityError, InsufficientDataError

client = TestClient(app)
VALID_KEY = settings.AI_INTERNAL_API_KEY
AUTH_HEADERS = {"X-Internal-Service-Key": VALID_KEY}

def test_anomaly_readiness_probe():
    response = client.get("/v1/anomaly/ready")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"
    assert data["algorithm"] == "IsolationForest"
    assert data["algorithmVersion"] == "1.9.0"
    assert "mean" in data["supportedFeatures"]
    assert data["deterministic"] is True

def test_anomaly_engine_deterministic_training_and_scoring():
    engine = IsolationForestEngine()
    feature_names = ["mean", "max", "p90", "standardDeviation"]

    # Generate 50 normal samples around mean=50, max=55, p90=53, stdDev=2
    np.random.seed(42)
    feature_matrix = []
    for _ in range(50):
        feature_matrix.append([
            float(np.random.normal(50.0, 1.0)),
            float(np.random.normal(55.0, 1.5)),
            float(np.random.normal(53.0, 1.2)),
            float(np.random.normal(2.0, 0.2)),
        ])

    res = engine.train(
        detector_id="det-test-1",
        feature_names=feature_names,
        feature_matrix=feature_matrix,
        contamination=0.02,
    )

    assert res["detector_id"] == "det-test-1"
    assert res["sample_count"] == 50
    assert len(res["artifact_hash"]) == 64
    assert res["artifact_size_bytes"] > 0
    assert res["artifact_size_bytes"] <= 2 * 1024 * 1024

    # Score normal point
    normal_vector = {"mean": 50.1, "max": 54.8, "p90": 52.9, "standardDeviation": 2.0}
    normal_score = engine.score(
        artifact_base64=res["artifact_base64"],
        artifact_hash=res["artifact_hash"],
        feature_vector=normal_vector,
        feature_names=feature_names,
    )
    assert normal_score["result"] == "NORMAL"
    assert normal_score["isAnomalous"] is False
    assert normal_score["normalizedScore"] < 50.0

    # Score clear outlier point
    anomalous_vector = {"mean": 450.0, "max": 900.0, "p90": 800.0, "standardDeviation": 85.0}
    anom_score = engine.score(
        artifact_base64=res["artifact_base64"],
        artifact_hash=res["artifact_hash"],
        feature_vector=anomalous_vector,
        feature_names=feature_names,
    )
    assert anom_score["result"] == "ANOMALOUS"
    assert anom_score["isAnomalous"] is True
    assert anom_score["normalizedScore"] >= 65.0
    assert len(anom_score["topContributingFeatures"]) > 0

def test_anomaly_auth_enforcement():
    # Missing header -> 401
    res_no_header = client.post("/v1/anomaly/models/train", json={})
    assert res_no_header.status_code == 401

    # Invalid header -> 401
    res_bad_key = client.post(
        "/v1/anomaly/models/train",
        json={},
        headers={"X-Internal-Service-Key": "wrong-key"}
    )
    assert res_bad_key.status_code == 401

def test_anomaly_api_train_and_score():
    feature_names = ["latency_mean", "latency_p99"]
    np.random.seed(42)
    feature_matrix = [
        [float(np.random.normal(25.0, 0.5)), float(np.random.normal(30.0, 1.0))]
        for _ in range(40)
    ]

    train_payload = {
        "detectorId": "det-api-1",
        "featureNames": feature_names,
        "featureMatrix": feature_matrix,
        "contamination": 0.02,
    }

    train_res = client.post("/v1/anomaly/models/train", json=train_payload, headers=AUTH_HEADERS)
    assert train_res.status_code == 200
    train_data = train_res.json()
    assert train_data["detectorId"] == "det-api-1"
    assert "artifactBase64" in train_data
    assert "artifactHash" in train_data

    # Score through API
    score_payload = {
        "detectorId": "det-api-1",
        "artifactBase64": train_data["artifactBase64"],
        "artifactHash": train_data["artifactHash"],
        "featureVector": {"latency_mean": 24.9, "latency_p99": 29.8},
        "featureNames": feature_names,
    }
    score_res = client.post("/v1/anomaly/models/score", json=score_payload, headers=AUTH_HEADERS)
    assert score_res.status_code == 200
    score_data = score_res.json()
    assert score_data["result"] == "NORMAL"
    assert score_data["isAnomalous"] is False

    # Score outlier through API
    spike_payload = {
        "detectorId": "det-api-1",
        "artifactBase64": train_data["artifactBase64"],
        "artifactHash": train_data["artifactHash"],
        "featureVector": {"latency_mean": 850.0, "latency_p99": 1200.0},
        "featureNames": feature_names,
    }
    spike_res = client.post("/v1/anomaly/models/score", json=spike_payload, headers=AUTH_HEADERS)
    assert spike_res.status_code == 200
    spike_data = spike_res.json()
    assert spike_data["result"] == "ANOMALOUS"
    assert spike_data["isAnomalous"] is True
    assert spike_data["normalizedScore"] >= 65.0

def test_anomaly_sha256_tamper_detection():
    feature_names = ["rate"]
    feature_matrix = [[float(i)] for i in range(20)]
    engine = IsolationForestEngine()
    res = engine.train("det-tamper", feature_names, feature_matrix)

    # Tampered hash
    tampered_hash = "0000000000000000000000000000000000000000000000000000000000000000"
    score_payload = {
        "detectorId": "det-tamper",
        "artifactBase64": res["artifact_base64"],
        "artifactHash": tampered_hash,
        "featureVector": {"rate": 10.0},
        "featureNames": feature_names,
    }
    score_res = client.post("/v1/anomaly/models/score", json=score_payload, headers=AUTH_HEADERS)
    assert score_res.status_code == 400
    assert "mismatch" in score_res.json()["detail"].lower()

def test_anomaly_insufficient_samples():
    payload = {
        "detectorId": "det-too-few",
        "featureNames": ["mean"],
        "featureMatrix": [[1.0], [2.0]],
        "contamination": 0.02,
    }
    res = client.post("/v1/anomaly/models/train", json=payload, headers=AUTH_HEADERS)
    assert res.status_code == 400
    assert "insufficient" in res.json()["detail"].lower()
