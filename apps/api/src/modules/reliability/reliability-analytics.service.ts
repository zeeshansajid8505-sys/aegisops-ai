import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ReliabilityTimeRange,
  IncidentMetricSummary,
  SeverityDistribution,
  DailyReliabilityPoint,
  PotentialRecurrenceItem,
  AiAgreementMetric,
  AnomalyFeedbackBreakdown,
  RunbookReliabilityMetric,
  OrganizationReliabilitySummary,
  ServiceReliabilitySummary,
  AlertSeverity,
} from '@aegisops/types';

@Injectable()
export class ReliabilityAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private parseTimeRange(timeRange: ReliabilityTimeRange): number {
    switch (timeRange) {
      case '7d':
        return 7;
      case '90d':
        return 90;
      case '30d':
      default:
        return 30;
    }
  }

  /**
   * Retrieves organization-level reliability analytics with historical rollups and live today blending.
   */
  async getOrganizationSummary(
    organizationId: string,
    timeRange: ReliabilityTimeRange = '30d',
  ): Promise<OrganizationReliabilitySummary> {
    const days = this.parseTimeRange(timeRange);
    const now = new Date();
    const todayMidnightUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const windowStart = new Date(todayMidnightUTC.getTime() - (days - 1) * 86400000);

    // 1. Fetch raw incidents in window for accurate percentile & metric calculations
    const incidents = await this.prisma.incident.findMany({
      where: {
        organizationId,
        detectedAt: { gte: windowStart, lte: now },
      },
      include: {
        primaryService: { select: { id: true, name: true } },
        alerts: {
          select: {
            alertRuleId: true,
            alertRule: { select: { id: true, name: true } },
          },
        },
        hypotheses: {
          orderBy: { rank: 'asc' },
          take: 1,
        },
      },
      orderBy: { detectedAt: 'desc' },
    });

    const metrics = this.calculateIncidentMetrics(incidents);
    const severityDistribution = this.calculateSeverityDistribution(incidents);
    const dailyTrend = await this.buildDailyTrend(organizationId, windowStart, todayMidnightUTC, now, undefined);
    const potentialRecurrences = this.calculatePotentialRecurrences(incidents);
    const aiAgreement = this.calculateAiAgreement(incidents);
    const anomalyFeedback = await this.calculateAnomalyFeedback(organizationId, windowStart, now);
    const runbookReliability = await this.calculateRunbookReliability(organizationId, windowStart, now);

    return {
      timeRange,
      metrics,
      severityDistribution,
      dailyTrend,
      potentialRecurrences,
      aiAgreement,
      anomalyFeedback,
      runbookReliability,
    };
  }

  /**
   * Retrieves service-level reliability analytics.
   */
  async getServiceSummary(
    organizationId: string,
    serviceId: string,
    timeRange: ReliabilityTimeRange = '30d',
  ): Promise<ServiceReliabilitySummary> {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, organizationId },
      select: { id: true, name: true },
    });

    if (!service) {
      throw new NotFoundException(`Service ${serviceId} not found`);
    }

    const days = this.parseTimeRange(timeRange);
    const now = new Date();
    const todayMidnightUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const windowStart = new Date(todayMidnightUTC.getTime() - (days - 1) * 86400000);

    const incidents = await this.prisma.incident.findMany({
      where: {
        organizationId,
        primaryServiceId: serviceId,
        detectedAt: { gte: windowStart, lte: now },
      },
      include: {
        primaryService: { select: { id: true, name: true } },
        alerts: {
          select: {
            alertRuleId: true,
            alertRule: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { detectedAt: 'desc' },
    });

    const metrics = this.calculateIncidentMetrics(incidents);
    const severityDistribution = this.calculateSeverityDistribution(incidents);
    const dailyTrend = await this.buildDailyTrend(organizationId, windowStart, todayMidnightUTC, now, serviceId);
    const potentialRecurrences = this.calculatePotentialRecurrences(incidents);

    const recentIncidents = incidents.slice(0, 10).map((inc) => {
      const mttr = inc.resolvedAt
        ? Math.round((inc.resolvedAt.getTime() - inc.detectedAt.getTime()) / 1000)
        : null;

      // Map severity to AlertSeverity ('SEV_1' | 'SEV_2' | 'SEV_3' | 'SEV_4')
      let mappedSev: AlertSeverity = 'SEV_3';
      if (inc.severity === 'CRITICAL' || (inc.severity as any) === 'SEV_1') mappedSev = 'SEV_1';
      else if (inc.severity === 'ERROR' || (inc.severity as any) === 'SEV_2') mappedSev = 'SEV_2';
      else if (inc.severity === 'WARNING' || (inc.severity as any) === 'SEV_3') mappedSev = 'SEV_3';
      else if (inc.severity === 'INFO' || (inc.severity as any) === 'SEV_4') mappedSev = 'SEV_4';

      return {
        id: inc.id,
        incidentKey: inc.incidentKey,
        title: inc.title,
        severity: mappedSev,
        status: inc.status,
        detectedAt: inc.detectedAt.toISOString(),
        resolvedAt: inc.resolvedAt ? inc.resolvedAt.toISOString() : null,
        mttrSeconds: mttr,
      };
    });

    return {
      serviceId: service.id,
      serviceName: service.name,
      timeRange,
      metrics,
      severityDistribution,
      dailyTrend,
      potentialRecurrences,
      recentIncidents,
    };
  }

  /**
   * Helper: Calculates MTTA, MTTI, MTTM, MTTR and P50/P90 percentiles.
   * Strictly excludes incidents with missing timestamps from respective averages.
   */
  private calculateIncidentMetrics(incidents: any[]): IncidentMetricSummary {
    const sampleCount = incidents.length;
    let ackCount = 0;
    let resCount = 0;
    let invCount = 0;
    let mitCount = 0;

    let totalAckSec = 0;
    let totalInvSec = 0;
    let totalMitSec = 0;
    let totalResSec = 0;

    const resolutionDurations: number[] = [];

    for (const inc of incidents) {
      const detected = inc.detectedAt.getTime();

      if (inc.acknowledgedAt) {
        const diff = (inc.acknowledgedAt.getTime() - detected) / 1000;
        if (diff >= 0) {
          totalAckSec += diff;
          ackCount++;
        }
      }

      if (inc.investigationStartedAt) {
        const diff = (inc.investigationStartedAt.getTime() - detected) / 1000;
        if (diff >= 0) {
          totalInvSec += diff;
          invCount++;
        }
      }

      if (inc.mitigatedAt) {
        const diff = (inc.mitigatedAt.getTime() - detected) / 1000;
        if (diff >= 0) {
          totalMitSec += diff;
          mitCount++;
        }
      }

      if (inc.resolvedAt) {
        const diff = (inc.resolvedAt.getTime() - detected) / 1000;
        if (diff >= 0) {
          totalResSec += diff;
          resCount++;
          resolutionDurations.push(diff);
        }
      }
    }

    const mttaSeconds = ackCount > 0 ? Math.round(totalAckSec / ackCount) : null;
    const mttiSeconds = invCount > 0 ? Math.round(totalInvSec / invCount) : null;
    const mttmSeconds = mitCount > 0 ? Math.round(totalMitSec / mitCount) : null;
    const mttrSeconds = resCount > 0 ? Math.round(totalResSec / resCount) : null;

    // Percentiles strictly require >= 5 samples
    let p50MttrSeconds: number | null = null;
    let p90MttrSeconds: number | null = null;

    if (resolutionDurations.length >= 5) {
      resolutionDurations.sort((a, b) => a - b);
      const p50Idx = Math.floor((resolutionDurations.length - 1) * 0.5);
      const p90Idx = Math.floor((resolutionDurations.length - 1) * 0.9);
      p50MttrSeconds = Math.round(resolutionDurations[p50Idx]!);
      p90MttrSeconds = Math.round(resolutionDurations[p90Idx]!);
    }

    return {
      sampleCount,
      acknowledgedCount: ackCount,
      resolvedCount: resCount,
      mttaSeconds,
      mttiSeconds,
      mttmSeconds,
      mttrSeconds,
      p50MttrSeconds,
      p90MttrSeconds,
    };
  }

  private calculateSeverityDistribution(incidents: any[]): SeverityDistribution {
    const dist: SeverityDistribution = { SEV_1: 0, SEV_2: 0, SEV_3: 0, SEV_4: 0 };
    for (const inc of incidents) {
      if (inc.severity === 'CRITICAL' || (inc.severity as any) === 'SEV_1') dist.SEV_1++;
      else if (inc.severity === 'ERROR' || (inc.severity as any) === 'SEV_2') dist.SEV_2++;
      else if (inc.severity === 'WARNING' || (inc.severity as any) === 'SEV_3') dist.SEV_3++;
      else if (inc.severity === 'INFO' || (inc.severity as any) === 'SEV_4') dist.SEV_4++;
    }
    return dist;
  }

  /**
   * Builds daily trend points using rollups for historical dates and live data for today.
   */
  private async buildDailyTrend(
    organizationId: string,
    windowStart: Date,
    todayMidnightUTC: Date,
    now: Date,
    serviceId?: string,
  ): Promise<DailyReliabilityPoint[]> {
    const trendMap = new Map<string, DailyReliabilityPoint>();

    // Initialize all dates in window
    let cur = new Date(windowStart.getTime());
    while (cur.getTime() <= now.getTime()) {
      const dateStr = cur.toISOString().split('T')[0]!;
      trendMap.set(dateStr, {
        date: dateStr,
        incidentCount: 0,
        criticalCount: 0,
        resolvedCount: 0,
        avgMttrSeconds: null,
        alertFiringCount: 0,
        anomalyCount: 0,
      });
      cur = new Date(cur.getTime() + 86400000);
    }

    // Historical completed days: query ReliabilityDailyRollup
    const rollupWhere: any = {
      organizationId,
      date: { gte: windowStart, lt: todayMidnightUTC },
    };
    if (serviceId) {
      rollupWhere.serviceId = serviceId;
    } else {
      rollupWhere.serviceId = null;
    }

    const rollups = await this.prisma.reliabilityDailyRollup.findMany({
      where: rollupWhere,
      orderBy: { date: 'asc' },
    });

    for (const r of rollups) {
      const dateStr = r.date.toISOString().split('T')[0]!;
      const avgMttr = r.resolvedIncidentCount > 0
        ? Math.round(r.totalResolutionSeconds / r.resolvedIncidentCount)
        : null;

      trendMap.set(dateStr, {
        date: dateStr,
        incidentCount: r.incidentCount,
        criticalCount: r.criticalIncidentCount,
        resolvedCount: r.resolvedIncidentCount,
        avgMttrSeconds: avgMttr,
        alertFiringCount: r.alertFiringCount,
        anomalyCount: r.anomalyDetectedCount,
      });
    }

    // Current day (today UTC): live query
    const todayStr = todayMidnightUTC.toISOString().split('T')[0]!;
    const todayIncidentsWhere: any = {
      organizationId,
      detectedAt: { gte: todayMidnightUTC, lte: now },
    };
    if (serviceId) todayIncidentsWhere.primaryServiceId = serviceId;

    const todayIncidents = await this.prisma.incident.findMany({
      where: todayIncidentsWhere,
      select: {
        severity: true,
        detectedAt: true,
        resolvedAt: true,
      },
    });

    let todayResCount = 0;
    let todayResSec = 0;
    let todayCritCount = 0;
    for (const inc of todayIncidents) {
      if (inc.severity === 'CRITICAL' || (inc.severity as any) === 'SEV_1') todayCritCount++;
      if (inc.resolvedAt) {
        const diff = (inc.resolvedAt.getTime() - inc.detectedAt.getTime()) / 1000;
        if (diff >= 0) {
          todayResSec += diff;
          todayResCount++;
        }
      }
    }

    const todayAlertsCount = await this.prisma.alertEvent.count({
      where: {
        organizationId,
        eventType: 'FIRING_STARTED',
        occurredAt: { gte: todayMidnightUTC, lte: now },
        ...(serviceId ? { rule: { serviceId } } : {}),
      },
    });

    const todayAnomaliesCount = await this.prisma.anomalyFinding.count({
      where: {
        organizationId,
        firstDetectedAt: { gte: todayMidnightUTC, lte: now },
        ...(serviceId ? { serviceId } : {}),
      },
    });

    trendMap.set(todayStr, {
      date: todayStr,
      incidentCount: todayIncidents.length,
      criticalCount: todayCritCount,
      resolvedCount: todayResCount,
      avgMttrSeconds: todayResCount > 0 ? Math.round(todayResSec / todayResCount) : null,
      alertFiringCount: todayAlertsCount,
      anomalyCount: todayAnomaliesCount,
    });

    return Array.from(trendMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Detects Potential Recurrences based on recurring incidents for the same service and alert rule.
   */
  private calculatePotentialRecurrences(incidents: any[]): PotentialRecurrenceItem[] {
    const clusterMap = new Map<string, {
      serviceId: string;
      serviceName: string;
      alertRuleId?: string;
      alertRuleName?: string;
      incidentIds: string[];
      lastIncidentAt: string;
    }>();

    for (const inc of incidents) {
      if (!inc.primaryServiceId) continue;

      const serviceId = inc.primaryServiceId;
      const serviceName = inc.primaryService?.name || 'Unknown Service';

      // Group by service + first linked alert rule (if present)
      const firstAlert = inc.alerts?.[0];
      const alertRuleId = firstAlert?.alertRuleId || undefined;
      const alertRuleName = firstAlert?.alertRule?.name || undefined;

      const clusterKey = alertRuleId ? `${serviceId}_${alertRuleId}` : `${serviceId}_generic`;

      const existing = clusterMap.get(clusterKey);
      if (!existing) {
        clusterMap.set(clusterKey, {
          serviceId,
          serviceName,
          alertRuleId,
          alertRuleName,
          incidentIds: [inc.id],
          lastIncidentAt: inc.detectedAt.toISOString(),
        });
      } else {
        existing.incidentIds.push(inc.id);
        if (new Date(inc.detectedAt) > new Date(existing.lastIncidentAt)) {
          existing.lastIncidentAt = inc.detectedAt.toISOString();
        }
      }
    }

    // Filter to clusters with >= 2 incidents
    const results: PotentialRecurrenceItem[] = [];
    for (const item of clusterMap.values()) {
      if (item.incidentIds.length >= 2) {
        results.push({
          serviceId: item.serviceId,
          serviceName: item.serviceName,
          alertRuleId: item.alertRuleId,
          alertRuleName: item.alertRuleName,
          incidentCount: item.incidentIds.length,
          lastIncidentAt: item.lastIncidentAt,
          incidentIds: item.incidentIds,
        });
      }
    }

    return results.sort((a, b) => b.incidentCount - a.incidentCount);
  }

  /**
   * Evaluates AI Top-1 Agreement strictly on incidents with a human-confirmed root cause.
   */
  private calculateAiAgreement(incidents: any[]): AiAgreementMetric {
    const humanConfirmed = incidents.filter(
      (inc) => inc.rootCauseConfirmedAt !== null || inc.confirmedRootCauseHypothesisId !== null,
    );

    if (humanConfirmed.length === 0) {
      return {
        humanConfirmedIncidentsCount: 0,
        top1AgreementCount: 0,
        agreementPercentage: null,
      };
    }

    let top1MatchCount = 0;

    for (const inc of humanConfirmed) {
      const topHypothesis = inc.hypotheses?.[0];
      if (!topHypothesis) continue;

      // Agreement matches if confirmed hypothesis is rank 1 or candidate service matches confirmed service
      if (
        inc.confirmedRootCauseHypothesisId &&
        topHypothesis.id === inc.confirmedRootCauseHypothesisId
      ) {
        top1MatchCount++;
      } else if (
        inc.primaryServiceId &&
        topHypothesis.candidateServiceId === inc.primaryServiceId
      ) {
        top1MatchCount++;
      }
    }

    const agreementPercentage = Math.round((top1MatchCount / humanConfirmed.length) * 100);

    return {
      humanConfirmedIncidentsCount: humanConfirmed.length,
      top1AgreementCount: top1MatchCount,
      agreementPercentage,
    };
  }

  private async calculateAnomalyFeedback(
    organizationId: string,
    windowStart: Date,
    now: Date,
  ): Promise<AnomalyFeedbackBreakdown> {
    const feedbacks = await this.prisma.anomalyFeedback.findMany({
      where: {
        organizationId,
        createdAt: { gte: windowStart, lte: now },
      },
      select: { classification: true },
    });

    const breakdown: AnomalyFeedbackBreakdown = {
      USEFUL: 0,
      FALSE_POSITIVE: 0,
      EXPECTED_BEHAVIOR: 0,
      UNSURE: 0,
      total: feedbacks.length,
    };

    for (const f of feedbacks) {
      if (f.classification in breakdown) {
        (breakdown as any)[f.classification]++;
      }
    }

    return breakdown;
  }

  private async calculateRunbookReliability(
    organizationId: string,
    windowStart: Date,
    now: Date,
  ): Promise<RunbookReliabilityMetric> {
    const executions = await this.prisma.runbookExecution.findMany({
      where: {
        organizationId,
        startedAt: { gte: windowStart, lte: now },
      },
      select: {
        status: true,
        startedAt: true,
        completedAt: true,
      },
    });

    const totalExecutions = executions.length;
    let completedCount = 0;
    let failedOrCancelledCount = 0;
    let totalCompletedDuration = 0;

    for (const ex of executions) {
      if (ex.status === 'COMPLETED') {
        completedCount++;
        if (ex.completedAt) {
          const diff = (ex.completedAt.getTime() - ex.startedAt.getTime()) / 1000;
          if (diff >= 0) totalCompletedDuration += diff;
        }
      } else if (ex.status === 'CANCELLED') {
        failedOrCancelledCount++;
      }
    }

    const completionRatePercentage = totalExecutions > 0
      ? Math.round((completedCount / totalExecutions) * 100)
      : null;

    const avgDurationSeconds = completedCount > 0
      ? Math.round(totalCompletedDuration / completedCount)
      : null;

    return {
      totalExecutions,
      completedCount,
      failedOrCancelledCount,
      completionRatePercentage,
      avgDurationSeconds,
    };
  }
}

