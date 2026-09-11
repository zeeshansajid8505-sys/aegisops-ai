import { Injectable } from '@nestjs/common';
import { MetricInstrumentType } from '@prisma/client';

export interface DataPoint {
  timestamp: Date;
  value: number;
}

export interface ExtractedFeatureWindow {
  featureSchemaVersion: string;
  featureNames: string[];
  featureVector: Record<string, number>;
  matrixRow: number[];
  sampleCount: number;
}

export const FEATURE_SCHEMA_VERSION = 'anomaly-feature-v1';

@Injectable()
export class FeatureWindowEngine {

  getFeatureNames(instrumentType: MetricInstrumentType): string[] {
    switch (instrumentType) {
      case MetricInstrumentType.GAUGE:
        return [
          'mean',
          'median',
          'min',
          'max',
          'standardDeviation',
          'mad',
          'latestValue',
          'firstToLastDelta',
          'linearSlope',
          'sampleCount',
        ];
      case MetricInstrumentType.SUM:
        return [
          'meanRate',
          'maxRate',
          'minRate',
          'rateStdDev',
          'rateDelta',
          'rateSlope',
          'sampleCount',
        ];
      case MetricInstrumentType.HISTOGRAM:
      case MetricInstrumentType.SUMMARY:
        return [
          'count',
          'sum',
          'p50',
          'p90',
          'p99',
          'max',
          'percentileDelta',
          'latencySlope',
          'sampleCount',
        ];
      default:
        return [
          'mean',
          'median',
          'min',
          'max',
          'standardDeviation',
          'mad',
          'latestValue',
          'firstToLastDelta',
          'linearSlope',
          'sampleCount',
        ];
    }
  }

  extract(points: DataPoint[], instrumentType: MetricInstrumentType): ExtractedFeatureWindow {
    const sorted = [...points].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const featureNames = this.getFeatureNames(instrumentType);
    let featureVector: Record<string, number>;

    switch (instrumentType) {
      case MetricInstrumentType.GAUGE:
        featureVector = this.extractGaugeFeatures(sorted);
        break;
      case MetricInstrumentType.SUM:
        featureVector = this.extractSumFeatures(sorted);
        break;
      case MetricInstrumentType.HISTOGRAM:
      case MetricInstrumentType.SUMMARY:
        featureVector = this.extractHistogramFeatures(sorted);
        break;
      default:
        featureVector = this.extractGaugeFeatures(sorted);
        break;
    }

    const matrixRow = featureNames.map((name) => {
      const val = featureVector[name];
      return typeof val === 'number' && Number.isFinite(val) ? val : 0.0;
    });

    return {
      featureSchemaVersion: FEATURE_SCHEMA_VERSION,
      featureNames,
      featureVector,
      matrixRow,
      sampleCount: sorted.length,
    };
  }

  private extractGaugeFeatures(points: DataPoint[]): Record<string, number> {
    if (points.length === 0) {
      return {
        mean: 0,
        median: 0,
        min: 0,
        max: 0,
        standardDeviation: 0,
        mad: 0,
        latestValue: 0,
        firstToLastDelta: 0,
        linearSlope: 0,
        sampleCount: 0,
      };
    }

    const values = points.map((p) => p.value);
    const n = values.length;
    const sum = values.reduce((acc, v) => acc + v, 0);
    const mean = sum / n;

    const sortedVals = [...values].sort((a, b) => a - b);
    const median = this.computePercentile(sortedVals, 50);
    const min = sortedVals[0] ?? 0;
    const max = sortedVals[sortedVals.length - 1] ?? 0;

    const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (n > 1 ? n - 1 : 1);
    const standardDeviation = Math.sqrt(variance);

    // Median Absolute Deviation
    const absDevs = sortedVals.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
    const mad = this.computePercentile(absDevs, 50);

    const latestValue = points[points.length - 1]?.value ?? 0;
    const firstValue = points[0]?.value ?? 0;
    const firstToLastDelta = latestValue - firstValue;
    const linearSlope = this.computeSlope(points);

    return {
      mean: Number(mean.toFixed(4)),
      median: Number(median.toFixed(4)),
      min: Number(min.toFixed(4)),
      max: Number(max.toFixed(4)),
      standardDeviation: Number(standardDeviation.toFixed(4)),
      mad: Number(mad.toFixed(4)),
      latestValue: Number(latestValue.toFixed(4)),
      firstToLastDelta: Number(firstToLastDelta.toFixed(4)),
      linearSlope: Number(linearSlope.toFixed(6)),
      sampleCount: n,
    };
  }

  private extractSumFeatures(points: DataPoint[]): Record<string, number> {
    if (points.length === 0) {
      return {
        meanRate: 0,
        maxRate: 0,
        minRate: 0,
        rateStdDev: 0,
        rateDelta: 0,
        rateSlope: 0,
        sampleCount: 0,
      };
    }

    if (points.length === 1) {
      return {
        meanRate: points[0]?.value ?? 0,
        maxRate: points[0]?.value ?? 0,
        minRate: points[0]?.value ?? 0,
        rateStdDev: 0,
        rateDelta: 0,
        rateSlope: 0,
        sampleCount: 1,
      };
    }

    const rates: { timestamp: Date; rate: number }[] = [];
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]!;
      const curr = points[i]!;
      const dtSeconds = Math.max(0.001, (curr.timestamp.getTime() - prev.timestamp.getTime()) / 1000);
      let delta = curr.value - prev.value;
      // Handle monotonic counter reset
      if (delta < 0) {
        delta = curr.value;
      }
      rates.push({
        timestamp: curr.timestamp,
        rate: Math.max(0, delta / dtSeconds),
      });
    }

    const rateValues = rates.map((r) => r.rate);
    const n = rateValues.length;
    const sum = rateValues.reduce((acc, v) => acc + v, 0);
    const meanRate = sum / n;
    const sortedRates = [...rateValues].sort((a, b) => a - b);
    const minRate = sortedRates[0] ?? 0;
    const maxRate = sortedRates[sortedRates.length - 1] ?? 0;

    const variance = rateValues.reduce((acc, v) => acc + Math.pow(v - meanRate, 2), 0) / (n > 1 ? n - 1 : 1);
    const rateStdDev = Math.sqrt(variance);
    const firstRate = rateValues[0] ?? 0;
    const latestRate = rateValues[rateValues.length - 1] ?? 0;
    const rateDelta = latestRate - firstRate;

    const ratePoints: DataPoint[] = rates.map((r) => ({ timestamp: r.timestamp, value: r.rate }));
    const rateSlope = this.computeSlope(ratePoints);

    return {
      meanRate: Number(meanRate.toFixed(4)),
      maxRate: Number(maxRate.toFixed(4)),
      minRate: Number(minRate.toFixed(4)),
      rateStdDev: Number(rateStdDev.toFixed(4)),
      rateDelta: Number(rateDelta.toFixed(4)),
      rateSlope: Number(rateSlope.toFixed(6)),
      sampleCount: points.length,
    };
  }

  private extractHistogramFeatures(points: DataPoint[]): Record<string, number> {
    if (points.length === 0) {
      return {
        count: 0,
        sum: 0,
        p50: 0,
        p90: 0,
        p99: 0,
        max: 0,
        percentileDelta: 0,
        latencySlope: 0,
        sampleCount: 0,
      };
    }

    const values = points.map((p) => p.value);
    const n = values.length;
    const sum = values.reduce((acc, v) => acc + v, 0);
    const sortedVals = [...values].sort((a, b) => a - b);

    const p50 = this.computePercentile(sortedVals, 50);
    const p90 = this.computePercentile(sortedVals, 90);
    const p99 = this.computePercentile(sortedVals, 99);
    const max = sortedVals[sortedVals.length - 1] ?? 0;
    const percentileDelta = p99 - p50;
    const latencySlope = this.computeSlope(points);

    return {
      count: n,
      sum: Number(sum.toFixed(4)),
      p50: Number(p50.toFixed(4)),
      p90: Number(p90.toFixed(4)),
      p99: Number(p99.toFixed(4)),
      max: Number(max.toFixed(4)),
      percentileDelta: Number(percentileDelta.toFixed(4)),
      latencySlope: Number(latencySlope.toFixed(6)),
      sampleCount: n,
    };
  }

  private computePercentile(sortedAsc: number[], p: number): number {
    if (sortedAsc.length === 0) return 0;
    if (sortedAsc.length === 1) return sortedAsc[0] ?? 0;
    const index = (p / 100) * (sortedAsc.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    const valLower = sortedAsc[lower] ?? 0;
    const valUpper = sortedAsc[upper] ?? 0;
    return valLower * (1 - weight) + valUpper * weight;
  }

  private computeSlope(points: DataPoint[]): number {
    if (points.length < 2) return 0;
    const t0 = points[0]!.timestamp.getTime();
    const xs = points.map((p) => (p.timestamp.getTime() - t0) / 1000); // seconds from start
    const ys = points.map((p) => p.value);
    const n = points.length;

    const xMean = xs.reduce((acc, x) => acc + x, 0) / n;
    const yMean = ys.reduce((acc, y) => acc + y, 0) / n;

    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i]! - xMean;
      const dy = ys[i]! - yMean;
      numerator += dx * dy;
      denominator += dx * dx;
    }

    if (Math.abs(denominator) < 1e-9) return 0;
    return numerator / denominator;
  }
}
