import { PrismaClient } from '@prisma/client';

export const ALERT_EVALUATION_RETENTION_DAYS = parseInt(
  process.env['ALERT_EVALUATION_RETENTION_DAYS'] ?? '14',
  10,
);

export class AlertRetentionService {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(private readonly prisma: PrismaClient) {}

  start(intervalMs = 6 * 60 * 60 * 1000): void {
    this.isRunning = true;
    // eslint-disable-next-line no-console
    console.log(
      `[AlertRetention] Alert evaluation retention active (${ALERT_EVALUATION_RETENTION_DAYS} days retention)`,
    );

    // Initial purge
    this.purgeExpiredEvaluations().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[AlertRetention] Initial purge error:', err.message);
    });

    this.timer = setInterval(() => {
      if (this.isRunning) {
        this.purgeExpiredEvaluations().catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[AlertRetention] Periodic purge error:', err.message);
        });
      }
    }, intervalMs);
  }

  async purgeExpiredEvaluations(): Promise<number> {
    try {
      const cutoff = new Date(
        Date.now() - ALERT_EVALUATION_RETENTION_DAYS * 24 * 60 * 60 * 1000,
      );

      const deleted = await this.prisma.alertEvaluation.deleteMany({
        where: {
          evaluatedAt: {
            lt: cutoff,
          },
        },
      });

      if (deleted.count > 0) {
        // eslint-disable-next-line no-console
        console.log(
          `[AlertRetention] Purged ${deleted.count} alert evaluations older than ${ALERT_EVALUATION_RETENTION_DAYS} days`,
        );
      }

      return deleted.count;
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('[AlertRetention] Error purging evaluations:', err.message);
      return 0;
    }
  }

  stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // eslint-disable-next-line no-console
    console.log('[AlertRetention] Alert retention service stopped');
  }
}

