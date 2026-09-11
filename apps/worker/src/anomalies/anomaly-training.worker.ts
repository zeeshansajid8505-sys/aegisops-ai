import { Worker, Job } from 'bullmq';
import { PrismaClient, AnomalyModelStatus } from '@prisma/client';
import Redis from 'ioredis';
import { WorkerConfig } from '../config';
import { FeatureWindowEngine, DataPoint } from './feature-window.engine';
import { RealtimeRooms, REALTIME_REDIS_CHANNEL } from '@aegisops/types';

export const ANOMALY_TRAINING_QUEUE_NAME = 'anomaly-model-training';

export interface AnomalyTrainingJobData {
  detectorId: string;
  organizationId: string;
  isManual?: boolean;
}

export class AnomalyTrainingWorker {
  private worker: Worker<AnomalyTrainingJobData> | null = null;
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

    this.worker = new Worker<AnomalyTrainingJobData>(
      ANOMALY_TRAINING_QUEUE_NAME,
      async (job: Job<AnomalyTrainingJobData>) => {
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
    console.log('[AnomalyTrainingWorker] Started anomaly model training background worker');
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
    console.log('[AnomalyTrainingWorker] Stopped anomaly model training worker');
  }

  private async processJob(data: AnomalyTrainingJobData): Promise<void> {
    const { detectorId, organizationId } = data;
    // eslint-disable-next-line no-console
    console.log(`[AnomalyTrainingWorker] Processing training job for detector ${detectorId}`);

    const detector = await this.prisma.anomalyDetector.findUnique({
      where: { id: detectorId },
      include: {
        metricDefinition: true,
      },
    });

    if (!detector || detector.status === 'ARCHIVED') {
      return;
    }

    const now = new Date();
    const lookbackHours = detector.trainingLookbackHours || 24;
    const lookbackStart = new Date(now.getTime() - lookbackHours * 3600 * 1000);
    const windowSeconds = detector.windowSeconds || 300;

    // 1. Gather incident and alert exclusions
    const excludedIntervals: { start: Date; end: Date }[] = [];
    const bufferMs = 5 * 60 * 1000;

    const incidents = await this.prisma.incident.findMany({
      where: {
        organizationId,
        primaryServiceId: detector.serviceId,
        detectedAt: { lte: now },
        OR: [{ resolvedAt: null }, { resolvedAt: { gte: lookbackStart } }],
      },
      select: { detectedAt: true, resolvedAt: true },
    });

    for (const inc of incidents) {
      excludedIntervals.push({
        start: new Date(Math.max(lookbackStart.getTime(), inc.detectedAt.getTime() - bufferMs)),
        end: inc.resolvedAt ? new Date(Math.min(now.getTime(), inc.resolvedAt.getTime() + bufferMs)) : now,
      });
    }

    const firingAlerts = await this.prisma.alertInstance.findMany({
      where: {
        organizationId,
        serviceId: detector.serviceId,
        environmentId: detector.environmentId,
        state: 'FIRING',
        firingStartedAt: { lte: now },
      },
      select: { firingStartedAt: true, lastEvaluatedAt: true },
    });

    for (const alert of firingAlerts) {
      if (alert.firingStartedAt) {
        excludedIntervals.push({
          start: new Date(Math.max(lookbackStart.getTime(), alert.firingStartedAt.getTime() - bufferMs)),
          end: alert.lastEvaluatedAt ? new Date(Math.min(now.getTime(), alert.lastEvaluatedAt.getTime() + bufferMs)) : now,
        });
      }
    }

    // 2. Query historical telemetry points
    const points = await this.prisma.metricPoint.findMany({
      where: {
        organizationId,
        serviceId: detector.serviceId,
        environmentId: detector.environmentId,
        series: { definitionId: detector.metricDefinitionId },
        timestamp: { gte: lookbackStart, lte: now },
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

    // 3. Segment and clean windows
    const windowMs = windowSeconds * 1000;
    const totalWindows = Math.floor((now.getTime() - lookbackStart.getTime()) / windowMs);
    const cleanMatrix: number[][] = [];
    const featureNames = this.featureEngine.getFeatureNames(detector.metricDefinition.instrumentType);

    for (let i = 0; i < totalWindows; i++) {
      const wStart = new Date(lookbackStart.getTime() + i * windowMs);
      const wEnd = new Date(wStart.getTime() + windowMs);

      // Check clean baseline
      const isClean = !excludedIntervals.some(
        (e) => Math.max(wStart.getTime(), e.start.getTime()) < Math.min(wEnd.getTime(), e.end.getTime()),
      );
      if (!isClean) continue;

      const wPoints = dataPoints.filter((p) => p.timestamp >= wStart && p.timestamp < wEnd);
      if (wPoints.length === 0) continue;

      const extracted = this.featureEngine.extract(wPoints, detector.metricDefinition.instrumentType);
      cleanMatrix.push(extracted.matrixRow);
    }

    const nextVersion = (detector.currentModelVersion ?? 0) + 1;
    const minWindows = Math.min(detector.minimumTrainingWindows, 10);

    if (cleanMatrix.length < minWindows) {
      const msg = `Insufficient clean data windows: ${cleanMatrix.length} collected, ${minWindows} required`;
      // eslint-disable-next-line no-console
      console.warn(`[AnomalyTrainingWorker] ${msg} for detector ${detector.id}`);

      await this.prisma.anomalyModelVersion.create({
        data: {
          organizationId,
          detectorId: detector.id,
          version: nextVersion,
          status: AnomalyModelStatus.INSUFFICIENT_DATA,
          featureNames,
          sampleCount: cleanMatrix.length,
          contamination: detector.contamination,
          failedAt: new Date(),
          failureCode: 'INSUFFICIENT_CLEAN_DATA',
          failureMessage: msg,
        },
      });

      await this.prisma.anomalyDetector.update({
        where: { id: detector.id },
        data: { currentModelStatus: AnomalyModelStatus.INSUFFICIENT_DATA },
      });
      return;
    }

    // 4. Call FastAPI
    try {
      const trainRes = await fetch(`${this.aiServiceUrl}/v1/anomaly/models/train`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Service-Key': this.apiKey,
        },
        body: JSON.stringify({
          detectorId: detector.id,
          featureNames,
          featureMatrix: cleanMatrix,
          contamination: detector.contamination,
        }),
      });

      if (!trainRes.ok) {
        throw new Error(`FastAPI training error [${trainRes.status}]: ${await trainRes.text()}`);
      }

      const trainData = (await trainRes.json()) as {
        algorithm: string;
        algorithmVersion: string;
        featureSchemaVersion: string;
        featureNames: string[];
        sampleCount: number;
        contamination: number;
        artifactBase64: string;
        artifactHash: string;
        artifactSizeBytes: number;
      };

      const artifactBuffer = Buffer.from(trainData.artifactBase64, 'base64');

      // Save model version atomically in transaction
      await this.prisma.$transaction(async (tx) => {
        await tx.anomalyModelVersion.updateMany({
          where: { detectorId: detector.id, status: AnomalyModelStatus.READY },
          data: { status: AnomalyModelStatus.SUPERSEDED },
        });

        await tx.anomalyModelVersion.create({
          data: {
            organizationId,
            detectorId: detector.id,
            version: nextVersion,
            status: AnomalyModelStatus.READY,
            algorithm: trainData.algorithm,
            algorithmVersion: trainData.algorithmVersion,
            featureSchemaVersion: trainData.featureSchemaVersion,
            featureNames: trainData.featureNames,
            trainingWindowStart: lookbackStart,
            trainingWindowEnd: now,
            sampleCount: trainData.sampleCount,
            contamination: trainData.contamination,
            modelArtifact: artifactBuffer,
            artifactHash: trainData.artifactHash,
            artifactSizeBytes: trainData.artifactSizeBytes,
            trainedAt: new Date(),
          },
        });

        await tx.anomalyDetector.update({
          where: { id: detector.id },
          data: {
            currentModelVersion: nextVersion,
            currentModelStatus: AnomalyModelStatus.READY,
            lastTrainedAt: new Date(),
          },
        });
      });

      // eslint-disable-next-line no-console
      console.log(`[AnomalyTrainingWorker] Trained model v${nextVersion} for detector '${detector.name}'`);

      // Realtime notification via Redis Pub/Sub
      if (this.redis && this.redis.status === 'ready') {
        const payload = JSON.stringify({
          id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type: 'anomaly.model.ready',
          organizationId,
          targetRoom: RealtimeRooms.organization(organizationId),
          timestamp: new Date().toISOString(),
          payload: {
            detectorId: detector.id,
            version: nextVersion,
            sampleCount: trainData.sampleCount,
            artifactHash: trainData.artifactHash,
          },
        });
        await this.redis.publish(REALTIME_REDIS_CHANNEL, payload);
      }
    } catch (err) {
      const errorMsg = (err as Error).message;
      // eslint-disable-next-line no-console
      console.error(`[AnomalyTrainingWorker] Training failed for detector ${detector.id}:`, errorMsg);

      await this.prisma.anomalyModelVersion.create({
        data: {
          organizationId,
          detectorId: detector.id,
          version: nextVersion,
          status: AnomalyModelStatus.FAILED,
          featureNames,
          sampleCount: cleanMatrix.length,
          contamination: detector.contamination,
          failedAt: new Date(),
          failureCode: 'TRAINING_INFERENCE_FAILURE',
          failureMessage: errorMsg,
        },
      });

      await this.prisma.anomalyDetector.update({
        where: { id: detector.id },
        data: { currentModelStatus: AnomalyModelStatus.FAILED },
      });
    }
  }
}
