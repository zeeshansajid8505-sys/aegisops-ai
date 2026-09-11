import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  OperationsOverview,
  OperationsSummary,
  AttentionItem,
  ServiceOperationalSummary,
  OperationsAlertItem,
  OperationsIncidentItem,
  OperationsActivityItem,
  IncidentStatus,
  IncidentSeverity,
} from '@aegisops/types';
import { aggregateServiceHealth } from '../health-probes/health-aggregation';

@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(organizationId: string): Promise<OperationsOverview> {
    const activeIncidentStatuses = ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'MITIGATED'];
    const activeAlertStates = ['PENDING', 'FIRING'];

    // Execute queries concurrently to guarantee bounded O(1) round trips and zero N+1 queries
    const [
      services,
      activeAlerts,
      activeIncidents,
      criticalIncidentsCount,
      alertGroupCounts,
      incidentGroupCounts,
      recentTimelineEvents,
      activeAnomalies,
    ] = await Promise.all([
      // 1. All services with environments and probe states for health calculation
      this.prisma.service.findMany({
        where: { organizationId },
        select: {
          id: true,
          name: true,
          slug: true,
          tier: true,
          updatedAt: true,
          environments: {
            select: {
              id: true,
              isProduction: true,
              isActive: true,
              healthProbes: {
                select: {
                  enabled: true,
                  isCritical: true,
                  state: {
                    select: {
                      status: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { name: 'asc' },
      }),

      // 2. Active alerts preview
      this.prisma.alertInstance.findMany({
        where: {
          organizationId,
          state: { in: activeAlertStates as any },
        },
        include: {
          rule: { select: { name: true, severity: true, thresholdValue: true } },
          service: { select: { name: true } },
          environment: { select: { name: true } },
        },
        orderBy: [{ state: 'asc' }, { lastStateChangeAt: 'desc' }],
        take: 10,
      }),

      // 3. Active incidents preview
      this.prisma.incident.findMany({
        where: {
          organizationId,
          status: { in: activeIncidentStatuses as any },
        },
        include: {
          primaryService: { select: { name: true } },
          commander: {
            include: {
              user: { select: { displayName: true } },
            },
          },
          alerts: {
            where: { unlinkedAt: null, resolvedAt: null },
            select: { id: true },
          },
        },
        orderBy: [{ detectedAt: 'desc' }],
        take: 10,
      }),

      // 4. Critical incidents count
      this.prisma.incident.count({
        where: {
          organizationId,
          status: { in: activeIncidentStatuses as any },
          severity: 'CRITICAL',
        },
      }),

      // 5. Active alerts count grouped by service
      this.prisma.alertInstance.groupBy({
        by: ['serviceId'],
        where: {
          organizationId,
          state: 'FIRING',
        },
        _count: true,
      }),

      // 6. Active incidents count grouped by service
      this.prisma.incident.groupBy({
        by: ['primaryServiceId'],
        where: {
          organizationId,
          status: { in: activeIncidentStatuses as any },
          primaryServiceId: { not: null },
        },
        _count: true,
      }),

      // 7. Recent operational activity from timeline events
      this.prisma.incidentTimelineEvent.findMany({
        where: {
          incident: { organizationId },
        },
        include: {
          incident: { select: { id: true, incidentKey: true, title: true } },
          actor: { include: { user: { select: { displayName: true } } } },
        },
        orderBy: { occurredAt: 'desc' },
        take: 10,
      }),

      // 8. Active high-priority anomaly findings
      (this.prisma.anomalyFinding
        ? this.prisma.anomalyFinding.findMany({
            where: {
              organizationId,
              state: 'ANOMALOUS',
            },
            include: {
              detector: { select: { name: true } },
              service: { select: { name: true } },
              environment: { select: { name: true } },
              metricDefinition: { select: { name: true } },
            },
            orderBy: { currentScore: 'desc' },
            take: 5,
          })
        : Promise.resolve([])),
    ]);

    // Service lookup maps for active counts
    const alertCountMap = new Map<string, number>();
    for (const group of alertGroupCounts) {
      alertCountMap.set(group.serviceId, group._count);
    }

    const incidentCountMap = new Map<string, number>();
    for (const group of incidentGroupCounts) {
      if (group.primaryServiceId) {
        incidentCountMap.set(group.primaryServiceId, group._count);
      }
    }

    // Services health summary
    let healthyCount = 0;
    let degradedCount = 0;
    let downCount = 0;

    const servicesHealthSummary: ServiceOperationalSummary[] = services.map((s) => {
      const healthStatus = aggregateServiceHealth(s.environments as any);
      if (healthStatus === 'HEALTHY') healthyCount++;
      else if (healthStatus === 'DEGRADED') degradedCount++;
      else if (healthStatus === 'UNHEALTHY') downCount++;

      return {
        id: s.id,
        name: s.name,
        slug: s.slug,
        tier: s.tier,
        healthStatus,
        activeIncidentsCount: incidentCountMap.get(s.id) ?? 0,
        activeAlertsCount: alertCountMap.get(s.id) ?? 0,
        updatedAt: s.updatedAt.toISOString(),
      };
    });

    const summary: OperationsSummary = {
      servicesCount: services.length,
      healthyServicesCount: healthyCount,
      degradedServicesCount: degradedCount,
      downServicesCount: downCount,
      activeAlertsCount: activeAlerts.length,
      activeIncidentsCount: activeIncidents.length,
      criticalIncidentsCount,
    };

    // Synthesize prioritized Needs Attention items
    const needsAttention: AttentionItem[] = [];

    // Critical and high incidents
    for (const inc of activeIncidents) {
      const isCrit = inc.severity === 'CRITICAL';
      const isErr = inc.severity === 'ERROR';
      needsAttention.push({
        id: `inc-${inc.id}`,
        type: 'incident',
        priority: isCrit ? 'CRITICAL' : isErr ? 'HIGH' : 'MEDIUM',
        title: `[${inc.incidentKey}] ${inc.title}`,
        description: `Status: ${inc.status} · Severity: ${inc.severity} · Service: ${inc.primaryService?.name ?? 'System'}`,
        timestamp: inc.detectedAt.toISOString(),
        targetUrl: `/incidents/${inc.id}`,
        serviceName: inc.primaryService?.name ?? null,
        metadata: {
          severity: inc.severity,
          status: inc.status,
          incidentKey: inc.incidentKey,
        },
      });
    }

    // Firing alerts
    for (const alert of activeAlerts.filter((a) => a.state === 'FIRING')) {
      const isSev1 = alert.rule?.severity === 'SEV_1';
      needsAttention.push({
        id: `alert-${alert.id}`,
        type: 'alert',
        priority: isSev1 ? 'CRITICAL' : 'HIGH',
        title: `Alert firing: ${alert.rule?.name ?? 'Metric threshold breach'}`,
        description: `Service: ${alert.service?.name ?? 'Unknown'} (${alert.environment?.name ?? 'Unknown'}) · Value: ${alert.currentValue ?? 'N/A'}`,
        timestamp: (alert.firingStartedAt ?? alert.lastStateChangeAt).toISOString(),
        targetUrl: `/alerts`,
        serviceName: alert.service?.name ?? null,
        metadata: {
          ruleName: alert.rule?.name,
          state: alert.state,
        },
      });
    }

    // Down/Degraded services
    for (const s of servicesHealthSummary) {
      if (s.healthStatus === 'UNHEALTHY') {
        needsAttention.push({
          id: `svc-${s.id}`,
          type: 'service',
          priority: 'CRITICAL',
          title: `Service Down: ${s.name}`,
          description: `Tier ${s.tier} service is reporting unhealthy state.`,
          timestamp: s.updatedAt,
          targetUrl: `/services/${s.id}`,
          serviceName: s.name,
        });
      } else if (s.healthStatus === 'DEGRADED') {
        needsAttention.push({
          id: `svc-${s.id}`,
          type: 'service',
          priority: 'HIGH',
          title: `Service Degraded: ${s.name}`,
          description: `Tier ${s.tier} service health probes are degraded.`,
          timestamp: s.updatedAt,
          targetUrl: `/services/${s.id}`,
          serviceName: s.name,
        });
      }
    }

    // Active high-priority ML anomalies (bounded to 3-5 items, non-intrusive)
    for (const anom of activeAnomalies) {
      needsAttention.push({
        id: `anom-${anom.id}`,
        type: 'anomaly',
        priority: anom.currentScore >= 85 ? 'HIGH' : 'MEDIUM',
        title: `Statistical Anomaly: ${anom.detector?.name ?? 'Anomaly Detected'}`,
        description: `Service: ${anom.service?.name ?? 'Unknown'} · Score: ${anom.currentScore.toFixed(1)}/100 · Metric: ${anom.metricDefinition?.name ?? 'metric'}`,
        timestamp: (anom.anomalousSince ?? anom.updatedAt).toISOString(),
        targetUrl: `/services/${anom.serviceId}?tab=observability&subtab=anomalies`,
        serviceName: anom.service?.name ?? null,
        metadata: {
          score: anom.currentScore,
          peakScore: anom.peakScore,
          detectorName: anom.detector?.name,
        },
      });
    }

    // Sort Needs Attention: CRITICAL first, then HIGH, then MEDIUM, then LOW
    const priorityWeight: Record<string, number> = {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 3,
    };
    needsAttention.sort((a, b) => {
      const weightDiff = (priorityWeight[a.priority] ?? 99) - (priorityWeight[b.priority] ?? 99);
      if (weightDiff !== 0) return weightDiff;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    const activeAlertsPreview: OperationsAlertItem[] = activeAlerts.map((a) => ({
      id: a.id,
      ruleName: a.rule?.name ?? 'Alert Rule',
      serviceName: a.service?.name ?? 'Service',
      environmentName: a.environment?.name ?? 'Environment',
      severity: a.rule?.severity ?? 'SEV_3',
      state: a.state,
      firingStartedAt: a.firingStartedAt ? a.firingStartedAt.toISOString() : null,
      currentValue: a.currentValue,
      thresholdValue: a.rule?.thresholdValue,
    }));

    const activeIncidentsPreview: OperationsIncidentItem[] = activeIncidents.map((inc) => ({
      id: inc.id,
      incidentKey: inc.incidentKey,
      title: inc.title,
      severity: inc.severity as IncidentSeverity,
      status: inc.status as IncidentStatus,
      primaryServiceName: inc.primaryService?.name ?? null,
      commanderName: inc.commander?.user?.displayName ?? null,
      activeAlertsCount: inc.alerts?.length ?? 0,
      detectedAt: inc.detectedAt.toISOString(),
    }));

    const recentActivity: OperationsActivityItem[] = recentTimelineEvents.map((e) => ({
      id: e.id,
      type: 'incident',
      title: `${e.incident.incidentKey}: ${e.eventType.replace(/_/g, ' ')}`,
      description: e.message,
      timestamp: e.occurredAt.toISOString(),
      actorName: e.actor?.user?.displayName ?? 'System',
      targetUrl: `/incidents/${e.incident.id}`,
    }));

    return {
      organizationId,
      generatedAt: new Date().toISOString(),
      summary,
      needsAttention: needsAttention.slice(0, 15),
      servicesHealthSummary,
      activeAlertsPreview,
      activeIncidentsPreview,
      recentActivity,
    };
  }
}
