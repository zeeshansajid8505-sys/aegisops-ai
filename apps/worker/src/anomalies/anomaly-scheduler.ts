import { Queue } from 'bullmq';
import { PrismaClient, AnomalyModelStatus } from '@prisma/client';
import { WorkerConfig } from '../config';
import { ANOMALY_TRAINING_QUEUE_NAME, AnomalyTrainingJobData } from './anomaly-training.worker';
import { ANOMALY_EVALUATION_QUEUE_NAME, AnomalyEvaluationJobData } from './anomaly-evaluation.worker';

export class AnomalyScheduler {
  private trainingQueue: Queue<AnomalyTrainingJobData> | null = null;
  private evaluationQueue: Queue<AnomalyEvaluationJobData> | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: WorkerConfig,
  ) {}

  async start(intervalMs = 10000): Promise<void> {
    this.trainingQueue = new Queue<AnomalyTrainingJobData>(ANOMALY_TRAINING_QUEUE_NAME, {
      connection: {
        host: this.config.redisHost,
        port: this.config.redisPort,
        maxRetriesPerRequest: null,
      },
    });

    this.evaluationQueue = new Queue<AnomalyEvaluationJobData>(ANOMALY_EVALUATION_QUEUE_NAME, {
      connection: {
        host: this.config.redisHost,
        port: this.config.redisPort,
        maxRetriesPerRequest: null,
      },
    });

    this.isRunning = true;
    // eslint-disable-next-line no-console
    console.log(`[AnomalyScheduler] Started periodic anomaly evaluation and retrain scheduler (tick: ${intervalMs}ms)`);

    // Initial tick
    this.tick().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[AnomalyScheduler] Initial tick error:', err);
    });

    this.intervalTimer = setInterval(() => {
      if (this.isRunning) {
        this.tick().catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[AnomalyScheduler] Periodic tick error:', err);
        });
      }
    }, intervalMs);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    if (this.trainingQueue) {
      await this.trainingQueue.close();
      this.trainingQueue = null;
    }
    if (this.evaluationQueue) {
      await this.evaluationQueue.close();
      this.evaluationQueue = null;
    }
    // eslint-disable-next-line no-console
    console.log('[AnomalyScheduler] Stopped anomaly scheduler');
  }

  private async tick(): Promise<void> {
    if (!this.trainingQueue || !this.evaluationQueue) return;

    try {
      const enabledDetectors = await this.prisma.anomalyDetector.findMany({
        where: {
          status: 'ENABLED',
          archivedAt: null,
        },
        include: {
          models: {
            where: { status: AnomalyModelStatus.READY },
            select: { id: true },
            take: 1,
          },
        },
      });

      const now = Date.now();

      for (const det of enabledDetectors) {
        const hasReadyModel = det.models.length > 0;
        const lastTrained = det.lastTrainedAt ? new Date(det.lastTrainedAt).getTime() : 0;
        const retrainIntervalMs = (det.retrainIntervalHours || 24) * 3600 * 1000;

        // Check if retraining is due or no model exists yet
        if (!hasReadyModel || (lastTrained > 0 && now - lastTrained >= retrainIntervalMs)) {
          await this.trainingQueue.add('train-model', {
            detectorId: det.id,
            organizationId: det.organizationId,
            isManual: false,
          }, {
            jobId: `train-cron-${det.id}-${Math.floor(now / 60000)}`,
          });
        }

        // Check if evaluation is due
        if (hasReadyModel) {
          const lastEval = det.lastEvaluatedAt ? new Date(det.lastEvaluatedAt).getTime() : 0;
          const evalIntervalMs = (det.evaluationIntervalSeconds || 60) * 1000;

          if (now - lastEval >= evalIntervalMs) {
            await this.evaluationQueue.add('evaluate-detector', {
              detectorId: det.id,
              organizationId: det.organizationId,
              scheduledTime: new Date(now).toISOString(),
            }, {
              jobId: `eval-cron-${det.id}-${Math.floor(now / 10000)}`,
            });
          }
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[AnomalyScheduler] Tick execution error:', (err as Error).message);
    }
  }
}

