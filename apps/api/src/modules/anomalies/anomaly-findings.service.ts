import { Injectable, NotFoundException, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventPublisher } from '../realtime/realtime-event.publisher';
import { NotificationRouterService } from '../notifications/notification-router.service';
import { FeatureWindowEngine, DataPoint } from './feature-window.engine';
import {
  AnomalyFindingState,
  AnomalyEvaluationResult,
  AnomalyEventType,
  AnomalyModelStatus,
  AnomalyFeedbackClassification,
} from '@prisma/client';
import {
  AnomalyFindingSummary,
  AnomalyFindingDetail,
  AnomalyFeedbackDto,
  AnomalyFeedbackSummary,
  RealtimeRooms,
} from '@aegisops/types';

const AI_SERVICE_URL = process.env['AI_SERVICE_URL'] ?? 'http://localhost:8000';
const AI_INTERNAL_API_KEY = process.env['AI_INTERNAL_API_KEY'] || 'aegisops-ai-internal-key-change-in-prod';

@Injectable()
export class AnomalyFindingsService {
  private readonly logger = new Logger(AnomalyFindingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimePublisher: RealtimeEventPublisher,
    private readonly featureEngine: FeatureWindowEngine,
    @Optional() private readonly notificationRouter?: NotificationRouterService,
  ) {}

  /**
   * Evaluate the current live window for a detector.
   */
  async evaluateDetector(
    detectorId: string,
    overridePoints?: Array<{ timestamp: Date | string; value: number }>,
  ): Promise<{
    evaluated: boolean;
    normalizedScore?: number;
    rawScore?: number;
    result?: AnomalyEvaluationResult;
    findingState?: AnomalyFindingState | 'NORMAL';
    findingId?: string;
    error?: string;
    message?: string;
  }> {
    const detector = await this.prisma.anomalyDetector.findUnique({
      where: { id: detectorId },
      include: {
        metricDefinition: true,
        models: {
          where: {
            status: { in: [AnomalyModelStatus.READY, AnomalyModelStatus.SUPERSEDED] },
            modelArtifact: { not: null },
          },
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });

    if (!detector || detector.status !== 'ENABLED') {
      return { evaluated: false, message: 'Detector not found or not enabled' };
    }

    const activeModel = detector.models[0];
    if (!activeModel || !activeModel.modelArtifact) {
      this.logger.debug(`Detector ${detectorId} has no active trained model; skipping evaluation`);
      return { evaluated: false, message: 'No active trained model' };
    }

    const now = new Date();
    const windowSeconds = detector.windowSeconds || 300;
    const windowStart = new Date(now.getTime() - windowSeconds * 1000);

    let dataPoints: DataPoint[];

    if (overridePoints && overridePoints.length > 0) {
      dataPoints = overridePoints.map((p) => ({
        timestamp: p.timestamp instanceof Date ? p.timestamp : new Date(p.timestamp),
        value: p.value,
      }));
    } else {
      // Query points in the live evaluation window
      const points = await this.prisma.metricPoint.findMany({
        where: {
          organizationId: detector.organizationId,
          serviceId: detector.serviceId,
          environmentId: detector.environmentId,
          series: { definitionId: detector.metricDefinitionId },
          timestamp: { gte: windowStart, lte: now },
        },
        select: {
          timestamp: true,
          valueType: true,
          intValue: true,
          doubleValue: true,
        },
        orderBy: { timestamp: 'asc' },
      });

      dataPoints = points.map((p) => ({
        timestamp: p.timestamp,
        value: p.valueType === 'INT64' && p.intValue !== null ? Number(p.intValue) : (p.doubleValue ?? 0),
      }));
    }

    if (dataPoints.length === 0) {
      this.logger.debug(`No telemetry points found for detector ${detectorId} in window`);
      return { evaluated: false, message: 'No points in window' };
    }

    const extracted = this.featureEngine.extract(dataPoints, detector.metricDefinition.instrumentType);
    const artifactBase64 = Buffer.from(activeModel.modelArtifact).toString('base64');

    const evalKey = `${detector.id}:${windowStart.getTime()}`;
    const startTime = Date.now();

    try {
      const scoreRes = await fetch(`${AI_SERVICE_URL}/v1/anomaly/models/score`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Service-Key': AI_INTERNAL_API_KEY,
        },
        body: JSON.stringify({
          detectorId: detector.id,
          artifactBase64,
          artifactHash: activeModel.artifactHash,
          featureVector: extracted.featureVector,
          featureNames: activeModel.featureNames,
        }),
      });

      if (!scoreRes.ok) {
        throw new Error(`Inference scoring failed: ${await scoreRes.text()}`);
      }

      const scoreData = (await scoreRes.json()) as {
        rawScore: number;
        normalizedScore: number;
        result: string;
        isAnomalous: boolean;
        classification: string;
        durationMs: number;
      };

      const durationMs = Date.now() - startTime;
      const isAnomalous = scoreData.isAnomalous || scoreData.normalizedScore >= 65.0;
      const evalResult = isAnomalous
        ? AnomalyEvaluationResult.ANOMALOUS
        : AnomalyEvaluationResult.NORMAL;

      // 1. Record AnomalyEvaluation
      await this.prisma.anomalyEvaluation.create({
        data: {
          organizationId: detector.organizationId,
          detectorId: detector.id,
          modelVersionId: activeModel.id,
          evaluationKey: evalKey,
          windowStart,
          windowEnd: now,
          featureVector: extracted.featureVector as any,
          rawScore: scoreData.rawScore,
          normalizedScore: scoreData.normalizedScore,
          classification: scoreData.classification,
          result: evalResult,
          durationMs,
        },
      });

      // Update detector lastEvaluatedAt
      await this.prisma.anomalyDetector.update({
        where: { id: detector.id },
        data: { lastEvaluatedAt: now },
      });

      // 2. State Machine & Hysteresis
      const fingerprint = `${detector.organizationId}:${detector.id}:${detector.environmentId}:aggregate`;
      await this.processFindingState(
        detector,
        fingerprint,
        isAnomalous,
        scoreData.normalizedScore,
        activeModel.id,
      );

      const latestFinding = await this.prisma.anomalyFinding.findUnique({
        where: {
          detectorId_fingerprint: {
            detectorId: detector.id,
            fingerprint,
          },
        },
      });

      return {
        evaluated: true,
        normalizedScore: scoreData.normalizedScore,
        rawScore: scoreData.rawScore,
        result: evalResult,
        findingState: latestFinding?.state ?? 'NORMAL',
        findingId: latestFinding?.id,
      };
    } catch (err) {
      this.logger.error(`Live evaluation failed for detector ${detectorId}: ${(err as Error).message}`);
      return {
        evaluated: false,
        error: (err as Error).message,
      };
    }
  }

  private async processFindingState(
    detector: any,
    fingerprint: string,
    isAnomalous: boolean,
    normalizedScore: number,
    modelVersionId: string,
  ): Promise<void> {
    const existingFinding = await this.prisma.anomalyFinding.findUnique({
      where: {
        detectorId_fingerprint: {
          detectorId: detector.id,
          fingerprint,
        },
      },
    });

    const now = new Date();

    if (isAnomalous) {
      if (!existingFinding || existingFinding.state === AnomalyFindingState.RESOLVED) {
        // First breach: Create in PENDING state
        const pendingFinding = await this.prisma.anomalyFinding.upsert({
          where: {
            detectorId_fingerprint: {
              detectorId: detector.id,
              fingerprint,
            },
          },
          create: {
            organizationId: detector.organizationId,
            detectorId: detector.id,
            serviceId: detector.serviceId,
            environmentId: detector.environmentId,
            metricDefinitionId: detector.metricDefinitionId,
            modelVersionId,
            fingerprint,
            state: AnomalyFindingState.PENDING,
            firstDetectedAt: now,
            pendingSince: now,
            currentScore: normalizedScore,
            peakScore: normalizedScore,
          },
          update: {
            state: AnomalyFindingState.PENDING,
            pendingSince: now,
            anomalousSince: null,
            resolvedAt: null,
            currentScore: normalizedScore,
            peakScore: normalizedScore,
            modelVersionId,
          },
        });

        await this.prisma.anomalyEvent.create({
          data: {
            findingId: pendingFinding.id,
            eventType: AnomalyEventType.PENDING_STARTED,
            score: normalizedScore,
            message: `Telemetry breached statistical anomaly baseline (Score: ${normalizedScore.toFixed(1)}/100, pending confirmation)`,
          },
        });

        // If pendingEvaluations is 1, immediately escalate to ANOMALOUS
        if (detector.pendingEvaluations <= 1) {
          await this.escalateToAnomalous(pendingFinding.id, detector, normalizedScore);
        }
      } else if (existingFinding.state === AnomalyFindingState.PENDING) {
        // Sustained breach while pending: count consecutive breaches
        const sinceDate = existingFinding.pendingSince
          ? new Date(existingFinding.pendingSince.getTime() - 5000)
          : new Date(Date.now() - 60000);
        const recentEvals = await this.prisma.anomalyEvaluation.findMany({
          where: {
            detectorId: detector.id,
            result: AnomalyEvaluationResult.ANOMALOUS,
            evaluatedAt: { gte: sinceDate },
          },
          take: 10,
        });

        if (recentEvals.length >= detector.pendingEvaluations) {
          await this.escalateToAnomalous(existingFinding.id, detector, normalizedScore);
        } else {
          await this.prisma.anomalyFinding.update({
            where: { id: existingFinding.id },
            data: {
              currentScore: normalizedScore,
              peakScore: Math.max(existingFinding.peakScore, normalizedScore),
            },
          });
        }
      } else if (existingFinding.state === AnomalyFindingState.ANOMALOUS) {
        // Sustained anomaly: update scores
        const peakScore = Math.max(existingFinding.peakScore, normalizedScore);
        const scoreEscalated = normalizedScore > existingFinding.currentScore + 10.0;

        await this.prisma.anomalyFinding.update({
          where: { id: existingFinding.id },
          data: {
            currentScore: normalizedScore,
            peakScore,
            lastAnomalousAt: now,
          },
        });

        if (scoreEscalated) {
          await this.prisma.anomalyEvent.create({
            data: {
              findingId: existingFinding.id,
              eventType: AnomalyEventType.ANOMALY_UPDATED,
              score: normalizedScore,
              message: `Anomaly score escalated to ${normalizedScore.toFixed(1)}/100`,
            },
          });
        }

        this.realtimePublisher
          .publish({
            id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type: 'anomaly.updated',
            organizationId: detector.organizationId,
            targetRoom: RealtimeRooms.organization(detector.organizationId),
            timestamp: new Date().toISOString(),
            payload: {
              findingId: existingFinding.id,
              detectorId: detector.id,
              serviceId: detector.serviceId,
              score: normalizedScore,
              peakScore,
            },
          })
          .catch(() => {});
      }
    } else {
      // Evaluation is NORMAL
      if (existingFinding && existingFinding.state === AnomalyFindingState.PENDING) {
        // Transient spike cleared before confirmation: resolve pending finding
        await this.prisma.anomalyFinding.update({
          where: { id: existingFinding.id },
          data: {
            state: AnomalyFindingState.RESOLVED,
            resolvedAt: now,
            lastNormalAt: now,
          },
        });
      } else if (existingFinding && existingFinding.state === AnomalyFindingState.ANOMALOUS) {
        // Check consecutive normal evaluations for recovery hysteresis
        const recentNormalEvals = await this.prisma.anomalyEvaluation.findMany({
          where: {
            detectorId: detector.id,
            result: AnomalyEvaluationResult.NORMAL,
            evaluatedAt: { gte: existingFinding.lastAnomalousAt ?? existingFinding.anomalousSince ?? now },
          },
          take: 10,
        });

        if (recentNormalEvals.length >= detector.recoveryEvaluations) {
          await this.prisma.anomalyFinding.update({
            where: { id: existingFinding.id },
            data: {
              state: AnomalyFindingState.RESOLVED,
              resolvedAt: now,
              lastNormalAt: now,
              currentScore: normalizedScore,
            },
          });

          await this.prisma.anomalyEvent.create({
            data: {
              findingId: existingFinding.id,
              eventType: AnomalyEventType.RESOLVED,
              score: normalizedScore,
              message: `Telemetry recovered to normal statistical baseline (${detector.recoveryEvaluations} consecutive normal evaluations)`,
            },
          });

          this.logger.log(`Anomaly finding ${existingFinding.id} recovered and resolved`);

          this.realtimePublisher
            .publish({
              id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              type: 'anomaly.resolved',
              organizationId: detector.organizationId,
              targetRoom: RealtimeRooms.organization(detector.organizationId),
              timestamp: new Date().toISOString(),
              payload: {
                findingId: existingFinding.id,
                detectorId: detector.id,
                serviceId: detector.serviceId,
              },
            })
            .catch(() => {});

          if (this.notificationRouter) {
            this.notificationRouter.routeEvent({
              organizationId: detector.organizationId,
              eventType: 'anomaly.resolved',
              sourceModule: 'anomalies',
              severity: 'INFO',
              serviceId: detector.serviceId,
              environmentId: detector.environmentId,
              title: `ML Anomaly Resolved: ${detector.name}`,
              message: `Telemetry recovered to normal statistical baseline`,
              payload: {
                findingId: existingFinding.id,
                detectorId: detector.id,
              },
              deepLink: `/services/${detector.serviceId}`,
            }).catch(() => {});
          }
        }
      }
    }
  }

  private async escalateToAnomalous(findingId: string, detector: any, score: number): Promise<void> {
    const now = new Date();
    await this.prisma.anomalyFinding.update({
      where: { id: findingId },
      data: {
        state: AnomalyFindingState.ANOMALOUS,
        anomalousSince: now,
        lastAnomalousAt: now,
        currentScore: score,
      },
    });

    await this.prisma.anomalyEvent.create({
      data: {
        findingId,
        eventType: AnomalyEventType.ANOMALY_DETECTED,
        score,
        message: `Sustained statistical deviation confirmed: anomaly finding activated with score ${score.toFixed(1)}/100`,
      },
    });

    this.logger.log(`Active anomaly detected for detector '${detector.name}' (Score: ${score.toFixed(1)})`);

    this.realtimePublisher
      .publish({
        id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'anomaly.detected',
        organizationId: detector.organizationId,
        targetRoom: RealtimeRooms.organization(detector.organizationId),
        timestamp: new Date().toISOString(),
        payload: {
          findingId,
          detectorId: detector.id,
          detectorName: detector.name,
          serviceId: detector.serviceId,
          environmentId: detector.environmentId,
          score,
        },
      })
      .catch(() => {});

    if (this.notificationRouter) {
      const severity = score >= 80 ? 'CRITICAL' : score >= 50 ? 'ERROR' : 'WARNING';
      this.notificationRouter.routeEvent({
        organizationId: detector.organizationId,
        eventType: 'anomaly.detected',
        sourceModule: 'anomalies',
        severity: severity as any,
        serviceId: detector.serviceId,
        environmentId: detector.environmentId,
        title: `ML Anomaly Detected: ${detector.name}`,
        message: `Sustained statistical deviation confirmed (Score: ${score.toFixed(1)}/100)`,
        payload: {
          findingId,
          detectorId: detector.id,
          detectorName: detector.name,
          score,
        },
        deepLink: `/services/${detector.serviceId}`,
      }).catch(() => {});
    }
  }

  async findAll(
    organizationId: string,
    options: {
      serviceId?: string;
      state?: AnomalyFindingState;
      limit?: number;
    } = {},
  ): Promise<AnomalyFindingSummary[]> {
    const where: Record<string, unknown> = { organizationId };
    if (options.serviceId) where['serviceId'] = options.serviceId;
    if (options.state) where['state'] = options.state;

    const findings = await this.prisma.anomalyFinding.findMany({
      where,
      include: {
        detector: true,
        service: true,
        environment: true,
        metricDefinition: true,
        feedbacks: { select: { id: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: options.limit ?? 50,
    });

    return findings.map((f) => ({
      id: f.id,
      organizationId: f.organizationId,
      detectorId: f.detectorId,
      detectorName: f.detector.name,
      serviceId: f.serviceId,
      serviceName: f.service.name,
      environmentId: f.environmentId,
      environmentName: f.environment.name,
      metricDefinitionId: f.metricDefinitionId,
      metricName: f.metricDefinition.name,
      metricSeriesId: f.metricSeriesId,
      fingerprint: f.fingerprint,
      state: f.state as any,
      firstDetectedAt: f.firstDetectedAt.toISOString(),
      pendingSince: f.pendingSince?.toISOString(),
      anomalousSince: f.anomalousSince?.toISOString(),
      lastAnomalousAt: f.lastAnomalousAt?.toISOString(),
      lastNormalAt: f.lastNormalAt?.toISOString(),
      resolvedAt: f.resolvedAt?.toISOString(),
      currentScore: f.currentScore,
      peakScore: f.peakScore,
      modelVersionId: f.modelVersionId,
      feedbacksCount: f.feedbacks.length,
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
    }));
  }

  async findById(organizationId: string, id: string): Promise<AnomalyFindingDetail> {
    const finding = await this.prisma.anomalyFinding.findFirst({
      where: { id, organizationId },
      include: {
        detector: true,
        service: true,
        environment: true,
        metricDefinition: true,
        events: { orderBy: { occurredAt: 'desc' }, take: 20 },
        feedbacks: {
          include: { membership: { include: { user: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!finding) {
      throw new NotFoundException(`Anomaly finding '${id}' not found`);
    }

    const recentEvaluations = await this.prisma.anomalyEvaluation.findMany({
      where: { detectorId: finding.detectorId },
      orderBy: { evaluatedAt: 'desc' },
      take: 20,
    });

    return {
      id: finding.id,
      organizationId: finding.organizationId,
      detectorId: finding.detectorId,
      detectorName: finding.detector.name,
      serviceId: finding.serviceId,
      serviceName: finding.service.name,
      environmentId: finding.environmentId,
      environmentName: finding.environment.name,
      metricDefinitionId: finding.metricDefinitionId,
      metricName: finding.metricDefinition.name,
      metricSeriesId: finding.metricSeriesId,
      fingerprint: finding.fingerprint,
      state: finding.state as any,
      firstDetectedAt: finding.firstDetectedAt.toISOString(),
      pendingSince: finding.pendingSince?.toISOString(),
      anomalousSince: finding.anomalousSince?.toISOString(),
      lastAnomalousAt: finding.lastAnomalousAt?.toISOString(),
      lastNormalAt: finding.lastNormalAt?.toISOString(),
      resolvedAt: finding.resolvedAt?.toISOString(),
      currentScore: finding.currentScore,
      peakScore: finding.peakScore,
      modelVersionId: finding.modelVersionId,
      feedbacksCount: finding.feedbacks.length,
      createdAt: finding.createdAt.toISOString(),
      updatedAt: finding.updatedAt.toISOString(),
      events: finding.events.map((e) => ({
        id: e.id,
        findingId: e.findingId,
        eventType: e.eventType as any,
        score: e.score,
        message: e.message,
        metadata: e.metadata as any,
        occurredAt: e.occurredAt.toISOString(),
      })),
      feedbacks: finding.feedbacks.map((f) => ({
        id: f.id,
        organizationId: f.organizationId,
        findingId: f.findingId,
        membershipId: f.membershipId,
        userName: f.membership.user.displayName,
        classification: f.classification as any,
        note: f.note,
        createdAt: f.createdAt.toISOString(),
      })),
      recentEvaluations: recentEvaluations.map((ev) => ({
        id: ev.id,
        organizationId: ev.organizationId,
        detectorId: ev.detectorId,
        modelVersionId: ev.modelVersionId,
        metricSeriesId: ev.metricSeriesId,
        evaluationKey: ev.evaluationKey,
        evaluatedAt: ev.evaluatedAt.toISOString(),
        windowStart: ev.windowStart.toISOString(),
        windowEnd: ev.windowEnd.toISOString(),
        featureVector: ev.featureVector as any,
        rawScore: ev.rawScore,
        normalizedScore: ev.normalizedScore,
        classification: ev.classification,
        result: ev.result as any,
        durationMs: ev.durationMs,
        errorCode: ev.errorCode,
        errorMessage: ev.errorMessage,
      })),
    };
  }

  async submitFeedback(
    organizationId: string,
    findingId: string,
    membershipId: string,
    dto: AnomalyFeedbackDto,
  ): Promise<AnomalyFeedbackSummary> {
    const finding = await this.prisma.anomalyFinding.findFirst({
      where: { id: findingId, organizationId },
    });

    if (!finding) {
      throw new NotFoundException(`Anomaly finding '${findingId}' not found`);
    }

    const feedback = await this.prisma.anomalyFeedback.create({
      data: {
        organizationId,
        findingId,
        membershipId,
        classification: dto.classification as AnomalyFeedbackClassification,
        note: dto.note,
      },
      include: {
        membership: { include: { user: true } },
      },
    });

    this.logger.log(
      `User ${feedback.membership.user.displayName} classified anomaly ${findingId} as ${dto.classification}`,
    );

    return {
      id: feedback.id,
      organizationId: feedback.organizationId,
      findingId: feedback.findingId,
      membershipId: feedback.membershipId,
      userName: feedback.membership.user.displayName,
      classification: feedback.classification as any,
      note: feedback.note,
      createdAt: feedback.createdAt.toISOString(),
    };
  }
}
