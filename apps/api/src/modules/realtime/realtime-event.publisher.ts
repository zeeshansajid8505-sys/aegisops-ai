import { Injectable, Logger } from '@nestjs/common';
import { RealtimeEventEnvelope, REALTIME_REDIS_CHANNEL } from '@aegisops/types';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class RealtimeEventPublisher {
  private readonly logger = new Logger(RealtimeEventPublisher.name);
  private localEmitter: ((envelope: RealtimeEventEnvelope) => void) | null = null;

  constructor(private readonly redisService: RedisService) {}

  /**
   * Register a local fallback handler (the gateway) so events dispatch even if Redis is down/absent.
   */
  registerLocalEmitter(emitter: (envelope: RealtimeEventEnvelope) => void): void {
    this.localEmitter = emitter;
  }

  /**
   * Publish an operational event envelope to Redis and local in-process gateway.
   */
  async publish(envelope: RealtimeEventEnvelope): Promise<void> {
    try {
      // 1. Dispatch locally in-memory first
      if (this.localEmitter) {
        try {
          this.localEmitter(envelope);
        } catch (err) {
          this.logger.warn(`Local event dispatch warning: ${(err as Error).message}`);
        }
      }

      // 2. Publish to Redis channel for multi-instance distribution
      const redis = this.redisService.getClient();
      if (redis && redis.status === 'ready') {
        const payload = JSON.stringify(envelope);
        await redis.publish(REALTIME_REDIS_CHANNEL, payload);
      }
    } catch (error) {
      // Realtime distribution should never break the caller's transaction or operational flow
      this.logger.warn(
        `Failed to publish realtime event [${envelope.type}] to room [${envelope.targetRoom}]: ${(error as Error).message}`,
      );
    }
  }
}

