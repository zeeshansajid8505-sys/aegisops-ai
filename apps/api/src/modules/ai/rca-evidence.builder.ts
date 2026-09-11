import { Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface BuiltRcaEvidence {
  incident: any;
  candidateServices: any[];
  topology: {
    services: any[];
    dependencies: any[];
  };
  metricEvidence: any[];
  alertEvidence: any[];
  healthEvidence: any[];
  humanNotes: any[];
  availableRunbooks: any[];
  anomalyEvidence: any[];
  fingerprint: string;
  windowStart: Date;
  windowEnd: Date;
  candidateServiceIds: string[];
}

@Injectable()
export class RcaEvidenceBuilder {
  constructor(private readonly prisma: PrismaService) {}

  async buildEvidence(organizationId: string, incidentId: string): Promise<BuiltRcaEvidence> {
    // 1. Fetch incident with relations
    const incident = await this.prisma.incident.findFirst({
      where: { id: incidentId, organizationId },
      include: {
        primaryService: true,
        alerts: {
          include: {
            alertInstance: {
              include: {
                rule: true,
              },
            },
            triggerAlertEvent: true,
          },
        },
        timelineEvents: {
          orderBy: { occurredAt: 'asc' },
        },
      },
    });

    if (!incident) {
      throw new NotFoundException(`Incident ${incidentId} not found in organization ${organizationId}`);
    }

    // 2. Determine lookback window: [detectedAt - 30m, detectedAt + 10m]
    const detectedAt = incident.detectedAt || incident.createdAt;
    const windowStart = new Date(detectedAt.getTime() - 30 * 60 * 1000);
    const now = new Date();
    let windowEnd = new Date(detectedAt.getTime() + 10 * 60 * 1000);
    if (windowEnd > now) {
      windowEnd = now;
    }
    // Baseline comparison window: [windowStart - 30m, windowStart]
    const baselineStart = new Date(windowStart.getTime() - 30 * 60 * 1000);

    // 3. Discover candidate services (bounded to 30)
    const candidateServiceIdSet = new Set<string>();

    if (incident.primaryServiceId) {
      candidateServiceIdSet.add(incident.primaryServiceId);
    }

    // Add services from incident alerts
    for (const ia of incident.alerts) {
      if (ia.serviceId) {
        candidateServiceIdSet.add(ia.serviceId);
      }
    }

    // Add upstream and downstream dependencies of primary service
    if (incident.primaryServiceId) {
      const directDeps = await this.prisma.serviceDependency.findMany({
        where: {
          organizationId,
          OR: [
            { sourceServiceId: incident.primaryServiceId },
            { targetServiceId: incident.primaryServiceId },
          ],
        },
        take: 20,
      });

      for (const dep of directDeps) {
        candidateServiceIdSet.add(dep.sourceServiceId);
        candidateServiceIdSet.add(dep.targetServiceId);
      }
    }

    // Add any other services in the org that fired alerts in this window
    const windowAlerts = await this.prisma.alertEvent.findMany({
      where: {
        organizationId,
        occurredAt: {
          gte: windowStart,
          lte: windowEnd,
        },
      },
      include: {
        alertInstance: true,
        rule: true,
      },
      take: 50,
    });

    for (const a of windowAlerts) {
      if (a.alertInstance?.serviceId) {
        candidateServiceIdSet.add(a.alertInstance.serviceId);
      }
    }

    // Bound candidate services to max 30
    const candidateServiceIds = Array.from(candidateServiceIdSet).slice(0, 30);

    // Fetch full candidate services
    const candidateServices = await this.prisma.service.findMany({
      where: {
        organizationId,
        id: { in: candidateServiceIds },
      },
    });

    // 4. Fetch dependencies between all candidate services
    const dependencies = await this.prisma.serviceDependency.findMany({
      where: {
        organizationId,
        OR: [
          { sourceServiceId: { in: candidateServiceIds } },
          { targetServiceId: { in: candidateServiceIds } },
        ],
      },
    });

    // 5. Gather Alert Evidence
    const alertEvidence: any[] = [];
    for (const ev of windowAlerts) {
      if (ev.alertInstance && candidateServiceIds.includes(ev.alertInstance.serviceId)) {
        alertEvidence.push({
          id: ev.id,
          serviceId: ev.alertInstance.serviceId,
          title: ev.rule?.name || ev.message || 'Alert',
          severity: ev.rule?.severity || 'HIGH',
          status: ev.alertInstance.state,
          firingStartedAt: ev.occurredAt.toISOString(),
        });
      }
    }

    // 6. Gather Metric Evidence & Baseline Deviations
    const metricRollupsWindow = await this.prisma.metricRollupMinute.findMany({
      where: {
        organizationId,
        serviceId: { in: candidateServiceIds },
        bucketMinute: {
          gte: windowStart,
          lte: windowEnd,
        },
      },
      include: {
        definition: true,
      },
      take: 200,
    });

    const metricRollupsBaseline = await this.prisma.metricRollupMinute.findMany({
      where: {
        organizationId,
        serviceId: { in: candidateServiceIds },
        bucketMinute: {
          gte: baselineStart,
          lt: windowStart,
        },
      },
      include: {
        definition: true,
      },
      take: 200,
    });

    // Group rollups by serviceId + definitionId
    const baselineMap = new Map<string, number[]>();
    for (const r of metricRollupsBaseline) {
      const key = `${r.serviceId}:${r.definitionId}`;
      const list = baselineMap.get(key) || [];
      list.push(r.avg);
      baselineMap.set(key, list);
    }

    const windowMap = new Map<string, { serviceId: string; definitionName: string; values: number[] }>();
    for (const r of metricRollupsWindow) {
      const key = `${r.serviceId}:${r.definitionId}`;
      const entry = windowMap.get(key) || {
        serviceId: r.serviceId,
        definitionName: r.definition.name,
        values: [],
      };
      entry.values.push(r.avg);
      windowMap.set(key, entry);
    }

    const metricEvidence: any[] = [];
    for (const [key, entry] of windowMap.entries()) {
      const baseValues = baselineMap.get(key) || [];
      const baseMean = baseValues.length > 0
        ? baseValues.reduce((a, b) => a + b, 0) / baseValues.length
        : 0;
      const winMean = entry.values.reduce((a, b) => a + b, 0) / entry.values.length;

      let pctChange = 0;
      if (baseMean > 0) {
        pctChange = ((winMean - baseMean) / baseMean) * 100;
      } else if (winMean > 0) {
        pctChange = 100;
      }

      const isAnomaly = Math.abs(pctChange) >= 30;

      metricEvidence.push({
        id: `metric-${key}`,
        serviceId: entry.serviceId,
        metricName: entry.definitionName,
        baselineMean: Math.round(baseMean * 100) / 100,
        windowMean: Math.round(winMean * 100) / 100,
        percentageChange: Math.round(pctChange * 10) / 10,
        isAnomaly,
      });
    }

    // 7. Gather Health Probe Evidence
    const probeStates = await this.prisma.healthProbeState.findMany({
      where: {
        probe: {
          organizationId,
          serviceId: { in: candidateServiceIds },
        },
      },
      include: {
        probe: true,
      },
    });

    const healthEvidence: any[] = [];
    for (const ps of probeStates) {
      healthEvidence.push({
        id: ps.id,
        serviceId: ps.probe.serviceId,
        status: ps.status,
        consecutiveFailures: ps.consecutiveFailures,
        failureReason: ps.lastFailureCode || undefined,
      });
    }

    // 8. Gather Human Notes
    const humanNotes: any[] = [];
    for (const te of incident.timelineEvents) {
      if (te.eventType === 'NOTE_ADDED') {
        humanNotes.push({
          id: te.id,
          message: te.message,
          authorName: te.actorMembershipId || 'Responder',
          createdAt: te.occurredAt ? te.occurredAt.toISOString() : new Date().toISOString(),
        });
      }
    }

    // 9. Fetch Approved Runbooks
    const runbooks = await this.prisma.runbook.findMany({
      where: {
        organizationId,
        isActive: true,
      },
      include: {
        steps: {
          orderBy: { order: 'asc' },
        },
      },
      take: 20,
    });

    const availableRunbooks = runbooks.map((rb) => ({
      id: rb.id,
      name: rb.name,
      description: rb.description,
      serviceId: rb.serviceId,
      severity: rb.severity,
      tags: rb.tags,
      steps: rb.steps.map((s) => ({
        id: s.id,
        order: s.order,
        title: s.title,
        instruction: s.instruction,
        stepType: s.stepType,
      })),
    }));

    // 9.5. Gather Proactive ML Anomaly Evidence
    const anomalyFindings = this.prisma.anomalyFinding
      ? await this.prisma.anomalyFinding.findMany({
          where: {
            organizationId,
            serviceId: { in: Array.from(candidateServiceIds) },
            state: { in: ['PENDING', 'ANOMALOUS'] },
            updatedAt: { gte: windowStart },
          },
          include: {
            detector: true,
            metricDefinition: true,
          },
          take: 20,
        })
      : [];

    const anomalyEvidence = anomalyFindings.map((af) => ({
      findingId: af.id,
      detectorId: af.detectorId,
      detectorName: af.detector.name,
      serviceId: af.serviceId,
      metricName: af.metricDefinition.name,
      state: af.state,
      peakScore: af.peakScore,
      currentScore: af.currentScore,
      firstDetectedAt: af.firstDetectedAt.toISOString(),
    }));

    // 10. Canonical SHA-256 Fingerprinting
    const canonicalObject = {
      incidentId: incident.id,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      candidateServiceIds: [...candidateServiceIds].sort(),
      alertIds: alertEvidence.map((a) => a.id).sort(),
      metricIds: metricEvidence.map((m) => m.id).sort(),
      healthIds: healthEvidence.map((h) => h.id).sort(),
      anomalyIds: anomalyEvidence.map((an) => an.findingId).sort(),
      dependencies: dependencies.map((d) => `${d.sourceServiceId}->${d.targetServiceId}`).sort(),
    };

    const fingerprint = crypto
      .createHash('sha256')
      .update(JSON.stringify(canonicalObject))
      .digest('hex');

    return {
      incident: {
        id: incident.id,
        key: incident.incidentKey,
        incidentKey: incident.incidentKey,
        title: incident.title,
        severity: incident.severity,
        status: incident.status,
        primaryServiceId: incident.primaryServiceId,
        detectedAt: detectedAt.toISOString(),
      },
      candidateServices: candidateServices.map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        tier: s.tier,
        lifecycleStatus: s.lifecycleStatus,
      })),
      topology: {
        services: candidateServices.map((s) => ({
          id: s.id,
          name: s.name,
          slug: s.slug,
          tier: s.tier,
          lifecycleStatus: s.lifecycleStatus,
        })),
        dependencies: dependencies.map((d) => ({
          id: d.id,
          sourceServiceId: d.sourceServiceId,
          targetServiceId: d.targetServiceId,
          dependencyType: d.dependencyType,
          isCritical: d.isCritical,
        })),
      },
      metricEvidence,
      alertEvidence,
      healthEvidence,
      humanNotes,
      availableRunbooks,
      anomalyEvidence,
      fingerprint,
      windowStart,
      windowEnd,
      candidateServiceIds,
    };
  }
}
