import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueryAlertsDto } from './dto/query-alerts.dto';
import { mapPrismaSeverityToType, mapTypeSeverityToPrisma } from './utils/severity-mapper';
import type {
  AlertInstanceSummary,
  AlertInstanceDetail,
  AlertEventSummary,
} from '@aegisops/types';

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAlerts(
    organizationId: string,
    query: QueryAlertsDto,
  ): Promise<{ alerts: AlertInstanceSummary[]; total: number }> {
    const where: any = {
      organizationId,
      ...(query.serviceId ? { serviceId: query.serviceId } : {}),
      ...(query.environmentId ? { environmentId: query.environmentId } : {}),
      ...(query.ruleId ? { ruleId: query.ruleId } : {}),
      ...(query.state
        ? { state: query.state }
        : { state: { in: ['PENDING', 'FIRING'] } }), // Default to active alerts
      ...(query.severity
        ? { rule: { severity: mapTypeSeverityToPrisma(query.severity) } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { rule: { name: { contains: query.search, mode: 'insensitive' } } },
              { service: { name: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [instances, total] = await Promise.all([
      this.prisma.alertInstance.findMany({
        where,
        include: {
          rule: true,
          service: { select: { name: true } },
          environment: { select: { name: true } },
          metricSeries: { select: { attributes: true } },
        },
        orderBy: [{ state: 'asc' }, { lastStateChangeAt: 'desc' }],
        take: query.limit ?? 50,
        skip: query.offset ?? 0,
      }),
      this.prisma.alertInstance.count({ where }),
    ]);

    return {
      alerts: instances.map((inst) => this.mapInstanceToSummary(inst)),
      total,
    };
  }

  async getAlert(
    organizationId: string,
    alertInstanceId: string,
  ): Promise<AlertInstanceDetail> {
    const instance = await this.prisma.alertInstance.findFirst({
      where: { id: alertInstanceId, organizationId },
      include: {
        rule: {
          include: {
            service: { select: { name: true } },
            environment: { select: { name: true } },
            metricDefinition: { select: { name: true } },
          },
        },
        service: { select: { name: true } },
        environment: { select: { name: true } },
        metricSeries: { select: { attributes: true } },
        events: {
          orderBy: { occurredAt: 'desc' },
          take: 50,
        },
        evaluations: {
          orderBy: { evaluatedAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!instance) {
      throw new NotFoundException(`Alert instance '${alertInstanceId}' not found`);
    }

    const summary = this.mapInstanceToSummary(instance);

    return {
      ...summary,
      recentEvents: instance.events.map((e) => ({
        id: e.id,
        organizationId: e.organizationId,
        ruleId: e.ruleId,
        alertInstanceId: e.alertInstanceId,
        eventType: e.eventType,
        fromState: e.fromState,
        toState: e.toState,
        observedValue: e.observedValue,
        thresholdValue: e.thresholdValue,
        message: e.message,
        metadata: (e.metadata as Record<string, any>) ?? null,
        occurredAt: e.occurredAt.toISOString(),
      })),
      recentEvaluations: instance.evaluations.map((e) => ({
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

  async getAlertEvents(
    organizationId: string,
    alertInstanceId: string,
    limit = 50,
  ): Promise<AlertEventSummary[]> {
    const instance = await this.prisma.alertInstance.findFirst({
      where: { id: alertInstanceId, organizationId },
    });

    if (!instance) {
      throw new NotFoundException(`Alert instance '${alertInstanceId}' not found`);
    }

    const events = await this.prisma.alertEvent.findMany({
      where: { alertInstanceId, organizationId },
      orderBy: { occurredAt: 'desc' },
      take: Math.min(100, Math.max(1, limit)),
    });

    return events.map((e) => ({
      id: e.id,
      organizationId: e.organizationId,
      ruleId: e.ruleId,
      alertInstanceId: e.alertInstanceId,
      eventType: e.eventType,
      fromState: e.fromState,
      toState: e.toState,
      observedValue: e.observedValue,
      thresholdValue: e.thresholdValue,
      message: e.message,
      metadata: (e.metadata as Record<string, any>) ?? null,
      occurredAt: e.occurredAt.toISOString(),
    }));
  }

  private mapInstanceToSummary(inst: any): AlertInstanceSummary {
    return {
      id: inst.id,
      organizationId: inst.organizationId,
      ruleId: inst.ruleId,
      ruleName: inst.rule?.name,
      serviceId: inst.serviceId,
      serviceName: inst.service?.name,
      environmentId: inst.environmentId,
      environmentName: inst.environment?.name,
      metricSeriesId: inst.metricSeriesId,
      seriesAttributes: (inst.metricSeries?.attributes as Record<string, string>) ?? {},
      fingerprint: inst.fingerprint,
      severity: mapPrismaSeverityToType(inst.rule?.severity ?? 'SEV_3'),
      state: inst.state,
      currentValue: inst.currentValue,
      thresholdValue: inst.rule?.thresholdValue,
      comparisonOperator: inst.rule?.comparisonOperator,
      lastEvaluationResult: inst.lastEvaluationResult,
      firstBreachedAt: inst.firstBreachedAt?.toISOString() ?? null,
      pendingSince: inst.pendingSince?.toISOString() ?? null,
      firingStartedAt: inst.firingStartedAt?.toISOString() ?? null,
      lastBreachedAt: inst.lastBreachedAt?.toISOString() ?? null,
      clearCandidateAt: inst.clearCandidateAt?.toISOString() ?? null,
      resolvedAt: inst.resolvedAt?.toISOString() ?? null,
      lastEvaluatedAt: inst.lastEvaluatedAt.toISOString(),
      lastStateChangeAt: inst.lastStateChangeAt.toISOString(),
      createdAt: inst.createdAt.toISOString(),
      updatedAt: inst.updatedAt.toISOString(),
    };
  }
}

