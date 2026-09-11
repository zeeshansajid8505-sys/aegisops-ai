import { BadRequestException } from '@nestjs/common';
import { AlertAggregation } from '@aegisops/types';

export interface MetricMetadata {
  instrumentType: string;
  isMonotonic?: boolean | null;
}

const GAUGE_VALID_AGGREGATIONS: ReadonlySet<AlertAggregation> = new Set([
  'AVG',
  'MIN',
  'MAX',
  'LAST',
]);

const MONOTONIC_COUNTER_VALID_AGGREGATIONS: ReadonlySet<AlertAggregation> = new Set([
  'SUM',
  'LAST',
  'RATE',
]);

const GENERAL_SUM_VALID_AGGREGATIONS: ReadonlySet<AlertAggregation> = new Set([
  'AVG',
  'MIN',
  'MAX',
  'SUM',
  'LAST',
]);

const HISTOGRAM_VALID_AGGREGATIONS: ReadonlySet<AlertAggregation> = new Set([
  'AVG',
  'MIN',
  'MAX',
  'SUM',
  'LAST',
  'P50',
  'P90',
  'P99',
]);

/**
 * Validates that the requested aggregation operator is mathematically and semantically
 * compatible with the underlying metric instrument type.
 */
export function validateMetricCompatibility(
  aggregation: AlertAggregation,
  metric: MetricMetadata,
): void {
  const { instrumentType, isMonotonic } = metric;

  if (instrumentType === 'GAUGE') {
    if (!GAUGE_VALID_AGGREGATIONS.has(aggregation)) {
      throw new BadRequestException(
        `Aggregation '${aggregation}' is not compatible with GAUGE metric. Allowed aggregations: ${Array.from(
          GAUGE_VALID_AGGREGATIONS,
        ).join(', ')}`,
      );
    }
  } else if (instrumentType === 'SUM') {
    if (isMonotonic) {
      if (!MONOTONIC_COUNTER_VALID_AGGREGATIONS.has(aggregation)) {
        throw new BadRequestException(
          `Aggregation '${aggregation}' is not compatible with monotonic SUM counter. Allowed aggregations: ${Array.from(
            MONOTONIC_COUNTER_VALID_AGGREGATIONS,
          ).join(', ')}`,
        );
      }
    } else {
      if (!GENERAL_SUM_VALID_AGGREGATIONS.has(aggregation)) {
        throw new BadRequestException(
          `Aggregation '${aggregation}' is not compatible with non-monotonic SUM metric. Allowed aggregations: ${Array.from(
            GENERAL_SUM_VALID_AGGREGATIONS,
          ).join(', ')}`,
        );
      }
    }
  } else if (instrumentType === 'HISTOGRAM') {
    if (!HISTOGRAM_VALID_AGGREGATIONS.has(aggregation)) {
      throw new BadRequestException(
        `Aggregation '${aggregation}' is not compatible with HISTOGRAM metric. Allowed aggregations: ${Array.from(
          HISTOGRAM_VALID_AGGREGATIONS,
        ).join(', ')}`,
      );
    }
  } else {
    // For other types, disallow percentiles and rate
    if (['P50', 'P90', 'P99', 'RATE'].includes(aggregation)) {
      throw new BadRequestException(
        `Aggregation '${aggregation}' is not compatible with instrument type '${instrumentType}'.`,
      );
    }
  }
}

