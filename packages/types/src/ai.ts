export type AnalysisStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SUPERSEDED';
export type HypothesisConfidence = 'LOW' | 'MEDIUM' | 'HIGH';
export type HypothesisStatus = 'PROPOSED' | 'CONFIRMED' | 'REJECTED' | 'SUPERSEDED';

export type FactType = 'METRIC' | 'ALERT' | 'HEALTH' | 'TOPOLOGY' | 'HUMAN_NOTE';

export type ReasonCode =
  | 'EARLIEST_ALERT'
  | 'LARGE_METRIC_DEVIATION'
  | 'CRITICAL_PROBE_FAILURE'
  | 'DIRECT_UPSTREAM_DEPENDENCY'
  | 'DIRECT_DOWNSTREAM_DEPENDENCY'
  | 'TOPOLOGY_PROXIMITY'
  | 'MULTIPLE_RELATED_ALERTS'
  | 'TIER_1_SERVICE'
  | 'TEMPORAL_PRECEDENCE'
  | 'RELATED_HEALTH_FAILURE'
  | 'HEALTHY_COUNTER_EVIDENCE'
  | 'NO_DIRECT_ALERT';

export interface ObservedFact {
  factId: string;
  type: FactType;
  description: string;
  entityRef?: string | null;
  timestamp?: string | null;
  source: string;
}

export interface IncidentHypothesis {
  id: string;
  organizationId: string;
  incidentId: string;
  analysisId: string;
  candidateServiceId?: string | null;
  candidateServiceName?: string | null;
  rank: number;
  hypothesis: string;
  confidence: HypothesisConfidence;
  score: number;
  reasonCodes: string[];
  evidenceRefs: string[];
  counterEvidenceRefs: string[];
  status: HypothesisStatus;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IncidentEvidenceSnapshot {
  id: string;
  organizationId: string;
  incidentId: string;
  windowStart: string;
  windowEnd: string;
  primaryServiceId?: string | null;
  affectedServiceIds: string[];
  evidenceVersion: string;
  evidenceFingerprint: string;
  facts: ObservedFact[];
  createdAt: string;
}

export interface RunbookRecommendationItem {
  runbookId: string;
  title: string;
  matchScore: number;
  reasonCodes: string[];
}

export interface ConfirmedRootCause {
  hypothesisId: string;
  summary: string;
  confirmedByMembershipId: string;
  confirmedByName?: string | null;
  confirmedAt: string;
}

export interface IncidentAnalysis {
  id: string;
  organizationId: string;
  incidentId: string;
  status: AnalysisStatus;
  analysisVersion: number;
  algorithmVersion: string;
  modelVersion: string;
  embeddingVersion: string;
  evidenceSnapshotId?: string | null;
  evidenceFingerprint?: string | null;
  startedAt: string;
  completedAt?: string | null;
  failedAt?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  summary?: string | null;
  hypotheses: IncidentHypothesis[];
  evidenceSnapshot?: IncidentEvidenceSnapshot | null;
  recommendedNextChecks: string[];
  recommendedRunbooks: RunbookRecommendationItem[];
  confirmedRootCause?: ConfirmedRootCause | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnomalyDetectionResult {
  isAnomaly: boolean;
  anomalyScore: number;
  threshold: number;
  featuresEvaluated: Record<string, number>;
  timestamp: string;
}
