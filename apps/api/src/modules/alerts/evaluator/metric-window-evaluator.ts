import { Injectable, Logger } from '@nestjs/common';
import {
  AlertAggregation,
  AlertComparisonOperator,
  AlertEvaluationMode,
  AlertEvaluationResult,
  AlertSeriesReduction,
  MetricSeriesFilter,
} from '@aegisops/types';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { evaluateComparison } from './threshold-evaluator';

export const ALERT_EVALUATION_DELAY_SECONDS = parseInt(
  process.env['ALERT_EVALUATION_DELAY_SECONDS'] ?? '10',
  10,
);

export const ALERT_MAX_INSTANCES_PER_RULE = parseInt(
  process.env['ALERT_MAX_INSTANCES_PER_RULE'] ?? '200',
  10,
);

export interface WindowEvaluationParams {
  organizationId: string;
  serviceId: string;
  environmentId: string;
  metricDefinitionId: string;
  windowSeconds: number;
  aggregation: AlertAggregation;
  seriesReduction?: AlertSeriesReduction | null;
  comparisonOperator: AlertComparisonOperator;
  thresholdValue: number;
  evaluationMode: AlertEvaluationMode;
  seriesFilters?: MetricSeriesFilter[];
  executionTime?: Date;
}

export interface SeriesEvaluationResult {
  seriesId: string;
  attributes: Record<string, string>;
  sampleCount: number;
  observedValue: number | null;
  breached: boolean;
  result: AlertEvaluationResult;
}

export interface WindowEvaluationResult {
  windowStart: Date;
  windowEnd: Date;
  totalSampleCount: number;
  seriesResults: SeriesEvaluationResult[];
  aggregateResult?: {
    observedValue: number | null;
    sampleCount: number;
    breached: boolean;
    result: AlertEvaluationResult;
  };
  cardinalityCapped?: boolean;
}

interface RawPoint {
  timestamp: Date;
  value: number;
  bucketCounts?: number[] | null;
  explicitBounds?: number[] | null;
}

export function matchesSeriesFilters(
  attributes: Record<string, any>,
  filters?: MetricSeriesFilter[],
): boolean {
  if (!filters || filters.length === 0) return true;
  for (const filter of filters) {
    const attrVal = attributes[filter.key] !== undefined ? String(attributes[filter.key]) : '';
    if (filter.operator === 'EQUALS') {
      if (attrVal !== filter.value) return false;
    } else if (filter.operator === 'NOT_EQUALS') {
      if (attrVal === filter.value) return false;
    }
  }
  return true;
}

export function computeAggregation(
  aggregation: AlertAggregation,
  points: RawPoint[],
): number | null {
  if (points.length === 0) return null;

  switch (aggregation) {
    case 'AVG': {
      const sum = points.reduce((acc, p) => acc + p.value, 0);
      return sum / points.length;
    }
    case 'MIN': {
      return Math.min(...points.map((p) => p.value));
    }
    case 'MAX': {
      return Math.max(...points.map((p) => p.value));
    }
    case 'SUM': {
      return points.reduce((acc, p) => acc + p.value, 0);
    }
    case 'LAST': {
      return points[points.length - 1]!.value;
    }
    case 'RATE': {
      if (points.length < 2) return 0;
      let totalDelta = 0;
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1]!.value;
        const curr = points[i]!.value;
        if (curr >= prev) {
          totalDelta += curr - prev;
        } else {
          // Counter reset detected: treat curr as delta from 0
          totalDelta += curr;
        }
      }
      const tStart = points[0]!.timestamp.getTime();
      const tEnd = points[points.length - 1]!.timestamp.getTime();
      const elapsedSeconds = (tEnd - tStart) / 1000;
      return elapsedSeconds > 0 ? totalDelta / elapsedSeconds : 0;
    }
    case 'P50':
    case 'P90':
    case 'P99': {
      const percentile = aggregation === 'P50' ? 50 : aggregation === 'P90' ? 90 : 99;
      return computePercentile(points, percentile);
    }
    default: {
      return points[points.length - 1]!.value;
    }
  }
}

function computePercentile(points: RawPoint[], percentile: number): number {
  if (points.length === 0) return 0;

  // Check if histogram bucket distributions are available
  let hasHistogramBuckets = false;
  const combinedBuckets: number[] = [];
  let explicitBounds: number[] = [];

  for (const p of points) {
    if (p.bucketCounts && p.bucketCounts.length > 0 && p.explicitBounds && p.explicitBounds.length > 0) {
      hasHistogramBuckets = true;
      explicitBounds = p.explicitBounds;
      for (let i = 0; i < p.bucketCounts.length; i++) {
        combinedBuckets[i] = (combinedBuckets[i] ?? 0) + Number(p.bucketCounts[i]);
      }
    }
  }

  if (hasHistogramBuckets && combinedBuckets.length > 0 && explicitBounds.length > 0) {
    const totalSamples = combinedBuckets.reduce((a, b) => a + b, 0);
    if (totalSamples > 0) {
      const target = totalSamples * (percentile / 100);
      let cumulative = 0;
      for (let i = 0; i < combinedBuckets.length; i++) {
        cumulative += combinedBuckets[i]!;
        if (cumulative >= target) {
          const lower = i === 0 ? 0 : explicitBounds[i - 1]!;
          const upper = i < explicitBounds.length ? explicitBounds[i]! : lower * 1.5 || 1000;
          const bucketCount = combinedBuckets[i]!;
          if (bucketCount === 0) return upper;
          const fraction = (target - (cumulative - bucketCount)) / bucketCount;
          return lower + fraction * (upper - lower);
        }
      }
      return explicitBounds[explicitBounds.length - 1]!;
    }
  }

  // Fallback to sorted scalar values
  const sorted = points.map((p) => p.value).sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1),
  );
  return sorted[index]!;
}

export function reduceAcrossSeries(
  reduction: AlertSeriesReduction,
  values: number[],
): number {
  if (values.length === 0) return 0;

  switch (reduction) {
    case 'MAX':
      return Math.max(...values);
    case 'MIN':
      return Math.min(...values);
    case 'SUM':
      return values.reduce((acc, v) => acc + v, 0);
    case 'AVG':
    default:
      return values.reduce((acc, v) => acc + v, 0) / values.length;
  }
}

@Injectable()
export class MetricWindowEvaluator {
  private readonly logger = new Logger(MetricWindowEvaluator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async evaluate(params: WindowEvaluationParams): Promise<WindowEvaluationResult> {
    const execTime = params.executionTime ?? new Date();
    const delaySeconds = ALERT_EVALUATION_DELAY_SECONDS;
    const windowEnd = new Date(execTime.getTime() - delaySeconds * 1000);
    const windowStart = new Date(windowEnd.getTime() - params.windowSeconds * 1000);

    // 1. Fetch all candidate series for this metric definition in this environment
    const allSeries = await this.prisma.metricSeries.findMany({
      where: {
        organizationId: params.organizationId,
        serviceId: params.serviceId,
        environmentId: params.environmentId,
        definitionId: params.metricDefinitionId,
      },
      select: {
        id: true,
        attributes: true,
      },
    });

    // 2. Filter candidate series by exact attribute filters (max 8)
    const filters = (params.seriesFilters ?? []).slice(0, 8);
    const matchingSeries = allSeries.filter((s) =>
      matchesSeriesFilters(s.attributes as Record<string, any>, filters),
    );

    let cardinalityCapped = false;
    let targetSeries = matchingSeries;

    if (
      params.evaluationMode === 'PER_SERIES' &&
      matchingSeries.length > ALERT_MAX_INSTANCES_PER_RULE
    ) {
      cardinalityCapped = true;
      targetSeries = matchingSeries.slice(0, ALERT_MAX_INSTANCES_PER_RULE);
      this.logger.warn(
        `Alert rule evaluation reached cardinality cap: ${matchingSeries.length} matching series capped to ${ALERT_MAX_INSTANCES_PER_RULE}`,
      );
    }

    // 3. Extract time-series data and compute aggregation for each series
    const seriesResults: SeriesEvaluationResult[] = [];
    let totalSampleCount = 0;

    for (const s of targetSeries) {
      const points = await this.fetchWindowPoints(
        params.organizationId,
        params.environmentId,
        s.id,
        windowStart,
        windowEnd,
      );

      totalSampleCount += points.length;

      if (points.length === 0) {
        seriesResults.push({
          seriesId: s.id,
          attributes: (s.attributes as Record<string, string>) ?? {},
          sampleCount: 0,
          observedValue: null,
          breached: false,
          result: 'NO_DATA',
        });
      } else {
        const aggVal = computeAggregation(params.aggregation, points);
        if (aggVal === null) {
          seriesResults.push({
            seriesId: s.id,
            attributes: (s.attributes as Record<string, string>) ?? {},
            sampleCount: 0,
            observedValue: null,
            breached: false,
            result: 'NO_DATA',
          });
        } else {
          const isBreached = evaluateComparison(
            aggVal,
            params.comparisonOperator,
            params.thresholdValue,
          );
          seriesResults.push({
            seriesId: s.id,
            attributes: (s.attributes as Record<string, string>) ?? {},
            sampleCount: points.length,
            observedValue: aggVal,
            breached: isBreached,
            result: isBreached ? 'BREACH' : 'OK',
          });
        }
      }
    }

    // 4. Handle AGGREGATE_SERIES two-stage evaluation
    let aggregateResult: WindowEvaluationResult['aggregateResult'];

    if (params.evaluationMode === 'AGGREGATE_SERIES') {
      const validObservedValues = seriesResults
        .map((sr) => sr.observedValue)
        .filter((v): v is number => v !== null);

      if (validObservedValues.length === 0) {
        aggregateResult = {
          observedValue: null,
          sampleCount: totalSampleCount,
          breached: false,
          result: 'NO_DATA',
        };
      } else {
        const reduction = params.seriesReduction ?? 'AVG';
        const finalReducedValue = reduceAcrossSeries(reduction, validObservedValues);
        const isBreached = evaluateComparison(
          finalReducedValue,
          params.comparisonOperator,
          params.thresholdValue,
        );

        aggregateResult = {
          observedValue: finalReducedValue,
          sampleCount: totalSampleCount,
          breached: isBreached,
          result: isBreached ? 'BREACH' : 'OK',
        };
      }
    }

    return {
      windowStart,
      windowEnd,
      totalSampleCount,
      seriesResults,
      aggregateResult,
      cardinalityCapped,
    };
  }

  private async fetchWindowPoints(
    organizationId: string,
    environmentId: string,
    seriesId: string,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<RawPoint[]> {
    const pointsMap = new Map<string, RawPoint>();

    // 1. Try Redis Hot Window if available
    const redis = this.redisService.getClient();
    if (redis && redis.status === 'ready') {
      try {
        const hotKey = `telemetry:hot:${organizationId}:${environmentId}:${seriesId}`;
        const rawItems = await redis.lrange(hotKey, 0, 99);

        for (const item of rawItems) {
          try {
            const parsed = JSON.parse(item);
            const pTime = new Date(parsed.timestamp);
            if (pTime >= windowStart && pTime <= windowEnd) {
              const iso = pTime.toISOString();
              if (!pointsMap.has(iso)) {
                pointsMap.set(iso, {
                  timestamp: pTime,
                  value: parsed.value ?? parsed.doubleValue ?? 0,
                  bucketCounts: parsed.bucketCounts ?? null,
                  explicitBounds: parsed.explicitBounds ?? null,
                });
              }
            }
          } catch {
            // Ignore malformed hot entries
          }
        }
      } catch (err) {
        this.logger.debug(`Redis hot window read failed: ${(err as Error).message}`);
      }
    }

    // 2. Query PostgreSQL metric_points to fill or verify
    const dbPoints = await this.prisma.metricPoint.findMany({
      where: {
        seriesId,
        timestamp: {
          gte: windowStart,
          lte: windowEnd,
        },
      },
      orderBy: { timestamp: 'asc' },
      take: 2000,
    });

    for (const p of dbPoints) {
      const iso = p.timestamp.toISOString();
      if (!pointsMap.has(iso)) {
        pointsMap.set(iso, {
          timestamp: p.timestamp,
          value: p.doubleValue ?? (p.intValue ? Number(p.intValue) : 0),
          bucketCounts: p.bucketCounts ? (p.bucketCounts as number[]) : null,
          explicitBounds: p.explicitBounds ? (p.explicitBounds as number[]) : null,
        });
      }
    }

    // If no raw points and window is large (> 5 min), fallback to 1-minute rollups
    if (pointsMap.size === 0) {
      const rollups = await this.prisma.metricRollupMinute.findMany({
        where: {
          seriesId,
          bucketMinute: {
            gte: windowStart,
            lte: windowEnd,
          },
        },
        orderBy: { bucketMinute: 'asc' },
        take: 500,
      });

      for (const r of rollups) {
        pointsMap.set(r.bucketMinute.toISOString(), {
          timestamp: r.bucketMinute,
          value: r.avg,
        });
      }
    }

    const sortedPoints = Array.from(pointsMap.values());
    sortedPoints.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    return sortedPoints;
  }
}

