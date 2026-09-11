import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings
from app.services.topology_embedder import TopologyEmbedder

client = TestClient(app)
VALID_KEY = settings.AI_INTERNAL_API_KEY

def test_rca_readiness_probe():
    response = client.get("/v1/rca/ready")
    assert response.status_code == 200
    data = response.json()
    assert data["ready"] is True
    assert data["engine"] == "RcaEngine"

def test_internal_auth_enforcement():
    sample_payload = {
        "incident": {
            "id": "inc-1",
            "incidentKey": "INC-1001",
            "title": "Degraded Checkout Flow",
            "detectedAt": "2026-09-08T12:00:00Z"
        },
        "candidateServices": [
            {"id": "svc-1", "name": "Checkout API"}
        ],
        "topology": {"services": [], "dependencies": []}
    }

    # Missing header -> 401
    res_no_header = client.post("/v1/rca/analyze", json=sample_payload)
    assert res_no_header.status_code == 401

    # Invalid header -> 401
    res_bad_key = client.post(
        "/v1/rca/analyze",
        json=sample_payload,
        headers={"X-Internal-Service-Key": "wrong-key"}
    )
    assert res_bad_key.status_code == 401

    # Valid key -> 200
    res_ok = client.post(
        "/v1/rca/analyze",
        json=sample_payload,
        headers={"X-Internal-Service-Key": VALID_KEY}
    )
    assert res_ok.status_code == 200

def test_topology_embedding_determinism_and_versioning():
    embedder = TopologyEmbedder(dimension=16)

    services_a = [
        {"id": "svc-checkout", "slug": "checkout-api", "tier": "TIER_1"},
        {"id": "svc-payment", "slug": "payment-gateway", "tier": "TIER_1"},
    ]
    dependencies_a = [
        {"sourceServiceId": "svc-checkout", "targetServiceId": "svc-payment", "isCritical": True}
    ]

    version_1, emb_1 = embedder.generate_embeddings(services_a, dependencies_a)
    version_2, emb_2 = embedder.generate_embeddings(services_a, dependencies_a)

    # Identical inputs must generate identical graph version and vectors
    assert version_1 == version_2
    assert emb_1 == emb_2
    assert len(emb_1["svc-checkout"]) == 16

    # Adding a dependency must alter the graph version
    dependencies_b = dependencies_a + [
        {"sourceServiceId": "svc-payment", "targetServiceId": "svc-db", "isCritical": False}
    ]
    version_3, _ = embedder.generate_embeddings(services_a, dependencies_b)
    assert version_1 != version_3

def test_upstream_failure_ranking():
    """When upstream payment-gateway exhibits earliest alert and probe failure, it ranks #1."""
    payload = {
        "incident": {
            "id": "inc-upstream-fail",
            "incidentKey": "INC-2001",
            "title": "Payment Degradation Cascading to Checkout",
            "severity": "CRITICAL",
            "status": "INVESTIGATING",
            "detectedAt": "2026-09-08T12:00:00Z"
        },
        "candidateServices": [
            {"id": "svc-checkout", "name": "Checkout API", "slug": "checkout-api", "tier": "TIER_1"},
            {"id": "svc-payment", "name": "Payment Gateway", "slug": "payment-gateway", "tier": "TIER_1"},
        ],
        "topology": {
            "services": [
                {"id": "svc-checkout", "slug": "checkout-api", "tier": "TIER_1"},
                {"id": "svc-payment", "slug": "payment-gateway", "tier": "TIER_1"},
            ],
            "dependencies": [
                {"sourceServiceId": "svc-checkout", "targetServiceId": "svc-payment", "isCritical": True}
            ]
        },
        "alertEvidence": [
            {
                "id": "alt-pay-1",
                "serviceId": "svc-payment",
                "ruleName": "Payment Gateway 5xx Spike",
                "firingStartedAt": "2026-09-08T11:58:00Z",
                "currentValue": 12.5,
                "thresholdValue": 5.0
            },
            {
                "id": "alt-chk-1",
                "serviceId": "svc-checkout",
                "ruleName": "Checkout Latency P99",
                "firingStartedAt": "2026-09-08T12:00:00Z",
                "currentValue": 850.0,
                "thresholdValue": 200.0
            }
        ],
        "metricEvidence": [
            {
                "serviceId": "svc-payment",
                "metricName": "http.server.errors",
                "percentageChange": 250.0,
                "normalizedDeviation": 4.5
            },
            {
                "serviceId": "svc-checkout",
                "metricName": "http.server.duration",
                "percentageChange": 95.0,
                "normalizedDeviation": 2.8
            }
        ],
        "healthEvidence": [
            {
                "serviceId": "svc-payment",
                "probeStatus": "UNHEALTHY",
                "isCritical": True,
                "firstFailureTime": "2026-09-08T11:58:10Z"
            }
        ],
        "availableRunbooks": [
            {
                "id": "rb-pay",
                "name": "Investigate Upstream Payment Gateway Latency",
                "serviceId": "svc-payment",
                "severity": "CRITICAL",
                "tags": ["latency", "upstream"]
            }
        ]
    }

    res = client.post(
        "/v1/rca/analyze",
        json=payload,
        headers={"X-Internal-Service-Key": VALID_KEY}
    )
    assert res.status_code == 200
    data = res.json()

    candidates = data["rankedCandidates"]
    assert len(candidates) == 2

    # payment-gateway must be #1
    top = candidates[0]
    assert top["candidateServiceId"] == "svc-payment"
    assert top["rank"] == 1
    assert "EARLIEST_ALERT" in top["reasonCodes"]
    assert "CRITICAL_PROBE_FAILURE" in top["reasonCodes"]
    assert "DIRECT_UPSTREAM_DEPENDENCY" in top["reasonCodes"]
    assert top["confidence"] == "HIGH"

    # checkout-api must be #2
    second = candidates[1]
    assert second["candidateServiceId"] == "svc-checkout"
    assert second["rank"] == 2

    # Runbook recommendation must match payment-gateway
    assert len(data["recommendedRunbooks"]) > 0
    assert data["recommendedRunbooks"][0]["runbookId"] == "rb-pay"

def test_counter_scenario_healthy_upstream_penalization():
    """When checkout-api degrades but payment-gateway is healthy, payment-gateway is penalized."""
    payload = {
        "incident": {
            "id": "inc-local-fail",
            "incidentKey": "INC-2002",
            "title": "Checkout Local Cache Exhaustion",
            "severity": "WARNING",
            "status": "INVESTIGATING",
            "detectedAt": "2026-09-08T14:00:00Z"
        },
        "candidateServices": [
            {"id": "svc-checkout", "name": "Checkout API", "slug": "checkout-api", "tier": "TIER_1"},
            {"id": "svc-payment", "name": "Payment Gateway", "slug": "payment-gateway", "tier": "TIER_1"},
        ],
        "topology": {
            "services": [
                {"id": "svc-checkout", "slug": "checkout-api", "tier": "TIER_1"},
                {"id": "svc-payment", "slug": "payment-gateway", "tier": "TIER_1"},
            ],
            "dependencies": [
                {"sourceServiceId": "svc-checkout", "targetServiceId": "svc-payment", "isCritical": True}
            ]
        },
        # Only checkout-api has an alert
        "alertEvidence": [
            {
                "id": "alt-chk-mem",
                "serviceId": "svc-checkout",
                "ruleName": "Memory Saturation",
                "firingStartedAt": "2026-09-08T13:59:00Z",
                "currentValue": 92.0,
                "thresholdValue": 85.0
            }
        ],
        "metricEvidence": [
            {
                "serviceId": "svc-checkout",
                "metricName": "process.runtime.memory",
                "percentageChange": 80.0,
                "normalizedDeviation": 3.2
            },
            {
                # payment-gateway metrics are completely normal
                "serviceId": "svc-payment",
                "metricName": "http.server.duration",
                "percentageChange": 2.0,
                "normalizedDeviation": 0.1
            }
        ],
        "healthEvidence": [
            {
                "serviceId": "svc-payment",
                "probeStatus": "HEALTHY",
                "isCritical": True
            }
        ]
    }

    res = client.post(
        "/v1/rca/analyze",
        json=payload,
        headers={"X-Internal-Service-Key": VALID_KEY}
    )
    assert res.status_code == 200
    data = res.json()

    candidates = data["rankedCandidates"]

    # checkout-api must be ranked #1
    top = candidates[0]
    assert top["candidateServiceId"] == "svc-checkout"
    assert top["rank"] == 1

    # payment-gateway must be penalized and NOT ranked #1
    pay = [c for c in candidates if c["candidateServiceId"] == "svc-payment"][0]
    assert pay["rank"] == 2
    assert "HEALTHY_COUNTER_EVIDENCE" in pay["reasonCodes"]
    assert "NO_DIRECT_ALERT" in pay["reasonCodes"]
    assert len(pay["counterEvidenceRefs"]) > 0

