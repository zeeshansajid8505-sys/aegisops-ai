import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export interface RateLimitCheckResult {
  allowed: boolean;
  limitType?: 'rpm' | 'pts';
  current: number;
  limit: number;
  resetSeconds: number;
}

@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);

  // Fallback in-memory map if Redis is temporarily unreachable
  private inMemoryCounts = new Map<string, { count: number; expiresAt: number }>();

  constructor(private readonly redisService: RedisService) {}

  async checkRateLimit(
    keyId: string,
    pointsCount: number,
    rpmLimit: number,
    ptsLimit: number,
  ): Promise<RateLimitCheckResult> {
    const now = Date.now();
    const currentMinute = Math.floor(now / 60000);
    const resetSeconds = 60 - Math.floor((now % 60000) / 1000);

    const redis = this.redisService.getClient();

    if (redis && redis.status === 'ready') {
      try {
        const rpmKey = `telemetry:ratelimit:rpm:${keyId}:${currentMinute}`;
        const ptsKey = `telemetry:ratelimit:pts:${keyId}:${currentMinute}`;

        const pipeline = redis.pipeline();
        pipeline.incr(rpmKey);
        pipeline.expire(rpmKey, 120);
        pipeline.incrby(ptsKey, Math.max(1, pointsCount));
        pipeline.expire(ptsKey, 120);

        const results = await pipeline.exec();

        const currentRpm = (results?.[0]?.[1] as number) ?? 1;
        const currentPts = (results?.[2]?.[1] as number) ?? pointsCount;

        if (currentRpm > rpmLimit) {
          return {
            allowed: false,
            limitType: 'rpm',
            current: currentRpm,
            limit: rpmLimit,
            resetSeconds,
          };
        }

        if (currentPts > ptsLimit) {
          return {
            allowed: false,
            limitType: 'pts',
            current: currentPts,
            limit: ptsLimit,
            resetSeconds,
          };
        }

        return {
          allowed: true,
          current: currentRpm,
          limit: rpmLimit,
          resetSeconds,
        };
      } catch (err) {
        this.logger.warn(`Redis rate limit error, using memory fallback: ${(err as Error).message}`);
      }
    }

    // In-memory fallback
    return this.checkMemoryFallback(keyId, pointsCount, rpmLimit, ptsLimit, currentMinute, resetSeconds);
  }

  private checkMemoryFallback(
    keyId: string,
    pointsCount: number,
    rpmLimit: number,
    ptsLimit: number,
    currentMinute: number,
    resetSeconds: number,
  ): RateLimitCheckResult {
    const now = Date.now();
    // Cleanup expired entries periodically
    if (this.inMemoryCounts.size > 2000) {
      for (const [k, v] of this.inMemoryCounts.entries()) {
        if (v.expiresAt <= now) this.inMemoryCounts.delete(k);
      }
    }

    const rpmKey = `rpm:${keyId}:${currentMinute}`;
    const ptsKey = `pts:${keyId}:${currentMinute}`;

    const rpmEntry = this.inMemoryCounts.get(rpmKey) ?? { count: 0, expiresAt: now + 120000 };
    rpmEntry.count += 1;
    this.inMemoryCounts.set(rpmKey, rpmEntry);

    const ptsEntry = this.inMemoryCounts.get(ptsKey) ?? { count: 0, expiresAt: now + 120000 };
    ptsEntry.count += Math.max(1, pointsCount);
    this.inMemoryCounts.set(ptsKey, ptsEntry);

    if (rpmEntry.count > rpmLimit) {
      return {
        allowed: false,
        limitType: 'rpm',
        current: rpmEntry.count,
        limit: rpmLimit,
        resetSeconds,
      };
    }

    if (ptsEntry.count > ptsLimit) {
      return {
        allowed: false,
        limitType: 'pts',
        current: ptsEntry.count,
        limit: ptsLimit,
        resetSeconds,
      };
    }

    return {
      allowed: true,
      current: rpmEntry.count,
      limit: rpmLimit,
      resetSeconds,
    };
  }
}

