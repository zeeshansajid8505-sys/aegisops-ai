import { Worker, Job } from 'bullmq';
import { PrismaClient, MetricInstrumentType, AggregationTemporality, MetricValueType } from '@prisma/client';
import Redis from 'ioredis';
import { WorkerConfig } from '../config';

export const TELEMETRY_METRICS_QUEUE_NAME = 'telemetry-metrics-ingest';

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
  timestamp: string;
  timeUnixNano: string;
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

export class TelemetryWorker {
  private worker: Worker<IngestJobData> | null = null;
  private redis: Redis | null = null;

  // In-memory caches to minimize redundant DB lookups during high throughput
  private defCache = new Map<string, string>(); // `${serviceId}:${metricName}` -> definitionId
  private seriesCache = new Map<string, string>(); // `${environmentId}:${definitionId}:${seriesHash}` -> seriesId

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: WorkerConfig,
  ) {}

  async start(): Promise<void> {
    this.redis = new Redis({
      host: this.config.redisHost,
      port: this.config.redisPort,
      maxRetriesPerRequest: null,
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });

    this.worker = new Worker<IngestJobData>(
      TELEMETRY_METRICS_QUEUE_NAME,
      async (job: Job<IngestJobData>) => {
        await this.processTelemetryBatch(job.data);
      },
      {
        connection: {
          host: this.config.redisHost,
          port: this.config.redisPort,
        },
        concurrency: Math.max(2, this.config.concurrency),
      },
    );

    this.worker.on('completed', (job: Job<IngestJobData>) => {
      // eslint-disable-next-line no-console
      console.log(`[TelemetryWorker] Ingest batch ${job.id} completed (${job.data.points.length} points)`);
    });

    this.worker.on('failed', (job: Job<IngestJobData> | undefined, err: Error) => {
      // eslint-disable-next-line no-console
      console.error(`[TelemetryWorker] Ingest batch ${job?.id} failed:`, err.message);
    });

    // eslint-disable-next-line no-console
    console.log(`[TelemetryWorker] Telemetry metrics ingestion worker active on queue '${TELEMETRY_METRICS_QUEUE_NAME}'`);
  }

  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
    // eslint-disable-next-line no-console
    console.log('[TelemetryWorker] Telemetry worker stopped');
  }

  async processTelemetryBatch(data: IngestJobData): Promise<void> {
    const { points } = data;
    if (!points || points.length === 0) return;

    const now = new Date();

    // 1. Resolve Definitions
    const defMap = new Map<string, string>(); // name -> defId
    for (const p of points) {
      const cacheKey = `${p.serviceId}:${p.metricName}`;
      if (!defMap.has(p.metricName)) {
        let defId = this.defCache.get(cacheKey);
        if (!defId) {
          const instrument = p.instrumentType as MetricInstrumentType;
          const temporality = (p.temporality as AggregationTemporality) ?? null;

          const def = await this.prisma.metricDefinition.upsert({
            where: {
              serviceId_name: {
                serviceId: p.serviceId,
                name: p.metricName,
              },
            },
            update: {
              lastSeenAt: now,
              unit: p.metricUnit ?? undefined,
              description: p.metricDescription ?? undefined,
            },
            create: {
              organizationId: p.organizationId,
              serviceId: p.serviceId,
              name: p.metricName,
              description: p.metricDescription,
              unit: p.metricUnit,
              instrumentType: instrument,
              temporality,
              isMonotonic: p.isMonotonic,
              firstSeenAt: now,
              lastSeenAt: now,
            },
          });
          defId = def.id;
          this.defCache.set(cacheKey, defId);
        }
        defMap.set(p.metricName, defId);
      }
    }

    // 2. Resolve Series
    const seriesMap = new Map<string, string>(); // seriesHash -> seriesId
    for (const p of points) {
      const defId = defMap.get(p.metricName);
      if (!defId) continue;

      const cacheKey = `${p.environmentId}:${defId}:${p.seriesHash}`;
      if (!seriesMap.has(p.seriesHash)) {
        let seriesId = this.seriesCache.get(cacheKey);
        if (!seriesId) {
          const series = await this.prisma.metricSeries.upsert({
            where: {
              environmentId_definitionId_seriesHash: {
                environmentId: p.environmentId,
                definitionId: defId,
                seriesHash: p.seriesHash,
              },
            },
            update: {
              lastSeenAt: now,
            },
            create: {
              organizationId: p.organizationId,
              serviceId: p.serviceId,
              environmentId: p.environmentId,
              definitionId: defId,
              seriesHash: p.seriesHash,
              attributes: p.attributes as any,
              attributesJson: p.attributesJson,
              firstSeenAt: now,
              lastSeenAt: now,
            },
          });
          seriesId = series.id;
          this.seriesCache.set(cacheKey, seriesId);
        }
        seriesMap.set(p.seriesHash, seriesId);
      }
    }

    // 3. Prepare Metric Points
    const pointsData = points.map((p) => {
      const seriesId = seriesMap.get(p.seriesHash)!;
      return {
        organizationId: p.organizationId,
        serviceId: p.serviceId,
        environmentId: p.environmentId,
        seriesId,
        timestamp: new Date(p.timestamp),
        timeUnixNano: BigInt(p.timeUnixNano),
        startTimeUnixNano: p.startTimeUnixNano ? BigInt(p.startTimeUnixNano) : null,
        valueType: p.valueType as MetricValueType,
        intValue: p.intValue ? BigInt(p.intValue) : null,
        doubleValue: p.doubleValue ?? null,
        histogramCount: p.histogramCount ? BigInt(p.histogramCount) : null,
        histogramSum: p.histogramSum ?? null,
        histogramMin: p.histogramMin ?? null,
        histogramMax: p.histogramMax ?? null,
        bucketCounts: p.bucketCounts ? (p.bucketCounts as any) : null,
        explicitBounds: p.explicitBounds ? (p.explicitBounds as any) : null,
        attributes: p.attributes as any,
      };
    });

    // Bulk insert into Postgres metric_points
    await this.prisma.metricPoint.createMany({
      data: pointsData,
      skipDuplicates: true,
    });

    // 4. Update Redis Hot Windows
    if (this.redis) {
      try {
        const pipeline = this.redis.pipeline();
        for (const p of points) {
          const seriesId = seriesMap.get(p.seriesHash);
          if (!seriesId) continue;

          const hotKey = `telemetry:hot:${p.organizationId}:${p.environmentId}:${seriesId}`;
          const hotPoint = JSON.stringify({
            timestamp: p.timestamp,
            timeUnixNano: p.timeUnixNano,
            value: p.doubleValue ?? (p.intValue ? Number(p.intValue) : 0),
            doubleValue: p.doubleValue,
            intValue: p.intValue,
            histogramCount: p.histogramCount,
            histogramSum: p.histogramSum,
            histogramMin: p.histogramMin,
            histogramMax: p.histogramMax,
            bucketCounts: p.bucketCounts,
            explicitBounds: p.explicitBounds,
          });

          pipeline.lpush(hotKey, hotPoint);
          pipeline.ltrim(hotKey, 0, 99); // Keep latest 100 points
          pipeline.expire(hotKey, 3600); // 1 hour TTL
        }
        await pipeline.exec();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[TelemetryWorker] Failed to write to Redis hot buffer: ${(err as Error).message}`);
      }
    }

    // 5. Compute & Upsert 1-Minute Rollups
    await this.computeOneMinuteRollups(points, defMap, seriesMap);
  }

  private async computeOneMinuteRollups(
    points: IngestJobPoint[],
    defMap: Map<string, string>,
    seriesMap: Map<string, string>,
  ): Promise<void> {
    // Group points by `${seriesId}:${bucketMinuteIso}`
    const rollupGroups = new Map<
      string,
      {
        samplePoints: IngestJobPoint;
        defId: string;
        seriesId: string;
        bucketMinute: Date;
        numericValues: number[];
      }
    >();

    for (const p of points) {
      const defId = defMap.get(p.metricName);
      const seriesId = seriesMap.get(p.seriesHash);
      if (!defId || !seriesId) continue;

      const ptDate = new Date(p.timestamp);
      // Floor to nearest minute: ms - (ms % 60000)
      const bucketMinute = new Date(Math.floor(ptDate.getTime() / 60000) * 60000);
      const groupKey = `${seriesId}:${bucketMinute.getTime()}`;

      let val = p.doubleValue;
      if (val === undefined && p.intValue !== undefined) {
        val = Number(p.intValue);
      }
      if (val === undefined && p.histogramSum !== undefined) {
        val = p.histogramSum;
      }
      if (val === undefined) continue;

      let group = rollupGroups.get(groupKey);
      if (!group) {
        group = {
          samplePoints: p,
          defId,
          seriesId,
          bucketMinute,
          numericValues: [],
        };
        rollupGroups.set(groupKey, group);
      }
      group.numericValues.push(val);
    }

    for (const group of rollupGroups.values()) {
      const { samplePoints, defId, seriesId, bucketMinute, numericValues } = group;
      if (numericValues.length === 0) continue;

      numericValues.sort((a, b) => a - b);
      const count = numericValues.length;
      const min = numericValues[0]!;
      const max = numericValues[count - 1]!;
      const sum = numericValues.reduce((acc, v) => acc + v, 0);
      const avg = sum / count;
      const lastValue = numericValues[count - 1]!;

      const p50 = this.getPercentile(numericValues, 50);
      const p90 = this.getPercentile(numericValues, 90);
      const p99 = this.getPercentile(numericValues, 99);

      // Upsert into Postgres metric_rollups_minute
      await this.prisma.metricRollupMinute.upsert({
        where: {
          seriesId_bucketMinute: {
            seriesId,
            bucketMinute,
          },
        },
        update: {
          sampleCount: { increment: count },
          min: { set: min },
          max: { set: max },
          sum: { increment: sum },
          avg,
          lastValue,
          p50,
          p90,
          p99,
        },
        create: {
          organizationId: samplePoints.organizationId,
          serviceId: samplePoints.serviceId,
          environmentId: samplePoints.environmentId,
          definitionId: defId,
          seriesId,
          bucketMinute,
          sampleCount: count,
          min,
          max,
          sum,
          avg,
          lastValue,
          p50,
          p90,
          p99,
        },
      });
    }
  }

  private getPercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))]!;
  }
}

