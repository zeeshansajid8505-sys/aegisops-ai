import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { WorkerConfig } from '../config';

export const INCIDENT_AI_ANALYSIS_QUEUE_NAME = 'incident-ai-analysis';

export interface IncidentAiAnalysisJobData {
  organizationId: string;
  incidentId: string;
  analysisId: string;
}

export class IncidentAiAnalysisWorker {
  private worker: Worker<IncidentAiAnalysisJobData> | null = null;
  private redis: Redis | null = null;
  private isRunning = false;
  private readonly aiServiceUrl: string;
  private readonly aiApiKey: string;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: WorkerConfig,
  ) {
    this.aiServiceUrl = process.env['AI_SERVICE_URL'] || 'http://localhost:8000';
    this.aiApiKey = process.env['AI_INTERNAL_API_KEY'] || 'aegisops-ai-internal-key-change-in-prod';
  }

  getIsRunning(): boolean {
    return this.isRunning;
  }

  async start(): Promise<void> {
    this.redis = new Redis({
      host: this.config.redisHost,
      port: this.config.redisPort,
      maxRetriesPerRequest: null,
    });

    this.worker = new Worker<IncidentAiAnalysisJobData>(
      INCIDENT_AI_ANALYSIS_QUEUE_NAME,
      async (job: Job<IncidentAiAnalysisJobData>) => {
        await this.processJob(job.data);
      },
      {
        connection: {
          host: this.config.redisHost,
          port: this.config.redisPort,
          maxRetriesPerRequest: null,
        },
        concurrency: 2,
      },
    );

    this.isRunning = true;
    // eslint-disable-next-line no-console
    console.log('[IncidentAiAnalysisWorker] Started AI RCA analysis background worker');
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
    console.log('[IncidentAiAnalysisWorker] Stopped AI RCA analysis worker');
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
      // Fire-and-forget realtime delivery
    }
  }

  async processJob(data: IncidentAiAnalysisJobData): Promise<void> {
    const { organizationId, incidentId, analysisId } = data;

    const analysis = await this.prisma.incidentAnalysis.findFirst({
      where: { id: analysisId, organizationId, incidentId },
      include: { evidenceSnapshot: true },
    });

    if (!analysis) {
      // eslint-disable-next-line no-console
      console.warn(`[IncidentAiAnalysisWorker] Analysis ${analysisId} not found`);
      return;
    }

    if (analysis.status === 'COMPLETED') {
      return;
    }

    // Mark RUNNING
    await this.prisma.incidentAnalysis.update({
      where: { id: analysisId },
      data: { status: 'RUNNING' },
    });

    await this.publishRealtime('incident.analysis.started', organizationId, incidentId, {
      analysisId,
      status: 'RUNNING',
    });

    try {
      // Build evidence
      const incident = await this.prisma.incident.findFirst({
        where: { id: incidentId, organizationId },
        include: {
          primaryService: true,
          alerts: {
            include: {
              alertInstance: { include: { rule: true } },
              triggerAlertEvent: true,
            },
          },
          timelineEvents: {
            orderBy: { occurredAt: 'asc' },
          },
        },
      });

      if (!incident) {
        throw new Error(`Incident ${incidentId} not found`);
      }

      const detectedAt = incident.detectedAt || incident.createdAt;
      const windowStart = new Date(detectedAt.getTime() - 30 * 60 * 1000);
      const now = new Date();
      let windowEnd = new Date(detectedAt.getTime() + 10 * 60 * 1000);
      if (windowEnd > now) {
        windowEnd = now;
      }
      const baselineStart = new Date(windowStart.getTime() - 30 * 60 * 1000);

      const candidateServiceIdSet = new Set<string>();
      if (incident.primaryServiceId) {
        candidateServiceIdSet.add(incident.primaryServiceId);
      }
      for (const ia of incident.alerts) {
        if (ia.serviceId) {
          candidateServiceIdSet.add(ia.serviceId);
        }
      }

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

      const windowAlerts = await this.prisma.alertEvent.findMany({
        where: {
          organizationId,
          occurredAt: { gte: windowStart, lte: windowEnd },
        },
        include: { alertInstance: true, rule: true },
        take: 50,
      });

      for (const a of windowAlerts) {
        if (a.alertInstance?.serviceId) {
          candidateServiceIdSet.add(a.alertInstance.serviceId);
        }
      }

      const candidateServiceIds = Array.from(candidateServiceIdSet).slice(0, 30);
      const candidateServices = await this.prisma.service.findMany({
        where: { organizationId, id: { in: candidateServiceIds } },
      });

      const dependencies = await this.prisma.serviceDependency.findMany({
        where: {
          organizationId,
          OR: [
            { sourceServiceId: { in: candidateServiceIds } },
            { targetServiceId: { in: candidateServiceIds } },
          ],
        },
      });

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

      const metricRollupsWindow = await this.prisma.metricRollupMinute.findMany({
        where: {
          organizationId,
          serviceId: { in: candidateServiceIds },
          bucketMinute: { gte: windowStart, lte: windowEnd },
        },
        include: { definition: true },
        take: 200,
      });

      const metricRollupsBaseline = await this.prisma.metricRollupMinute.findMany({
        where: {
          organizationId,
          serviceId: { in: candidateServiceIds },
          bucketMinute: { gte: baselineStart, lt: windowStart },
        },
        include: { definition: true },
        take: 200,
      });

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

        metricEvidence.push({
          id: `metric-${key}`,
          serviceId: entry.serviceId,
          metricName: entry.definitionName,
          baselineMean: Math.round(baseMean * 100) / 100,
          windowMean: Math.round(winMean * 100) / 100,
          percentageChange: Math.round(pctChange * 10) / 10,
          isAnomaly: Math.abs(pctChange) >= 30,
        });
      }

      const probeStates = await this.prisma.healthProbeState.findMany({
        where: {
          probe: {
            organizationId,
            serviceId: { in: candidateServiceIds },
          },
        },
        include: { probe: true },
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

      const humanNotes: any[] = [];
      for (const te of incident.timelineEvents) {
        if (te.eventType === 'NOTE_ADDED') {
          humanNotes.push({
            id: te.id,
            message: te.message,
            authorName: te.actorMembershipId || 'Responder',
            createdAt: te.occurredAt.toISOString(),
          });
        }
      }

      const runbooks = await this.prisma.runbook.findMany({
        where: { organizationId, isActive: true },
        include: { steps: { orderBy: { order: 'asc' } } },
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

      const payload = {
        incident: {
          id: incident.id,
          key: incident.incidentKey,
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
      };

      // Call FastAPI
      const res = await fetch(`${this.aiServiceUrl}/v1/rca/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Service-Key': this.aiApiKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`FastAPI inference returned status ${res.status}: ${errText}`);
      }

      const inferenceResult = (await res.json()) as any;

      // Persist in transaction
      await this.prisma.$transaction(async (tx) => {
        if (analysis.evidenceSnapshotId) {
          await tx.incidentEvidenceSnapshot.update({
            where: { id: analysis.evidenceSnapshotId },
            data: {
              facts: (inferenceResult.observedFacts || []) as any,
            },
          });
        }

        await tx.incidentHypothesis.deleteMany({
          where: { analysisId },
        });

        for (const c of inferenceResult.rankedCandidates || []) {
          await tx.incidentHypothesis.create({
            data: {
              organizationId,
              incidentId,
              analysisId,
              candidateServiceId: c.candidateServiceId || null,
              rank: c.rank,
              hypothesis: c.hypothesis,
              confidence: c.confidence || 'MEDIUM',
              score: c.score || 0,
              reasonCodes: c.reasonCodes || [],
              evidenceRefs: c.evidenceRefs || [],
              counterEvidenceRefs: c.counterEvidenceRefs || [],
              status: 'PROPOSED',
            },
          });
        }

        await tx.incidentAnalysis.update({
          where: { id: analysisId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            summary: inferenceResult.summary,
            algorithmVersion: inferenceResult.algorithmVersion || '1.0.0',
            modelVersion: inferenceResult.modelVersion || '1.0.0',
            embeddingVersion: inferenceResult.embeddingVersion || '1.0.0',
            recommendedNextChecks: inferenceResult.recommendedNextChecks || [],
            recommendedRunbooks: (inferenceResult.recommendedRunbooks || []) as any,
          },
        });

        await tx.incidentTimelineEvent.create({
          data: {
            incidentId,
            organizationId,
            eventType: 'ANALYSIS_COMPLETED',
            message: `AI Root Cause Analysis completed: ${inferenceResult.summary || 'Hypotheses generated.'}`,
          },
        });
      });

      await this.publishRealtime('incident.analysis.completed', organizationId, incidentId, {
        analysisId,
        summary: inferenceResult.summary,
        hypothesesCount: (inferenceResult.rankedCandidates || []).length,
      });

      // eslint-disable-next-line no-console
      console.log(`[IncidentAiAnalysisWorker] Successfully completed analysis ${analysisId}`);
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error(`[IncidentAiAnalysisWorker] Analysis ${analysisId} failed: ${err.message}`);

      await this.prisma.incidentAnalysis.update({
        where: { id: analysisId },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          failureCode: 'INFERENCE_FAILED',
          failureMessage: err.message,
        },
      });

      await this.publishRealtime('incident.analysis.failed', organizationId, incidentId, {
        analysisId,
        error: err.message,
      });
    }
  }
}
