import { MetricNormalizerService } from './metric-normalizer.service';
import type { TelemetryAuthContext } from './guards/machine-telemetry-auth.guard';

describe('MetricNormalizerService', () => {
  let service: MetricNormalizerService;

  const authContext: TelemetryAuthContext = {
    organizationId: 'org-tenant-1',
    serviceId: 'service-orders',
    environmentId: 'env-prod',
    ingestKeyId: 'key-test',
    rateLimitRpm: 120,
    rateLimitPts: 100000,
  };

  beforeEach(() => {
    service = new MetricNormalizerService();
  });

  it('should normalize Gauge metrics and bind to auth tenant context', () => {
    const nowNano = (BigInt(Date.now()) * 1_000_000n).toString();
    const payload = {
      resource_metrics: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { string_value: 'untrusted-client-reported-name' } },
            ],
          },
          scope_metrics: [
            {
              metrics: [
                {
                  name: 'system.cpu.utilization',
                  unit: '1',
                  gauge: {
                    data_points: [
                      {
                        time_unix_nano: nowNano,
                        as_double: 0.45,
                        attributes: [{ key: 'cpu.core', value: { int_value: 0 } }],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const result = service.normalizePayload(payload, authContext, false);

    expect(result.accepted.length).toBe(1);
    const point = result.accepted[0]!;
    // Machine auth binding is strictly preserved (never overwritten by payload)
    expect(point.organizationId).toBe(authContext.organizationId);
    expect(point.serviceId).toBe(authContext.serviceId);
    expect(point.environmentId).toBe(authContext.environmentId);
    expect(point.metricName).toBe('system.cpu.utilization');
    expect(point.instrumentType).toBe('GAUGE');
    expect(point.doubleValue).toBe(0.45);
    expect(point.seriesHash).toBeDefined();
  });

  it('should redact sensitive attributes during normalization', () => {
    const nowNano = (BigInt(Date.now()) * 1_000_000n).toString();
    const payload = {
      resource_metrics: [
        {
          scope_metrics: [
            {
              metrics: [
                {
                  name: 'http.server.requests.total',
                  sum: {
                    aggregation_temporality: 2,
                    is_monotonic: true,
                    data_points: [
                      {
                        time_unix_nano: nowNano,
                        as_int: '10',
                        attributes: [
                          { key: 'http.status_code', value: { int_value: 200 } },
                          { key: 'api_key', value: { string_value: 'secret_token_value' } },
                          { key: 'user.password', value: { string_value: 'password123' } },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const result = service.normalizePayload(payload, authContext, false);

    expect(result.accepted.length).toBe(1);
    const point = result.accepted[0]!;
    expect(point.attributes['http.status_code']).toBe(200);
    expect(point.attributes['api_key']).toBe('[REDACTED]');
    expect(point.attributes['user.password']).toBe('[REDACTED]');
  });

  it('should normalize Histogram metrics', () => {
    const nowNano = (BigInt(Date.now()) * 1_000_000n).toString();
    const payload = {
      resource_metrics: [
        {
          scope_metrics: [
            {
              metrics: [
                {
                  name: 'http.server.request.duration',
                  unit: 'ms',
                  histogram: {
                    aggregation_temporality: 2,
                    data_points: [
                      {
                        time_unix_nano: nowNano,
                        count: '50',
                        sum: 2500.5,
                        min: 10.2,
                        max: 450.8,
                        bucket_counts: ['10', '25', '15'],
                        explicit_bounds: [50, 100],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const result = service.normalizePayload(payload, authContext, false);

    expect(result.accepted.length).toBe(1);
    const point = result.accepted[0]!;
    expect(point.instrumentType).toBe('HISTOGRAM');
    expect(point.histogramCount).toBe(50n);
    expect(point.histogramSum).toBe(2500.5);
    expect(point.histogramMin).toBe(10.2);
    expect(point.histogramMax).toBe(450.8);
    expect(point.bucketCounts).toEqual([10, 25, 15]);
    expect(point.explicitBounds).toEqual([50, 100]);
  });
});

