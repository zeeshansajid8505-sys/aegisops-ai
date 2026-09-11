import { SeverityLevel } from './severity';

export type AlertSeverity = 'SEV_1' | 'SEV_2' | 'SEV_3' | 'SEV_4';

export type AlertRuleStatus = 'ENABLED' | 'DISABLED' | 'ARCHIVED';

export type AlertComparisonOperator = 'GT' | 'GTE' | 'LT' | 'LTE' | 'EQ' | 'NEQ';

export type AlertEvaluationMode = 'PER_SERIES' | 'AGGREGATE_SERIES';

export type AlertAggregation =
  | 'AVG'
  | 'MIN'
  | 'MAX'
  | 'SUM'
  | 'LAST'
  | 'RATE'
  | 'P50'
  | 'P90'
  | 'P99';

export type AlertSeriesReduction = 'MAX' | 'MIN' | 'AVG' | 'SUM';

export type AlertNoDataPolicy = 'IGNORE' | 'OK' | 'ALERT';

export type AlertInstanceState = 'INACTIVE' | 'PENDING' | 'FIRING';

export type AlertEvaluationResult = 'OK' | 'BREACH' | 'NO_DATA' | 'ERROR';

export type AlertEventType =
  | 'PENDING_STARTED'
  | 'PENDING_CLEARED'
  | 'FIRING_STARTED'
  | 'RESOLVED';

export interface MetricSeriesFilter {
  key: string;
  operator: 'EQUALS' | 'NOT_EQUALS';
  value: string;
}

export interface CreateAlertRuleDto {
  name: string;
  description?: string;
  metricDefinitionId: string;
  severity: SeverityLevel;
  status?: AlertRuleStatus;
  evaluationMode: AlertEvaluationMode;
  aggregation: AlertAggregation;
  seriesReduction?: AlertSeriesReduction | null;
  comparisonOperator: AlertComparisonOperator;
  thresholdValue: number;
  windowSeconds?: number;
  evaluationIntervalSeconds?: number;
  pendingDurationSeconds?: number;
  recoveryDurationSeconds?: number;
  noDataPolicy?: AlertNoDataPolicy;
  seriesFilters?: MetricSeriesFilter[];
}

export interface UpdateAlertRuleDto {
  name?: string;
  description?: string;
  metricDefinitionId?: string;
  severity?: SeverityLevel;
  status?: AlertRuleStatus;
  evaluationMode?: AlertEvaluationMode;
  aggregation?: AlertAggregation;
  seriesReduction?: AlertSeriesReduction | null;
  comparisonOperator?: AlertComparisonOperator;
  thresholdValue?: number;
  windowSeconds?: number;
  evaluationIntervalSeconds?: number;
  pendingDurationSeconds?: number;
  recoveryDurationSeconds?: number;
  noDataPolicy?: AlertNoDataPolicy;
  seriesFilters?: MetricSeriesFilter[];
}

export interface AlertRuleSummary {
  id: string;
  organizationId: string;
  serviceId: string;
  serviceName?: string;
  environmentId: string;
  environmentName?: string;
  metricDefinitionId: string;
  metricName?: string;
  name: string;
  description?: string | null;
  severity: SeverityLevel;
  status: AlertRuleStatus;
  evaluationMode: AlertEvaluationMode;
  aggregation: AlertAggregation;
  seriesReduction?: AlertSeriesReduction | null;
  comparisonOperator: AlertComparisonOperator;
  thresholdValue: number;
  windowSeconds: number;
  evaluationIntervalSeconds: number;
  pendingDurationSeconds: number;
  recoveryDurationSeconds: number;
  noDataPolicy: AlertNoDataPolicy;
  seriesFilters: MetricSeriesFilter[];
  activeAlertCount?: number;
  lastEvaluatedAt?: string | null;
  lastSuccessfulEvaluationAt?: string | null;
  lastEvaluationError?: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
}

export interface AlertRuleDetail extends AlertRuleSummary {
  metricUnit?: string | null;
  metricInstrumentType?: string;
  instances?: AlertInstanceSummary[];
  recentEvaluations?: AlertEvaluationSummary[];
}

export interface AlertInstanceSummary {
  id: string;
  organizationId: string;
  ruleId: string;
  ruleName?: string;
  serviceId: string;
  serviceName?: string;
  environmentId: string;
  environmentName?: string;
  metricSeriesId?: string | null;
  seriesAttributes?: Record<string, string>;
  fingerprint: string;
  severity: SeverityLevel;
  state: AlertInstanceState;
  currentValue?: number | null;
  thresholdValue?: number;
  comparisonOperator?: AlertComparisonOperator;
  lastEvaluationResult: AlertEvaluationResult;
  firstBreachedAt?: string | null;
  pendingSince?: string | null;
  firingStartedAt?: string | null;
  lastBreachedAt?: string | null;
  clearCandidateAt?: string | null;
  resolvedAt?: string | null;
  lastEvaluatedAt: string;
  lastStateChangeAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AlertInstanceDetail extends AlertInstanceSummary {
  rule?: AlertRuleSummary;
  recentEvents?: AlertEventSummary[];
  recentEvaluations?: AlertEvaluationSummary[];
}

export interface AlertEventSummary {
  id: string;
  organizationId: string;
  ruleId: string;
  alertInstanceId: string;
  eventType: AlertEventType;
  fromState?: AlertInstanceState | null;
  toState?: AlertInstanceState | null;
  observedValue?: number | null;
  thresholdValue?: number | null;
  message: string;
  metadata?: Record<string, any> | null;
  occurredAt: string;
}

export interface AlertEvaluationSummary {
  id: string;
  organizationId: string;
  ruleId: string;
  alertInstanceId?: string | null;
  metricSeriesId?: string | null;
  evaluationKey: string;
  evaluatedAt: string;
  windowStart: string;
  windowEnd: string;
  observedValue?: number | null;
  sampleCount: number;
  result: AlertEvaluationResult;
  durationMs: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  createdAt: string;
}

export interface AlertPreviewRequest {
  serviceId: string;
  environmentId: string;
  metricDefinitionId: string;
  evaluationMode: AlertEvaluationMode;
  aggregation: AlertAggregation;
  seriesReduction?: AlertSeriesReduction | null;
  comparisonOperator: AlertComparisonOperator;
  thresholdValue: number;
  windowSeconds: number;
  seriesFilters?: MetricSeriesFilter[];
}

export interface AlertPreviewSeriesResult {
  seriesId: string;
  attributes: Record<string, string>;
  sampleCount: number;
  observedValue?: number | null;
  breached: boolean;
}

export interface AlertPreviewResponse {
  matchingSeriesCount: number;
  windowStart: string;
  windowEnd: string;
  totalSampleCount: number;
  seriesResults: AlertPreviewSeriesResult[];
  reducedValue?: number | null;
  breached: boolean;
  result: AlertEvaluationResult;
}

