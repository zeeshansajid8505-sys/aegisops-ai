import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

export const ANOMALY_TRAINING_QUEUE_NAME =
  process.env['ANOMALY_TRAINING_QUEUE_NAME'] ?? 'anomaly-model-training';

export const ANOMALY_EVALUATION_QUEUE_NAME =
  process.env['ANOMALY_EVALUATION_QUEUE_NAME'] ?? 'anomaly-evaluation';

export interface AnomalyTrainingJobData {
  detectorId: string;
  organizationId: string;
  isManual?: boolean;
}

export interface AnomalyEvaluationJobData {
  detectorId: string;
  organizationId: string;
  scheduledTime?: string;
  runId?: string;
}

@Injectable()
export class AnomaliesQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnomaliesQueueService.name);
  private trainingQueue: Queue<AnomalyTrainingJobData> | null = null;
  private evaluationQueue: Queue<AnomalyEvaluationJobData> | null = null;

  onModuleInit(): void {
    const redisHost = process.env['REDIS_HOST'] ?? 'localhost';
    const redisPort = parseInt(process.env['REDIS_PORT'] ?? '6379', 10);

    try {
      this.trainingQueue = new Queue<AnomalyTrainingJobData>(ANOMALY_TRAINING_QUEUE_NAME, {
        connection: {
          host: redisHost,
          port: redisPort,
          maxRetriesPerRequest: null,
        },
        defaultJobOptions: {
          attempts: 2,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: 500,
          removeOnFail: 1000,
        },
      });

      this.evaluationQueue = new Queue<AnomalyEvaluationJobData>(ANOMALY_EVALUATION_QUEUE_NAME, {
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
        `Anomaly BullMQ queues initialized: [${ANOMALY_TRAINING_QUEUE_NAME}, ${ANOMALY_EVALUATION_QUEUE_NAME}]`,
      );
    } catch (err) {
      this.logger.warn(`Failed to initialize Anomaly BullMQ queues: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.trainingQueue) {
      await this.trainingQueue.close();
    }
    if (this.evaluationQueue) {
      await this.evaluationQueue.close();
    }
    this.logger.log('Anomaly BullMQ queues closed');
  }

  getTrainingQueue(): Queue<AnomalyTrainingJobData> | null {
    return this.trainingQueue;
  }

  getEvaluationQueue(): Queue<AnomalyEvaluationJobData> | null {
    return this.evaluationQueue;
  }

  async enqueueTrainingJob(data: AnomalyTrainingJobData): Promise<void> {
    if (!this.trainingQueue) {
      this.logger.warn('Training queue not available, skipping enqueue');
      return;
    }
    await this.trainingQueue.add('train-model', data, {
      jobId: `train-${data.detectorId}-${Date.now()}`,
    });
    this.logger.log(`Enqueued training job for detector ${data.detectorId}`);
  }

  async enqueueEvaluationJob(data: AnomalyEvaluationJobData): Promise<void> {
    if (!this.evaluationQueue) {
      this.logger.warn('Evaluation queue not available, skipping enqueue');
      return;
    }
    await this.evaluationQueue.add('evaluate-detector', data, {
      jobId: `eval-${data.detectorId}-${data.runId ?? Date.now()}`,
    });
  }
}

