import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

export const ALERT_EVALUATION_QUEUE_NAME =
  process.env['ALERT_EVALUATION_QUEUE_NAME'] ?? 'alert-rule-evaluation';

export interface AlertEvaluationJobData {
  ruleId: string;
  organizationId: string;
  scheduledTime?: string;
  timeBucket?: string;
  isManual: boolean;
  runId: string;
}

@Injectable()
export class AlertsQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertsQueueService.name);
  private queue: Queue<AlertEvaluationJobData> | null = null;

  onModuleInit(): void {
    const redisHost = process.env['REDIS_HOST'] ?? 'localhost';
    const redisPort = parseInt(process.env['REDIS_PORT'] ?? '6379', 10);

    try {
      this.queue = new Queue<AlertEvaluationJobData>(ALERT_EVALUATION_QUEUE_NAME, {
        connection: {
          host: redisHost,
          port: redisPort,
          maxRetriesPerRequest: null,
        },
        defaultJobOptions: {
          attempts: 2,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: 1000,
          removeOnFail: 2000,
        },
      });

      this.logger.log(
        `Alerts BullMQ queue '${ALERT_EVALUATION_QUEUE_NAME}' initialized successfully`,
      );
    } catch (err) {
      this.logger.warn(`Failed to initialize BullMQ alerts queue: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.queue) {
      await this.queue.close();
      this.logger.log('Alerts BullMQ queue closed');
    }
  }

  getQueue(): Queue<AlertEvaluationJobData> | null {
    return this.queue;
  }

  /**
   * Enqueues an immediate manual evaluation job for an alert rule.
   */
  async enqueueManualEvaluation(
    ruleId: string,
    organizationId: string,
    runId: string,
  ): Promise<string> {
    if (!this.queue) {
      throw new Error('Alerts evaluation queue is not initialized');
    }

    const now = new Date();
    const timeBucket = String(Math.floor(now.getTime() / 10000));
    const jobId = `manual:${ruleId}:${runId}`;

    const job = await this.queue.add(
      'evaluate-rule',
      {
        ruleId,
        organizationId,
        scheduledTime: now.toISOString(),
        timeBucket,
        isManual: true,
        runId,
      },
      {
        jobId,
        priority: 1, // High priority for manual evaluations
      },
    );

    this.logger.log(`Enqueued manual evaluation job ${job.id} for rule ${ruleId}`);
    return job.id ?? jobId;
  }

  /**
   * Schedules or updates a repeatable evaluation job using BullMQ job scheduler / repeat.
   */
  async scheduleRule(
    ruleId: string,
    organizationId: string,
    intervalSeconds: number,
  ): Promise<void> {
    if (!this.queue) return;

    const schedulerId = `alert-rule:${ruleId}`;
    const intervalMs = Math.max(15, intervalSeconds) * 1000;

    try {
      await this.queue.upsertJobScheduler(
        schedulerId,
        { every: intervalMs },
        {
          name: 'evaluate-rule',
          data: {
            ruleId,
            organizationId,
            isManual: false,
            runId: schedulerId,
          },
        },
      );

      this.logger.log(`Scheduled alert evaluation for rule ${ruleId} every ${intervalSeconds}s`);
    } catch (err) {
      this.logger.error(
        `Failed to schedule rule ${ruleId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  /**
   * Removes repeatable evaluation job scheduler for a rule.
   */
  async removeRuleSchedule(ruleId: string): Promise<void> {
    if (!this.queue) return;

    const schedulerId = `alert-rule:${ruleId}`;

    try {
      await this.queue.removeJobScheduler(schedulerId);
      this.logger.log(`Removed alert evaluation schedule for rule ${ruleId}`);
    } catch (err) {
      this.logger.warn(`Failed to remove schedule for rule ${ruleId}: ${(err as Error).message}`);
    }
  }

  /**
   * Synchronizes rule schedule state according to status (ENABLED vs DISABLED / ARCHIVED).
   */
  async reconcileRuleSchedule(
    ruleId: string,
    organizationId: string,
    status: string,
    intervalSeconds: number,
  ): Promise<void> {
    if (status === 'ENABLED') {
      await this.scheduleRule(ruleId, organizationId, intervalSeconds);
    } else {
      await this.removeRuleSchedule(ruleId);
    }
  }
}
