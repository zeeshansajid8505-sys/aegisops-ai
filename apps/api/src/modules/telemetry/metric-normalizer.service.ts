import { Injectable } from '@nestjs/common';
import { sanitizeAttributes } from './utils/sanitizer';
import { canonicalizeAttributes } from './utils/attribute-canonicalizer';
import { parseAndValidateTimestamp } from './utils/timestamp-validator';
import { parseBigIntSafe, parseNumberSafe, isValidFiniteNumber } from './utils/numeric-validator';
import type { TelemetryAuthContext } from './guards/machine-telemetry-auth.guard';

export interface NormalizedMetricPoint {
  organizationId: string;
  serviceId: string;
  environmentId: string;
  metricName: string;
  metricDescription?: string;
  metricUnit?: string;
  instrumentType: 'GAUGE' | 'SUM' | 'HISTOGRAM';
  temporality?: 'DELTA' | 'CUMULATIVE';
  isMonotonic?: boolean;
  seriesHash: string;
  attributes: Record<string, string | number | boolean>;
  attributesJson: string;
  timestamp: Date;
  timeUnixNano: bigint;
  startTimeUnixNano?: bigint;
  valueType: 'INT64' | 'DOUBLE' | 'HISTOGRAM';
  intValue?: bigint;
  doubleValue?: number;
  histogramCount?: bigint;
  histogramSum?: number;
  histogramMin?: number;
  histogramMax?: number;
  bucketCounts?: number[];
  explicitBounds?: number[];
}

export interface NormalizationResult {
  accepted: NormalizedMetricPoint[];
  rejectedCount: number;
  rejectionReasons: string[];
}

@Injectable()
export class MetricNormalizerService {
  normalizePayload(
    payload: any,
    authContext: TelemetryAuthContext,
    enforceSkew = true,
  ): NormalizationResult {
    const accepted: NormalizedMetricPoint[] = [];
    let rejectedCount = 0;
    const rejectionReasons: string[] = [];

    if (!payload || typeof payload !== 'object') {
      return { accepted, rejectedCount: 1, rejectionReasons: ['Invalid payload object'] };
    }

    // Support both snake_case (protobuf/otlp standard) and camelCase
    const resourceMetrics = payload.resource_metrics ?? payload.resourceMetrics ?? [];
    if (!Array.isArray(resourceMetrics)) {
      return { accepted, rejectedCount: 1, rejectionReasons: ['resource_metrics must be an array'] };
    }

    const now = new Date();

    for (const rm of resourceMetrics) {
      // Extract resource-level attributes
      const rawResourceAttrs = this.extractKeyValueArray(rm?.resource?.attributes);
      const scopeMetrics = rm?.scope_metrics ?? rm?.scopeMetrics ?? [];

      if (!Array.isArray(scopeMetrics)) continue;

      for (const sm of scopeMetrics) {
        const metrics = sm?.metrics ?? [];
        if (!Array.isArray(metrics)) continue;

        for (const metric of metrics) {
          const metricName = metric?.name;
          if (!metricName || typeof metricName !== 'string' || metricName.trim() === '') {
            rejectedCount++;
            rejectionReasons.push('Metric missing valid name');
            continue;
          }

          const description = metric?.description ? String(metric.description) : undefined;
          const unit = metric?.unit ? String(metric.unit) : undefined;

          // 1. Gauge
          if (metric.gauge) {
            const dataPoints = metric.gauge.data_points ?? metric.gauge.dataPoints ?? [];
            for (const dp of dataPoints) {
              const res = this.processNumberDataPoint(
                dp,
                metricName,
                description,
                unit,
                'GAUGE',
                undefined,
                undefined,
                rawResourceAttrs,
                authContext,
                now,
                enforceSkew,
              );
              if (res.point) accepted.push(res.point);
              else {
                rejectedCount++;
                if (res.reason) rejectionReasons.push(res.reason);
              }
            }
          }

          // 2. Sum
          else if (metric.sum) {
            const sumObj = metric.sum;
            const dataPoints = sumObj.data_points ?? sumObj.dataPoints ?? [];
            const temporality = this.mapTemporality(sumObj.aggregation_temporality ?? sumObj.aggregationTemporality);
            const isMonotonic = typeof sumObj.is_monotonic === 'boolean'
              ? sumObj.is_monotonic
              : typeof sumObj.isMonotonic === 'boolean'
              ? sumObj.isMonotonic
              : undefined;

            for (const dp of dataPoints) {
              const res = this.processNumberDataPoint(
                dp,
                metricName,
                description,
                unit,
                'SUM',
                temporality,
                isMonotonic,
                rawResourceAttrs,
                authContext,
                now,
                enforceSkew,
              );
              if (res.point) accepted.push(res.point);
              else {
                rejectedCount++;
                if (res.reason) rejectionReasons.push(res.reason);
              }
            }
          }

          // 3. Histogram
          else if (metric.histogram) {
            const histObj = metric.histogram;
            const dataPoints = histObj.data_points ?? histObj.dataPoints ?? [];
            const temporality = this.mapTemporality(histObj.aggregation_temporality ?? histObj.aggregationTemporality);

            for (const dp of dataPoints) {
              const res = this.processHistogramDataPoint(
                dp,
                metricName,
                description,
                unit,
                temporality,
                rawResourceAttrs,
                authContext,
                now,
                enforceSkew,
              );
              if (res.point) accepted.push(res.point);
              else {
                rejectedCount++;
                if (res.reason) rejectionReasons.push(res.reason);
              }
            }
          }
        }
      }
    }

    return { accepted, rejectedCount, rejectionReasons };
  }

  private processNumberDataPoint(
    dp: any,
    metricName: string,
    description: string | undefined,
    unit: string | undefined,
    instrumentType: 'GAUGE' | 'SUM',
    temporality: 'DELTA' | 'CUMULATIVE' | undefined,
    isMonotonic: boolean | undefined,
    resourceAttrs: Record<string, unknown>,
    auth: TelemetryAuthContext,
    now: Date,
    enforceSkew: boolean,
  ): { point?: NormalizedMetricPoint; reason?: string } {
    const rawTime = dp.time_unix_nano ?? dp.timeUnixNano;
    const parsedTs = parseAndValidateTimestamp(rawTime, now, enforceSkew);
    if (!parsedTs) {
      return { reason: `Invalid timestamp '${rawTime}'` };
    }
    if (!parsedTs.isValidSkew) {
      return { reason: parsedTs.skewError ?? 'Clock skew violation' };
    }

    // Combine resource attributes with point attributes
    const pointAttrs = this.extractKeyValueArray(dp.attributes);
    const combinedAttrs = { ...resourceAttrs, ...pointAttrs };
    const sanitized = sanitizeAttributes(combinedAttrs);
    const { canonicalJson, seriesHash } = canonicalizeAttributes(sanitized);

    // Extract value
    let valueType: 'INT64' | 'DOUBLE' = 'DOUBLE';
    let intValue: bigint | undefined;
    let doubleValue: number | undefined;

    const rawInt = dp.as_int ?? dp.asInt;
    const rawDouble = dp.as_double ?? dp.asDouble ?? dp.value;

    if (rawInt !== undefined && rawInt !== null) {
      const parsed = parseBigIntSafe(rawInt);
      if (parsed !== null) {
        valueType = 'INT64';
        intValue = parsed;
        doubleValue = Number(parsed);
      }
    } else if (rawDouble !== undefined && rawDouble !== null) {
      const parsed = parseNumberSafe(rawDouble);
      if (parsed !== null && isValidFiniteNumber(parsed)) {
        valueType = 'DOUBLE';
        doubleValue = parsed;
      }
    }

    if (doubleValue === undefined && intValue === undefined) {
      return { reason: 'Missing or non-finite numeric value' };
    }

    const startNano = parseBigIntSafe(dp.start_time_unix_nano ?? dp.startTimeUnixNano) ?? undefined;

    return {
      point: {
        organizationId: auth.organizationId,
        serviceId: auth.serviceId,
        environmentId: auth.environmentId,
        metricName,
        metricDescription: description,
        metricUnit: unit,
        instrumentType,
        temporality,
        isMonotonic,
        seriesHash,
        attributes: sanitized,
        attributesJson: canonicalJson,
        timestamp: parsedTs.date,
        timeUnixNano: parsedTs.timeUnixNano,
        startTimeUnixNano: startNano,
        valueType,
        intValue,
        doubleValue,
      },
    };
  }

  private processHistogramDataPoint(
    dp: any,
    metricName: string,
    description: string | undefined,
    unit: string | undefined,
    temporality: 'DELTA' | 'CUMULATIVE' | undefined,
    resourceAttrs: Record<string, unknown>,
    auth: TelemetryAuthContext,
    now: Date,
    enforceSkew: boolean,
  ): { point?: NormalizedMetricPoint; reason?: string } {
    const rawTime = dp.time_unix_nano ?? dp.timeUnixNano;
    const parsedTs = parseAndValidateTimestamp(rawTime, now, enforceSkew);
    if (!parsedTs) {
      return { reason: `Invalid timestamp '${rawTime}'` };
    }
    if (!parsedTs.isValidSkew) {
      return { reason: parsedTs.skewError ?? 'Clock skew violation' };
    }

    const pointAttrs = this.extractKeyValueArray(dp.attributes);
    const combinedAttrs = { ...resourceAttrs, ...pointAttrs };
    const sanitized = sanitizeAttributes(combinedAttrs);
    const { canonicalJson, seriesHash } = canonicalizeAttributes(sanitized);

    const count = parseBigIntSafe(dp.count) ?? 0n;
    const sum = parseNumberSafe(dp.sum) ?? 0;
    const min = parseNumberSafe(dp.min) ?? undefined;
    const max = parseNumberSafe(dp.max) ?? undefined;

    const rawBuckets = dp.bucket_counts ?? dp.bucketCounts ?? [];
    const rawBounds = dp.explicit_bounds ?? dp.explicitBounds ?? [];

    const bucketCounts: number[] = Array.isArray(rawBuckets)
      ? rawBuckets.map((b: any) => Number(parseBigIntSafe(b) ?? 0))
      : [];
    const explicitBounds: number[] = Array.isArray(rawBounds)
      ? rawBounds.map((b: any) => Number(parseNumberSafe(b) ?? 0))
      : [];

    const startNano = parseBigIntSafe(dp.start_time_unix_nano ?? dp.startTimeUnixNano) ?? undefined;

    return {
      point: {
        organizationId: auth.organizationId,
        serviceId: auth.serviceId,
        environmentId: auth.environmentId,
        metricName,
        metricDescription: description,
        metricUnit: unit,
        instrumentType: 'HISTOGRAM',
        temporality,
        seriesHash,
        attributes: sanitized,
        attributesJson: canonicalJson,
        timestamp: parsedTs.date,
        timeUnixNano: parsedTs.timeUnixNano,
        startTimeUnixNano: startNano,
        valueType: 'HISTOGRAM',
        doubleValue: sum,
        histogramCount: count,
        histogramSum: sum,
        histogramMin: min,
        histogramMax: max,
        bucketCounts,
        explicitBounds,
      },
    };
  }

  private extractKeyValueArray(attrs: any): Record<string, unknown> {
    if (!attrs) return {};
    if (Array.isArray(attrs)) {
      const result: Record<string, unknown> = {};
      for (const item of attrs) {
        if (!item || typeof item.key !== 'string') continue;
        const valObj = item.value;
        if (valObj === null || valObj === undefined) {
          result[item.key] = '';
        } else if (typeof valObj !== 'object') {
          result[item.key] = valObj;
        } else {
          // OTLP AnyValue object
          if ('string_value' in valObj) result[item.key] = valObj.string_value;
          else if ('stringValue' in valObj) result[item.key] = valObj.stringValue;
          else if ('bool_value' in valObj) result[item.key] = valObj.bool_value;
          else if ('boolValue' in valObj) result[item.key] = valObj.boolValue;
          else if ('int_value' in valObj) result[item.key] = valObj.int_value;
          else if ('intValue' in valObj) result[item.key] = valObj.intValue;
          else if ('double_value' in valObj) result[item.key] = valObj.double_value;
          else if ('doubleValue' in valObj) result[item.key] = valObj.doubleValue;
          else result[item.key] = JSON.stringify(valObj);
        }
      }
      return result;
    }
    if (typeof attrs === 'object') {
      return attrs;
    }
    return {};
  }

  private mapTemporality(val: any): 'DELTA' | 'CUMULATIVE' | undefined {
    if (val === 1 || val === 'AGGREGATION_TEMPORALITY_DELTA' || val === 'DELTA') return 'DELTA';
    if (val === 2 || val === 'AGGREGATION_TEMPORALITY_CUMULATIVE' || val === 'CUMULATIVE') return 'CUMULATIVE';
    return undefined;
  }
}

