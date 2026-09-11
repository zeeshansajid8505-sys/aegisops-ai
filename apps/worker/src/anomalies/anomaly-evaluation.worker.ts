import { Worker, Job } from 'bullmq';
import {
  PrismaClient,
  AnomalyModelStatus,
  AnomalyEvaluationResult,
  AnomalyFindingState,
  AnomalyEventType,
} from '@prisma/client';
import Redis from 'ioredis';
import { WorkerConfig } from '../config';
import { FeatureWindowEngine, DataPoint } from './feature-window.engine';
import { RealtimeRooms, REALTIME_REDIS_CHANNEL } from '@aegisops/types';

export const ANOMALY_EVALUATION_QUEUE_NAME = 'anomaly-evaluation';

export interface AnomalyEvaluationJobData {
  detectorId: string;
  organizationId: string;
  scheduledTime?: string;
}

export class AnomalyEvaluationWorker {
  private worker: Worker<AnomalyEvaluationJobData> | null = null;
  private redis: Redis | null = null;
  private isRunning = false;
  private readonly featureEngine = new FeatureWindowEngine();
  private readonly aiServiceUrl: string;
  private readonly apiKey: string;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: WorkerConfig,
  ) {
    this.aiServiceUrl = process.env['AI_SERVICE_URL'] || 'http://localhost:8000';
    this.apiKey = process.env['AI_INTERNAL_API_KEY'] || 'aegisops-ai-internal-key-change-in-prod';
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

    this.worker = new Worker<AnomalyEvaluationJobData>(
      ANOMALY_EVALUATION_QUEUE_NAME,
      async (job: Job<AnomalyEvaluationJobData>) => {
        await this.processJob(job.data);
      },
      {
        connection: {
          host: this.config.redisHost,
          port: this.config.redisPort,
          maxRetriesPerRequest: null,
        },
        concurrency: 5,
      },
    );

    this.isRunning = true;
    // eslint-disable-next-line no-console
    console.log('[AnomalyEvaluationWorker] Started anomaly evaluation background worker');
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
    console.log('[AnomalyEvaluationWorker] Stopped anomaly evaluation worker');
  }

  private async processJob(data: AnomalyEvaluationJobData): Promise<void> {
    const { detectorId, organizationId } = data;

    const detector = await this.prisma.anomalyDetector.findUnique({
      where: { id: detectorId },
      include: {
        metricDefinition: true,
        models: {
          where: { status: AnomalyModelStatus.READY },
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });

    if (!detector || detector.status !== 'ENABLED') {
      return;
    }

    const activeModel = detector.models[0];
    if (!activeModel || !activeModel.modelArtifact) {
      return;
    }

    const now = new Date();
    const windowSeconds = detector.windowSeconds || 300;
    const windowStart = new Date(now.getTime() - windowSeconds * 1000);

    const points = await this.prisma.metricPoint.findMany({
      where: {
        organizationId,
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

    const dataPoints: DataPoint[] = points.map((p) => ({
      timestamp: p.timestamp,
      value: p.valueType === 'INT64' && p.intValue !== null ? Number(p.intValue) : (p.doubleValue ?? 0),
    }));

    if (dataPoints.length === 0) {
      return;
    }

    const extracted = this.featureEngine.extract(dataPoints, detector.metricDefinition.instrumentType);
    const artifactBase64 = Buffer.from(activeModel.modelArtifact).toString('base64');
    const evalKey = `${detector.id}:${windowStart.getTime()}`;
    const startTime = Date.now();

    try {
      const scoreRes = await fetch(`${this.aiServiceUrl}/v1/anomaly/models/score`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Service-Key': this.apiKey,
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
        throw new Error(`Scoring inference failed: ${await scoreRes.text()}`);
      }

      const scoreData = (await scoreRes.json()) as {
        rawScore: number;
        normalizedScore: number;
        result: string;
        isAnomalous: boolean;
        classification: string;
      };

      const durationMs = Date.now() - startTime;
      const isAnomalous = scoreData.isAnomalous || scoreData.normalizedScore >= 65.0;
      const evalResult = isAnomalous
        ? AnomalyEvaluationResult.ANOMALOUS
        : AnomalyEvaluationResult.NORMAL;

      await this.prisma.anomalyEvaluation.create({
        data: {
          organizationId,
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

      await this.prisma.anomalyDetector.update({
        where: { id: detector.id },
        data: { lastEvaluatedAt: now },
      });

      const fingerprint = `${organizationId}:${detector.id}:${detector.environmentId}:aggregate`;
      await this.processFindingState(detector, fingerprint, isAnomalous, scoreData.normalizedScore, activeModel.id);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[AnomalyEvaluationWorker] Evaluation error for detector ${detectorId}:`, (err as Error).message);
    }
  }

  private async processFindingState(
    detector: any,
    fingerprint: string,
    isAnomalous: boolean,
    score: number,
    modelVersionId: string,
  ): Promise<void> {
    const existing = await this.prisma.anomalyFinding.findUnique({
      where: {
        detectorId_fingerprint: {
          detectorId: detector.id,
          fingerprint,
        },
      },
    });

    const now = new Date();

    if (isAnomalous) {
      if (!existing || existing.state === AnomalyFindingState.RESOLVED) {
        const pending = await this.prisma.anomalyFinding.upsert({
          where: { detectorId_fingerprint: { detectorId: detector.id, fingerprint } },
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
            currentScore: score,
            peakScore: score,
          },
          update: {
            state: AnomalyFindingState.PENDING,
            pendingSince: now,
            anomalousSince: null,
            resolvedAt: null,
            currentScore: score,
            peakScore: score,
            modelVersionId,
          },
        });

        await this.prisma.anomalyEvent.create({
          data: {
            findingId: pending.id,
            eventType: AnomalyEventType.PENDING_STARTED,
            score,
            message: `Telemetry breached statistical anomaly baseline (Score: ${score.toFixed(1)}/100, pending confirmation)`,
          },
        });

        if (detector.pendingEvaluations <= 1) {
          await this.escalateToAnomalous(pending.id, detector, score);
        }
      } else if (existing.state === AnomalyFindingState.PENDING) {
        const recentAnomEvals = await this.prisma.anomalyEvaluation.findMany({
          where: {
            detectorId: detector.id,
            result: AnomalyEvaluationResult.ANOMALOUS,
            evaluatedAt: { gte: existing.pendingSince ?? now },
          },
          take: 10,
        });

        if (recentAnomEvals.length >= detector.pendingEvaluations) {
          await this.escalateToAnomalous(existing.id, detector, score);
        } else {
          await this.prisma.anomalyFinding.update({
            where: { id: existing.id },
            data: { currentScore: score, peakScore: Math.max(existing.peakScore, score) },
          });
        }
      } else if (existing.state === AnomalyFindingState.ANOMALOUS) {
        const peakScore = Math.max(existing.peakScore, score);
        await this.prisma.anomalyFinding.update({
          where: { id: existing.id },
          data: { currentScore: score, peakScore, lastAnomalousAt: now },
        });

        await this.publishRealtime('anomaly.updated', detector.organizationId, {
          findingId: existing.id,
          detectorId: detector.id,
          serviceId: detector.serviceId,
          score,
          peakScore,
        });
      }
    } else {
      // Normal evaluation
      if (existing && existing.state === AnomalyFindingState.PENDING) {
        await this.prisma.anomalyFinding.update({
          where: { id: existing.id },
          data: { state: AnomalyFindingState.RESOLVED, resolvedAt: now, lastNormalAt: now },
        });
      } else if (existing && existing.state === AnomalyFindingState.ANOMALOUS) {
        const recentNormalEvals = await this.prisma.anomalyEvaluation.findMany({
          where: {
            detectorId: detector.id,
            result: AnomalyEvaluationResult.NORMAL,
            evaluatedAt: { gte: existing.lastAnomalousAt ?? existing.anomalousSince ?? now },
          },
          take: 10,
        });

        if (recentNormalEvals.length >= detector.recoveryEvaluations) {
          await this.prisma.anomalyFinding.update({
            where: { id: existing.id },
            data: { state: AnomalyFindingState.RESOLVED, resolvedAt: now, lastNormalAt: now, currentScore: score },
          });

          await this.prisma.anomalyEvent.create({
            data: {
              findingId: existing.id,
              eventType: AnomalyEventType.RESOLVED,
              score,
              message: `Telemetry recovered to normal statistical baseline (${detector.recoveryEvaluations} consecutive normal evaluations)`,
            },
          });

          await this.publishRealtime('anomaly.resolved', detector.organizationId, {
            findingId: existing.id,
            detectorId: detector.id,
            serviceId: detector.serviceId,
          });
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

    await this.publishRealtime('anomaly.detected', detector.organizationId, {
      findingId,
      detectorId: detector.id,
      detectorName: detector.name,
      serviceId: detector.serviceId,
      environmentId: detector.environmentId,
      score,
    });
  }

  private async publishRealtime(type: string, organizationId: string, payload: any): Promise<void> {
    if (this.redis && this.redis.status === 'ready') {
      const msg = JSON.stringify({
        id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type,
        organizationId,
        targetRoom: RealtimeRooms.organization(organizationId),
        timestamp: new Date().toISOString(),
        payload,
      });
      await this.redis.publish(REALTIME_REDIS_CHANNEL, msg);
    }
  }
}
