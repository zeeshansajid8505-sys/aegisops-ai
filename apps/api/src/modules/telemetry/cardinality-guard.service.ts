import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export const MAX_SERIES_PER_ENVIRONMENT = 5000;

@Injectable()
export class CardinalityGuardService {
  private readonly logger = new Logger(CardinalityGuardService.name);

  // In-memory set cache of known series hashes: envId -> Set<seriesHash>
  private knownSeriesCache = new Map<string, Set<string>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async canAcceptSeries(
    environmentId: string,
    seriesHash: string,
  ): Promise<{ allowed: boolean; isNew: boolean }> {
    // 1. Check local cache
    const localSet = this.knownSeriesCache.get(environmentId);
    if (localSet && localSet.has(seriesHash)) {
      return { allowed: true, isNew: false };
    }

    // 2. Check Redis set
    const redis = this.redisService.getClient();
    const redisKey = `telemetry:series_set:${environmentId}`;

    if (redis && redis.status === 'ready') {
      try {
        const isMember = await redis.sismember(redisKey, seriesHash);
        if (isMember === 1) {
          this.recordLocalCache(environmentId, seriesHash);
          return { allowed: true, isNew: false };
        }
      } catch {
        // Fall back to database
      }
    }

    // 3. Check Database
    const existingSeries = await this.prisma.metricSeries.findFirst({
      where: {
        environmentId,
        seriesHash,
      },
      select: { id: true },
    });

    if (existingSeries) {
      this.recordLocalCache(environmentId, seriesHash);
      if (redis && redis.status === 'ready') {
        redis.sadd(redisKey, seriesHash).catch(() => {});
        redis.expire(redisKey, 86400).catch(() => {});
      }
      return { allowed: true, isNew: false };
    }

    // 4. This is a NEW series: verify cardinality limit
    const currentCount = await this.prisma.metricSeries.count({
      where: { environmentId },
    });

    if (currentCount >= MAX_SERIES_PER_ENVIRONMENT) {
      this.logger.warn(
        `Cardinality cap reached for environment ${environmentId}: ${currentCount}/${MAX_SERIES_PER_ENVIRONMENT} series. Rejecting new series ${seriesHash.slice(0, 8)}.`,
      );
      return { allowed: false, isNew: true };
    }

    // Allowed to create new series
    this.recordLocalCache(environmentId, seriesHash);
    if (redis && redis.status === 'ready') {
      redis.sadd(redisKey, seriesHash).catch(() => {});
      redis.expire(redisKey, 86400).catch(() => {});
    }

    return { allowed: true, isNew: true };
  }

  private recordLocalCache(environmentId: string, seriesHash: string): void {
    let set = this.knownSeriesCache.get(environmentId);
    if (!set) {
      set = new Set();
      this.knownSeriesCache.set(environmentId, set);
    }
    // Limit local set size
    if (set.size < 10000) {
      set.add(seriesHash);
    }
  }
}

