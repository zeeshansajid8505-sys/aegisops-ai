import time
from typing import Dict, List, Any, Optional
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, Field
from app.core.security import verify_internal_api_key
from app.services.anomaly_engine import (
    IsolationForestEngine,
    AnomalyEngineError,
    ArtifactIntegrityError,
    ArtifactSizeError,
    InsufficientDataError,
)

router = APIRouter(prefix="/v1/anomaly")
engine = IsolationForestEngine()

class TrainModelRequest(BaseModel):
    detectorId: str
    featureNames: List[str]
    featureMatrix: List[List[float]]
    contamination: float = Field(default=0.02, ge=0.001, le=0.5)

class TrainModelResponse(BaseModel):
    detectorId: str
    algorithm: str
    algorithmVersion: str
    featureSchemaVersion: str
    featureNames: List[str]
    sampleCount: int
    contamination: float
    artifactBase64: str
    artifactHash: str
    artifactSizeBytes: int

class ScoreModelRequest(BaseModel):
    detectorId: str
    artifactBase64: str
    artifactHash: str
    featureVector: Dict[str, float]
    featureNames: Optional[List[str]] = None

class FeatureContribution(BaseModel):
    feature: str
    currentValue: float
    baselineMean: float
    zScore: float

class ScoreModelResponse(BaseModel):
    rawScore: float
    normalizedScore: float
    result: str
    isAnomalous: bool
    classification: str
    topContributingFeatures: List[FeatureContribution] = []
    durationMs: int = 0

class BatchScoreRequest(BaseModel):
    detectorId: str
    artifactBase64: str
    artifactHash: str
    featureWindows: List[Dict[str, float]]
    featureNames: Optional[List[str]] = None

class BatchScoreResponse(BaseModel):
    results: List[ScoreModelResponse]
    durationMs: int = 0

@router.get("/ready", tags=["Anomaly Detection"])
def get_ready_status():
    """Returns anomaly inference readiness and supported ML capabilities."""
    return {
        "status": "ready",
        "algorithm": "IsolationForest",
        "algorithmVersion": "1.9.0",
        "featureSchemaVersion": "anomaly-feature-v1",
        "supportedFeatures": [
            "mean", "median", "min", "max", "standardDeviation",
            "mad", "latestValue", "firstToLastDelta", "linearSlope",
            "meanRate", "maxRate", "minRate", "rateStdDev",
            "p50", "p90", "p99", "percentileDelta"
        ],
        "deterministic": True,
        "randomState": 42,
    }

@router.post("/models/train", response_model=TrainModelResponse, dependencies=[Depends(verify_internal_api_key)], tags=["Anomaly Detection"])
def train_anomaly_model(req: TrainModelRequest):
    """Trains an Isolation Forest model and returns the serialized model artifact."""
    try:
        res = engine.train(
            detector_id=req.detectorId,
            feature_names=req.featureNames,
            feature_matrix=req.featureMatrix,
            contamination=req.contamination,
        )
        return TrainModelResponse(
            detectorId=res["detector_id"],
            algorithm=res["algorithm"],
            algorithmVersion=res["algorithm_version"],
            featureSchemaVersion=res["feature_schema_version"],
            featureNames=res["feature_names"],
            sampleCount=res["sample_count"],
            contamination=res["contamination"],
            artifactBase64=res["artifact_base64"],
            artifactHash=res["artifact_hash"],
            artifactSizeBytes=res["artifact_size_bytes"],
        )
    except InsufficientDataError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except ArtifactSizeError as e:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Training failed: {e}")

@router.post("/models/score", response_model=ScoreModelResponse, dependencies=[Depends(verify_internal_api_key)], tags=["Anomaly Detection"])
def score_feature_window(req: ScoreModelRequest):
    """Evaluates a single feature window using the trained model artifact."""
    start_time = time.perf_counter()
    try:
        res = engine.score(
            artifact_base64=req.artifactBase64,
            artifact_hash=req.artifactHash,
            feature_vector=req.featureVector,
            feature_names=req.featureNames,
        )
        duration_ms = int((time.perf_counter() - start_time) * 1000)
        return ScoreModelResponse(
            rawScore=res["rawScore"],
            normalizedScore=res["normalizedScore"],
            result=res["result"],
            isAnomalous=res["isAnomalous"],
            classification=res["classification"],
            topContributingFeatures=[FeatureContribution(**c) for c in res.get("topContributingFeatures", [])],
            durationMs=duration_ms,
        )
    except ArtifactIntegrityError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except ArtifactSizeError as e:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Scoring failed: {e}")

@router.post("/models/batch-score", response_model=BatchScoreResponse, dependencies=[Depends(verify_internal_api_key)], tags=["Anomaly Detection"])
def batch_score_feature_windows(req: BatchScoreRequest):
    """Evaluates multiple feature windows (used for backtesting and historical evaluation)."""
    start_time = time.perf_counter()
    try:
        raw_results = engine.batch_score(
            artifact_base64=req.artifactBase64,
            artifact_hash=req.artifactHash,
            feature_windows=req.featureWindows,
            feature_names=req.featureNames,
        )
        duration_ms = int((time.perf_counter() - start_time) * 1000)
        scored = [
            ScoreModelResponse(
                rawScore=r["rawScore"],
                normalizedScore=r["normalizedScore"],
                result=r["result"],
                isAnomalous=r["isAnomalous"],
                classification=r["classification"],
                topContributingFeatures=[FeatureContribution(**c) for c in r.get("topContributingFeatures", [])],
                durationMs=0,
            )
            for r in raw_results
        ]
        return BatchScoreResponse(results=scored, durationMs=duration_ms)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Batch scoring failed: {e}")
