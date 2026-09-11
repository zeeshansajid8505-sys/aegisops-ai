import { Queue } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { WorkerConfig } from './config';

export interface HealthProbeJobData {
  probeId: string;
  organizationId: string;
  serviceId: string;
}

export const HEALTH_PROBES_QUEUE_NAME = 'health-probes';

export class ProbeScheduler {
  private queue: Queue<HealthProbeJobData> | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: WorkerConfig,
  ) {}

  async start(intervalMs = 5000): Promise<void> {
    this.queue = new Queue<HealthProbeJobData>(HEALTH_PROBES_QUEUE_NAME, {
      connection: {
        host: this.config.redisHost,
        port: this.config.redisPort,
      },
    });

    this.isRunning = true;
    // eslint-disable-next-line no-console
    console.log(`[ProbeScheduler] Started periodic probe discovery (tick: ${intervalMs}ms)`);

    this.discoverAndEnqueueDueProbes().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[ProbeScheduler] Initial tick error:', err);
    });

    this.intervalTimer = setInterval(() => {
      if (this.isRunning) {
        this.discoverAndEnqueueDueProbes().catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[ProbeScheduler] Periodic tick error:', err);
        });
      }
    }, intervalMs);
  }

  async discoverAndEnqueueDueProbes(): Promise<number> {
    if (!this.queue) return 0;

    try {
      const probes = await this.prisma.healthProbe.findMany({
        where: { enabled: true },
        include: { state: true },
      });

      const now = Date.now();
      let enqueuedCount = 0;

      for (const probe of probes) {
        const nextRun = probe.nextRunAt ? new Date(probe.nextRunAt).getTime() : 0;
        const lastChecked = probe.state?.lastCheckedAt ? new Date(probe.state.lastCheckedAt).getTime() : 0;
        const intervalMs = probe.intervalSeconds * 1000;

        const isDue = nextRun === 0 || now >= nextRun || (now - lastChecked >= intervalMs);

        if (isDue) {
          const timeSlot = Math.floor(now / Math.max(intervalMs, 5000));
          const jobId = `probe-${probe.id}-${timeSlot}`;

          try {
            await this.queue.add(
              'execute-probe',
              {
                probeId: probe.id,
                organizationId: probe.organizationId,
                serviceId: probe.serviceId,
              },
              {
                jobId,
                removeOnComplete: true,
                removeOnFail: 100,
              },
            );
            enqueuedCount++;
          } catch {
            // Deduplicated
          }
        }
      }

      return enqueuedCount;
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('[ProbeScheduler] Error querying due probes from database:', err.message);
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
    console.log('[ProbeScheduler] Probe scheduler stopped');
  }
}

