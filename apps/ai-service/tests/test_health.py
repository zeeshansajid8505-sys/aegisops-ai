from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_root():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "running"
    assert "version" in data

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "@aegisops/ai-service"
    assert "components" in data
    assert data["components"]["ml_engine"]["status"] == "healthy"

def test_readiness():
    response = client.get("/ready")
    assert response.status_code == 200
    assert response.json()["ready"] is True

def test_liveness():
    response = client.get("/live")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
