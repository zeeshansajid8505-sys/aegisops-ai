import type { AlertSeverity } from './alerts';

export type ReliabilityTimeRange = '7d' | '30d' | '90d';

export interface IncidentMetricSummary {
  sampleCount: number;
  acknowledgedCount: number;
  resolvedCount: number;
  mttaSeconds: number | null;
  mttiSeconds: number | null;
  mttmSeconds: number | null;
  mttrSeconds: number | null;
  p50MttrSeconds: number | null;
  p90MttrSeconds: number | null;
}

export interface SeverityDistribution {
  SEV_1: number;
  SEV_2: number;
  SEV_3: number;
  SEV_4: number;
}

export interface DailyReliabilityPoint {
  date: string; // YYYY-MM-DD
  incidentCount: number;
  criticalCount: number;
  resolvedCount: number;
  avgMttrSeconds: number | null;
  alertFiringCount: number;
  anomalyCount: number;
}

export interface PotentialRecurrenceItem {
  serviceId: string;
  serviceName: string;
  alertRuleId?: string;
  alertRuleName?: string;
  incidentCount: number;
  lastIncidentAt: string;
  incidentIds: string[];
}

export interface AiAgreementMetric {
  humanConfirmedIncidentsCount: number;
  top1AgreementCount: number;
  agreementPercentage: number | null;
}

export interface AnomalyFeedbackBreakdown {
  USEFUL: number;
  FALSE_POSITIVE: number;
  EXPECTED_BEHAVIOR: number;
  UNSURE: number;
  total: number;
}

export interface RunbookReliabilityMetric {
  totalExecutions: number;
  completedCount: number;
  failedOrCancelledCount: number;
  completionRatePercentage: number | null;
  avgDurationSeconds: number | null;
}

export interface OrganizationReliabilitySummary {
  timeRange: ReliabilityTimeRange;
  metrics: IncidentMetricSummary;
  severityDistribution: SeverityDistribution;
  dailyTrend: DailyReliabilityPoint[];
  potentialRecurrences: PotentialRecurrenceItem[];
  aiAgreement: AiAgreementMetric;
  anomalyFeedback: AnomalyFeedbackBreakdown;
  runbookReliability: RunbookReliabilityMetric;
}

export interface ServiceReliabilitySummary {
  serviceId: string;
  serviceName: string;
  timeRange: ReliabilityTimeRange;
  metrics: IncidentMetricSummary;
  severityDistribution: SeverityDistribution;
  dailyTrend: DailyReliabilityPoint[];
  potentialRecurrences: PotentialRecurrenceItem[];
  recentIncidents: Array<{
    id: string;
    incidentKey: string;
    title: string;
    severity: AlertSeverity;
    status: string;
    detectedAt: string;
    resolvedAt: string | null;
    mttrSeconds: number | null;
  }>;
}
