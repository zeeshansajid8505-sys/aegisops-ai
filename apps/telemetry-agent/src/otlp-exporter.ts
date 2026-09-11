import * as http from 'http';
import * as https from 'https';
import * as zlib from 'zlib';
import { URL } from 'url';
import type { GeneratedMetrics } from './scenarios';

export interface ExporterConfig {
  endpoint: string;
  apiKey: string;
  serviceName: string;
  serviceVersion?: string;
  environment: string;
  useGzip?: boolean;
}

export class OtlpHttpExporter {
  constructor(private readonly config: ExporterConfig) {}

  async exportMetrics(
    metrics: GeneratedMetrics,
    timestamp: Date = new Date(),
  ): Promise<{ success: boolean; statusCode?: number; responseBody?: string; durationMs: number }> {
    const startTime = Date.now();
    const timeUnixNano = (BigInt(timestamp.getTime()) * 1_000_000n).toString();
    const startTimeUnixNano = (BigInt(timestamp.getTime() - 5000) * 1_000_000n).toString();

    // Construct OTLP JSON payload
    const otlpPayload = {
      resource_metrics: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { string_value: this.config.serviceName } },
              { key: 'service.version', value: { string_value: this.config.serviceVersion ?? '1.0.0' } },
              { key: 'deployment.environment', value: { string_value: this.config.environment } },
              { key: 'host.name', value: { string_value: 'aegis-agent-host-01' } },
            ],
          },
          scope_metrics: [
            {
              scope: {
                name: '@aegisops/telemetry-agent',
                version: '0.1.0',
              },
              metrics: [
                // 1. http.server.requests.total (Sum, cumulative)
                {
                  name: 'http.server.requests.total',
                  description: 'Total incoming HTTP server requests count',
                  unit: 'requests',
                  sum: {
                    aggregation_temporality: 2, // CUMULATIVE
                    is_monotonic: true,
                    data_points: metrics.requestsTotal.map((req) => ({
                      attributes: [
                        { key: 'http.method', value: { string_value: req.method } },
                        { key: 'http.route', value: { string_value: req.route } },
                        { key: 'http.status_code', value: { int_value: req.statusCode } },
                      ],
                      start_time_unix_nano: startTimeUnixNano,
                      time_unix_nano: timeUnixNano,
                      as_int: req.count,
                    })),
                  },
                },
                // 2. http.server.request.duration (Histogram)
                {
                  name: 'http.server.request.duration',
                  description: 'Measures the duration of inbound HTTP requests',
                  unit: 'ms',
                  histogram: {
                    aggregation_temporality: 2, // CUMULATIVE
                    data_points: [
                      {
                        attributes: [
                          { key: 'http.method', value: { string_value: metrics.requestDuration.method } },
                          { key: 'http.route', value: { string_value: metrics.requestDuration.route } },
                        ],
                        start_time_unix_nano: startTimeUnixNano,
                        time_unix_nano: timeUnixNano,
                        count: metrics.requestDuration.count,
                        sum: metrics.requestDuration.sum,
                        min: metrics.requestDuration.min,
                        max: metrics.requestDuration.max,
                        bucket_counts: metrics.requestDuration.bucketCounts,
                        explicit_bounds: metrics.requestDuration.explicitBounds,
                      },
                    ],
                  },
                },
                // 3. system.cpu.utilization (Gauge)
                {
                  name: 'system.cpu.utilization',
                  description: 'Current CPU utilization percentage (0.0 - 1.0)',
                  unit: '1',
                  gauge: {
                    data_points: [
                      {
                        start_time_unix_nano: startTimeUnixNano,
                        time_unix_nano: timeUnixNano,
                        as_double: Math.round(metrics.cpuUtilization * 1000) / 1000,
                      },
                    ],
                  },
                },
                // 4. system.memory.utilization (Gauge)
                {
                  name: 'system.memory.utilization',
                  description: 'Current RAM utilization percentage (0.0 - 1.0)',
                  unit: '1',
                  gauge: {
                    data_points: [
                      {
                        start_time_unix_nano: startTimeUnixNano,
                        time_unix_nano: timeUnixNano,
                        as_double: Math.round(metrics.memoryUtilization * 1000) / 1000,
                      },
                    ],
                  },
                },
                // 5. system.memory.usage (Gauge)
                {
                  name: 'system.memory.usage',
                  description: 'Current memory usage in bytes',
                  unit: 'By',
                  gauge: {
                    data_points: [
                      {
                        start_time_unix_nano: startTimeUnixNano,
                        time_unix_nano: timeUnixNano,
                        as_int: metrics.memoryUsageBytes,
                      },
                    ],
                  },
                },
                // 6. app.queue.active_jobs (Gauge)
                {
                  name: 'app.queue.active_jobs',
                  description: 'Number of active background jobs in the queue',
                  unit: 'jobs',
                  gauge: {
                    data_points: [
                      {
                        attributes: [{ key: 'queue.name', value: { string_value: 'default' } }],
                        start_time_unix_nano: startTimeUnixNano,
                        time_unix_nano: timeUnixNano,
                        as_int: metrics.activeJobs,
                      },
                    ],
                  },
                },
                // 7. app.queue.latency_ms (Gauge)
                {
                  name: 'app.queue.latency_ms',
                  description: 'Time spent by jobs waiting in queue before execution',
                  unit: 'ms',
                  gauge: {
                    data_points: [
                      {
                        attributes: [{ key: 'queue.name', value: { string_value: 'default' } }],
                        start_time_unix_nano: startTimeUnixNano,
                        time_unix_nano: timeUnixNano,
                        as_double: Math.round(metrics.queueLatencyMs * 100) / 100,
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

    const jsonBody = JSON.stringify(otlpPayload);
    let requestBuffer: Buffer = Buffer.from(jsonBody, 'utf-8');
    const isGzip = this.config.useGzip ?? false;

    if (isGzip) {
      requestBuffer = zlib.gzipSync(requestBuffer);
    }

    const targetUrl = new URL(this.config.endpoint);
    const headers: Record<string, string | number> = {
      'Content-Type': 'application/json',
      'Content-Length': requestBuffer.length,
      'Authorization': `Bearer ${this.config.apiKey}`,
      'X-Aegis-Telemetry-Key': this.config.apiKey,
      'User-Agent': 'AegisOps-Telemetry-Agent/0.1.0',
    };

    if (isGzip) {
      headers['Content-Encoding'] = 'gzip';
    }

    return new Promise((resolve) => {
      const client = targetUrl.protocol === 'https:' ? https : http;

      const req = client.request(
        targetUrl,
        {
          method: 'POST',
          headers,
          timeout: 10000,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const durationMs = Date.now() - startTime;
            const resBody = Buffer.concat(chunks).toString('utf-8');
            const success = (res.statusCode ?? 500) >= 200 && (res.statusCode ?? 500) < 300;
            resolve({
              success,
              statusCode: res.statusCode,
              responseBody: resBody,
              durationMs,
            });
          });
        },
      );

      req.on('error', (err) => {
        resolve({
          success: false,
          durationMs: Date.now() - startTime,
          responseBody: err.message,
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          success: false,
          durationMs: Date.now() - startTime,
          responseBody: 'Request timeout',
        });
      });

      req.write(requestBuffer);
      req.end();
    });
  }
}

