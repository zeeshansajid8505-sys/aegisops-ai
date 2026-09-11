import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

export const NOTIFICATION_DELIVERY_QUEUE_NAME =
  process.env['NOTIFICATION_DELIVERY_QUEUE_NAME'] ?? 'notification-delivery';

export interface NotificationDeliveryJobData {
  deliveryId: string;
  organizationId: string;
  channel: 'EMAIL' | 'SLACK' | 'WEBHOOK';
  destination: string;
  notificationEventId: string;
  integrationConnectionId?: string;
  attemptNumber: number;
}

@Injectable()
export class NotificationsQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsQueueService.name);
  private queue: Queue<NotificationDeliveryJobData> | null = null;

  onModuleInit(): void {
    const redisHost = process.env['REDIS_HOST'] ?? 'localhost';
    const redisPort = parseInt(process.env['REDIS_PORT'] ?? '6379', 10);

    try {
      this.queue = new Queue<NotificationDeliveryJobData>(NOTIFICATION_DELIVERY_QUEUE_NAME, {
        connection: {
          host: redisHost,
          port: redisPort,
          maxRetriesPerRequest: null,
        },
        defaultJobOptions: {
          attempts: 4,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: 1000,
          removeOnFail: 2000,
        },
      });

      this.logger.log(`Initialized notification delivery queue: ${NOTIFICATION_DELIVERY_QUEUE_NAME}`);
    } catch (err: any) {
      this.logger.error(`Failed to initialize notification delivery queue: ${err?.message || err}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.queue) {
      await this.queue.close();
      this.logger.log('Closed notification delivery queue');
    }
  }

  async enqueueDelivery(data: NotificationDeliveryJobData, delayMs = 0): Promise<void> {
    if (!this.queue) {
      this.logger.warn(`Cannot enqueue delivery ${data.deliveryId}: queue not initialized`);
      return;
    }

    try {
      await this.queue.add('deliver-notification', data, {
        jobId: `delivery-${data.deliveryId}-attempt-${data.attemptNumber}`,
        delay: delayMs,
      });
      this.logger.log(`Enqueued notification delivery ${data.deliveryId} for channel ${data.channel} (delay: ${delayMs}ms)`);
    } catch (err: any) {
      this.logger.error(`Failed to enqueue notification delivery ${data.deliveryId}: ${err?.message || err}`);
    }
  }
}

