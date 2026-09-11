import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

export const INCIDENT_CORRELATION_QUEUE_NAME = 'incident-correlation';

export interface IncidentCorrelationJobData {
  triggerId?: string;
  organizationId: string;
  alertEventId: string;
  eventType: 'FIRING_STARTED' | 'RESOLVED';
}

@Injectable()
export class IncidentsQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IncidentsQueueService.name);
  private queue: Queue<IncidentCorrelationJobData> | null = null;

  onModuleInit(): void {
    const redisHost = process.env['REDIS_HOST'] ?? 'localhost';
    const redisPort = parseInt(process.env['REDIS_PORT'] ?? '6379', 10);

    try {
      this.queue = new Queue<IncidentCorrelationJobData>(INCIDENT_CORRELATION_QUEUE_NAME, {
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
          removeOnFail: 2000,
        },
      });

      this.logger.log(`Incidents BullMQ queue '${INCIDENT_CORRELATION_QUEUE_NAME}' initialized`);
    } catch (err) {
      this.logger.warn(`Failed to initialize Incidents BullMQ queue: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.queue) {
      await this.queue.close();
      this.logger.log('Incidents BullMQ queue closed');
    }
  }

  getQueue(): Queue<IncidentCorrelationJobData> | null {
    return this.queue;
  }

  async enqueueCorrelation(
    organizationId: string,
    alertEventId: string,
    eventType: 'FIRING_STARTED' | 'RESOLVED',
    triggerId?: string,
  ): Promise<string | null> {
    if (!this.queue) {
      this.logger.warn('BullMQ queue unavailable for incident correlation');
      return null;
    }

    const job = await this.queue.add(
      'correlate-alert',
      {
        triggerId,
        organizationId,
        alertEventId,
        eventType,
      },
      {
        jobId: `corr-${alertEventId}`,
      },
    );

    return job.id ?? null;
  }
}

