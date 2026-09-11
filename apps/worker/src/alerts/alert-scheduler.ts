import { Queue } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { WorkerConfig } from '../config';
import { ALERT_EVALUATION_QUEUE_NAME, AlertEvaluationJobData } from './alert-worker';

export class AlertScheduler {
  private queue: Queue<AlertEvaluationJobData> | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: WorkerConfig,
  ) {}

  async start(intervalMs = 5000): Promise<void> {
    this.queue = new Queue<AlertEvaluationJobData>(ALERT_EVALUATION_QUEUE_NAME, {
      connection: {
        host: this.config.redisHost,
        port: this.config.redisPort,
        maxRetriesPerRequest: null,
      },
    });

    this.isRunning = true;
    // eslint-disable-next-line no-console
    console.log(`[AlertScheduler] Started periodic alert rule evaluation scheduler (tick: ${intervalMs}ms)`);

    // Initial tick
    this.discoverAndEnqueueDueRules().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[AlertScheduler] Initial tick error:', err);
    });

    this.intervalTimer = setInterval(() => {
      if (this.isRunning) {
        this.discoverAndEnqueueDueRules().catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[AlertScheduler] Periodic tick error:', err);
        });
      }
    }, intervalMs);
  }

  async discoverAndEnqueueDueRules(): Promise<number> {
    if (!this.queue) return 0;

    try {
      const enabledRules = await this.prisma.alertRule.findMany({
        where: {
          status: 'ENABLED',
          archivedAt: null,
        },
      });

      const now = Date.now();
      let enqueuedCount = 0;

      for (const rule of enabledRules) {
        const lastEvalTime = rule.lastEvaluatedAt ? new Date(rule.lastEvaluatedAt).getTime() : 0;
        const intervalMs = Math.max(15, rule.evaluationIntervalSeconds) * 1000;

        const isDue = lastEvalTime === 0 || now - lastEvalTime >= intervalMs;

        if (isDue) {
          const timeSlot = Math.floor(now / intervalMs);
          const jobId = `alert-rule:${rule.id}:${timeSlot}`;

          try {
            await this.queue.add(
              'evaluate-rule',
              {
                ruleId: rule.id,
                organizationId: rule.organizationId,
                scheduledTime: new Date(now).toISOString(),
                timeBucket: String(timeSlot),
                isManual: false,
                runId: `sched:${timeSlot}`,
              },
              {
                jobId,
                removeOnComplete: 1000,
                removeOnFail: 2000,
              },
            );
            enqueuedCount++;
          } catch {
            // Deduplicated by BullMQ jobId
          }
        }
      }

      return enqueuedCount;
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('[AlertScheduler] Error discovering due alert rules:', err.message);
      return 0;
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }
    // eslint-disable-next-line no-console
    console.log('[AlertScheduler] Alert rule scheduler stopped');
  }
}

