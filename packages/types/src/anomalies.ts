import { MetricSeriesFilter } from './alerts';

export type AnomalyDetectorStatus = 'ENABLED' | 'DISABLED' | 'ARCHIVED';

export type AnomalyEvaluationMode = 'PER_SERIES' | 'AGGREGATE_SERIES';

export type AnomalyModelStatus =
  | 'QUEUED'
  | 'TRAINING'
  | 'READY'
  | 'FAILED'
  | 'SUPERSEDED'
  | 'STALE'
  | 'INSUFFICIENT_DATA';

export type AnomalyEvaluationResult =
  | 'NORMAL'
  | 'ANOMALOUS'
  | 'INSUFFICIENT_DATA'
  | 'ERROR';

export type AnomalyFindingState = 'PENDING' | 'ANOMALOUS' | 'RESOLVED';

export type AnomalyEventType =
  | 'PENDING_STARTED'
  | 'ANOMALY_DETECTED'
  | 'ANOMALY_UPDATED'
  | 'RESOLVED'
  | 'MODEL_CHANGED'
  | 'ERROR';

export type AnomalyFeedbackClassification =
  | 'USEFUL'
  | 'FALSE_POSITIVE'
  | 'EXPECTED_BEHAVIOR'
  | 'UNSURE';

export type AnomalySensitivity = 'CONSERVATIVE' | 'BALANCED' | 'SENSITIVE';

export interface AnomalyDetectorSummary {
  id: string;
  organizationId: string;
  serviceId: string;
  serviceName?: string | null;
  environmentId: string;
  environmentName?: string | null;
  metricDefinitionId: string;
  metricName?: string | null;
  metricUnit?: string | null;
  instrumentType?: string | null;
  name: string;
  description?: string | null;
  status: AnomalyDetectorStatus;
  evaluationMode: AnomalyEvaluationMode;
  seriesFilters: MetricSeriesFilter[];
  windowSeconds: number;
  evaluationIntervalSeconds: number;
  trainingLookbackHours: number;
  minimumTrainingWindows: number;
  contamination: number;
  pendingEvaluations: number;
  recoveryEvaluations: number;
  retrainIntervalHours: number;
  currentModelVersion?: number | null;
  currentModelStatus?: AnomalyModelStatus | null;
  activeFindingsCount?: number;
  lastEvaluatedAt?: string | null;
  lastTrainedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
}

export interface AnomalyDetectorDetail extends AnomalyDetectorSummary {
  models?: AnomalyModelSummary[];
  activeFindings?: AnomalyFindingSummary[];
}

export interface CreateAnomalyDetectorDto {
  name: string;
  description?: string;
  metricDefinitionId: string;
  evaluationMode?: AnomalyEvaluationMode;
  seriesFilters?: MetricSeriesFilter[];
  windowSeconds?: number;
  evaluationIntervalSeconds?: number;
  trainingLookbackHours?: number;
  minimumTrainingWindows?: number;
  sensitivity?: AnomalySensitivity;
  contamination?: number;
  pendingEvaluations?: number;
  recoveryEvaluations?: number;
  retrainIntervalHours?: number;
}

export interface UpdateAnomalyDetectorDto {
  name?: string;
  description?: string;
  status?: AnomalyDetectorStatus;
  evaluationMode?: AnomalyEvaluationMode;
  seriesFilters?: MetricSeriesFilter[];
  windowSeconds?: number;
  evaluationIntervalSeconds?: number;
  trainingLookbackHours?: number;
  minimumTrainingWindows?: number;
  contamination?: number;
  pendingEvaluations?: number;
  recoveryEvaluations?: number;
  retrainIntervalHours?: number;
}

export interface AnomalyModelSummary {
  id: string;
  organizationId: string;
  detectorId: string;
  version: number;
  status: AnomalyModelStatus;
  algorithm: string;
  algorithmVersion: string;
  featureSchemaVersion: string;
  featureNames: string[];
  trainingDataFingerprint?: string | null;
  trainingWindowStart?: string | null;
  trainingWindowEnd?: string | null;
  sampleCount: number;
  contamination: number;
  artifactHash?: string | null;
  artifactSizeBytes?: number | null;
  trainedAt?: string | null;
  failedAt?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  createdAt: string;
}

export interface AnomalyEvaluationSummary {
  id: string;
  organizationId: string;
  detectorId: string;
  modelVersionId?: string | null;
  metricSeriesId?: string | null;
  evaluationKey: string;
  evaluatedAt: string;
  windowStart: string;
  windowEnd: string;
  featureVector: Record<string, number>;
  rawScore: number;
  normalizedScore: number;
  classification: string;
  result: AnomalyEvaluationResult;
  durationMs: number;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface AnomalyEventSummary {
  id: string;
  findingId: string;
  eventType: AnomalyEventType;
  score: number;
  message: string;
  metadata?: Record<string, unknown> | null;
  occurredAt: string;
}

export interface AnomalyFeedbackSummary {
  id: string;
  organizationId: string;
  findingId: string;
  membershipId: string;
  userName?: string | null;
  classification: AnomalyFeedbackClassification;
  note?: string | null;
  createdAt: string;
}

export interface AnomalyFindingSummary {
  id: string;
  organizationId: string;
  detectorId: string;
  detectorName?: string | null;
  serviceId: string;
  serviceName?: string | null;
  environmentId: string;
  environmentName?: string | null;
  metricDefinitionId?: string | null;
  metricName?: string | null;
  metricSeriesId?: string | null;
  seriesAttributes?: Record<string, string> | null;
  fingerprint: string;
  state: AnomalyFindingState;
  firstDetectedAt?: string | null;
  pendingSince?: string | null;
  anomalousSince?: string | null;
  lastAnomalousAt?: string | null;
  lastNormalAt?: string | null;
  resolvedAt?: string | null;
  currentScore: number;
  peakScore: number;
  modelVersionId?: string | null;
  feedbacksCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AnomalyFindingDetail extends AnomalyFindingSummary {
  recentEvaluations?: AnomalyEvaluationSummary[];
  events?: AnomalyEventSummary[];
  feedbacks?: AnomalyFeedbackSummary[];
}

export interface AnomalyFeedbackDto {
  classification: AnomalyFeedbackClassification;
  note?: string;
}

export interface AnomalyBacktestResult {
  detectorId?: string;
  windowsEvaluated: number;
  windowsFlagged: number;
  scoreDistribution: {
    min: number;
    max: number;
    mean: number;
    p50: number;
    p90: number;
    p99: number;
  };
  flaggedTimestamps: string[];
  sampleCount: number;
}

