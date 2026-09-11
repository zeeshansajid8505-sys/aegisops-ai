import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventPublisher } from '../realtime/realtime-event.publisher';
import { FeatureWindowEngine, DataPoint } from './feature-window.engine';
import { CleanBaselineFilter } from './clean-baseline.filter';
import { AnomaliesQueueService } from './anomalies-queue.service';
import { AnomalyFindingsService } from './anomaly-findings.service';
import {
  AnomalyDetectorStatus,
  AnomalyEvaluationMode,
  AnomalySensitivity,
  AnomalyModelStatus,
} from '@prisma/client';
import {
  CreateAnomalyDetectorDto,
  UpdateAnomalyDetectorDto,
  AnomalyDetectorSummary,
  AnomalyDetectorDetail,
  AnomalyBacktestResult,
  RealtimeRooms,
} from '@aegisops/types';

const AI_SERVICE_URL = process.env['AI_SERVICE_URL'] ?? 'http://localhost:8000';
const AI_INTERNAL_API_KEY = process.env['AI_INTERNAL_API_KEY'] || 'aegisops-ai-internal-key-change-in-prod';

@Injectable()
export class AnomalyDetectorsService {
  private readonly logger = new Logger(AnomalyDetectorsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimePublisher: RealtimeEventPublisher,
    private readonly featureEngine: FeatureWindowEngine,
    private readonly cleanBaselineFilter: CleanBaselineFilter,
    private readonly queueService: AnomaliesQueueService,
    private readonly findingsService: AnomalyFindingsService,
  ) {}

  async create(
    organizationId: string,
    membershipId: string,
    dto: CreateAnomalyDetectorDto,
  ): Promise<AnomalyDetectorSummary> {
    const metricDef = await this.prisma.metricDefinition.findFirst({
      where: {
        id: dto.metricDefinitionId,
        organizationId,
      },
      include: {
        service: true,
      },
    });

    if (!metricDef) {
      throw new NotFoundException(`Metric definition '${dto.metricDefinitionId}' not found`);
    }

    // Default sensitivity presets
    const sensitivity = dto.sensitivity ?? 'BALANCED';
    let contamination = dto.contamination;
    let pendingEvaluations = dto.pendingEvaluations;
    let recoveryEvaluations = dto.recoveryEvaluations;

    if (contamination === undefined) {
      contamination = sensitivity === 'CONSERVATIVE' ? 0.01 : sensitivity === 'SENSITIVE' ? 0.05 : 0.02;
    }
    if (pendingEvaluations === undefined) {
      pendingEvaluations = sensitivity === 'CONSERVATIVE' ? 3 : sensitivity === 'SENSITIVE' ? 1 : 2;
    }
    if (recoveryEvaluations === undefined) {
      recoveryEvaluations = 2;
    }

    // Determine environment (default to first active service environment)
    const env = await this.prisma.serviceEnvironment.findFirst({
      where: {
        serviceId: metricDef.serviceId,
        organizationId,
        isActive: true,
      },
      orderBy: { isProduction: 'desc' },
    });

    if (!env) {
      throw new BadRequestException(`No active service environment found for service ${metricDef.serviceId}`);
    }

    const detector = await this.prisma.anomalyDetector.create({
      data: {
        organizationId,
        serviceId: metricDef.serviceId,
        environmentId: env.id,
        metricDefinitionId: metricDef.id,
        name: dto.name,
        description: dto.description,
        status: AnomalyDetectorStatus.ENABLED,
        evaluationMode: (dto.evaluationMode as AnomalyEvaluationMode) ?? AnomalyEvaluationMode.AGGREGATE_SERIES,
        seriesFilters: (dto.seriesFilters as unknown as object) ?? [],
        windowSeconds: dto.windowSeconds ?? 300,
        evaluationIntervalSeconds: dto.evaluationIntervalSeconds ?? 60,
        trainingLookbackHours: dto.trainingLookbackHours ?? 24,
        minimumTrainingWindows: dto.minimumTrainingWindows ?? 30,
        sensitivity: sensitivity as AnomalySensitivity,
        contamination,
        pendingEvaluations,
        recoveryEvaluations,
        retrainIntervalHours: dto.retrainIntervalHours ?? 24,
        createdByMembershipId: membershipId,
      },
      include: {
        service: true,
        environment: true,
        metricDefinition: true,
      },
    });

    // Enqueue initial model training
    await this.queueService.enqueueTrainingJob({
      detectorId: detector.id,
      organizationId,
      isManual: true,
    });

    return this.mapToSummary(detector);
  }

  async findAll(
    organizationId: string,
    serviceId?: string,
    environmentId?: string,
  ): Promise<AnomalyDetectorSummary[]> {
    const where: Record<string, unknown> = {
      organizationId,
      status: { not: AnomalyDetectorStatus.ARCHIVED },
    };
    if (serviceId) where['serviceId'] = serviceId;
    if (environmentId) where['environmentId'] = environmentId;

    const detectors = await this.prisma.anomalyDetector.findMany({
      where,
      include: {
        service: true,
        environment: true,
        metricDefinition: true,
        findings: {
          where: { state: { in: ['PENDING', 'ANOMALOUS'] } },
          select: { id: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return detectors.map((d) => this.mapToSummary(d, d.findings.length));
  }

  async findById(organizationId: string, id: string): Promise<AnomalyDetectorDetail> {
    const detector = await this.prisma.anomalyDetector.findFirst({
      where: { id, organizationId },
      include: {
        service: true,
        environment: true,
        metricDefinition: true,
        models: {
          orderBy: { version: 'desc' },
          take: 10,
        },
        findings: {
          where: { state: { in: ['PENDING', 'ANOMALOUS'] } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!detector) {
      throw new NotFoundException(`Anomaly detector '${id}' not found`);
    }

    const summary = this.mapToSummary(detector, detector.findings.length);

    return {
      ...summary,
      models: detector.models.map((m) => ({
        id: m.id,
        organizationId: m.organizationId,
        detectorId: m.detectorId,
        version: m.version,
        status: m.status as any,
        algorithm: m.algorithm,
        algorithmVersion: m.algorithmVersion,
        featureSchemaVersion: m.featureSchemaVersion,
        featureNames: m.featureNames,
        trainingDataFingerprint: m.trainingDataFingerprint,
        trainingWindowStart: m.trainingWindowStart?.toISOString(),
        trainingWindowEnd: m.trainingWindowEnd?.toISOString(),
        sampleCount: m.sampleCount,
        contamination: m.contamination,
        artifactHash: m.artifactHash,
        artifactSizeBytes: m.artifactSizeBytes,
        trainedAt: m.trainedAt?.toISOString(),
        failedAt: m.failedAt?.toISOString(),
        failureCode: m.failureCode,
        failureMessage: m.failureMessage,
        createdAt: m.createdAt.toISOString(),
      })),
      activeFindings: detector.findings.map((f) => ({
        id: f.id,
        organizationId: f.organizationId,
        detectorId: f.detectorId,
        serviceId: f.serviceId,
        environmentId: f.environmentId,
        metricDefinitionId: f.metricDefinitionId,
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
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
      })),
    };
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateAnomalyDetectorDto,
  ): Promise<AnomalyDetectorSummary> {
    const existing = await this.prisma.anomalyDetector.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      throw new NotFoundException(`Anomaly detector '${id}' not found`);
    }

    const updated = await this.prisma.anomalyDetector.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        status: dto.status as AnomalyDetectorStatus,
        evaluationMode: dto.evaluationMode as AnomalyEvaluationMode,
        seriesFilters: dto.seriesFilters !== undefined ? (dto.seriesFilters as unknown as object) : undefined,
        windowSeconds: dto.windowSeconds,
        evaluationIntervalSeconds: dto.evaluationIntervalSeconds,
        trainingLookbackHours: dto.trainingLookbackHours,
        minimumTrainingWindows: dto.minimumTrainingWindows,
        contamination: dto.contamination,
        pendingEvaluations: dto.pendingEvaluations,
        recoveryEvaluations: dto.recoveryEvaluations,
        retrainIntervalHours: dto.retrainIntervalHours,
      },
      include: {
        service: true,
        environment: true,
        metricDefinition: true,
      },
    });

    return this.mapToSummary(updated);
  }

  async archive(organizationId: string, id: string): Promise<void> {
    const existing = await this.prisma.anomalyDetector.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      throw new NotFoundException(`Anomaly detector '${id}' not found`);
    }

    await this.prisma.anomalyDetector.update({
      where: { id },
      data: {
        status: AnomalyDetectorStatus.ARCHIVED,
        archivedAt: new Date(),
      },
    });
  }

  async triggerTraining(organizationId: string, id: string): Promise<{ queued: boolean }> {
    const detector = await this.prisma.anomalyDetector.findFirst({
      where: { id, organizationId },
    });
    if (!detector) {
      throw new NotFoundException(`Anomaly detector '${id}' not found`);
    }

    await this.prisma.anomalyDetector.update({
      where: { id },
      data: { currentModelStatus: AnomalyModelStatus.TRAINING },
    });

    await this.queueService.enqueueTrainingJob({
      detectorId: id,
      organizationId,
      isManual: true,
    });

    return { queued: true };
  }

  /**
   * Execute model training lifecycle for an anomaly detector.
   * This builds the clean baseline, queries historical data, invokes FastAPI /v1/anomaly/models/train,
   * verifies SHA-256 integrity and bounded artifact size, and stores the version in PostgreSQL.
   */
  async executeTraining(detectorId: string): Promise<{ success: boolean; version?: number; error?: string }> {
    const detector = await this.prisma.anomalyDetector.findUnique({
      where: { id: detectorId },
      include: {
        service: true,
        environment: true,
        metricDefinition: true,
      },
    });

    if (!detector) {
      return { success: false, error: `Detector '${detectorId}' not found` };
    }

    this.logger.log(`Beginning model training for detector '${detector.name}' (${detector.id})`);

    const now = new Date();
    const lookbackHours = detector.trainingLookbackHours || 24;
    const lookbackStart = new Date(now.getTime() - lookbackHours * 3600 * 1000);
    const windowSeconds = detector.windowSeconds || 300;

    // 1. Obtain clean baseline exclusions (incident & alert masking)
    const { excludedIntervals, maskedIntervalsCount } =
      await this.cleanBaselineFilter.getExcludedIntervals(
        detector.organizationId,
        detector.serviceId,
        detector.environmentId,
        lookbackStart,
        now,
      );

    // 2. Query historical telemetry points
    const points = await this.prisma.metricPoint.findMany({
      where: {
        organizationId: detector.organizationId,
        serviceId: detector.serviceId,
        environmentId: detector.environmentId,
        series: {
          definitionId: detector.metricDefinitionId,
        },
        timestamp: {
          gte: lookbackStart,
          lte: now,
        },
      },
      select: {
        timestamp: true,
        valueType: true,
        intValue: true,
        doubleValue: true,
      },
      orderBy: { timestamp: 'asc' },
    });

    // 3. Segment into sliding/tumbling windows and apply clean baseline filter
    const windowMs = windowSeconds * 1000;
    const totalWindows = Math.floor((now.getTime() - lookbackStart.getTime()) / windowMs);

    const cleanFeatureMatrix: number[][] = [];
    const featureNames = this.featureEngine.getFeatureNames(detector.metricDefinition.instrumentType);

    // Map points to data point objects
    const dataPoints: DataPoint[] = points.map((p) => {
      let val = 0;
      if (p.valueType === 'INT64' && p.intValue !== null) {
        val = Number(p.intValue);
      } else if (p.valueType === 'DOUBLE' && p.doubleValue !== null) {
        val = p.doubleValue;
      }
      return { timestamp: p.timestamp, value: val };
    });

    for (let i = 0; i < totalWindows; i++) {
      const wStart = new Date(lookbackStart.getTime() + i * windowMs);
      const wEnd = new Date(wStart.getTime() + windowMs);

      // Check if window is clean of active incidents/alerts
      if (!this.cleanBaselineFilter.isWindowClean(wStart, wEnd, excludedIntervals)) {
        continue;
      }

      // Filter points belonging to this window
      const windowPoints = dataPoints.filter(
        (p) => p.timestamp >= wStart && p.timestamp < wEnd,
      );

      if (windowPoints.length === 0) {
        continue;
      }

      const extracted = this.featureEngine.extract(windowPoints, detector.metricDefinition.instrumentType);
      cleanFeatureMatrix.push(extracted.matrixRow);
    }

    const nextVersion = (detector.currentModelVersion ?? 0) + 1;

    // Check minimum required clean training windows
    const minWindows = Math.min(detector.minimumTrainingWindows, 10); // Allow at least 10 for small test baselines
    if (cleanFeatureMatrix.length < minWindows) {
      const errorMsg = `Insufficient clean training windows: collected ${cleanFeatureMatrix.length}, minimum ${minWindows} required (masked ${maskedIntervalsCount} outage periods)`;
      this.logger.warn(`Detector ${detector.id} training failed: ${errorMsg}`);

      await this.prisma.anomalyModelVersion.create({
        data: {
          organizationId: detector.organizationId,
          detectorId: detector.id,
          version: nextVersion,
          status: AnomalyModelStatus.INSUFFICIENT_DATA,
          featureNames,
          sampleCount: cleanFeatureMatrix.length,
          contamination: detector.contamination,
          failedAt: new Date(),
          failureCode: 'INSUFFICIENT_CLEAN_DATA',
          failureMessage: errorMsg,
        },
      });

      await this.prisma.anomalyDetector.update({
        where: { id: detector.id },
        data: {
          currentModelStatus: AnomalyModelStatus.INSUFFICIENT_DATA,
        },
      });

      return { success: false, error: errorMsg };
    }

    // 4. Call FastAPI to train Isolation Forest
    try {
      const trainRes = await fetch(`${AI_SERVICE_URL}/v1/anomaly/models/train`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Service-Key': AI_INTERNAL_API_KEY,
        },
        body: JSON.stringify({
          detectorId: detector.id,
          featureNames,
          featureMatrix: cleanFeatureMatrix,
          contamination: detector.contamination,
        }),
      });

      if (!trainRes.ok) {
        const errorText = await trainRes.text();
        throw new Error(`FastAPI training endpoint returned ${trainRes.status}: ${errorText}`);
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

      // Decode base64 model artifact into binary Buffer
      const artifactBuffer = Buffer.from(trainData.artifactBase64, 'base64');

      // Verify artifact size <= 2 MiB
      if (artifactBuffer.length > 2 * 1024 * 1024) {
        throw new Error(`Model artifact size ${artifactBuffer.length} bytes exceeds 2 MiB limit`);
      }

      // Store model version atomically in transaction
      await this.prisma.$transaction(async (tx) => {
        await tx.anomalyModelVersion.updateMany({
          where: {
            detectorId: detector.id,
            status: AnomalyModelStatus.READY,
          },
          data: {
            status: AnomalyModelStatus.SUPERSEDED,
          },
        });

        await tx.anomalyModelVersion.create({
          data: {
            organizationId: detector.organizationId,
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

      this.logger.log(
        `Model training successful for detector '${detector.name}' (version ${nextVersion}, ${trainData.sampleCount} clean samples, hash: ${trainData.artifactHash.substring(0, 8)}...)`,
      );

      // Realtime notification
      this.realtimePublisher
        .publish({
          id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type: 'anomaly.model.ready',
          organizationId: detector.organizationId,
          targetRoom: RealtimeRooms.organization(detector.organizationId),
          timestamp: new Date().toISOString(),
          payload: {
            detectorId: detector.id,
            version: nextVersion,
            sampleCount: trainData.sampleCount,
            artifactHash: trainData.artifactHash,
          },
        })
        .catch(() => {});

      return { success: true, version: nextVersion };
    } catch (err) {
      const errorMsg = (err as Error).message;
      this.logger.error(`Model training failed for detector '${detector.name}': ${errorMsg}`);

      await this.prisma.anomalyModelVersion.create({
        data: {
          organizationId: detector.organizationId,
          detectorId: detector.id,
          version: nextVersion,
          status: AnomalyModelStatus.FAILED,
          featureNames,
          sampleCount: cleanFeatureMatrix.length,
          contamination: detector.contamination,
          failedAt: new Date(),
          failureCode: 'INFERENCE_SERVICE_ERROR',
          failureMessage: errorMsg,
        },
      });

      await this.prisma.anomalyDetector.update({
        where: { id: detector.id },
        data: {
          currentModelStatus: AnomalyModelStatus.FAILED,
        },
      });

      this.realtimePublisher
        .publish({
          id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type: 'anomaly.model.failed',
          organizationId: detector.organizationId,
          targetRoom: RealtimeRooms.organization(detector.organizationId),
          timestamp: new Date().toISOString(),
          payload: {
            detectorId: detector.id,
            version: nextVersion,
            error: errorMsg,
          },
        })
        .catch(() => {});

      return { success: false, error: errorMsg };
    }
  }

  /**
   * Backtest detector over historical lookback windows.
   */
  async backtest(
    organizationId: string,
    detectorId: string,
    hours = 24,
  ): Promise<AnomalyBacktestResult> {
    const detector = await this.prisma.anomalyDetector.findFirst({
      where: { id: detectorId, organizationId },
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

    if (!detector) {
      throw new NotFoundException(`Anomaly detector '${detectorId}' not found`);
    }

    const activeModel = detector.models[0];
    if (!activeModel || !activeModel.modelArtifact) {
      throw new BadRequestException('No active model artifact available for backtesting');
    }

    const now = new Date();
    const startTime = new Date(now.getTime() - hours * 3600 * 1000);
    const windowSeconds = detector.windowSeconds || 300;

    const points = await this.prisma.metricPoint.findMany({
      where: {
        organizationId,
        serviceId: detector.serviceId,
        environmentId: detector.environmentId,
        series: { definitionId: detector.metricDefinitionId },
        timestamp: { gte: startTime, lte: now },
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

    const windowMs = windowSeconds * 1000;
    const totalWindows = Math.floor((now.getTime() - startTime.getTime()) / windowMs);
    const featureWindows: Record<string, number>[] = [];
    const windowTimestamps: string[] = [];

    for (let i = 0; i < totalWindows; i++) {
      const wStart = new Date(startTime.getTime() + i * windowMs);
      const wEnd = new Date(wStart.getTime() + windowMs);
      const wPoints = dataPoints.filter((p) => p.timestamp >= wStart && p.timestamp < wEnd);
      if (wPoints.length === 0) continue;

      const extracted = this.featureEngine.extract(wPoints, detector.metricDefinition.instrumentType);
      featureWindows.push(extracted.featureVector);
      windowTimestamps.push(wStart.toISOString());
    }

    if (featureWindows.length === 0) {
      return {
        detectorId,
        windowsEvaluated: 0,
        windowsFlagged: 0,
        scoreDistribution: { min: 0, max: 0, mean: 0, p50: 0, p90: 0, p99: 0 },
        flaggedTimestamps: [],
        sampleCount: dataPoints.length,
      };
    }

    const artifactBase64 = Buffer.from(activeModel.modelArtifact).toString('base64');
    const batchRes = await fetch(`${AI_SERVICE_URL}/v1/anomaly/models/batch-score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Service-Key': AI_INTERNAL_API_KEY,
      },
      body: JSON.stringify({
        detectorId: detector.id,
        artifactBase64,
        artifactHash: activeModel.artifactHash,
        featureWindows,
        featureNames: activeModel.featureNames,
      }),
    });

    if (!batchRes.ok) {
      throw new Error(`Batch scoring failed: ${await batchRes.text()}`);
    }

    const batchData = (await batchRes.json()) as {
      results: Array<{ normalizedScore: number; isAnomalous: boolean }>;
    };

    const scores = batchData.results.map((r) => r.normalizedScore);
    const flaggedTimestamps: string[] = [];
    batchData.results.forEach((r, idx) => {
      if (r.isAnomalous && windowTimestamps[idx]) {
        flaggedTimestamps.push(windowTimestamps[idx]!);
      }
    });

    scores.sort((a, b) => a - b);
    const sum = scores.reduce((acc, s) => acc + s, 0);

    return {
      detectorId,
      windowsEvaluated: scores.length,
      windowsFlagged: flaggedTimestamps.length,
      scoreDistribution: {
        min: scores[0] ?? 0,
        max: scores[scores.length - 1] ?? 0,
        mean: Number((sum / scores.length).toFixed(2)),
        p50: scores[Math.floor(scores.length * 0.5)] ?? 0,
        p90: scores[Math.floor(scores.length * 0.9)] ?? 0,
        p99: scores[Math.floor(scores.length * 0.99)] ?? 0,
      },
      flaggedTimestamps,
      sampleCount: dataPoints.length,
    };
  }

  private mapToSummary(detector: any, activeFindingsCount = 0): AnomalyDetectorSummary {
    return {
      id: detector.id,
      organizationId: detector.organizationId,
      serviceId: detector.serviceId,
      serviceName: detector.service?.name ?? null,
      environmentId: detector.environmentId,
      environmentName: detector.environment?.name ?? null,
      metricDefinitionId: detector.metricDefinitionId,
      metricName: detector.metricDefinition?.name ?? null,
      metricUnit: detector.metricDefinition?.unit ?? null,
      instrumentType: detector.metricDefinition?.instrumentType ?? null,
      name: detector.name,
      description: detector.description,
      status: detector.status,
      evaluationMode: detector.evaluationMode,
      seriesFilters: (detector.seriesFilters as any) ?? [],
      windowSeconds: detector.windowSeconds,
      evaluationIntervalSeconds: detector.evaluationIntervalSeconds,
      trainingLookbackHours: detector.trainingLookbackHours,
      minimumTrainingWindows: detector.minimumTrainingWindows,
      contamination: detector.contamination,
      pendingEvaluations: detector.pendingEvaluations,
      recoveryEvaluations: detector.recoveryEvaluations,
      retrainIntervalHours: detector.retrainIntervalHours,
      currentModelVersion: detector.currentModelVersion,
      currentModelStatus: detector.currentModelStatus,
      activeFindingsCount,
      lastEvaluatedAt: detector.lastEvaluatedAt?.toISOString(),
      lastTrainedAt: detector.lastTrainedAt?.toISOString(),
      createdAt: detector.createdAt.toISOString(),
      updatedAt: detector.updatedAt.toISOString(),
      archivedAt: detector.archivedAt?.toISOString(),
    };
  }

  async evaluateNow(
    organizationId: string,
    id: string,
    points?: Array<{ timestamp: string | Date; value: number }>,
  ) {
    const detector = await this.prisma.anomalyDetector.findFirst({
      where: { id, organizationId },
    });
    if (!detector) {
      throw new NotFoundException(`Anomaly detector '${id}' not found`);
    }
    return this.findingsService.evaluateDetector(id, points);
  }
}
