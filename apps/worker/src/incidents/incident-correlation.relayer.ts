import { Queue } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { WorkerConfig } from '../config';
import {
  INCIDENT_CORRELATION_QUEUE_NAME,
  IncidentCorrelationJobData,
} from './incident-correlation.worker';

export class IncidentCorrelationRelayer {
  private queue: Queue<IncidentCorrelationJobData> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: WorkerConfig,
  ) {}

  async start(intervalMs = 5000): Promise<void> {
    this.queue = new Queue<IncidentCorrelationJobData>(INCIDENT_CORRELATION_QUEUE_NAME, {
      connection: {
        host: this.config.redisHost,
        port: this.config.redisPort,
        maxRetriesPerRequest: null,
      },
    });

    this.isRunning = true;
    // eslint-disable-next-line no-console
    console.log(`[IncidentCorrelationRelayer] Started outbox relayer (tick: ${intervalMs}ms)`);

    // Initial check
    this.relayPendingTriggers().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[IncidentCorrelationRelayer] Initial tick error:', err);
    });

    this.timer = setInterval(() => {
      if (this.isRunning) {
        this.relayPendingTriggers().catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[IncidentCorrelationRelayer] Periodic tick error:', err);
        });
      }
    }, intervalMs);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }
    // eslint-disable-next-line no-console
    console.log('[IncidentCorrelationRelayer] Stopped outbox relayer');
  }

  async relayPendingTriggers(): Promise<number> {
    if (!this.queue) return 0;

    const pendingTriggers = await this.prisma.incidentCorrelationTrigger.findMany({
      where: { status: 'PENDING' },
      take: 50,
      orderBy: { createdAt: 'asc' },
    });

    let relayedCount = 0;
    for (const trigger of pendingTriggers) {
      try {
        await this.queue.add(
          'correlate-alert',
          {
            triggerId: trigger.id,
            organizationId: trigger.organizationId,
            alertEventId: trigger.alertEventId,
            eventType: trigger.eventType,
          },
          {
            jobId: `corr-${trigger.alertEventId}`,
            removeOnComplete: true,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 1000,
            },
          },
        );

        await this.prisma.incidentCorrelationTrigger.update({
          where: { id: trigger.id },
          data: {
            status: 'QUEUED',
            queuedAt: new Date(),
          },
        });
        relayedCount++;
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error(`[IncidentCorrelationRelayer] Failed to relay trigger ${trigger.id}:`, err);
        await this.prisma.incidentCorrelationTrigger.update({
          where: { id: trigger.id },
          data: {
            lastError: err.message || String(err),
          },
        });
      }
    }

    return relayedCount;
  }
}

