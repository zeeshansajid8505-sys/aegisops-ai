import { Worker, Job } from 'bullmq';
import { PrismaClient, AlertEventType, IncidentStatus } from '@prisma/client';
import Redis from 'ioredis';
import { WorkerConfig } from '../config';
import {
  selectBestIncidentCandidate,
  AlertCorrelationInput,
  IncidentCandidate,
} from './domain/correlation-scorer';
import {
  evaluateSeverityEscalation,
  alertSeverityToIncidentSeverity,
} from './domain/severity-escalation';

export const INCIDENT_CORRELATION_QUEUE_NAME = 'incident-correlation';

export interface IncidentCorrelationJobData {
  triggerId?: string;
  organizationId: string;
  alertEventId: string;
  eventType: AlertEventType;
}

export class IncidentCorrelationWorker {
  private worker: Worker<IncidentCorrelationJobData> | null = null;
  private redis: Redis | null = null;
  private isRunning = false;

  getIsRunning(): boolean {
    return this.isRunning;
  }

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: WorkerConfig,
  ) {}

  async start(): Promise<void> {
    this.redis = new Redis({
      host: this.config.redisHost,
      port: this.config.redisPort,
      maxRetriesPerRequest: null,
    });

    this.worker = new Worker<IncidentCorrelationJobData>(
      INCIDENT_CORRELATION_QUEUE_NAME,
      async (job: Job<IncidentCorrelationJobData>) => {
        await this.processJob(job.data);
      },
      {
        connection: {
          host: this.config.redisHost,
          port: this.config.redisPort,
          maxRetriesPerRequest: null,
        },
        concurrency: this.config.concurrency,
      },
    );

    this.isRunning = true;
    // eslint-disable-next-line no-console
    console.log('[IncidentCorrelationWorker] Started incident correlation worker');
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
    // eslint-disable-next-line no-console
    console.log('[IncidentCorrelationWorker] Stopped incident correlation worker');
  }

  private getRedis(): Redis {
    if (!this.redis) {
      this.redis = new Redis({
        host: this.config.redisHost,
        port: this.config.redisPort,
        maxRetriesPerRequest: null,
      });
    }
    return this.redis;
  }

  private async publishRealtime(
    type: string,
    organizationId: string,
    incidentId: string,
    payload: any,
  ): Promise<void> {
    try {
      const redis = this.getRedis();
      if (redis && redis.status === 'ready') {
        const envelope = {
          id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type,
          organizationId,
          targetRoom: `incident:${organizationId}:${incidentId}`,
          timestamp: new Date().toISOString(),
          payload,
        };
        await redis.publish('aegisops:realtime:events', JSON.stringify(envelope));
      }
    } catch {
      // Fire and forget: do not interrupt transaction or correlation
    }
  }

  private async acquireLock(
    lockKey: string,
    token: string,
    ttlMs = 30000,
  ): Promise<boolean> {
    const redis = this.getRedis();
    const result = await redis.set(lockKey, token, 'PX', ttlMs, 'NX');
    return result === 'OK';
  }

  private async releaseLock(lockKey: string, token: string): Promise<void> {
    const redis = this.getRedis();
    const luaScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    try {
      await redis.eval(luaScript, 1, lockKey, token);
    } catch {
      // Ignore lock release errors
    }
  }

  async processJob(data: IncidentCorrelationJobData): Promise<void> {
    const { triggerId, organizationId, alertEventId, eventType } = data;

    // Load alert event and related entities
    const alertEvent = await this.prisma.alertEvent.findUnique({
      where: { id: alertEventId },
      include: {
        alertInstance: {
          include: {
            service: true,
            environment: true,
          },
        },
        rule: true,
      },
    });

    if (!alertEvent) {
      // eslint-disable-next-line no-console
      console.warn(`[IncidentCorrelationWorker] AlertEvent ${alertEventId} not found, skipping.`);
      if (triggerId) {
        await this.prisma.incidentCorrelationTrigger.update({
          where: { id: triggerId },
          data: { status: 'FAILED', lastError: 'AlertEvent not found' },
        });
      }
      return;
    }

    const envKey =
      alertEvent.alertInstance.environment?.key ?? alertEvent.alertInstance.environmentId;
    const lockKey = `lock:incident-correlation:${organizationId}:${envKey}`;
    const token = `${alertEventId}-${Date.now()}`;

    // Acquire environment-scoped distributed lock (with spin-wait if needed)
    let acquired = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      acquired = await this.acquireLock(lockKey, token, 30000);
      if (acquired) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    if (!acquired) {
      throw new Error(`Failed to acquire distributed lock ${lockKey} for alert event ${alertEventId}`);
    }

    try {
      if (eventType === 'FIRING_STARTED') {
        await this.handleFiringStarted(alertEvent);
      } else if (eventType === 'RESOLVED') {
        await this.handleResolved(alertEvent);
      }

      if (triggerId) {
        await this.prisma.incidentCorrelationTrigger.update({
          where: { id: triggerId },
          data: {
            status: 'PROCESSED',
            processedAt: new Date(),
          },
        });
      }
    } catch (err: any) {
      if (triggerId) {
        await this.prisma.incidentCorrelationTrigger.update({
          where: { id: triggerId },
          data: {
            status: 'FAILED',
            lastError: err.message || String(err),
            attempts: { increment: 1 },
          },
        });
      }
      throw err;
    } finally {
      await this.releaseLock(lockKey, token);
    }
  }

  private async handleFiringStarted(alertEvent: any): Promise<void> {
    // Idempotency: check if this episode has already been linked
    const existingAlertLink = await this.prisma.incidentAlert.findUnique({
      where: { triggerAlertEventId: alertEvent.id },
    });
    if (existingAlertLink) {
      return;
    }

    const serviceId = alertEvent.alertInstance.serviceId;
    const organizationId = alertEvent.organizationId;
    const environmentId = alertEvent.alertInstance.environmentId;
    const service = alertEvent.alertInstance.service;
    const rule = alertEvent.rule;

    // 1. Fetch 1-hop connected service IDs (both dependencies and dependents)
    const dependencies = await this.prisma.serviceDependency.findMany({
      where: {
        organizationId,
        OR: [{ sourceServiceId: serviceId }, { targetServiceId: serviceId }],
      },
    });

    const connectedServiceIds = new Set<string>();
    for (const dep of dependencies) {
      if (dep.sourceServiceId === serviceId) {
        connectedServiceIds.add(dep.targetServiceId);
      } else {
        connectedServiceIds.add(dep.sourceServiceId);
      }
    }

    const envKey = alertEvent.alertInstance.environment?.key ?? null;
    const alertInput: AlertCorrelationInput = {
      alertEventId: alertEvent.id,
      serviceId,
      environmentId,
      environmentKey: envKey,
      occurredAt: alertEvent.occurredAt,
      ownerTeamId: service.ownerTeamId,
      connectedServiceIds,
    };

    // 2. Fetch active candidate incidents in this organization & environment
    const activeIncidents = await this.prisma.incident.findMany({
      where: {
        organizationId,
        OR: [
          ...(envKey ? [{ environment: { key: envKey } }] : []),
          { environmentId },
        ],
        status: { in: ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'MITIGATED'] as IncidentStatus[] },
        lastSignalAt: { gte: new Date(alertEvent.occurredAt.getTime() - 600000) },
      },
      include: {
        environment: {
          select: { id: true, key: true },
        },
        alerts: {
          where: { unlinkedAt: null },
        },
        primaryService: {
          select: { id: true, ownerTeamId: true },
        },
      },
    });

    const candidates: IncidentCandidate[] = activeIncidents.map((inc) => ({
      id: inc.id,
      incidentKey: inc.incidentKey,
      organizationId: inc.organizationId,
      environmentId: inc.environmentId,
      environmentKey: inc.environment?.key ?? null,
      primaryServiceId: inc.primaryServiceId,
      status: inc.status,
      severity: inc.severity,
      assignedTeamId: inc.assignedTeamId,
      primaryServiceOwnerTeamId: inc.primaryService?.ownerTeamId,
      lastSignalAt: inc.lastSignalAt,
      linkedServiceIds: inc.alerts.map((a) => a.serviceId),
    }));

    const bestCandidate = selectBestIncidentCandidate(alertInput, candidates);

    if (bestCandidate && bestCandidate.eligible) {
      // Attach to existing incident
      const targetIncidentId = bestCandidate.candidate.id;
      const currentSeverity = bestCandidate.candidate.severity;
      const escalation = evaluateSeverityEscalation(currentSeverity, rule.severity);

      await this.prisma.$transaction(async (tx) => {
        await tx.incidentAlert.create({
          data: {
            organizationId,
            incidentId: targetIncidentId,
            alertInstanceId: alertEvent.alertInstanceId,
            triggerAlertEventId: alertEvent.id,
            alertRuleId: rule.id,
            serviceId,
            environmentId,
            alertSeverity: rule.severity,
            correlationScore: bestCandidate.totalScore,
            correlationReasons: bestCandidate.reasons as any,
            linkedAt: alertEvent.occurredAt,
          },
        });

        await tx.incident.update({
          where: { id: targetIncidentId },
          data: {
            lastSignalAt: alertEvent.occurredAt,
            allSignalsClearedAt: null,
            ...(escalation.escalated ? { severity: escalation.newSeverity } : {}),
          },
        });

        await tx.incidentTimelineEvent.create({
          data: {
            organizationId,
            incidentId: targetIncidentId,
            eventType: 'ALERT_ATTACHED',
            occurredAt: alertEvent.occurredAt,
            message: `Alert '${rule.name}' correlated and attached (score: ${bestCandidate.totalScore})`,
            metadata: {
              correlationScore: bestCandidate.totalScore,
              reasons: bestCandidate.reasons,
              alertRuleId: rule.id,
              serviceId,
            } as any,
          },
        });

        if (escalation.escalated) {
          await tx.incidentTimelineEvent.create({
            data: {
              organizationId,
              incidentId: targetIncidentId,
              eventType: 'SEVERITY_ESCALATED',
              occurredAt: alertEvent.occurredAt,
              message: `Severity escalated from ${currentSeverity} to ${escalation.newSeverity} by alert '${rule.name}'`,
              metadata: {
                previousSeverity: currentSeverity,
                newSeverity: escalation.newSeverity,
                alertRuleId: rule.id,
              },
            },
          });
        }
      });

      if (escalation.escalated) {
        await this.publishRealtime(
          'incident.severity.updated',
          organizationId,
          targetIncidentId,
          { incidentId: targetIncidentId, newSeverity: escalation.newSeverity },
        );
      } else {
        await this.publishRealtime(
          'incident.updated',
          organizationId,
          targetIncidentId,
          { incidentId: targetIncidentId, attachedAlertRule: rule.name },
        );
      }
    } else {
      // Create new automated incident
      const incidentKey = `INC-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const initialSeverity = alertSeverityToIncidentSeverity(rule.severity);
      const title = `[${service.name}] ${rule.name}`;
      let createdIncidentId = '';

      await this.prisma.$transaction(async (tx) => {
        const incident = await tx.incident.create({
          data: {
            organizationId,
            incidentKey,
            title,
            source: 'AUTOMATED',
            status: 'OPEN',
            severity: initialSeverity,
            primaryServiceId: serviceId,
            environmentId,
            assignedTeamId: service.ownerTeamId,
            detectedAt: alertEvent.occurredAt,
            lastSignalAt: alertEvent.occurredAt,
          },
        });
        createdIncidentId = incident.id;

        await tx.incidentAlert.create({
          data: {
            organizationId,
            incidentId: incident.id,
            alertInstanceId: alertEvent.alertInstanceId,
            triggerAlertEventId: alertEvent.id,
            alertRuleId: rule.id,
            serviceId,
            environmentId,
            alertSeverity: rule.severity,
            correlationScore: 100,
            correlationReasons: [
              {
                code: 'SAME_SERVICE',
                score: 100,
                description: 'Initial root alert episode triggering incident',
              },
            ] as any,
            linkedAt: alertEvent.occurredAt,
          },
        });

        await tx.incidentTimelineEvent.create({
          data: {
            organizationId,
            incidentId: incident.id,
            eventType: 'INCIDENT_CREATED',
            occurredAt: alertEvent.occurredAt,
            message: `Automated incident created from alert '${rule.name}'`,
            metadata: {
              ruleId: rule.id,
              serviceId,
              severity: initialSeverity,
            },
          },
        });

        await tx.incidentTimelineEvent.create({
          data: {
            organizationId,
            incidentId: incident.id,
            eventType: 'ALERT_ATTACHED',
            occurredAt: alertEvent.occurredAt,
            message: `Alert '${rule.name}' attached as root signal`,
            metadata: {
              ruleId: rule.id,
              serviceId,
              correlationScore: 100,
            },
          },
        });
      });

      if (createdIncidentId) {
        await this.publishRealtime(
          'incident.created',
          organizationId,
          createdIncidentId,
          { incidentId: createdIncidentId, incidentKey, title, severity: initialSeverity },
        );
      }
    }
  }

  private async handleResolved(alertEvent: any): Promise<void> {
    const matchingAlertLinks = await this.prisma.incidentAlert.findMany({
      where: {
        alertInstanceId: alertEvent.alertInstanceId,
        resolvedAt: null,
        unlinkedAt: null,
      },
      include: {
        alertRule: true,
        incident: true,
      },
    });

    if (matchingAlertLinks.length === 0) {
      return;
    }

    for (const link of matchingAlertLinks) {
      const incidentId = link.incidentId;
      const organizationId = link.organizationId;
      const ruleName = link.alertRule?.name || 'Alert';

      await this.prisma.$transaction(async (tx) => {
        // Mark alert episode as resolved
        await tx.incidentAlert.update({
          where: { id: link.id },
          data: { resolvedAt: alertEvent.occurredAt },
        });

        await tx.incidentTimelineEvent.create({
          data: {
            organizationId,
            incidentId,
            eventType: 'ALERT_RESOLVED',
            occurredAt: alertEvent.occurredAt,
            message: `Linked alert '${ruleName}' resolved`,
            metadata: {
              alertRuleId: link.alertRuleId,
              alertInstanceId: link.alertInstanceId,
            },
          },
        });

        // Check if all active alert links for this incident are now resolved
        const activeUnresolvedCount = await tx.incidentAlert.count({
          where: {
            incidentId,
            unlinkedAt: null,
            resolvedAt: null,
          },
        });

        if (activeUnresolvedCount === 0) {
          // Set all signals cleared on the incident
          await tx.incident.update({
            where: { id: incidentId },
            data: { allSignalsClearedAt: alertEvent.occurredAt },
          });

          await tx.incidentTimelineEvent.create({
            data: {
              organizationId,
              incidentId,
              eventType: 'ALL_LINKED_SIGNALS_CLEARED',
              occurredAt: alertEvent.occurredAt,
              message:
                'All linked alert signals have cleared. Incident remains open for human review.',
              metadata: { clearedAt: alertEvent.occurredAt },
            },
          });
        }
      });
    }
  }
}
