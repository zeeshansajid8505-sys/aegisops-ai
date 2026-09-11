// Phase 3: Telemetry Ingestion, Metric Storage & Buffers

export interface TelemetryIngestKeySummary {
  id: string;
  organizationId: string;
  serviceId: string;
  environmentId: string;
  name: string;
  keyPrefix: string;
  isActive: boolean;
  rateLimitRpm?: number;
  rateLimitPts?: number;
  createdByUserId?: string | null;
  createdAt: string;
  updatedAt?: string;
  expiresAt?: string | null;
  revokedAt?: string | null;
  lastUsedAt?: string | null;
}

export interface TelemetryKeyCreatedResponse extends TelemetryIngestKeySummary {
  rawKey: string; // ONLY returned once upon creation!
}

export type TelemetryIngestKeyCreateResponse = TelemetryKeyCreatedResponse;

export interface CreateTelemetryKeyDto {
  name: string;
  environmentId: string;
  rateLimitRpm?: number;
  rateLimitPts?: number;
  expiresAt?: string;
}

export type MetricInstrumentType =
  | 'GAUGE'
  | 'SUM'
  | 'HISTOGRAM'
  | 'UP_DOWN_COUNTER'
  | 'SUMMARY'
  | 'OTHER';

export type AggregationTemporality = 'UNSPECIFIED' | 'DELTA' | 'CUMULATIVE';

export type MetricValueType = 'DOUBLE' | 'INT' | 'INT64' | 'HISTOGRAM';

export interface MetricDefinitionSummary {
  id: string;
  organizationId: string;
  serviceId: string;
  environmentId?: string;
  definitionKey?: string;
  name: string;
  description?: string | null;
  unit?: string | null;
  instrumentType: MetricInstrumentType;
  temporality?: AggregationTemporality;
  isMonotonic?: boolean | null;
  scopeName?: string | null;
  scopeVersion?: string | null;
  seriesCount?: number;
  createdAt?: string;
  firstSeenAt?: string;
  lastSeenAt: string;
}

export interface MetricSeriesSummary {
  id: string;
  organizationId: string;
  serviceId?: string;
  environmentId?: string;
  metricDefinitionId?: string;
  definitionId?: string;
  seriesHash?: string;
  seriesFingerprint?: string;
  resourceAttributes?: Record<string, unknown>;
  attributes: Record<string, unknown>;
  serviceInstanceId?: string | null;
  createdAt: string;
  lastSeenAt: string;
}

export interface MetricDataPoint {
  timestamp: string;
  timeUnixNano: string;
  value?: number | null;
  intValue?: string | null;
  doubleValue?: number | null;
  histogramCount?: string | null;
  histogramSum?: number | null;
  histogramMin?: number | null;
  histogramMax?: number | null;
  bucketCounts?: number[];
  explicitBounds?: number[];
  count?: number;
  min?: number;
  max?: number;
  sum?: number;
  p50?: number;
  p90?: number;
  p99?: number;
}

export interface MetricPointResponse extends MetricDataPoint {}

export interface HistogramPointResponse {
  timestamp: string;
  timeUnixNano: string;
  count: string;
  sum: number;
  min?: number | null;
  max?: number | null;
  explicitBounds: number[];
  bucketCounts: string[];
}

export type MetricQueryResolution = 'RAW' | 'ONE_MINUTE' | 'raw' | '1m' | '5m' | '1h';

export type MetricAggregation = 'AVG' | 'MIN' | 'MAX' | 'SUM' | 'LAST' | 'RATE';

export interface MetricTimeseriesData {
  metricName: string;
  instrumentType: MetricInstrumentType;
  unit?: string;
  seriesHash: string;
  attributes: Record<string, string | number | boolean>;
  points: MetricDataPoint[];
}

export interface MetricTimeseriesResponse {
  serviceId: string;
  environmentId: string;
  resolution: string;
  startTime: string;
  endTime: string;
  timeseries: MetricTimeseriesData[];
}

export interface MetricQueryRequest {
  metricDefinitionId?: string;
  metricName?: string;
  metricNames?: string[];
  environmentId?: string;
  from?: string; // ISO 8601 string
  to?: string; // ISO 8601 string
  startTime?: string;
  endTime?: string;
  resolution?: MetricQueryResolution;
  aggregation?: MetricAggregation;
  seriesFilters?: Record<string, string>;
  limit?: number;
  maxPoints?: number;
}

export interface MetricSeriesQueryResult {
  seriesId: string;
  seriesFingerprint: string;
  attributes: Record<string, unknown>;
  resourceAttributes: Record<string, unknown>;
  points: (MetricPointResponse | HistogramPointResponse)[];
}

export interface MetricQueryResponse {
  metricDefinition?: MetricDefinitionSummary;
  resolution: MetricQueryResolution;
  aggregation?: MetricAggregation;
  from?: string;
  to?: string;
  series: MetricSeriesQueryResult[];
}

export type IngestionStatus = 'ACTIVE' | 'STALE' | 'NEVER_RECEIVED';

export interface TelemetryIngestionRecentEvent {
  id: string;
  environmentId: string;
  pointsAccepted: number;
  pointsRejected: number;
  payloadBytes: number;
  contentType: string;
  clientIp?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
}

export interface TelemetryStatusResponse {
  serviceId?: string;
  organizationId?: string;
  environmentId?: string;
  status?: IngestionStatus;
  lastReceivedAt?: string | null;
  activeMetricCount?: number;
  activeSeriesCount?: number;
  recentAcceptedPoints?: number;
  recentRejectedPoints?: number;
  activeKeysCount?: number;
  seriesCount?: number;
  definitionsCount?: number;
  pointsAccepted24h?: number;
  pointsRejected24h?: number;
  recentEvents?: TelemetryIngestionRecentEvent[];
}
