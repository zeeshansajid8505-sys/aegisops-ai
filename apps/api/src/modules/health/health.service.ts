import { Injectable } from '@nestjs/common';
import type { SystemHealthResponse, HealthStatus, ComponentHealth } from '@aegisops/types';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class HealthService {
  private readonly startTime = Date.now();

  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async checkHealth(): Promise<SystemHealthResponse> {
    const dbHealthy = await this.prismaService.ping();
    const redisHealthy = await this.redisService.ping();

    const components: Record<string, ComponentHealth> = {
      api: {
        status: 'healthy',
        message: 'Core API process running normally',
        latencyMs: 0,
      },
      database: {
        status: dbHealthy ? 'healthy' : 'degraded',
        message: dbHealthy ? 'PostgreSQL connected' : 'PostgreSQL not reachable',
      },
      redis: {
        status: redisHealthy ? 'healthy' : 'degraded',
        message: redisHealthy ? 'Redis connected' : 'Redis not reachable',
      },
      memory: {
        status: 'healthy',
        details: {
          rssMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
          heapUsedMb: Math.round(process.memoryUsage().heapUsed / (1024 * 1024)),
        },
      },
    };

    const overallStatus: HealthStatus =
      !dbHealthy || !redisHealthy ? 'degraded' : 'healthy';

    return {
      status: overallStatus,
      service: '@aegisops/api',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      components,
    };
  }

  getLiveness(): { status: string; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
