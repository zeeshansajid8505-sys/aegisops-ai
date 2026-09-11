import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

export const INCIDENT_AI_ANALYSIS_QUEUE_NAME = 'incident-ai-analysis';

export interface IncidentAiAnalysisJobData {
  organizationId: string;
  incidentId: string;
  analysisId: string;
}

@Injectable()
export class AiQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiQueueService.name);
  private queue: Queue<IncidentAiAnalysisJobData> | null = null;

  onModuleInit(): void {
    const redisHost = process.env['REDIS_HOST'] ?? 'localhost';
    const redisPort = parseInt(process.env['REDIS_PORT'] ?? '6379', 10);

    try {
      this.queue = new Queue<IncidentAiAnalysisJobData>(INCIDENT_AI_ANALYSIS_QUEUE_NAME, {
        connection: {
          host: redisHost,
          port: redisPort,
          maxRetriesPerRequest: null,
        },
        defaultJobOptions: {
          attempts: 2,
          backoff: {
            type: 'exponential',
            delay: 1500,
          },
          removeOnComplete: 1000,
          removeOnFail: 2000,
        },
      });

      this.logger.log(`AI BullMQ queue '${INCIDENT_AI_ANALYSIS_QUEUE_NAME}' initialized`);
    } catch (err) {
      this.logger.warn(`Failed to initialize AI BullMQ queue: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.queue) {
      await this.queue.close();
      this.logger.log('AI BullMQ queue closed');
    }
  }

  getQueue(): Queue<IncidentAiAnalysisJobData> | null {
    return this.queue;
  }

  async enqueueAnalysis(
    organizationId: string,
    incidentId: string,
    analysisId: string,
  ): Promise<string | null> {
    if (!this.queue) {
      this.logger.warn('BullMQ queue unavailable for AI analysis');
      return null;
    }

    const job = await this.queue.add(
      'run-rca-analysis',
      {
        organizationId,
        incidentId,
        analysisId,
      },
      {
        jobId: `rca-${analysisId}`,
      },
    );

    return job.id ?? null;
  }
}

