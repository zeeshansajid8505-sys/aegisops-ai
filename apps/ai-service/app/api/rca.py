from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from app.core.security import verify_internal_api_key
from app.services.rca_engine import RcaEngine

router = APIRouter(prefix="/v1/rca", tags=["Root Cause Analysis"])
rca_engine = RcaEngine()

class IncidentMetadata(BaseModel):
    id: str
    incidentKey: str
    incidentKey: Optional[str] = ""
    key: Optional[str] = ""
    title: str
    severity: str = "WARNING"
    status: str = "INVESTIGATING"
    detectedAt: str
    primaryServiceId: Optional[str] = None

class CandidateService(BaseModel):
    id: str
    name: Optional[str] = None
    slug: Optional[str] = None
    tier: Optional[str] = "TIER_2"
    inIncident: Optional[bool] = False
    isPrimary: Optional[bool] = False
    teamId: Optional[str] = None

class DependencyEdge(BaseModel):
    sourceServiceId: str
    targetServiceId: str
    isCritical: Optional[bool] = False
    type: Optional[str] = "SYNCHRONOUS"

class TopologyPayload(BaseModel):
    services: List[Dict[str, Any]] = Field(default_factory=list)
    dependencies: List[Dict[str, Any]] = Field(default_factory=list)

class AlertEvidenceItem(BaseModel):
    id: str
    serviceId: str
    ruleName: Optional[str] = None
    severity: Optional[str] = None
    firingStartedAt: Optional[str] = None
    currentValue: Optional[float] = None
    thresholdValue: Optional[float] = None
    relativeTimeSeconds: Optional[float] = 0.0

class MetricEvidenceItem(BaseModel):
    serviceId: str
    metricName: str
    baselineMean: Optional[float] = 0.0
    baselineStdDev: Optional[float] = 0.0
    currentMean: Optional[float] = 0.0
    currentMax: Optional[float] = 0.0
    percentageChange: Optional[float] = 0.0
    normalizedDeviation: Optional[float] = 0.0
    sampleCount: Optional[int] = 0

class HealthEvidenceItem(BaseModel):
    serviceId: str
    probeStatus: str
    isCritical: Optional[bool] = False
    firstFailureTime: Optional[str] = None
    failureLatencyMs: Optional[float] = None

class HumanNoteItem(BaseModel):
    noteId: str
    content: str
    timestamp: str
    authorName: Optional[str] = "Responder"

class RcaAnalysisRequest(BaseModel):
    incident: IncidentMetadata
    candidateServices: List[CandidateService]
    topology: TopologyPayload
    metricEvidence: List[MetricEvidenceItem] = Field(default_factory=list)
    alertEvidence: List[AlertEvidenceItem] = Field(default_factory=list)
    healthEvidence: List[HealthEvidenceItem] = Field(default_factory=list)
    humanNotes: List[HumanNoteItem] = Field(default_factory=list)
    availableRunbooks: List[Dict[str, Any]] = Field(default_factory=list)
    anomalyEvidence: List[Dict[str, Any]] = Field(default_factory=list)

class ObservedFactOut(BaseModel):
    factId: str
    type: str
    description: str
    entityRef: Optional[str] = None
    timestamp: Optional[str] = None
    source: str

class HypothesisOut(BaseModel):
    id: str
    candidateServiceId: Optional[str] = None
    candidateServiceName: Optional[str] = None
    rank: int
    hypothesis: str
    confidence: str
    score: float
    reasonCodes: List[str]
    evidenceRefs: List[str]
    counterEvidenceRefs: List[str]

class RunbookRecommendationOut(BaseModel):
    runbookId: str
    title: str
    matchScore: float
    reasonCodes: List[str]

class RcaAnalysisResponse(BaseModel):
    algorithmVersion: str
    embeddingVersion: str
    modelVersion: str
    summary: str
    observedFacts: List[ObservedFactOut]
    rankedCandidates: List[HypothesisOut]
    recommendedNextChecks: List[str]
    recommendedRunbooks: List[RunbookRecommendationOut]

@router.get("/ready")
def get_rca_readiness():
    """Readiness probe for the RCA reasoning engine."""
    return {
        "ready": True,
        "engine": "RcaEngine",
        "embeddingDimension": rca_engine.embedder.dimension,
    }

@router.post("/analyze", response_model=RcaAnalysisResponse, dependencies=[Depends(verify_internal_api_key)])
def run_rca_analysis(req: RcaAnalysisRequest):
    """Execute evidence-based root cause analysis with internal pre-shared key authentication."""
    try:
        result = rca_engine.analyze(
            incident=req.incident.model_dump(),
            candidate_services=[s.model_dump() for s in req.candidateServices],
            topology=req.topology.model_dump(),
            metric_evidence=[m.model_dump() for m in req.metricEvidence],
            alert_evidence=[a.model_dump() for a in req.alertEvidence],
            health_evidence=[h.model_dump() for h in req.healthEvidence],
            human_notes=[n.model_dump() for n in req.humanNotes],
            available_runbooks=req.availableRunbooks,
            anomaly_evidence=req.anomalyEvidence,
        )
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Inference execution failed: {str(e)}",
        )

