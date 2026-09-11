import { PrismaClient } from '@prisma/client';

export class ReliabilityRollupScheduler {
  private intervalTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaClient,
  ) {}

  async start(intervalMs = 300000): Promise<void> {
    this.isRunning = true;
    // eslint-disable-next-line no-console
    console.log(`[ReliabilityRollupScheduler] Started periodic reliability rollup scheduler (tick: ${intervalMs}ms)`);

    // Initial run
    this.runRollups().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[ReliabilityRollupScheduler] Initial run error:', err);
    });

    this.intervalTimer = setInterval(() => {
      if (this.isRunning) {
        this.runRollups().catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[ReliabilityRollupScheduler] Periodic rollup error:', err);
        });
      }
    }, intervalMs);
  }

  async runRollups(): Promise<void> {
    try {
      const orgs = await this.prisma.organization.findMany({ select: { id: true } });
      const now = new Date();
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const yesterday = new Date(today.getTime() - 86400000);

      for (const org of orgs) {
        await this.computeRollup(org.id, yesterday);
        await this.computeRollup(org.id, today);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[ReliabilityRollupScheduler] Error computing rollups:', err);
    }
  }

  private async computeRollup(organizationId: string, targetDate: Date): Promise<void> {
    const year = targetDate.getUTCFullYear();
    const month = targetDate.getUTCMonth();
    const day = targetDate.getUTCDate();

    const startOfDay = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    const endOfDay = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
    const dateStr = startOfDay.toISOString().split('T')[0]!;
    const rollupKey = `${organizationId}_all_all_${dateStr}`;

    const incidents = await this.prisma.incident.findMany({
      where: {
        organizationId,
        detectedAt: { gte: startOfDay, lte: endOfDay },
      },
      select: {
        severity: true,
        detectedAt: true,
        acknowledgedAt: true,
        investigationStartedAt: true,
        mitigatedAt: true,
        resolvedAt: true,
      },
    });

    const incidentCount = incidents.length;
    let criticalIncidentCount = 0;
    let resolvedIncidentCount = 0;
    let acknowledgedIncidentCount = 0;
    let totalAckSeconds = 0;
    let totalInvestigationSeconds = 0;
    let totalMitigationSeconds = 0;
    let totalResolutionSeconds = 0;

    for (const inc of incidents) {
      if (inc.severity === 'CRITICAL' || (inc.severity as any) === 'SEV_1') criticalIncidentCount++;
      if (inc.acknowledgedAt) {
        acknowledgedIncidentCount++;
        const diff = (inc.acknowledgedAt.getTime() - inc.detectedAt.getTime()) / 1000;
        if (diff >= 0) totalAckSeconds += diff;
      }
      if (inc.investigationStartedAt) {
        const diff = (inc.investigationStartedAt.getTime() - inc.detectedAt.getTime()) / 1000;
        if (diff >= 0) totalInvestigationSeconds += diff;
      }
      if (inc.mitigatedAt) {
        const diff = (inc.mitigatedAt.getTime() - inc.detectedAt.getTime()) / 1000;
        if (diff >= 0) totalMitigationSeconds += diff;
      }
      if (inc.resolvedAt) {
        resolvedIncidentCount++;
        const diff = (inc.resolvedAt.getTime() - inc.detectedAt.getTime()) / 1000;
        if (diff >= 0) totalResolutionSeconds += diff;
      }
    }

    const alertFiringCount = await this.prisma.alertEvent.count({
      where: {
        organizationId,
        eventType: 'FIRING_STARTED',
        occurredAt: { gte: startOfDay, lte: endOfDay },
      },
    });

    const alertResolutionCount = await this.prisma.alertEvent.count({
      where: {
        organizationId,
        eventType: 'RESOLVED',
        occurredAt: { gte: startOfDay, lte: endOfDay },
      },
    });

    const anomalyDetectedCount = await this.prisma.anomalyFinding.count({
      where: {
        organizationId,
        firstDetectedAt: { gte: startOfDay, lte: endOfDay },
      },
    });

    const anomalyResolvedCount = await this.prisma.anomalyFinding.count({
      where: {
        organizationId,
        state: 'RESOLVED',
        firstDetectedAt: { gte: startOfDay, lte: endOfDay },
      },
    });

    const runbookExecutionCount = await this.prisma.runbookExecution.count({
      where: {
        organizationId,
        startedAt: { gte: startOfDay, lte: endOfDay },
      },
    });

    const deliveries = await this.prisma.notificationDelivery.findMany({
      where: {
        organizationId,
        createdAt: { gte: startOfDay, lte: endOfDay },
      },
      select: { status: true },
    });

    const notificationDeliveredCount = deliveries.filter((d) => d.status === 'DELIVERED').length;
    const notificationFailedCount = deliveries.filter((d) => d.status === 'FAILED').length;

    await this.prisma.reliabilityDailyRollup.upsert({
      where: { rollupKey },
      create: {
        rollupKey,
        organizationId,
        serviceId: null,
        environmentId: null,
        date: startOfDay,
        incidentCount,
        criticalIncidentCount,
        resolvedIncidentCount,
        acknowledgedIncidentCount,
        totalAckSeconds,
        totalInvestigationSeconds,
        totalMitigationSeconds,
        totalResolutionSeconds,
        alertFiringCount,
        alertResolutionCount,
        anomalyDetectedCount,
        anomalyResolvedCount,
        runbookExecutionCount,
        notificationDeliveredCount,
        notificationFailedCount,
      },
      update: {
        incidentCount,
        criticalIncidentCount,
        resolvedIncidentCount,
        acknowledgedIncidentCount,
        totalAckSeconds,
        totalInvestigationSeconds,
        totalMitigationSeconds,
        totalResolutionSeconds,
        alertFiringCount,
        alertResolutionCount,
        anomalyDetectedCount,
        anomalyResolvedCount,
        runbookExecutionCount,
        notificationDeliveredCount,
        notificationFailedCount,
        updatedAt: new Date(),
      },
    });
  }

  stop(): void {
    this.isRunning = false;
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    // eslint-disable-next-line no-console
    console.log('[ReliabilityRollupScheduler] Stopped reliability rollup scheduler');
  }
}
