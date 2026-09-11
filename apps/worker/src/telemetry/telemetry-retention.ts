import { PrismaClient } from '@prisma/client';

export const RAW_METRIC_RETENTION_DAYS = 7;
export const ROLLUP_RETENTION_DAYS = 30;
export const INGESTION_EVENT_RETENTION_DAYS = 7;

export class TelemetryRetentionService {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(private readonly prisma: PrismaClient) {}

  start(intervalMs = 3600000): void {
    // Run cleanup immediately on worker startup
    this.runCleanup().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[TelemetryRetentionService] Startup retention cleanup error:', err.message);
    });

    // Schedule periodic retention sweep (every 1 hour by default)
    this.timer = setInterval(() => {
      this.runCleanup().catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[TelemetryRetentionService] Periodic retention cleanup error:', err.message);
      });
    }, intervalMs);

    // eslint-disable-next-line no-console
    console.log('[TelemetryRetentionService] Retention cleaner scheduled');
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runCleanup(): Promise<{
    deletedRawPoints: number;
    deletedRollups: number;
    deletedEvents: number;
  }> {
    if (this.isRunning) {
      return { deletedRawPoints: 0, deletedRollups: 0, deletedEvents: 0 };
    }

    this.isRunning = true;
    const now = Date.now();

    try {
      const rawCutoff = new Date(now - RAW_METRIC_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      const rollupCutoff = new Date(now - ROLLUP_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      const eventCutoff = new Date(now - INGESTION_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);

      const [deletedPoints, deletedRollups, deletedEvents] = await Promise.all([
        this.prisma.metricPoint.deleteMany({
          where: { createdAt: { lt: rawCutoff } },
        }),
        this.prisma.metricRollupMinute.deleteMany({
          where: { createdAt: { lt: rollupCutoff } },
        }),
        this.prisma.telemetryIngestionEvent.deleteMany({
          where: { createdAt: { lt: eventCutoff } },
        }),
      ]);

      if (deletedPoints.count > 0 || deletedRollups.count > 0 || deletedEvents.count > 0) {
        // eslint-disable-next-line no-console
        console.log(
          `[TelemetryRetentionService] Retention sweep complete: deleted ${deletedPoints.count} raw points, ${deletedRollups.count} rollups, ${deletedEvents.count} events`,
        );
      }

      return {
        deletedRawPoints: deletedPoints.count,
        deletedRollups: deletedRollups.count,
        deletedEvents: deletedEvents.count,
      };
    } finally {
      this.isRunning = false;
    }
  }
}

