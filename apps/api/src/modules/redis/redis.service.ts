import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;

  onModuleInit(): void {
    const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    try {
      this.client = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null, // Do not spam connection attempts if not running
      });

      this.client.on('error', (err) => {
        this.logger.debug(`Redis event: ${err.message}`);
      });

      this.logger.log('Redis client initialized');
    } catch (error) {
      this.logger.warn(`Failed to initialize Redis client: ${(error as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => {});
      this.logger.log('Redis client disconnected');
    }
  }

  getClient(): Redis | null {
    return this.client;
  }

  async ping(): Promise<boolean> {
    if (!this.client) return false;
    try {
      if (this.client.status === 'wait') {
        await this.client.connect().catch(() => {});
      }
      const pong = await this.client.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }
}
