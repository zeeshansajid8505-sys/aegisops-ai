import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { NormalizedMetricPoint } from './metric-normalizer.service';

export const TELEMETRY_METRICS_QUEUE_NAME = 'telemetry-metrics-ingest';
export const TELEMETRY_BATCH_SIZE = 500;

export interface IngestJobPoint {
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
  timestamp: string; // ISO string
  timeUnixNano: string; // Serialized string for BigInt
  startTimeUnixNano?: string;
  valueType: 'INT64' | 'DOUBLE' | 'HISTOGRAM';
  intValue?: string;
  doubleValue?: number;
  histogramCount?: string;
  histogramSum?: number;
  histogramMin?: number;
  histogramMax?: number;
  bucketCounts?: number[];
  explicitBounds?: number[];
}

export interface IngestJobData {
  organizationId: string;
  serviceId: string;
  environmentId: string;
  ingestKeyId: string;
  batchIndex: number;
  totalBatches: number;
  points: IngestJobPoint[];
  enqueuedAt: string;
}

@Injectable()
export class TelemetryQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelemetryQueueService.name);
  private queue: Queue<IngestJobData> | null = null;

  onModuleInit(): void {
    const redisHost = process.env['REDIS_HOST'] ?? 'localhost';
    const redisPort = parseInt(process.env['REDIS_PORT'] ?? '6379', 10);

    try {
      this.queue = new Queue<IngestJobData>(TELEMETRY_METRICS_QUEUE_NAME, {
        connection: {
          host: redisHost,
          port: redisPort,
          maxRetriesPerRequest: null,
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      });

      this.logger.log(`Telemetry BullMQ queue '${TELEMETRY_METRICS_QUEUE_NAME}' initialized`);
    } catch (err) {
      this.logger.warn(`Failed to initialize BullMQ telemetry queue: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.queue) {
      await this.queue.close();
      this.logger.log('Telemetry BullMQ queue closed');
    }
  }

  async enqueueMetricPoints(
    points: NormalizedMetricPoint[],
    ingestKeyId: string,
  ): Promise<void> {
    if (!this.queue || points.length === 0) return;

    // Split points into chunks of TELEMETRY_BATCH_SIZE (default 500)
    const chunks: NormalizedMetricPoint[][] = [];
    for (let i = 0; i < points.length; i += TELEMETRY_BATCH_SIZE) {
      chunks.push(points.slice(i, i + TELEMETRY_BATCH_SIZE));
    }

    const totalBatches = chunks.length;
    const nowIso = new Date().toISOString();

    const jobs = chunks.map((chunk, index) => {
      const serializablePoints: IngestJobPoint[] = chunk.map((p) => ({
        organizationId: p.organizationId,
        serviceId: p.serviceId,
        environmentId: p.environmentId,
        metricName: p.metricName,
        metricDescription: p.metricDescription,
        metricUnit: p.metricUnit,
        instrumentType: p.instrumentType,
        temporality: p.temporality,
        isMonotonic: p.isMonotonic,
        seriesHash: p.seriesHash,
        attributes: p.attributes,
        attributesJson: p.attributesJson,
        timestamp: p.timestamp.toISOString(),
        timeUnixNano: p.timeUnixNano.toString(),
        startTimeUnixNano: p.startTimeUnixNano ? p.startTimeUnixNano.toString() : undefined,
        valueType: p.valueType,
        intValue: p.intValue ? p.intValue.toString() : undefined,
        doubleValue: p.doubleValue,
        histogramCount: p.histogramCount ? p.histogramCount.toString() : undefined,
        histogramSum: p.histogramSum,
        histogramMin: p.histogramMin,
        histogramMax: p.histogramMax,
        bucketCounts: p.bucketCounts,
        explicitBounds: p.explicitBounds,
      }));

      const jobData: IngestJobData = {
        organizationId: chunk[0]!.organizationId,
        serviceId: chunk[0]!.serviceId,
        environmentId: chunk[0]!.environmentId,
        ingestKeyId,
        batchIndex: index,
        totalBatches,
        points: serializablePoints,
        enqueuedAt: nowIso,
      };

      return {
        name: `ingest-${chunk[0]!.serviceId}-${Date.now()}-${index}`,
        data: jobData,
      };
    });

    await this.queue.addBulk(jobs);
  }
}
