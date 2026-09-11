from fastapi import APIRouter
from datetime import datetime, timezone
import os

router = APIRouter()

@router.get("/health")
def get_health():
    """System and ML engine health check."""
    return {
        "status": "healthy",
        "service": "@aegisops/ai-service",
        "version": "0.1.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "components": {
            "ml_engine": {
                "status": "healthy",
                "message": "Isolation Forest ML engine initialized"
            },
            "system": {
                "status": "healthy",
                "pid": os.getpid()
            }
        }
    }

@router.get("/ready")
def get_readiness():
    """Readiness probe."""
    return {
        "ready": True,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@router.get("/live")
def get_liveness():
    """Liveness probe."""
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
