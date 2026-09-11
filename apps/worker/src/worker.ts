import { PrismaClient } from '@prisma/client';
import { loadWorkerConfig, WorkerConfig } from './config';
import { ProbeScheduler } from './probe-scheduler';
import { HealthProbeWorker } from './probe-worker';
import { TelemetryWorker } from './telemetry/telemetry-worker';
import { TelemetryRetentionService } from './telemetry/telemetry-retention';
import { AlertWorker } from './alerts/alert-worker';
import { AlertScheduler } from './alerts/alert-scheduler';
import { AlertRetentionService } from './alerts/alert-retention';
import { IncidentCorrelationWorker } from './incidents/incident-correlation.worker';
import { IncidentCorrelationRelayer } from './incidents/incident-correlation.relayer';
import { IncidentAiAnalysisWorker } from './incidents/incident-ai-analysis.worker';
import { AnomalyTrainingWorker } from './anomalies/anomaly-training.worker';
import { AnomalyEvaluationWorker } from './anomalies/anomaly-evaluation.worker';
import { AnomalyScheduler } from './anomalies/anomaly-scheduler';
import { NotificationDeliveryWorker } from './notifications/notification-delivery.worker';
import { ReliabilityRollupScheduler } from './reliability/reliability-rollup.scheduler';

export class BackgroundWorkerService {
  private isRunning = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private readonly config: WorkerConfig;
  private prisma: PrismaClient | null = null;
  private scheduler: ProbeScheduler | null = null;
  private probeWorker: HealthProbeWorker | null = null;
  private telemetryWorker: TelemetryWorker | null = null;
  private retentionService: TelemetryRetentionService | null = null;
  private alertWorker: AlertWorker | null = null;
  private alertScheduler: AlertScheduler | null = null;
  private alertRetention: AlertRetentionService | null = null;
  private correlationWorker: IncidentCorrelationWorker | null = null;
  private correlationRelayer: IncidentCorrelationRelayer | null = null;
  private aiAnalysisWorker: IncidentAiAnalysisWorker | null = null;
  private anomalyTrainingWorker: AnomalyTrainingWorker | null = null;
  private anomalyEvaluationWorker: AnomalyEvaluationWorker | null = null;
  private anomalyScheduler: AnomalyScheduler | null = null;
  private notificationDeliveryWorker: NotificationDeliveryWorker | null = null;
  private reliabilityScheduler: ReliabilityRollupScheduler | null = null;

  constructor() {
    this.config = loadWorkerConfig();
  }

  async start(): Promise<void> {
    this.isRunning = true;
    // eslint-disable-next-line no-console
    console.log(
      `[AegisOps Worker] Background worker started in ${this.config.environment} mode (concurrency: ${this.config.concurrency})`,
    );

    // Initialize database client
    this.prisma = new PrismaClient();
    await this.prisma.$connect();

    // Start health probe scheduler and consumer worker
    this.scheduler = new ProbeScheduler(this.prisma, this.config);
    this.probeWorker = new HealthProbeWorker(this.prisma, this.config);
    this.telemetryWorker = new TelemetryWorker(this.prisma, this.config);
    this.retentionService = new TelemetryRetentionService(this.prisma);
    this.alertWorker = new AlertWorker(this.prisma, this.config);
    this.alertScheduler = new AlertScheduler(this.prisma, this.config);
    this.alertRetention = new AlertRetentionService(this.prisma);
    this.correlationWorker = new IncidentCorrelationWorker(this.prisma, this.config);
    this.correlationRelayer = new IncidentCorrelationRelayer(this.prisma, this.config);
    this.aiAnalysisWorker = new IncidentAiAnalysisWorker(this.prisma, this.config);
    this.anomalyTrainingWorker = new AnomalyTrainingWorker(this.prisma, this.config);
    this.anomalyEvaluationWorker = new AnomalyEvaluationWorker(this.prisma, this.config);
    this.anomalyScheduler = new AnomalyScheduler(this.prisma, this.config);
    this.notificationDeliveryWorker = new NotificationDeliveryWorker(this.prisma, this.config);
    this.reliabilityScheduler = new ReliabilityRollupScheduler(this.prisma);

    await this.probeWorker.start();
    await this.scheduler.start();
    await this.telemetryWorker.start();
    this.retentionService.start();
    await this.alertWorker.start();
    await this.alertScheduler.start();
    this.alertRetention.start();
    await this.correlationWorker.start();
    await this.correlationRelayer.start();
    await this.aiAnalysisWorker.start();
    await this.anomalyTrainingWorker.start();
    await this.anomalyEvaluationWorker.start();
    await this.anomalyScheduler.start();
    await this.notificationDeliveryWorker.start();
    await this.reliabilityScheduler.start();

    // Heartbeat reporting
    this.heartbeatTimer = setInterval(() => {
      if (this.isRunning) {
        // eslint-disable-next-line no-console
        console.log(`[AegisOps Worker Heartbeat] Status: healthy, Uptime: ${Math.floor(process.uptime())}s`);
      }
    }, 60000);
  }

  async stop(): Promise<void> {
    // eslint-disable-next-line no-console
    console.log('[AegisOps Worker] Initiating graceful shutdown...');
    this.isRunning = false;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.reliabilityScheduler) {
      this.reliabilityScheduler.stop();
      this.reliabilityScheduler = null;
    }

    if (this.notificationDeliveryWorker) {
      await this.notificationDeliveryWorker.stop();
      this.notificationDeliveryWorker = null;
    }

    if (this.anomalyScheduler) {
      await this.anomalyScheduler.stop();
      this.anomalyScheduler = null;
    }

    if (this.anomalyEvaluationWorker) {
      await this.anomalyEvaluationWorker.stop();
      this.anomalyEvaluationWorker = null;
    }

    if (this.anomalyTrainingWorker) {
      await this.anomalyTrainingWorker.stop();
      this.anomalyTrainingWorker = null;
    }

    if (this.aiAnalysisWorker) {
      await this.aiAnalysisWorker.stop();
      this.aiAnalysisWorker = null;
    }

    if (this.correlationRelayer) {
      await this.correlationRelayer.stop();
      this.correlationRelayer = null;
    }

    if (this.correlationWorker) {
      await this.correlationWorker.stop();
      this.correlationWorker = null;
    }

    if (this.alertRetention) {
      this.alertRetention.stop();
      this.alertRetention = null;
    }

    if (this.alertScheduler) {
      await this.alertScheduler.stop();
      this.alertScheduler = null;
    }

    if (this.alertWorker) {
      await this.alertWorker.stop();
      this.alertWorker = null;
    }

    if (this.retentionService) {
      this.retentionService.stop();
      this.retentionService = null;
    }

    if (this.telemetryWorker) {
      await this.telemetryWorker.stop();
      this.telemetryWorker = null;
    }

    if (this.scheduler) {
      await this.scheduler.stop();
      this.scheduler = null;
    }

    if (this.probeWorker) {
      await this.probeWorker.stop();
      this.probeWorker = null;
    }

    if (this.prisma) {
      await this.prisma.$disconnect();
      this.prisma = null;
    }

    // eslint-disable-next-line no-console
    console.log('[AegisOps Worker] Graceful shutdown completed.');
  }

  getStatus(): { isRunning: boolean; config: WorkerConfig } {
    return {
      isRunning: this.isRunning,
      config: this.config,
    };
  }
}
