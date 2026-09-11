import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AlertsQueueService } from './alerts-queue.service';
import { MetricWindowEvaluator } from './evaluator/metric-window-evaluator';
import { validateMetricCompatibility } from './evaluator/metric-compatibility';
import {
  mapPrismaSeverityToType,
  mapTypeSeverityToPrisma,
} from './utils/severity-mapper';
import { CreateAlertRuleDto } from './dto/create-alert-rule.dto';
import { UpdateAlertRuleDto } from './dto/update-alert-rule.dto';
import { QueryAlertRulesDto } from './dto/query-alert-rules.dto';
import { PreviewAlertRuleDto } from './dto/preview-alert-rule.dto';
import type {
  AlertRuleSummary,
  AlertRuleDetail,
  AlertPreviewResponse,
  AlertEvaluationSummary,
  MetricSeriesFilter,
} from '@aegisops/types';

@Injectable()
export class AlertRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: AlertsQueueService,
    private readonly windowEvaluator: MetricWindowEvaluator,
  ) {}

  async createRule(
    organizationId: string,
    serviceId: string,
    environmentId: string,
    userId: string,
    dto: CreateAlertRuleDto,
  ): Promise<AlertRuleSummary> {
    // 1. Verify Service belongs to Organization
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, organizationId },
    });
    if (!service) {
      throw new NotFoundException(`Service '${serviceId}' not found in organization`);
    }

    // 2. Verify Environment belongs to Service and Organization
    const env = await this.prisma.serviceEnvironment.findFirst({
      where: { id: environmentId, serviceId, organizationId },
    });
    if (!env) {
      throw new NotFoundException(`Environment '${environmentId}' not found for service`);
    }

    // 3. Verify MetricDefinition belongs to Service and Organization
    const metricDef = await this.prisma.metricDefinition.findFirst({
      where: { id: dto.metricDefinitionId, serviceId, organizationId },
    });
    if (!metricDef) {
      throw new NotFoundException(
        `Metric definition '${dto.metricDefinitionId}' not found for service`,
      );
    }

    // 4. Validate Metric Compatibility
    validateMetricCompatibility(dto.aggregation, {
      instrumentType: metricDef.instrumentType,
      isMonotonic: metricDef.isMonotonic,
    });

    // 5. Validate mode and reduction
    if (dto.evaluationMode === 'AGGREGATE_SERIES' && !dto.seriesReduction) {
      dto.seriesReduction = 'AVG';
    }

    const prismaSeverity = mapTypeSeverityToPrisma(dto.severity);
    const windowSeconds = dto.windowSeconds ?? 300;
    const evaluationIntervalSeconds = dto.evaluationIntervalSeconds ?? 60;
    const pendingDurationSeconds = dto.pendingDurationSeconds ?? 0;
    const recoveryDurationSeconds = dto.recoveryDurationSeconds ?? 0;
    const noDataPolicy = dto.noDataPolicy ?? 'IGNORE';
    const seriesFilters = (dto.seriesFilters ?? []).slice(0, 8);

    const rule = await this.prisma.alertRule.create({
      data: {
        organizationId,
        serviceId,
        environmentId,
        metricDefinitionId: dto.metricDefinitionId,
        name: dto.name,
        description: dto.description ?? null,
        severity: prismaSeverity,
        status: dto.status ?? 'ENABLED',
        evaluationMode: dto.evaluationMode,
        aggregation: dto.aggregation,
        seriesReduction: dto.seriesReduction ?? null,
        comparisonOperator: dto.comparisonOperator,
        thresholdValue: dto.thresholdValue,
        windowSeconds,
        evaluationIntervalSeconds,
        pendingDurationSeconds,
        recoveryDurationSeconds,
        noDataPolicy,
        seriesFilters: seriesFilters as any,
        createdByUserId: userId,
      },
      include: {
        service: { select: { name: true } },
        environment: { select: { name: true } },
        metricDefinition: { select: { name: true } },
      },
    });

    // 6. Schedule evaluation if ENABLED
    if (rule.status === 'ENABLED') {
      await this.queueService.scheduleRule(
        rule.id,
        organizationId,
        rule.evaluationIntervalSeconds,
      );
    }

    return this.mapRuleToSummary(rule);
  }

  async updateRule(
    organizationId: string,
    ruleId: string,
    dto: UpdateAlertRuleDto,
  ): Promise<AlertRuleSummary> {
    const existing = await this.prisma.alertRule.findFirst({
      where: { id: ruleId, organizationId },
      include: { metricDefinition: true },
    });

    if (!existing) {
      throw new NotFoundException(`Alert rule '${ruleId}' not found`);
    }

    // Check metric definition or aggregation changes
    let targetMetricDef = existing.metricDefinition;

    if (dto.metricDefinitionId && dto.metricDefinitionId !== existing.metricDefinitionId) {
      const found = await this.prisma.metricDefinition.findFirst({
        where: { id: dto.metricDefinitionId, serviceId: existing.serviceId, organizationId },
      });
      if (!found) {
        throw new NotFoundException(`Metric definition '${dto.metricDefinitionId}' not found`);
      }
      targetMetricDef = found;
    }

    const targetAggregation = dto.aggregation ?? existing.aggregation;
    validateMetricCompatibility(targetAggregation, {
      instrumentType: targetMetricDef.instrumentType,
      isMonotonic: targetMetricDef.isMonotonic,
    });

    const updated = await this.prisma.alertRule.update({
      where: { id: ruleId },
      data: {
        name: dto.name ?? undefined,
        description: dto.description !== undefined ? dto.description : undefined,
        metricDefinitionId: dto.metricDefinitionId ?? undefined,
        severity: dto.severity ? mapTypeSeverityToPrisma(dto.severity) : undefined,
        status: dto.status ?? undefined,
        evaluationMode: dto.evaluationMode ?? undefined,
        aggregation: dto.aggregation ?? undefined,
        seriesReduction:
          dto.seriesReduction !== undefined ? dto.seriesReduction : undefined,
        comparisonOperator: dto.comparisonOperator ?? undefined,
        thresholdValue: dto.thresholdValue ?? undefined,
        windowSeconds: dto.windowSeconds ?? undefined,
        evaluationIntervalSeconds: dto.evaluationIntervalSeconds ?? undefined,
        pendingDurationSeconds: dto.pendingDurationSeconds ?? undefined,
        recoveryDurationSeconds: dto.recoveryDurationSeconds ?? undefined,
        noDataPolicy: dto.noDataPolicy ?? undefined,
        seriesFilters: dto.seriesFilters ? (dto.seriesFilters.slice(0, 8) as any) : undefined,
      },
      include: {
        service: { select: { name: true } },
        environment: { select: { name: true } },
        metricDefinition: { select: { name: true } },
      },
    });

    // Reconcile scheduler
    await this.queueService.reconcileRuleSchedule(
      updated.id,
      organizationId,
      updated.status,
      updated.evaluationIntervalSeconds,
    );

    return this.mapRuleToSummary(updated);
  }

  async enableRule(organizationId: string, ruleId: string): Promise<AlertRuleSummary> {
    return this.updateRule(organizationId, ruleId, { status: 'ENABLED' });
  }

  async disableRule(organizationId: string, ruleId: string): Promise<AlertRuleSummary> {
    return this.updateRule(organizationId, ruleId, { status: 'DISABLED' });
  }

  async archiveRule(organizationId: string, ruleId: string): Promise<AlertRuleSummary> {
    const existing = await this.prisma.alertRule.findFirst({
      where: { id: ruleId, organizationId },
    });

    if (!existing) {
      throw new NotFoundException(`Alert rule '${ruleId}' not found`);
    }

    await this.queueService.removeRuleSchedule(ruleId);

    const archived = await this.prisma.alertRule.update({
      where: { id: ruleId },
      data: {
        status: 'ARCHIVED',
        archivedAt: new Date(),
      },
      include: {
        service: { select: { name: true } },
        environment: { select: { name: true } },
        metricDefinition: { select: { name: true } },
      },
    });

    return this.mapRuleToSummary(archived);
  }

  async listRules(
    organizationId: string,
    query: QueryAlertRulesDto,
  ): Promise<{ rules: AlertRuleSummary[]; total: number }> {
    const where: any = {
      organizationId,
      ...(query.serviceId ? { serviceId: query.serviceId } : {}),
      ...(query.environmentId ? { environmentId: query.environmentId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.severity ? { severity: mapTypeSeverityToPrisma(query.severity) } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rules, total] = await Promise.all([
      this.prisma.alertRule.findMany({
        where,
        include: {
          service: { select: { name: true } },
          environment: { select: { name: true } },
          metricDefinition: { select: { name: true } },
          instances: {
            where: { state: { in: ['PENDING', 'FIRING'] } },
            select: { id: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit ?? 50,
        skip: query.offset ?? 0,
      }),
      this.prisma.alertRule.count({ where }),
    ]);

    return {
      rules: rules.map((r) => this.mapRuleToSummary(r, r.instances?.length ?? 0)),
      total,
    };
  }

  async getRule(organizationId: string, ruleId: string): Promise<AlertRuleDetail> {
    const rule = await this.prisma.alertRule.findFirst({
      where: { id: ruleId, organizationId },
      include: {
        service: { select: { name: true } },
        environment: { select: { name: true } },
        metricDefinition: true,
        instances: {
          orderBy: { lastStateChangeAt: 'desc' },
          take: 20,
        },
        evaluations: {
          orderBy: { evaluatedAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!rule) {
      throw new NotFoundException(`Alert rule '${ruleId}' not found`);
    }

    const summary = this.mapRuleToSummary(rule);

    return {
      ...summary,
      metricUnit: rule.metricDefinition?.unit ?? null,
      metricInstrumentType: rule.metricDefinition?.instrumentType,
      instances: rule.instances.map((i) => ({
        id: i.id,
        organizationId: i.organizationId,
        ruleId: i.ruleId,
        ruleName: rule.name,
        serviceId: i.serviceId,
        serviceName: rule.service.name,
        environmentId: i.environmentId,
        environmentName: rule.environment.name,
        metricSeriesId: i.metricSeriesId,
        fingerprint: i.fingerprint,
        severity: summary.severity,
        state: i.state,
        currentValue: i.currentValue,
        thresholdValue: rule.thresholdValue,
        comparisonOperator: rule.comparisonOperator,
        lastEvaluationResult: i.lastEvaluationResult,
        firstBreachedAt: i.firstBreachedAt?.toISOString() ?? null,
        pendingSince: i.pendingSince?.toISOString() ?? null,
        firingStartedAt: i.firingStartedAt?.toISOString() ?? null,
        lastBreachedAt: i.lastBreachedAt?.toISOString() ?? null,
        clearCandidateAt: i.clearCandidateAt?.toISOString() ?? null,
        resolvedAt: i.resolvedAt?.toISOString() ?? null,
        lastEvaluatedAt: i.lastEvaluatedAt.toISOString(),
        lastStateChangeAt: i.lastStateChangeAt.toISOString(),
        createdAt: i.createdAt.toISOString(),
        updatedAt: i.updatedAt.toISOString(),
      })),
      recentEvaluations: rule.evaluations.map((e) => ({
        id: e.id,
        organizationId: e.organizationId,
        ruleId: e.ruleId,
        alertInstanceId: e.alertInstanceId,
        metricSeriesId: e.metricSeriesId,
        evaluationKey: e.evaluationKey,
        evaluatedAt: e.evaluatedAt.toISOString(),
        windowStart: e.windowStart.toISOString(),
        windowEnd: e.windowEnd.toISOString(),
        observedValue: e.observedValue,
        sampleCount: e.sampleCount,
        result: e.result,
        durationMs: e.durationMs,
        errorCode: e.errorCode,
        errorMessage: e.errorMessage,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }

  async evaluateNow(
    organizationId: string,
    ruleId: string,
  ): Promise<{ message: string; runId: string; jobId: string }> {
    const rule = await this.prisma.alertRule.findFirst({
      where: { id: ruleId, organizationId },
    });

    if (!rule) {
      throw new NotFoundException(`Alert rule '${ruleId}' not found`);
    }

    if (rule.status === 'ARCHIVED') {
      throw new BadRequestException('Cannot evaluate an archived rule');
    }

    const runId = crypto.randomUUID();
    const jobId = await this.queueService.enqueueManualEvaluation(
      rule.id,
      organizationId,
      runId,
    );

    return {
      message: 'Alert evaluation triggered successfully',
      runId,
      jobId,
    };
  }

  async previewRule(
    organizationId: string,
    dto: PreviewAlertRuleDto,
  ): Promise<AlertPreviewResponse> {
    const service = await this.prisma.service.findFirst({
      where: { id: dto.serviceId, organizationId },
    });
    if (!service) {
      throw new NotFoundException(`Service '${dto.serviceId}' not found`);
    }

    const env = await this.prisma.serviceEnvironment.findFirst({
      where: { id: dto.environmentId, serviceId: dto.serviceId, organizationId },
    });
    if (!env) {
      throw new NotFoundException(`Environment '${dto.environmentId}' not found`);
    }

    const metricDef = await this.prisma.metricDefinition.findFirst({
      where: { id: dto.metricDefinitionId, serviceId: dto.serviceId, organizationId },
    });
    if (!metricDef) {
      throw new NotFoundException(`Metric definition '${dto.metricDefinitionId}' not found`);
    }

    validateMetricCompatibility(dto.aggregation, {
      instrumentType: metricDef.instrumentType,
      isMonotonic: metricDef.isMonotonic,
    });

    // Run window evaluation against real telemetry without changing any state or saving alert instances
    const evalResult = await this.windowEvaluator.evaluate({
      organizationId,
      serviceId: dto.serviceId,
      environmentId: dto.environmentId,
      metricDefinitionId: dto.metricDefinitionId,
      windowSeconds: dto.windowSeconds ?? 300,
      aggregation: dto.aggregation,
      seriesReduction: dto.seriesReduction,
      comparisonOperator: dto.comparisonOperator,
      thresholdValue: dto.thresholdValue,
      evaluationMode: dto.evaluationMode,
      seriesFilters: dto.seriesFilters,
    });

    const isAggregate = dto.evaluationMode === 'AGGREGATE_SERIES';
    const overallBreach = isAggregate
      ? evalResult.aggregateResult?.breached ?? false
      : evalResult.seriesResults.some((sr) => sr.breached);

    const overallResult = isAggregate
      ? evalResult.aggregateResult?.result ?? 'NO_DATA'
      : evalResult.seriesResults.length === 0
      ? 'NO_DATA'
      : overallBreach
      ? 'BREACH'
      : 'OK';

    return {
      matchingSeriesCount: evalResult.seriesResults.length,
      windowStart: evalResult.windowStart.toISOString(),
      windowEnd: evalResult.windowEnd.toISOString(),
      totalSampleCount: evalResult.totalSampleCount,
      seriesResults: evalResult.seriesResults.map((sr) => ({
        seriesId: sr.seriesId,
        attributes: sr.attributes,
        sampleCount: sr.sampleCount,
        observedValue: sr.observedValue,
        breached: sr.breached,
      })),
      reducedValue: evalResult.aggregateResult?.observedValue ?? null,
      breached: overallBreach,
      result: overallResult,
    };
  }

  async getRuleEvaluations(
    organizationId: string,
    ruleId: string,
    limit = 50,
  ): Promise<AlertEvaluationSummary[]> {
    const rule = await this.prisma.alertRule.findFirst({
      where: { id: ruleId, organizationId },
    });

    if (!rule) {
      throw new NotFoundException(`Alert rule '${ruleId}' not found`);
    }

    const evaluations = await this.prisma.alertEvaluation.findMany({
      where: { ruleId, organizationId },
      orderBy: { evaluatedAt: 'desc' },
      take: Math.min(100, Math.max(1, limit)),
    });

    return evaluations.map((e) => ({
      id: e.id,
      organizationId: e.organizationId,
      ruleId: e.ruleId,
      alertInstanceId: e.alertInstanceId,
      metricSeriesId: e.metricSeriesId,
      evaluationKey: e.evaluationKey,
      evaluatedAt: e.evaluatedAt.toISOString(),
      windowStart: e.windowStart.toISOString(),
      windowEnd: e.windowEnd.toISOString(),
      observedValue: e.observedValue,
      sampleCount: e.sampleCount,
      result: e.result,
      durationMs: e.durationMs,
      errorCode: e.errorCode,
      errorMessage: e.errorMessage,
      createdAt: e.createdAt.toISOString(),
    }));
  }

  private mapRuleToSummary(rule: any, activeAlertCount = 0): AlertRuleSummary {
    return {
      id: rule.id,
      organizationId: rule.organizationId,
      serviceId: rule.serviceId,
      serviceName: rule.service?.name,
      environmentId: rule.environmentId,
      environmentName: rule.environment?.name,
      metricDefinitionId: rule.metricDefinitionId,
      metricName: rule.metricDefinition?.name,
      name: rule.name,
      description: rule.description,
      severity: mapPrismaSeverityToType(rule.severity),
      status: rule.status,
      evaluationMode: rule.evaluationMode,
      aggregation: rule.aggregation,
      seriesReduction: rule.seriesReduction,
      comparisonOperator: rule.comparisonOperator,
      thresholdValue: rule.thresholdValue,
      windowSeconds: rule.windowSeconds,
      evaluationIntervalSeconds: rule.evaluationIntervalSeconds,
      pendingDurationSeconds: rule.pendingDurationSeconds,
      recoveryDurationSeconds: rule.recoveryDurationSeconds,
      noDataPolicy: rule.noDataPolicy,
      seriesFilters: (rule.seriesFilters as MetricSeriesFilter[]) ?? [],
      activeAlertCount,
      lastEvaluatedAt: rule.lastEvaluatedAt?.toISOString() ?? null,
      lastSuccessfulEvaluationAt: rule.lastSuccessfulEvaluationAt?.toISOString() ?? null,
      lastEvaluationError: rule.lastEvaluationError,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
      archivedAt: rule.archivedAt?.toISOString() ?? null,
    };
  }
}
