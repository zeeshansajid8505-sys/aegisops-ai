import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiServiceClient } from './ai-service.client';
import { RcaEvidenceBuilder } from './rca-evidence.builder';
import { AiQueueService } from './ai-queue.service';
import { RealtimeEventPublisher } from '../realtime/realtime-event.publisher';
import { RealtimeRooms } from '@aegisops/types';

@Injectable()
export class RcaService {
  private readonly logger = new Logger(RcaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiClient: AiServiceClient,
    private readonly evidenceBuilder: RcaEvidenceBuilder,
    private readonly queueService: AiQueueService,
    @Optional() private readonly realtimePublisher?: RealtimeEventPublisher,
  ) {}

  private publishRealtime(
    type: any,
    organizationId: string,
    incidentId: string,
    payload: any,
  ): void {
    if (!this.realtimePublisher) return;
    this.realtimePublisher
      .publish({
        id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type,
        organizationId,
        targetRoom: RealtimeRooms.incident(organizationId, incidentId),
        timestamp: new Date().toISOString(),
        payload,
      })
      .catch(() => {});
  }

  async triggerAnalysis(
    organizationId: string,
    incidentId: string,
    options?: { force?: boolean; sync?: boolean },
  ): Promise<any> {
    const incident = await this.prisma.incident.findFirst({
      where: { id: incidentId, organizationId },
    });
    if (!incident) {
      throw new NotFoundException(`Incident ${incidentId} not found`);
    }

    // Check if an analysis is currently running or queued
    const activeAnalysis = await this.prisma.incidentAnalysis.findFirst({
      where: {
        organizationId,
        incidentId,
        status: { in: ['QUEUED', 'RUNNING'] },
      },
      include: {
        hypotheses: true,
        evidenceSnapshot: true,
      },
    });

    if (activeAnalysis && !options?.force) {
      return activeAnalysis;
    }

    // Gather structured evidence
    const evidence = await this.evidenceBuilder.buildEvidence(organizationId, incidentId);

    // Check idempotency: if latest completed analysis has same fingerprint within 5 minutes
    if (!options?.force) {
      const recentSameSnapshot = await this.prisma.incidentAnalysis.findFirst({
        where: {
          organizationId,
          incidentId,
          evidenceFingerprint: evidence.fingerprint,
          status: 'COMPLETED',
          completedAt: {
            gte: new Date(Date.now() - 5 * 60 * 1000),
          },
        },
        include: {
          hypotheses: {
            orderBy: { rank: 'asc' },
            include: { candidateService: true },
          },
          evidenceSnapshot: true,
        },
        orderBy: { analysisVersion: 'desc' },
      });

      if (recentSameSnapshot) {
        return recentSameSnapshot;
      }
    }

    // Determine version number
    const count = await this.prisma.incidentAnalysis.count({
      where: { organizationId, incidentId },
    });
    const nextVersion = count + 1;

    // Persist immutable snapshot
    const snapshot = await this.prisma.incidentEvidenceSnapshot.create({
      data: {
        organizationId,
        incidentId,
        windowStart: evidence.windowStart,
        windowEnd: evidence.windowEnd,
        primaryServiceId: evidence.incident.primaryServiceId || undefined,
        affectedServiceIds: evidence.candidateServiceIds,
        evidenceVersion: '1.0.0',
        evidenceFingerprint: evidence.fingerprint,
        facts: [],
      },
    });

    // Create queued analysis record
    const analysis = await this.prisma.incidentAnalysis.create({
      data: {
        organizationId,
        incidentId,
        status: 'QUEUED',
        analysisVersion: nextVersion,
        evidenceSnapshotId: snapshot.id,
        evidenceFingerprint: evidence.fingerprint,
      },
      include: {
        evidenceSnapshot: true,
        hypotheses: true,
      },
    });

    // Add timeline event
    await this.prisma.incidentTimelineEvent.create({
      data: {
        incidentId,
        organizationId,
        eventType: 'ANALYSIS_STARTED',
        message: `AI-assisted root cause analysis v${nextVersion} initiated.`,
      },
    });

    // Notify real-time
    this.publishRealtime('incident.analysis.started', organizationId, incidentId, {
      analysisId: analysis.id,
      analysisVersion: nextVersion,
      status: 'QUEUED',
    });

    if (options?.sync) {
      // Execute synchronously (useful for tests or direct execution)
      return await this.executeAnalysisJob(organizationId, incidentId, analysis.id);
    }

    // Enqueue to BullMQ worker
    const jobId = await this.queueService.enqueueAnalysis(organizationId, incidentId, analysis.id);
    if (!jobId) {
      // If BullMQ fails to enqueue, fall back to executing asynchronously in next tick
      setImmediate(() => {
        this.executeAnalysisJob(organizationId, incidentId, analysis.id).catch((err) => {
          this.logger.error(`Fallback execution failed: ${err.message}`);
        });
      });
    }

    return analysis;
  }

  async executeAnalysisJob(
    organizationId: string,
    incidentId: string,
    analysisId: string,
  ): Promise<any> {
    const analysis = await this.prisma.incidentAnalysis.findFirst({
      where: { id: analysisId, organizationId, incidentId },
      include: { evidenceSnapshot: true },
    });

    if (!analysis) {
      throw new NotFoundException(`Analysis ${analysisId} not found`);
    }

    // Mark as RUNNING
    await this.prisma.incidentAnalysis.update({
      where: { id: analysisId },
      data: { status: 'RUNNING' },
    });

    try {
      // Build fresh evidence payload
      const evidence = await this.evidenceBuilder.buildEvidence(organizationId, incidentId);

      // Call Python FastAPI inference service
      const inferenceResult = await this.aiClient.analyze({
        incident: evidence.incident,
        candidateServices: evidence.candidateServices,
        topology: evidence.topology,
        metricEvidence: evidence.metricEvidence,
        alertEvidence: evidence.alertEvidence,
        healthEvidence: evidence.healthEvidence,
        humanNotes: evidence.humanNotes,
        availableRunbooks: evidence.availableRunbooks,
        anomalyEvidence: evidence.anomalyEvidence,
      });

      // Persist results in transaction
      const updated = await this.prisma.$transaction(async (tx) => {
        // 1. Update snapshot with observed facts
        if (analysis.evidenceSnapshotId) {
          await tx.incidentEvidenceSnapshot.update({
            where: { id: analysis.evidenceSnapshotId },
            data: {
              facts: (inferenceResult.observedFacts || []) as any,
            },
          });
        }

        // 2. Delete any preexisting hypotheses for this analysis if rerun
        await tx.incidentHypothesis.deleteMany({
          where: { analysisId },
        });

        // 3. Create hypotheses
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

        // 4. Update analysis record
        const completedAnalysis = await tx.incidentAnalysis.update({
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
          include: {
            hypotheses: {
              orderBy: { rank: 'asc' },
              include: { candidateService: true },
            },
            evidenceSnapshot: true,
          },
        });

        // 5. Add timeline event
        await tx.incidentTimelineEvent.create({
          data: {
            incidentId,
            organizationId,
            eventType: 'ANALYSIS_COMPLETED',
            message: `AI Root Cause Analysis completed: ${inferenceResult.summary || 'Hypotheses generated.'}`,
          },
        });

        return completedAnalysis;
      });

      this.publishRealtime('incident.analysis.completed', organizationId, incidentId, {
        analysisId,
        summary: updated.summary,
        hypothesesCount: updated.hypotheses.length,
      });

      return updated;
    } catch (err: any) {
      this.logger.error(`AI Analysis execution failed for ${analysisId}: ${err.message}`, err.stack);

      const failedAnalysis = await this.prisma.incidentAnalysis.update({
        where: { id: analysisId },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          failureCode: 'INFERENCE_FAILED',
          failureMessage: err.message,
        },
      });

      this.publishRealtime('incident.analysis.failed', organizationId, incidentId, {
        analysisId,
        error: err.message,
      });

      return failedAnalysis;
    }
  }

  async getLatestAnalysis(organizationId: string, incidentId: string): Promise<any> {
    const analysis = await this.prisma.incidentAnalysis.findFirst({
      where: { organizationId, incidentId },
      orderBy: { analysisVersion: 'desc' },
      include: {
        hypotheses: {
          orderBy: { rank: 'asc' },
          include: {
            candidateService: {
              select: { id: true, name: true, slug: true, tier: true, lifecycleStatus: true },
            },
          },
        },
        evidenceSnapshot: true,
      },
    });

    if (!analysis) {
      return null;
    }

    // Also get incident's confirmed root cause details
    const incident = await this.prisma.incident.findFirst({
      where: { id: incidentId, organizationId },
      include: {
        confirmedRootCauseHypothesis: true,
        rootCauseConfirmedBy: {
          include: { user: { select: { displayName: true, email: true } } },
        },
      },
    });

    let confirmedRootCause = null;
    if (incident?.confirmedRootCauseHypothesisId) {
      confirmedRootCause = {
        hypothesisId: incident.confirmedRootCauseHypothesisId,
        summary: incident.rootCauseSummary || '',
        confirmedByMembershipId: incident.rootCauseConfirmedByMembershipId || '',
        confirmedByName: incident.rootCauseConfirmedBy?.user?.displayName || incident.rootCauseConfirmedBy?.user?.email || null,
        confirmedAt: incident.rootCauseConfirmedAt?.toISOString() || null,
      };
    }

    return {
      ...analysis,
      hypotheses: ((analysis as any).hypotheses || []).map((h: any) => ({
        ...h,
        candidateServiceName: h.candidateService?.name || null,
      })),
      confirmedRootCause,
    };
  }

  async getAnalysisHistory(organizationId: string, incidentId: string): Promise<any[]> {
    return await this.prisma.incidentAnalysis.findMany({
      where: { organizationId, incidentId },
      orderBy: { analysisVersion: 'desc' },
      include: {
        hypotheses: {
          orderBy: { rank: 'asc' },
          include: { candidateService: true },
        },
        evidenceSnapshot: true,
      },
    });
  }

  async confirmRootCause(
    organizationId: string,
    incidentId: string,
    hypothesisId: string,
    membershipId: string,
    summary?: string,
  ): Promise<any> {
    const hypothesis = await this.prisma.incidentHypothesis.findFirst({
      where: { id: hypothesisId, organizationId, incidentId },
      include: { candidateService: true },
    });

    if (!hypothesis) {
      throw new NotFoundException(`Hypothesis ${hypothesisId} not found`);
    }

    const finalSummary = summary || hypothesis.hypothesis;

    await this.prisma.$transaction(async (tx) => {
      // 1. Mark this hypothesis as CONFIRMED
      await tx.incidentHypothesis.update({
        where: { id: hypothesisId },
        data: { status: 'CONFIRMED' },
      });

      // 2. Mark other hypotheses in same analysis as SUPERSEDED
      await tx.incidentHypothesis.updateMany({
        where: {
          analysisId: hypothesis.analysisId,
          id: { not: hypothesisId },
        },
        data: { status: 'SUPERSEDED' },
      });

      // 3. Update Incident with confirmed root cause
      await tx.incident.update({
        where: { id: incidentId },
        data: {
          confirmedRootCauseHypothesisId: hypothesis.id,
          rootCauseSummary: finalSummary,
          rootCauseConfirmedByMembershipId: membershipId,
          rootCauseConfirmedAt: new Date(),
        },
      });

      // 4. Create timeline event
      await tx.incidentTimelineEvent.create({
        data: {
          incidentId,
          organizationId,
          eventType: 'ROOT_CAUSE_CONFIRMED',
          actorMembershipId: membershipId,
          message: `Human confirmed root cause: ${finalSummary} (Service: ${hypothesis.candidateService?.name || 'Unknown'})`,
        },
      });
    });

    this.publishRealtime('incident.root-cause.confirmed', organizationId, incidentId, {
      hypothesisId,
      summary: finalSummary,
      confirmedByMembershipId: membershipId,
      candidateServiceName: hypothesis.candidateService?.name || null,
    });

    return this.getLatestAnalysis(organizationId, incidentId);
  }

  async rejectHypothesis(
    organizationId: string,
    incidentId: string,
    hypothesisId: string,
    membershipId: string,
    rejectionReason: string,
  ): Promise<any> {
    if (!rejectionReason || !rejectionReason.trim()) {
      throw new BadRequestException('A valid rejection reason is required');
    }

    const hypothesis = await this.prisma.incidentHypothesis.findFirst({
      where: { id: hypothesisId, organizationId, incidentId },
      include: { candidateService: true },
    });

    if (!hypothesis) {
      throw new NotFoundException(`Hypothesis ${hypothesisId} not found`);
    }

    const updatedHypothesis = await this.prisma.$transaction(async (tx) => {
      const rejected = await tx.incidentHypothesis.update({
        where: { id: hypothesisId },
        data: {
          status: 'REJECTED',
          rejectionReason,
        },
      });

      await tx.incidentTimelineEvent.create({
        data: {
          incidentId,
          organizationId,
          eventType: 'HYPOTHESIS_REJECTED',
          actorMembershipId: membershipId,
          message: `AI Hypothesis rejected: "${rejectionReason}" (Target: ${hypothesis.candidateService?.name || 'N/A'})`,
        },
      });

      return rejected;
    });

    this.publishRealtime('incident.updated', organizationId, incidentId, {
      hypothesisId,
      status: 'REJECTED',
      rejectionReason,
    });

    return updatedHypothesis;
  }
}
