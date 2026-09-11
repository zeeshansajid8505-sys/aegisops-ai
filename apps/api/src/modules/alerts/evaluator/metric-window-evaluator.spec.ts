import {
  computeAggregation,
  matchesSeriesFilters,
  reduceAcrossSeries,
} from './metric-window-evaluator';

describe('Metric Window Evaluator Pure Functions', () => {
  describe('matchesSeriesFilters', () => {
    it('returns true when no filters provided', () => {
      expect(matchesSeriesFilters({ host: 'web-1' }, [])).toBe(true);
      expect(matchesSeriesFilters({ host: 'web-1' }, undefined)).toBe(true);
    });

    it('matches EQUALS filter', () => {
      const filters = [{ key: 'env', operator: 'EQUALS' as const, value: 'production' }];
      expect(matchesSeriesFilters({ env: 'production', host: 'web-1' }, filters)).toBe(true);
      expect(matchesSeriesFilters({ env: 'staging', host: 'web-1' }, filters)).toBe(false);
    });

    it('matches NOT_EQUALS filter', () => {
      const filters = [{ key: 'region', operator: 'NOT_EQUALS' as const, value: 'us-west-1' }];
      expect(matchesSeriesFilters({ region: 'us-east-1' }, filters)).toBe(true);
      expect(matchesSeriesFilters({ region: 'us-west-1' }, filters)).toBe(false);
    });

    it('matches multiple attribute filters in conjunction', () => {
      const filters = [
        { key: 'service', operator: 'EQUALS' as const, value: 'auth' },
        { key: 'status', operator: 'NOT_EQUALS' as const, value: 'canary' },
      ];
      expect(matchesSeriesFilters({ service: 'auth', status: 'prod' }, filters)).toBe(true);
      expect(matchesSeriesFilters({ service: 'auth', status: 'canary' }, filters)).toBe(false);
      expect(matchesSeriesFilters({ service: 'payments', status: 'prod' }, filters)).toBe(false);
    });
  });

  describe('computeAggregation', () => {
    const t0 = new Date('2026-09-08T12:00:00Z');
    const t1 = new Date('2026-09-08T12:00:10Z');
    const t2 = new Date('2026-09-08T12:00:20Z');
    const t3 = new Date('2026-09-08T12:00:30Z');

    const samplePoints = [
      { timestamp: t0, value: 10 },
      { timestamp: t1, value: 20 },
      { timestamp: t2, value: 30 },
      { timestamp: t3, value: 40 },
    ];

    it('computes AVG', () => {
      expect(computeAggregation('AVG', samplePoints)).toBe(25);
    });

    it('computes MIN and MAX', () => {
      expect(computeAggregation('MIN', samplePoints)).toBe(10);
      expect(computeAggregation('MAX', samplePoints)).toBe(40);
    });

    it('computes SUM', () => {
      expect(computeAggregation('SUM', samplePoints)).toBe(100);
    });

    it('computes LAST', () => {
      expect(computeAggregation('LAST', samplePoints)).toBe(40);
    });

    it('returns null for empty points', () => {
      expect(computeAggregation('AVG', [])).toBeNull();
    });

    describe('RATE aggregation and counter resets', () => {
      it('computes rate per second correctly across time delta', () => {
        // Delta = 30, Time = 30s -> Rate = 1.0/s
        const rate = computeAggregation('RATE', samplePoints);
        expect(rate).toBeCloseTo(1.0, 5);
      });

      it('handles monotonic counter reset gracefully', () => {
        // Counter reset: 10 -> 20 -> 5 (reset!) -> 15
        // Delta 1: 20 - 10 = 10
        // Delta 2: reset to 5 -> +5
        // Delta 3: 15 - 5 = 10
        // Total delta = 25 over 30s -> Rate = 25/30 = 0.833/s
        const resetPoints = [
          { timestamp: t0, value: 10 },
          { timestamp: t1, value: 20 },
          { timestamp: t2, value: 5 },
          { timestamp: t3, value: 15 },
        ];
        const rate = computeAggregation('RATE', resetPoints);
        expect(rate).toBeCloseTo(25 / 30, 4);
      });
    });

    describe('Percentiles P50, P90, P99', () => {
      it('computes scalar percentile approximations', () => {
        const sortedPoints = Array.from({ length: 100 }, (_, i) => ({
          timestamp: new Date(t0.getTime() + i * 1000),
          value: i + 1,
        }));

        const p50 = computeAggregation('P50', sortedPoints);
        const p90 = computeAggregation('P90', sortedPoints);
        const p99 = computeAggregation('P99', sortedPoints);

        expect(p50).toBe(50);
        expect(p90).toBe(90);
        expect(p99).toBe(99);
      });

      it('computes histogram explicit bounds percentiles', () => {
        const histogramPoint = {
          timestamp: t0,
          value: 0,
          explicitBounds: [10, 50, 100, 500],
          bucketCounts: [20, 30, 30, 20], // total 100 samples
        };

        const p50 = computeAggregation('P50', [histogramPoint]);
        expect(p50).toBeGreaterThanOrEqual(10);
        expect(p50).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('reduceAcrossSeries', () => {
    const values = [10, 20, 30, 40];

    it('reduces across series using AVG', () => {
      expect(reduceAcrossSeries('AVG', values)).toBe(25);
    });

    it('reduces across series using MAX and MIN', () => {
      expect(reduceAcrossSeries('MAX', values)).toBe(40);
      expect(reduceAcrossSeries('MIN', values)).toBe(10);
    });

    it('reduces across series using SUM', () => {
      expect(reduceAcrossSeries('SUM', values)).toBe(100);
    });

    it('handles empty values safely', () => {
      expect(reduceAcrossSeries('AVG', [])).toBe(0);
    });
  });
});
