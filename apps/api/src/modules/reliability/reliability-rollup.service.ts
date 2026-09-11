import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReliabilityRollupService {
  private readonly logger = new Logger(ReliabilityRollupService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Computes daily rollup for a given organization, optional service/environment, and UTC date.
   * Ensures absolute idempotency with unique rollupKey.
   */
  async computeDailyRollup(
    organizationId: string,
    targetDate: Date,
    serviceId?: string,
    environmentId?: string,
  ): Promise<void> {
    const year = targetDate.getUTCFullYear();
    const month = targetDate.getUTCMonth();
    const day = targetDate.getUTCDate();

    const startOfDay = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    const endOfDay = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
    const dateStr = startOfDay.toISOString().split('T')[0];

    const rollupKey = `${organizationId}_${serviceId || 'all'}_${environmentId || 'all'}_${dateStr}`;

    const incidentWhere: any = {
      organizationId,
      detectedAt: { gte: startOfDay, lte: endOfDay },
    };
    if (serviceId) incidentWhere.primaryServiceId = serviceId;
    if (environmentId) incidentWhere.environmentId = environmentId;

    const incidents = await this.prisma.incident.findMany({
      where: incidentWhere,
      select: {
        id: true,
        severity: true,
        status: true,
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
        const ackDiff = (inc.acknowledgedAt.getTime() - inc.detectedAt.getTime()) / 1000;
        if (ackDiff >= 0) totalAckSeconds += ackDiff;
      }

      if (inc.investigationStartedAt) {
        const invDiff = (inc.investigationStartedAt.getTime() - inc.detectedAt.getTime()) / 1000;
        if (invDiff >= 0) totalInvestigationSeconds += invDiff;
      }

      if (inc.mitigatedAt) {
        const mitDiff = (inc.mitigatedAt.getTime() - inc.detectedAt.getTime()) / 1000;
        if (mitDiff >= 0) totalMitigationSeconds += mitDiff;
      }

      if (inc.resolvedAt) {
        resolvedIncidentCount++;
        const resDiff = (inc.resolvedAt.getTime() - inc.detectedAt.getTime()) / 1000;
        if (resDiff >= 0) totalResolutionSeconds += resDiff;
      }
    }

    // Alerts within the day
    const alertWhere: any = {
      organizationId,
      occurredAt: { gte: startOfDay, lte: endOfDay },
    };
    if (serviceId) alertWhere.rule = { serviceId };
    if (environmentId) alertWhere.rule = { ...alertWhere.rule, environmentId };

    const alertEvents = await this.prisma.alertEvent.findMany({
      where: alertWhere,
      select: { eventType: true },
    });

    const alertFiringCount = alertEvents.filter((a) => a.eventType === 'FIRING_STARTED').length;
    const alertResolutionCount = alertEvents.filter((a) => a.eventType === 'RESOLVED').length;

    // Anomalies
    const anomalyWhere: any = {
      organizationId,
      firstDetectedAt: { gte: startOfDay, lte: endOfDay },
    };
    if (serviceId) anomalyWhere.serviceId = serviceId;
    if (environmentId) anomalyWhere.environmentId = environmentId;

    const anomalyFindings = await this.prisma.anomalyFinding.findMany({
      where: anomalyWhere,
      select: { id: true, state: true },
    });

    const anomalyDetectedCount = anomalyFindings.length;
    const anomalyResolvedCount = anomalyFindings.filter((af) => af.state === 'RESOLVED').length;

    // Runbook Executions
    const runbookExecutionCount = await this.prisma.runbookExecution.count({
      where: {
        organizationId,
        startedAt: { gte: startOfDay, lte: endOfDay },
      },
    });

    // Notifications
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
        serviceId: serviceId || null,
        environmentId: environmentId || null,
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

    this.logger.debug(`Processed reliability rollup for ${rollupKey}: ${incidentCount} incidents`);
  }

  /**
   * Recomputes rollups for a range of historical days.
   */
  async computeRollupForDateRange(
    organizationId: string,
    startDate: Date,
    endDate: Date,
    serviceId?: string,
    environmentId?: string,
  ): Promise<number> {
    let current = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
    const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));
    let processed = 0;

    while (current.getTime() <= end.getTime()) {
      await this.computeDailyRollup(organizationId, current, serviceId, environmentId);
      processed++;
      current = new Date(current.getTime() + 86400000);
    }

    return processed;
  }
}

