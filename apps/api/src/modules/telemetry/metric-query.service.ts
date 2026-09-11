import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { QueryMetricsDto } from './dto/query-metrics.dto';
import { QueryDefinitionsDto } from './dto/query-definitions.dto';
import type {
  MetricDefinitionSummary,
  MetricTimeseriesResponse,
  MetricTimeseriesData,
  MetricDataPoint,
  TelemetryStatusResponse,
} from '@aegisops/types';

@Injectable()
export class MetricQueryService {
  private readonly logger = new Logger(MetricQueryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async getTelemetryStatus(
    organizationId: string,
    serviceId: string,
  ): Promise<TelemetryStatusResponse> {
    this.logger.debug(`Fetching telemetry status for service ${serviceId}`);
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, organizationId },
    });

    if (!service) {
      throw new NotFoundException(`Service '${serviceId}' not found`);
    }

    const [activeKeysCount, seriesCount, definitionsCount, recentEvents, aggregates] = await Promise.all([
      this.prisma.telemetryIngestKey.count({
        where: { serviceId, organizationId, isActive: true },
      }),
      this.prisma.metricSeries.count({
        where: { serviceId, organizationId },
      }),
      this.prisma.metricDefinition.count({
        where: { serviceId, organizationId },
      }),
      this.prisma.telemetryIngestionEvent.findMany({
        where: { serviceId, organizationId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.telemetryIngestionEvent.aggregate({
        where: {
          serviceId,
          organizationId,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        _sum: {
          pointsAccepted: true,
          pointsRejected: true,
        },
      }),
    ]);

    return {
      serviceId,
      organizationId,
      activeKeysCount,
      seriesCount,
      definitionsCount,
      pointsAccepted24h: aggregates._sum.pointsAccepted ?? 0,
      pointsRejected24h: aggregates._sum.pointsRejected ?? 0,
      recentEvents: recentEvents.map((e) => ({
        id: e.id,
        environmentId: e.environmentId,
        pointsAccepted: e.pointsAccepted,
        pointsRejected: e.pointsRejected,
        payloadBytes: e.payloadBytes,
        contentType: e.contentType,
        clientIp: e.clientIp,
        rejectionReason: e.rejectionReason,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }

  async getDefinitions(
    organizationId: string,
    serviceId: string,
    dto: QueryDefinitionsDto,
  ): Promise<MetricDefinitionSummary[]> {
    const defs = await this.prisma.metricDefinition.findMany({
      where: {
        organizationId,
        serviceId,
        ...(dto.search
          ? {
              OR: [
                { name: { contains: dto.search, mode: 'insensitive' } },
                { description: { contains: dto.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        _count: {
          select: { series: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return defs.map((d) => ({
      id: d.id,
      organizationId: d.organizationId,
      serviceId: d.serviceId,
      name: d.name,
      description: d.description,
      unit: d.unit,
      instrumentType: d.instrumentType,
      temporality: d.temporality ?? undefined,
      isMonotonic: d.isMonotonic ?? undefined,
      seriesCount: d._count.series,
      createdAt: d.createdAt.toISOString(),
      firstSeenAt: d.firstSeenAt.toISOString(),
      lastSeenAt: d.lastSeenAt.toISOString(),
    }));
  }

  async queryMetrics(
    organizationId: string,
    serviceId: string,
    dto: QueryMetricsDto,
  ): Promise<MetricTimeseriesResponse> {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, organizationId },
    });

    if (!service) {
      throw new NotFoundException(`Service '${serviceId}' not found`);
    }

    const startDate = new Date(dto.startTime);
    const endDate = new Date(dto.endTime);
    const limit = dto.limit ?? 500;
    const resolution = dto.resolution ?? 'raw';

    // Find all matching series
    const seriesList = await this.prisma.metricSeries.findMany({
      where: {
        organizationId,
        serviceId,
        environmentId: dto.environmentId,
        definition: {
          name: { in: dto.metricNames },
        },
        ...(dto.seriesHash ? { seriesHash: dto.seriesHash } : {}),
      },
      include: {
        definition: true,
      },
      take: 20, // Max 20 series returned concurrently
    });

    const resultTimeseries: MetricTimeseriesData[] = [];

    for (const s of seriesList) {
      const dataPoints: MetricDataPoint[] = [];

      if (resolution === 'raw') {
        // 1. First check Redis hot window if range includes recent data
        const hotPoints = await this.getHotWindowPoints(
          organizationId,
          dto.environmentId,
          s.id,
          startDate.getTime(),
          endDate.getTime(),
        );

        if (hotPoints.length > 0) {
          dataPoints.push(...hotPoints);
        }

        // 2. Query Postgres for remaining or historical points
        const points = await this.prisma.metricPoint.findMany({
          where: {
            seriesId: s.id,
            timestamp: {
              gte: startDate,
              lte: endDate,
            },
          },
          orderBy: { timestamp: 'asc' },
          take: limit,
        });

        for (const p of points) {
          // Prevent duplicate points if hot buffer had it
          const tsIso = p.timestamp.toISOString();
          if (!dataPoints.some((dp) => dp.timestamp === tsIso)) {
            dataPoints.push({
              timestamp: tsIso,
              timeUnixNano: p.timeUnixNano.toString(),
              value: p.doubleValue ?? (p.intValue ? Number(p.intValue) : 0),
              intValue: p.intValue ? p.intValue.toString() : undefined,
              doubleValue: p.doubleValue ?? undefined,
              histogramCount: p.histogramCount ? p.histogramCount.toString() : undefined,
              histogramSum: p.histogramSum ?? undefined,
              histogramMin: p.histogramMin ?? undefined,
              histogramMax: p.histogramMax ?? undefined,
              bucketCounts: (p.bucketCounts as number[]) ?? undefined,
              explicitBounds: (p.explicitBounds as number[]) ?? undefined,
            });
          }
        }
      } else {
        // Rollup resolution ('1m', '5m', '1h')
        const rollups = await this.prisma.metricRollupMinute.findMany({
          where: {
            seriesId: s.id,
            bucketMinute: {
              gte: startDate,
              lte: endDate,
            },
          },
          orderBy: { bucketMinute: 'asc' },
          take: limit,
        });

        for (const r of rollups) {
          dataPoints.push({
            timestamp: r.bucketMinute.toISOString(),
            timeUnixNano: (BigInt(r.bucketMinute.getTime()) * 1_000_000n).toString(),
            value: r.avg,
            doubleValue: r.avg,
            min: r.min,
            max: r.max,
            sum: r.sum,
            count: r.sampleCount,
            p50: r.p50 ?? undefined,
            p90: r.p90 ?? undefined,
            p99: r.p99 ?? undefined,
          });
        }
      }

      // Sort chronological
      dataPoints.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      resultTimeseries.push({
        metricName: s.definition.name,
        instrumentType: s.definition.instrumentType,
        unit: s.definition.unit ?? undefined,
        seriesHash: s.seriesHash,
        attributes: (s.attributes as Record<string, string | number | boolean>) ?? {},
        points: dataPoints.slice(0, limit),
      });
    }

    return {
      serviceId,
      environmentId: dto.environmentId,
      resolution,
      startTime: dto.startTime,
      endTime: dto.endTime,
      timeseries: resultTimeseries,
    };
  }

  private async getHotWindowPoints(
    organizationId: string,
    environmentId: string,
    seriesId: string,
    startMs: number,
    endMs: number,
  ): Promise<MetricDataPoint[]> {
    const redis = this.redisService.getClient();
    if (!redis || redis.status !== 'ready') return [];

    try {
      const hotKey = `telemetry:hot:${organizationId}:${environmentId}:${seriesId}`;
      const rawEntries = await redis.lrange(hotKey, 0, 100);
      const points: MetricDataPoint[] = [];

      for (const item of rawEntries) {
        try {
          const parsed = JSON.parse(item);
          const pointMs = new Date(parsed.timestamp).getTime();
          if (pointMs >= startMs && pointMs <= endMs) {
            points.push(parsed);
          }
        } catch {
          // Ignore malformed entries
        }
      }

      return points;
    } catch {
      return [];
    }
  }
}
