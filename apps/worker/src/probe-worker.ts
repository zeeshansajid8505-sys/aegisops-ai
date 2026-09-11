import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { WorkerConfig } from './config';
import { ProbeRunner } from './probe-runner';
import { HealthProbeJobData, HEALTH_PROBES_QUEUE_NAME } from './probe-scheduler';

export class HealthProbeWorker {
  private worker: Worker<HealthProbeJobData> | null = null;
  private probeRunner: ProbeRunner;

  constructor(
    prisma: PrismaClient,
    private readonly config: WorkerConfig,
  ) {
    this.probeRunner = new ProbeRunner(prisma);
  }

  async start(): Promise<void> {
    this.worker = new Worker<HealthProbeJobData>(
      HEALTH_PROBES_QUEUE_NAME,
      async (job: Job<HealthProbeJobData>) => {
        const { probeId } = job.data;
        const result = await this.probeRunner.executeAndRecordProbe(probeId);
        return result;
      },
      {
        connection: {
          host: this.config.redisHost,
          port: this.config.redisPort,
        },
        concurrency: this.config.concurrency,
      },
    );

    this.worker.on('completed', (job: Job<HealthProbeJobData>) => {
      // eslint-disable-next-line no-console
      console.log(`[HealthProbeWorker] Job ${job.id} completed (probe: ${job.data.probeId})`);
    });

    this.worker.on('failed', (job: Job<HealthProbeJobData> | undefined, err: Error) => {
      // eslint-disable-next-line no-console
      console.error(`[HealthProbeWorker] Job ${job?.id} failed:`, err.message);
    });

    // eslint-disable-next-line no-console
    console.log(`[HealthProbeWorker] Health probe processor active (concurrency: ${this.config.concurrency})`);
  }

  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    // eslint-disable-next-line no-console
    console.log('[HealthProbeWorker] Health probe processor stopped');
  }
}

