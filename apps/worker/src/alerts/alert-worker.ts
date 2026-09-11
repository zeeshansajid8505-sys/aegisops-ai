import { Worker, Job } from 'bullmq';
import { PrismaClient, AlertInstanceState, AlertEvaluationResult, AlertEventType } from '@prisma/client';
import Redis from 'ioredis';
import * as crypto from 'crypto';
import { WorkerConfig } from '../config';

export const ALERT_EVALUATION_QUEUE_NAME =
  process.env['ALERT_EVALUATION_QUEUE_NAME'] ?? 'alert-rule-evaluation';
export const ALERT_EVALUATION_DELAY_SECONDS = parseInt(
  process.env['ALERT_EVALUATION_DELAY_SECONDS'] ?? '10',
  10,
);
export const ALERT_MAX_INSTANCES_PER_RULE = parseInt(
  process.env['ALERT_MAX_INSTANCES_PER_RULE'] ?? '200',
  10,
);
export const ALERT_RULE_LOCK_TTL_SECONDS = parseInt(
  process.env['ALERT_RULE_LOCK_TTL_SECONDS'] ?? '30',
  10,
);

export interface AlertEvaluationJobData {
  ruleId: string;
  organizationId: string;
  scheduledTime?: string;
  timeBucket?: string;
  isManual: boolean;
  runId: string;
}

interface MetricSeriesFilter {
  key: string;
  operator: 'EQUALS' | 'NOT_EQUALS';
  value: string;
}

interface RawPoint {
  timestamp: Date;
  value: number;
  bucketCounts?: number[] | null;
  explicitBounds?: number[] | null;
}

export class AlertWorker {
  private worker: Worker<AlertEvaluationJobData> | null = null;
  private redis: Redis | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: WorkerConfig,
  ) {}

  async start(): Promise<void> {
    this.redis = new Redis({
      host: this.config.redisHost,
      port: this.config.redisPort,
      maxRetriesPerRequest: null,
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });

    this.worker = new Worker<AlertEvaluationJobData>(
      ALERT_EVALUATION_QUEUE_NAME,
      async (job: Job<AlertEvaluationJobData>) => {
        await this.processEvaluationJob(job);
      },
      {
        connection: {
          host: this.config.redisHost,
          port: this.config.redisPort,
        },
        concurrency: Math.max(2, this.config.concurrency),
      },
    );

    this.worker.on('completed', (job: Job<AlertEvaluationJobData>) => {
      // eslint-disable-next-line no-console
      console.log(`[AlertWorker] Evaluation completed for rule ${job.data.ruleId} (job: ${job.id})`);
    });

    this.worker.on('failed', (job: Job<AlertEvaluationJobData> | undefined, err: Error) => {
      // eslint-disable-next-line no-console
      console.error(`[AlertWorker] Evaluation failed for rule ${job?.data.ruleId}:`, err.message);
    });

    // eslint-disable-next-line no-console
    console.log(`[AlertWorker] Alert evaluation worker active on queue '${ALERT_EVALUATION_QUEUE_NAME}'`);
  }

  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    if (this.redis) {
      this.redis.disconnect();
      this.redis = null;
    }
    // eslint-disable-next-line no-console
    console.log('[AlertWorker] Alert evaluation worker stopped');
  }

  private async processEvaluationJob(job: Job<AlertEvaluationJobData>): Promise<void> {
    const { ruleId, organizationId, isManual, runId } = job.data;
    const startTime = Date.now();

    if (!this.redis) return;

    // 1. Concurrency Protection: Acquire distributed lock for this rule
    const lockKey = `lock:alert-rule:${ruleId}`;
    const lockToken = crypto.randomUUID();
    const lockTtlMs = ALERT_RULE_LOCK_TTL_SECONDS * 1000;

    const acquired = await this.redis.set(lockKey, lockToken, 'PX', lockTtlMs, 'NX');
    if (!acquired) {
      // eslint-disable-next-line no-console
      console.warn(`[AlertWorker] Rule ${ruleId} evaluation lock already held. Skipping overlapping run.`);
      return;
    }

    try {
      // 2. Fetch Rule
      const rule = await this.prisma.alertRule.findFirst({
        where: { id: ruleId, organizationId },
        include: {
          metricDefinition: true,
        },
      });

      if (!rule) {
        // eslint-disable-next-line no-console
        console.warn(`[AlertWorker] Rule ${ruleId} not found in org ${organizationId}`);
        return;
      }

      if (rule.status === 'ARCHIVED') {
        return;
      }

      if (rule.status === 'DISABLED' && !isManual) {
        return;
      }

      // 3. Idempotency Check
      const timeBucket =
        job.data.timeBucket ??
        String(Math.floor(startTime / (Math.max(15, rule.evaluationIntervalSeconds) * 1000)));
      const evaluationKey = isManual
        ? `manual:${rule.id}:${runId}`
        : `${rule.id}:${timeBucket}`;

      if (!isManual) {
        const recentEval = await this.prisma.alertEvaluation.findFirst({
          where: {
            ruleId: rule.id,
            evaluationKey,
          },
        });
        if (recentEval) {
          // eslint-disable-next-line no-console
          console.log(`[AlertWorker] Skipping duplicate evaluation for key ${evaluationKey}`);
          return;
        }
      }

      // 4. Calculate Sliding Window
      const windowEnd = new Date(startTime - ALERT_EVALUATION_DELAY_SECONDS * 1000);
      const windowStart = new Date(windowEnd.getTime() - rule.windowSeconds * 1000);

      // 5. Query matching series
      const allSeries = await this.prisma.metricSeries.findMany({
        where: {
          organizationId: rule.organizationId,
          serviceId: rule.serviceId,
          environmentId: rule.environmentId,
          definitionId: rule.metricDefinitionId,
        },
      });

      const filters = ((rule.seriesFilters as any) as MetricSeriesFilter[]) ?? [];
      const matchingSeries = allSeries.filter((s) =>
        this.matchesFilters(s.attributes as Record<string, any>, filters),
      );

      let targetSeries = matchingSeries;
      if (rule.evaluationMode === 'PER_SERIES' && matchingSeries.length > ALERT_MAX_INSTANCES_PER_RULE) {
        targetSeries = matchingSeries.slice(0, ALERT_MAX_INSTANCES_PER_RULE);
        // eslint-disable-next-line no-console
        console.warn(`[AlertWorker] Cardinality cap reached for rule ${rule.id} (${matchingSeries.length} capped to ${ALERT_MAX_INSTANCES_PER_RULE})`);
      }

      // 6. Extract data points and compute evaluation
      if (rule.evaluationMode === 'PER_SERIES') {
        await this.evaluatePerSeries(rule, targetSeries, windowStart, windowEnd, evaluationKey, startTime);
      } else {
        await this.evaluateAggregateSeries(rule, targetSeries, windowStart, windowEnd, evaluationKey, startTime);
      }

      // 7. Update AlertRule timestamps
      await this.prisma.alertRule.update({
        where: { id: rule.id },
        data: {
          lastEvaluatedAt: new Date(),
          lastSuccessfulEvaluationAt: new Date(),
          lastEvaluationError: null,
        },
      });
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error(`[AlertWorker] Error executing evaluation for rule ${ruleId}:`, err.message);

      try {
        await this.prisma.alertRule.update({
          where: { id: ruleId },
          data: {
            lastEvaluatedAt: new Date(),
            lastEvaluationError: err.message,
          },
        });

        await this.prisma.alertEvaluation.create({
          data: {
            organizationId,
            ruleId,
            evaluationKey: `err:${ruleId}:${Date.now()}`,
            evaluatedAt: new Date(),
            windowStart: new Date(),
            windowEnd: new Date(),
            result: 'ERROR',
            durationMs: Date.now() - startTime,
            errorCode: 'EVALUATION_EXCEPTION',
            errorMessage: err.message,
          },
        });
      } catch {
        // Ignore secondary error recording failures
      }
    } finally {
      // 8. Safe Lua release of Redis distributed lock
      await this.releaseLock(lockKey, lockToken);
    }
  }

  private async evaluatePerSeries(
    rule: any,
    seriesList: any[],
    windowStart: Date,
    windowEnd: Date,
    baseEvaluationKey: string,
    startTime: number,
  ): Promise<void> {
    const currentTime = new Date();

    for (const s of seriesList) {
      const points = await this.fetchPoints(rule.organizationId, rule.environmentId, s.id, windowStart, windowEnd);
      const evalResult = this.computeSeriesResult(rule, points);

      const fingerprint = this.computeFingerprint(rule.organizationId, rule.id, rule.serviceId, rule.environmentId, 'PER_SERIES', s.id);

      // Upsert or fetch existing AlertInstance
      const existingInstance = await this.prisma.alertInstance.findUnique({
        where: {
          ruleId_fingerprint: {
            ruleId: rule.id,
            fingerprint,
          },
        },
      });

      const currentState: AlertInstanceState = existingInstance ? existingInstance.state : 'INACTIVE';
      const stateOutcome = this.reduceState(
        currentState,
        evalResult.result,
        currentTime,
        evalResult.observedValue,
        rule.thresholdValue,
        rule.pendingDurationSeconds,
        rule.recoveryDurationSeconds,
        rule.noDataPolicy,
        existingInstance,
      );

      const durationMs = Date.now() - startTime;
      const evaluationKey = `${baseEvaluationKey}:${s.id}`;

      // Transactional state transition & evaluation persistence
      await this.prisma.$transaction(async (tx) => {
        const instance = await tx.alertInstance.upsert({
          where: {
            ruleId_fingerprint: {
              ruleId: rule.id,
              fingerprint,
            },
          },
          create: {
            organizationId: rule.organizationId,
            ruleId: rule.id,
            serviceId: rule.serviceId,
            environmentId: rule.environmentId,
            metricSeriesId: s.id,
            fingerprint,
            state: stateOutcome.newState,
            currentValue: evalResult.observedValue,
            lastEvaluationResult: evalResult.result,
            firstBreachedAt: stateOutcome.timestamps.firstBreachedAt,
            pendingSince: stateOutcome.timestamps.pendingSince,
            firingStartedAt: stateOutcome.timestamps.firingStartedAt,
            lastBreachedAt: stateOutcome.timestamps.lastBreachedAt,
            clearCandidateAt: stateOutcome.timestamps.clearCandidateAt,
            resolvedAt: stateOutcome.timestamps.resolvedAt,
            lastEvaluatedAt: currentTime,
            lastStateChangeAt: stateOutcome.stateChanged ? currentTime : currentTime,
          },
          update: {
            state: stateOutcome.newState,
            currentValue: evalResult.observedValue,
            lastEvaluationResult: evalResult.result,
            firstBreachedAt: stateOutcome.timestamps.firstBreachedAt,
            pendingSince: stateOutcome.timestamps.pendingSince,
            firingStartedAt: stateOutcome.timestamps.firingStartedAt,
            lastBreachedAt: stateOutcome.timestamps.lastBreachedAt,
            clearCandidateAt: stateOutcome.timestamps.clearCandidateAt,
            resolvedAt: stateOutcome.timestamps.resolvedAt,
            lastEvaluatedAt: currentTime,
            ...(stateOutcome.stateChanged ? { lastStateChangeAt: currentTime } : {}),
          },
        });

        // Insert transition event if state machine produced one
        if (stateOutcome.event) {
          const createdEvent = await tx.alertEvent.create({
            data: {
              organizationId: rule.organizationId,
              ruleId: rule.id,
              alertInstanceId: instance.id,
              eventType: stateOutcome.event.eventType,
              fromState: currentState,
              toState: stateOutcome.newState,
              observedValue: evalResult.observedValue,
              thresholdValue: rule.thresholdValue,
              message: stateOutcome.event.message,
              occurredAt: currentTime,
            },
          });

          if (
            stateOutcome.event.eventType === 'FIRING_STARTED' ||
            stateOutcome.event.eventType === 'RESOLVED'
          ) {
            await tx.incidentCorrelationTrigger.create({
              data: {
                organizationId: rule.organizationId,
                alertEventId: createdEvent.id,
                eventType: stateOutcome.event.eventType,
                status: 'PENDING',
              },
            });
          }
        }

        // Insert evaluation record
        await tx.alertEvaluation.create({
          data: {
            organizationId: rule.organizationId,
            ruleId: rule.id,
            alertInstanceId: instance.id,
            metricSeriesId: s.id,
            evaluationKey,
            evaluatedAt: currentTime,
            windowStart,
            windowEnd,
            observedValue: evalResult.observedValue,
            sampleCount: points.length,
            result: evalResult.result,
            durationMs,
          },
        });
      });
    }
  }

  private async evaluateAggregateSeries(
    rule: any,
    seriesList: any[],
    windowStart: Date,
    windowEnd: Date,
    baseEvaluationKey: string,
    startTime: number,
  ): Promise<void> {
    const currentTime = new Date();
    let totalSampleCount = 0;
    const seriesValues: number[] = [];

    for (const s of seriesList) {
      const points = await this.fetchPoints(rule.organizationId, rule.environmentId, s.id, windowStart, windowEnd);
      totalSampleCount += points.length;
      if (points.length > 0) {
        const val = this.computeAggregation(rule.aggregation, points);
        if (val !== null) {
          seriesValues.push(val);
        }
      }
    }

    let observedValue: number | null = null;
    let evalResult: AlertEvaluationResult = 'NO_DATA';

    if (seriesValues.length > 0) {
      observedValue = this.reduceAcrossSeries(rule.seriesReduction ?? 'AVG', seriesValues);
      const isBreached = this.evaluateComparison(observedValue, rule.comparisonOperator, rule.thresholdValue);
      evalResult = isBreached ? 'BREACH' : 'OK';
    }

    const fingerprint = this.computeFingerprint(rule.organizationId, rule.id, rule.serviceId, rule.environmentId, 'AGGREGATE_SERIES');

    const existingInstance = await this.prisma.alertInstance.findUnique({
      where: {
        ruleId_fingerprint: {
          ruleId: rule.id,
          fingerprint,
        },
      },
    });

    const currentState: AlertInstanceState = existingInstance ? existingInstance.state : 'INACTIVE';
    const stateOutcome = this.reduceState(
      currentState,
      evalResult,
      currentTime,
      observedValue,
      rule.thresholdValue,
      rule.pendingDurationSeconds,
      rule.recoveryDurationSeconds,
      rule.noDataPolicy,
      existingInstance,
    );

    const durationMs = Date.now() - startTime;

    await this.prisma.$transaction(async (tx) => {
      const instance = await tx.alertInstance.upsert({
        where: {
          ruleId_fingerprint: {
            ruleId: rule.id,
            fingerprint,
          },
        },
        create: {
          organizationId: rule.organizationId,
          ruleId: rule.id,
          serviceId: rule.serviceId,
          environmentId: rule.environmentId,
          metricSeriesId: null,
          fingerprint,
          state: stateOutcome.newState,
          currentValue: observedValue,
          lastEvaluationResult: evalResult,
          firstBreachedAt: stateOutcome.timestamps.firstBreachedAt,
          pendingSince: stateOutcome.timestamps.pendingSince,
          firingStartedAt: stateOutcome.timestamps.firingStartedAt,
          lastBreachedAt: stateOutcome.timestamps.lastBreachedAt,
          clearCandidateAt: stateOutcome.timestamps.clearCandidateAt,
          resolvedAt: stateOutcome.timestamps.resolvedAt,
          lastEvaluatedAt: currentTime,
          lastStateChangeAt: currentTime,
        },
        update: {
          state: stateOutcome.newState,
          currentValue: observedValue,
          lastEvaluationResult: evalResult,
          firstBreachedAt: stateOutcome.timestamps.firstBreachedAt,
          pendingSince: stateOutcome.timestamps.pendingSince,
          firingStartedAt: stateOutcome.timestamps.firingStartedAt,
          lastBreachedAt: stateOutcome.timestamps.lastBreachedAt,
          clearCandidateAt: stateOutcome.timestamps.clearCandidateAt,
          resolvedAt: stateOutcome.timestamps.resolvedAt,
          lastEvaluatedAt: currentTime,
          ...(stateOutcome.stateChanged ? { lastStateChangeAt: currentTime } : {}),
        },
      });

      if (stateOutcome.event) {
        const createdEvent = await tx.alertEvent.create({
          data: {
            organizationId: rule.organizationId,
            ruleId: rule.id,
            alertInstanceId: instance.id,
            eventType: stateOutcome.event.eventType,
            fromState: currentState,
            toState: stateOutcome.newState,
            observedValue,
            thresholdValue: rule.thresholdValue,
            message: stateOutcome.event.message,
            occurredAt: currentTime,
          },
        });

        if (
          stateOutcome.event.eventType === 'FIRING_STARTED' ||
          stateOutcome.event.eventType === 'RESOLVED'
        ) {
          await tx.incidentCorrelationTrigger.create({
            data: {
              organizationId: rule.organizationId,
              alertEventId: createdEvent.id,
              eventType: stateOutcome.event.eventType,
              status: 'PENDING',
            },
          });
        }
      }

      await tx.alertEvaluation.create({
        data: {
          organizationId: rule.organizationId,
          ruleId: rule.id,
          alertInstanceId: instance.id,
          metricSeriesId: null,
          evaluationKey: baseEvaluationKey,
          evaluatedAt: currentTime,
          windowStart,
          windowEnd,
          observedValue,
          sampleCount: totalSampleCount,
          result: evalResult,
          durationMs,
        },
      });
    });
  }

  private computeSeriesResult(
    rule: any,
    points: RawPoint[],
  ): { observedValue: number | null; result: AlertEvaluationResult } {
    if (points.length === 0) {
      return { observedValue: null, result: 'NO_DATA' };
    }

    const val = this.computeAggregation(rule.aggregation, points);
    if (val === null) {
      return { observedValue: null, result: 'NO_DATA' };
    }

    const breached = this.evaluateComparison(val, rule.comparisonOperator, rule.thresholdValue);
    return {
      observedValue: val,
      result: breached ? 'BREACH' : 'OK',
    };
  }

  private evaluateComparison(val: number, op: string, threshold: number): boolean {
    const EPSILON = 1e-9;
    switch (op) {
      case 'GT':
        return val > threshold;
      case 'GTE':
        return val >= threshold - EPSILON;
      case 'LT':
        return val < threshold;
      case 'LTE':
        return val <= threshold + EPSILON;
      case 'EQ':
        return Math.abs(val - threshold) < EPSILON;
      case 'NEQ':
        return Math.abs(val - threshold) >= EPSILON;
      default:
        return false;
    }
  }

  private computeAggregation(agg: string, points: RawPoint[]): number | null {
    if (points.length === 0) return null;

    switch (agg) {
      case 'AVG':
        return points.reduce((acc, p) => acc + p.value, 0) / points.length;
      case 'MIN':
        return Math.min(...points.map((p) => p.value));
      case 'MAX':
        return Math.max(...points.map((p) => p.value));
      case 'SUM':
        return points.reduce((acc, p) => acc + p.value, 0);
      case 'LAST':
        return points[points.length - 1]!.value;
      case 'RATE': {
        if (points.length < 2) return 0;
        let delta = 0;
        for (let i = 1; i < points.length; i++) {
          const prev = points[i - 1]!.value;
          const curr = points[i]!.value;
          if (curr >= prev) {
            delta += curr - prev;
          } else {
            delta += curr; // Counter reset
          }
        }
        const tStart = points[0]!.timestamp.getTime();
        const tEnd = points[points.length - 1]!.timestamp.getTime();
        const elapsed = (tEnd - tStart) / 1000;
        return elapsed > 0 ? delta / elapsed : 0;
      }
      case 'P50':
      case 'P90':
      case 'P99': {
        const pct = agg === 'P50' ? 50 : agg === 'P90' ? 90 : 99;
        return this.computePercentile(points, pct);
      }
      default:
        return points[points.length - 1]!.value;
    }
  }

  private computePercentile(points: RawPoint[], percentile: number): number {
    if (points.length === 0) return 0;

    let hasHistogram = false;
    const combinedBuckets: number[] = [];
    let explicitBounds: number[] = [];

    for (const p of points) {
      if (p.bucketCounts && p.bucketCounts.length > 0 && p.explicitBounds && p.explicitBounds.length > 0) {
        hasHistogram = true;
        explicitBounds = p.explicitBounds;
        for (let i = 0; i < p.bucketCounts.length; i++) {
          combinedBuckets[i] = (combinedBuckets[i] ?? 0) + Number(p.bucketCounts[i]);
        }
      }
    }

    if (hasHistogram && combinedBuckets.length > 0 && explicitBounds.length > 0) {
      const totalSamples = combinedBuckets.reduce((a, b) => a + b, 0);
      if (totalSamples > 0) {
        const target = totalSamples * (percentile / 100);
        let cumulative = 0;
        for (let i = 0; i < combinedBuckets.length; i++) {
          cumulative += combinedBuckets[i]!;
          if (cumulative >= target) {
            const lower = i === 0 ? 0 : explicitBounds[i - 1]!;
            const upper = i < explicitBounds.length ? explicitBounds[i]! : lower * 1.5 || 1000;
            const bucketCount = combinedBuckets[i]!;
            if (bucketCount === 0) return upper;
            const fraction = (target - (cumulative - bucketCount)) / bucketCount;
            return lower + fraction * (upper - lower);
          }
        }
        return explicitBounds[explicitBounds.length - 1]!;
      }
    }

    const sorted = points.map((p) => p.value).sort((a, b) => a - b);
    const index = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1),
    );
    return sorted[index]!;
  }

  private reduceAcrossSeries(reduction: string, values: number[]): number {
    if (values.length === 0) return 0;
    switch (reduction) {
      case 'MAX':
        return Math.max(...values);
      case 'MIN':
        return Math.min(...values);
      case 'SUM':
        return values.reduce((a, b) => a + b, 0);
      case 'AVG':
      default:
        return values.reduce((a, b) => a + b, 0) / values.length;
    }
  }

  private reduceState(
    currentState: AlertInstanceState,
    result: AlertEvaluationResult,
    currentTime: Date,
    observedValue: number | null,
    thresholdValue: number,
    pendingDurationSeconds: number,
    recoveryDurationSeconds: number,
    noDataPolicy: string,
    existingInstance?: any,
  ): {
    newState: AlertInstanceState;
    stateChanged: boolean;
    event: { eventType: AlertEventType; message: string } | null;
    timestamps: {
      firstBreachedAt: Date | null;
      pendingSince: Date | null;
      firingStartedAt: Date | null;
      lastBreachedAt: Date | null;
      clearCandidateAt: Date | null;
      resolvedAt: Date | null;
    };
  } {
    const timestamps = {
      firstBreachedAt: existingInstance?.firstBreachedAt ?? null,
      pendingSince: existingInstance?.pendingSince ?? null,
      firingStartedAt: existingInstance?.firingStartedAt ?? null,
      lastBreachedAt: existingInstance?.lastBreachedAt ?? null,
      clearCandidateAt: existingInstance?.clearCandidateAt ?? null,
      resolvedAt: existingInstance?.resolvedAt ?? null,
    };

    if (result === 'ERROR') {
      return { newState: currentState, stateChanged: false, event: null, timestamps };
    }

    let effective: 'OK' | 'BREACH' | 'NO_OP' = 'NO_OP';
    if (result === 'NO_DATA') {
      if (noDataPolicy === 'OK') effective = 'OK';
      else if (noDataPolicy === 'ALERT') effective = 'BREACH';
      else effective = 'NO_OP';
    } else {
      effective = result === 'BREACH' ? 'BREACH' : 'OK';
    }

    if (effective === 'NO_OP') {
      return { newState: currentState, stateChanged: false, event: null, timestamps };
    }

    switch (currentState) {
      case 'INACTIVE': {
        if (effective === 'BREACH') {
          timestamps.firstBreachedAt = currentTime;
          timestamps.lastBreachedAt = currentTime;
          timestamps.resolvedAt = null;

          if (pendingDurationSeconds <= 0) {
            timestamps.firingStartedAt = currentTime;
            timestamps.pendingSince = null;
            timestamps.clearCandidateAt = null;
            return {
              newState: 'FIRING',
              stateChanged: true,
              event: {
                eventType: 'FIRING_STARTED',
                message: `Breached threshold (${observedValue ?? 'no-data'} vs ${thresholdValue}) and entered FIRING immediately.`,
              },
              timestamps,
            };
          } else {
            timestamps.pendingSince = currentTime;
            timestamps.firingStartedAt = null;
            timestamps.clearCandidateAt = null;
            return {
              newState: 'PENDING',
              stateChanged: true,
              event: {
                eventType: 'PENDING_STARTED',
                message: `Breached threshold (${observedValue ?? 'no-data'} vs ${thresholdValue}) and is PENDING for ${pendingDurationSeconds}s.`,
              },
              timestamps,
            };
          }
        }
        return { newState: 'INACTIVE', stateChanged: false, event: null, timestamps };
      }

      case 'PENDING': {
        if (effective === 'BREACH') {
          timestamps.lastBreachedAt = currentTime;
          const pendingStart = timestamps.pendingSince ?? currentTime;
          const elapsed = (currentTime.getTime() - pendingStart.getTime()) / 1000;

          if (elapsed >= pendingDurationSeconds) {
            timestamps.firingStartedAt = currentTime;
            timestamps.pendingSince = null;
            timestamps.clearCandidateAt = null;
            return {
              newState: 'FIRING',
              stateChanged: true,
              event: {
                eventType: 'FIRING_STARTED',
                message: `Violation persisted for ${Math.round(elapsed)}s (>= ${pendingDurationSeconds}s). Alert transitioned to FIRING.`,
              },
              timestamps,
            };
          }
          return { newState: 'PENDING', stateChanged: false, event: null, timestamps };
        }

        // PENDING + OK -> violation cleared
        timestamps.pendingSince = null;
        timestamps.firstBreachedAt = null;
        timestamps.clearCandidateAt = null;
        return {
          newState: 'INACTIVE',
          stateChanged: true,
          event: {
            eventType: 'PENDING_CLEARED',
            message: `Metric normalized (${observedValue ?? 'ok'}) while PENDING. Alert returned to INACTIVE.`,
          },
          timestamps,
        };
      }

      case 'FIRING': {
        if (effective === 'BREACH') {
          timestamps.lastBreachedAt = currentTime;
          timestamps.clearCandidateAt = null;
          // Deduplication: remain FIRING, no event
          return { newState: 'FIRING', stateChanged: false, event: null, timestamps };
        }

        // FIRING + OK
        if (recoveryDurationSeconds <= 0) {
          timestamps.resolvedAt = currentTime;
          timestamps.clearCandidateAt = null;
          timestamps.pendingSince = null;
          timestamps.firstBreachedAt = null;
          return {
            newState: 'INACTIVE',
            stateChanged: true,
            event: {
              eventType: 'RESOLVED',
              message: `Metric normalized (${observedValue ?? 'ok'}). Alert RESOLVED immediately.`,
            },
            timestamps,
          };
        }

        if (!timestamps.clearCandidateAt) {
          timestamps.clearCandidateAt = currentTime;
          return { newState: 'FIRING', stateChanged: false, event: null, timestamps };
        }

        const recoveryElapsed = (currentTime.getTime() - timestamps.clearCandidateAt.getTime()) / 1000;
        if (recoveryElapsed >= recoveryDurationSeconds) {
          timestamps.resolvedAt = currentTime;
          timestamps.clearCandidateAt = null;
          timestamps.pendingSince = null;
          timestamps.firstBreachedAt = null;
          return {
            newState: 'INACTIVE',
            stateChanged: true,
            event: {
              eventType: 'RESOLVED',
              message: `Metric remained healthy for ${Math.round(recoveryElapsed)}s (>= ${recoveryDurationSeconds}s). Alert RESOLVED.`,
            },
            timestamps,
          };
        }

        return { newState: 'FIRING', stateChanged: false, event: null, timestamps };
      }

      default:
        return { newState: 'INACTIVE', stateChanged: false, event: null, timestamps };
    }
  }

  private async fetchPoints(
    orgId: string,
    envId: string,
    seriesId: string,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<RawPoint[]> {
    const pointsMap = new Map<string, RawPoint>();

    if (this.redis) {
      try {
        const hotKey = `telemetry:hot:${orgId}:${envId}:${seriesId}`;
        const raw = await this.redis.lrange(hotKey, 0, 99);
        for (const r of raw) {
          try {
            const parsed = JSON.parse(r);
            const ts = new Date(parsed.timestamp);
            if (ts >= windowStart && ts <= windowEnd) {
              const iso = ts.toISOString();
              if (!pointsMap.has(iso)) {
                pointsMap.set(iso, {
                  timestamp: ts,
                  value: parsed.value ?? parsed.doubleValue ?? 0,
                  bucketCounts: parsed.bucketCounts ?? null,
                  explicitBounds: parsed.explicitBounds ?? null,
                });
              }
            }
          } catch {
            // Ignore
          }
        }
      } catch {
        // Fallback to postgres
      }
    }

    const dbPoints = await this.prisma.metricPoint.findMany({
      where: {
        seriesId,
        timestamp: {
          gte: windowStart,
          lte: windowEnd,
        },
      },
      orderBy: { timestamp: 'asc' },
      take: 2000,
    });

    for (const p of dbPoints) {
      const iso = p.timestamp.toISOString();
      if (!pointsMap.has(iso)) {
        pointsMap.set(iso, {
          timestamp: p.timestamp,
          value: p.doubleValue ?? (p.intValue ? Number(p.intValue) : 0),
          bucketCounts: p.bucketCounts ? (p.bucketCounts as number[]) : null,
          explicitBounds: p.explicitBounds ? (p.explicitBounds as number[]) : null,
        });
      }
    }

    if (pointsMap.size === 0) {
      const rollups = await this.prisma.metricRollupMinute.findMany({
        where: {
          seriesId,
          bucketMinute: {
            gte: windowStart,
            lte: windowEnd,
          },
        },
        orderBy: { bucketMinute: 'asc' },
        take: 500,
      });

      for (const r of rollups) {
        pointsMap.set(r.bucketMinute.toISOString(), {
          timestamp: r.bucketMinute,
          value: r.avg,
        });
      }
    }

    const sorted = Array.from(pointsMap.values());
    sorted.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    return sorted;
  }

  private matchesFilters(attributes: Record<string, any>, filters?: MetricSeriesFilter[]): boolean {
    if (!filters || filters.length === 0) return true;
    for (const f of filters) {
      const attrVal = attributes[f.key] !== undefined ? String(attributes[f.key]) : '';
      if (f.operator === 'EQUALS' && attrVal !== f.value) return false;
      if (f.operator === 'NOT_EQUALS' && attrVal === f.value) return false;
    }
    return true;
  }

  private computeFingerprint(
    orgId: string,
    ruleId: string,
    svcId: string,
    envId: string,
    mode: 'PER_SERIES' | 'AGGREGATE_SERIES',
    seriesId?: string,
  ): string {
    const target = mode === 'AGGREGATE_SERIES' ? 'aggregate' : `series:${seriesId ?? 'unknown'}`;
    const raw = `org:${orgId}|rule:${ruleId}|svc:${svcId}|env:${envId}|target:${target}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  private async releaseLock(key: string, token: string): Promise<void> {
    if (!this.redis) return;
    const luaScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    try {
      await this.redis.eval(luaScript, 1, key, token);
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.warn(`[AlertWorker] Failed to release Redis lock ${key}:`, err.message);
    }
  }
}

