import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import type {
  HealthProbeSummary,
  HealthProbeRunSummary,
  ServiceHealthStatus,
} from '@aegisops/types';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityLoggerService } from '../security/security-logger.service';
import { ProbeExecutorService } from './probe-executor.service';
import { CreateHealthProbeDto } from './dto/create-health-probe.dto';
import { UpdateHealthProbeDto } from './dto/update-health-probe.dto';
import { QueryRunsDto } from './dto/query-runs.dto';
import { aggregateServiceHealth, aggregateEnvironmentHealth } from './health-aggregation';

@Injectable()
export class HealthProbesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityLogger: SecurityLoggerService,
    private readonly probeExecutor: ProbeExecutorService,
  ) {}

  async listProbes(
    organizationId: string,
    serviceId: string,
  ): Promise<HealthProbeSummary[]> {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, organizationId },
    });

    if (!service) {
      throw new NotFoundException(`Service not found in this organization`);
    }

    const probes = await this.prisma.healthProbe.findMany({
      where: { serviceId, organizationId },
      include: {
        environment: {
          select: { name: true },
        },
        state: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return probes.map((p) => ({
      id: p.id,
      organizationId: p.organizationId,
      serviceId: p.serviceId,
      environmentId: p.environmentId,
      environmentName: p.environment?.name,
      name: p.name,
      probeType: p.probeType as any,
      enabled: p.enabled,
      isCritical: p.isCritical,
      intervalSeconds: p.intervalSeconds,
      timeoutMs: p.timeoutMs,
      failureThreshold: p.failureThreshold,
      successThreshold: p.successThreshold,
      httpMethod: p.httpMethod,
      httpPath: p.httpPath,
      httpExpectedStatusMin: p.httpExpectedStatusMin,
      httpExpectedStatusMax: p.httpExpectedStatusMax,
      grpcHost: p.grpcHost,
      grpcService: p.grpcService,
      grpcUseTls: p.grpcUseTls,
      state: p.state
        ? {
            status: p.state.status as any,
            consecutiveSuccesses: p.state.consecutiveSuccesses,
            consecutiveFailures: p.state.consecutiveFailures,
            lastCheckedAt: p.state.lastCheckedAt?.toISOString(),
            lastSuccessfulAt: p.state.lastSuccessfulAt?.toISOString(),
            lastFailedAt: p.state.lastFailedAt?.toISOString(),
            lastLatencyMs: p.state.lastLatencyMs,
            lastFailureCode: p.state.lastFailureCode,
          }
        : null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));
  }

  async getProbe(
    organizationId: string,
    probeId: string,
  ): Promise<HealthProbeSummary> {
    const probe = await this.prisma.healthProbe.findFirst({
      where: { id: probeId, organizationId },
      include: {
        environment: {
          select: { name: true },
        },
        state: true,
      },
    });

    if (!probe) {
      throw new NotFoundException(`Health probe not found in this organization`);
    }

    return {
      id: probe.id,
      organizationId: probe.organizationId,
      serviceId: probe.serviceId,
      environmentId: probe.environmentId,
      environmentName: probe.environment?.name,
      name: probe.name,
      probeType: probe.probeType as any,
      enabled: probe.enabled,
      isCritical: probe.isCritical,
      intervalSeconds: probe.intervalSeconds,
      timeoutMs: probe.timeoutMs,
      failureThreshold: probe.failureThreshold,
      successThreshold: probe.successThreshold,
      httpMethod: probe.httpMethod,
      httpPath: probe.httpPath,
      httpExpectedStatusMin: probe.httpExpectedStatusMin,
      httpExpectedStatusMax: probe.httpExpectedStatusMax,
      grpcHost: probe.grpcHost,
      grpcService: probe.grpcService,
      grpcUseTls: probe.grpcUseTls,
      state: probe.state
        ? {
            status: probe.state.status as any,
            consecutiveSuccesses: probe.state.consecutiveSuccesses,
            consecutiveFailures: probe.state.consecutiveFailures,
            lastCheckedAt: probe.state.lastCheckedAt?.toISOString(),
            lastSuccessfulAt: probe.state.lastSuccessfulAt?.toISOString(),
            lastFailedAt: probe.state.lastFailedAt?.toISOString(),
            lastLatencyMs: probe.state.lastLatencyMs,
            lastFailureCode: probe.state.lastFailureCode,
          }
        : null,
      createdAt: probe.createdAt.toISOString(),
      updatedAt: probe.updatedAt.toISOString(),
    };
  }

  async createProbe(
    organizationId: string,
    serviceId: string,
    dto: CreateHealthProbeDto,
  ): Promise<HealthProbeSummary> {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, organizationId },
    });

    if (!service) {
      throw new NotFoundException(`Service not found in this organization`);
    }

    const environment = await this.prisma.serviceEnvironment.findFirst({
      where: { id: dto.environmentId, serviceId, organizationId },
    });

    if (!environment) {
      throw new BadRequestException(
        `Environment does not exist or does not belong to this service`,
      );
    }

    const intervalSeconds = dto.intervalSeconds ?? 30;
    const timeoutMs = dto.timeoutMs ?? 5000;

    if (timeoutMs > intervalSeconds * 1000) {
      throw new BadRequestException(
        `Probe timeout (${timeoutMs}ms) cannot exceed interval (${intervalSeconds}s)`,
      );
    }

    const probe = await this.prisma.$transaction(async (tx) => {
      const created = await tx.healthProbe.create({
        data: {
          organizationId,
          serviceId,
          environmentId: dto.environmentId,
          name: dto.name.trim(),
          probeType: dto.probeType,
          enabled: dto.enabled ?? true,
          isCritical: dto.isCritical ?? false,
          intervalSeconds,
          timeoutMs,
          failureThreshold: dto.failureThreshold ?? 3,
          successThreshold: dto.successThreshold ?? 2,
          httpMethod: dto.httpMethod || 'GET',
          httpPath: dto.httpPath || '/health',
          httpExpectedStatusMin: dto.httpExpectedStatusMin ?? 200,
          httpExpectedStatusMax: dto.httpExpectedStatusMax ?? 299,
          grpcHost: dto.grpcHost?.trim(),
          grpcService: dto.grpcService?.trim(),
          grpcUseTls: dto.grpcUseTls ?? false,
          nextRunAt: new Date(), // eligible immediately
        },
      });

      await tx.healthProbeState.create({
        data: {
          probeId: created.id,
          organizationId,
          status: 'UNKNOWN',
        },
      });

      return created;
    });

    this.securityLogger.logEvent({
      event: 'HEALTH_PROBE_CREATED',
      organizationId,
      details: { probeId: probe.id, serviceId, type: probe.probeType },
    });

    return this.getProbe(organizationId, probe.id);
  }

  async updateProbe(
    organizationId: string,
    probeId: string,
    dto: UpdateHealthProbeDto,
  ): Promise<HealthProbeSummary> {
    const probe = await this.prisma.healthProbe.findFirst({
      where: { id: probeId, organizationId },
    });

    if (!probe) {
      throw new NotFoundException(`Health probe not found in this organization`);
    }

    const intervalSeconds = dto.intervalSeconds ?? probe.intervalSeconds;
    const timeoutMs = dto.timeoutMs ?? probe.timeoutMs;

    if (timeoutMs > intervalSeconds * 1000) {
      throw new BadRequestException(
        `Probe timeout (${timeoutMs}ms) cannot exceed interval (${intervalSeconds}s)`,
      );
    }

    await this.prisma.healthProbe.update({
      where: { id: probeId },
      data: {
        name: dto.name?.trim(),
        enabled: dto.enabled,
        isCritical: dto.isCritical,
        intervalSeconds: dto.intervalSeconds,
        timeoutMs: dto.timeoutMs,
        failureThreshold: dto.failureThreshold,
        successThreshold: dto.successThreshold,
        httpMethod: dto.httpMethod,
        httpPath: dto.httpPath,
        httpExpectedStatusMin: dto.httpExpectedStatusMin,
        httpExpectedStatusMax: dto.httpExpectedStatusMax,
        grpcHost: dto.grpcHost?.trim(),
        grpcService: dto.grpcService?.trim(),
        grpcUseTls: dto.grpcUseTls,
      },
    });

    return this.getProbe(organizationId, probeId);
  }

  async deleteProbe(
    organizationId: string,
    probeId: string,
  ): Promise<{ success: boolean; message: string }> {
    const probe = await this.prisma.healthProbe.findFirst({
      where: { id: probeId, organizationId },
    });

    if (!probe) {
      throw new NotFoundException(`Health probe not found in this organization`);
    }

    await this.prisma.healthProbe.delete({
      where: { id: probeId },
    });

    this.securityLogger.logEvent({
      event: 'HEALTH_PROBE_DELETED',
      organizationId,
      details: { probeId, name: probe.name },
    });

    return { success: true, message: `Health probe "${probe.name}" deleted successfully` };
  }

  async runNow(
    organizationId: string,
    probeId: string,
  ): Promise<{ message: string; run: HealthProbeRunSummary }> {
    const probe = await this.prisma.healthProbe.findFirst({
      where: { id: probeId, organizationId },
    });

    if (!probe) {
      throw new NotFoundException(`Health probe not found in this organization`);
    }

    const { run } = await this.probeExecutor.executeAndRecordProbe(probeId, organizationId);

    return {
      message: 'Probe executed successfully',
      run: {
        id: run.id,
        organizationId: run.organizationId,
        probeId: run.probeId,
        serviceId: run.serviceId,
        environmentId: run.environmentId,
        status: run.status as any,
        startedAt: run.startedAt.toISOString(),
        completedAt: run.completedAt.toISOString(),
        latencyMs: run.latencyMs,
        httpStatusCode: run.httpStatusCode,
        failureCode: run.failureCode,
        failureMessage: run.failureMessage,
        createdAt: run.createdAt.toISOString(),
      },
    };
  }

  async listRuns(
    organizationId: string,
    probeId: string,
    query: QueryRunsDto,
  ): Promise<{ items: HealthProbeRunSummary[]; total: number; page: number; limit: number }> {
    const probe = await this.prisma.healthProbe.findFirst({
      where: { id: probeId, organizationId },
    });

    if (!probe) {
      throw new NotFoundException(`Health probe not found in this organization`);
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [runs, total] = await Promise.all([
      this.prisma.healthProbeRun.findMany({
        where: { probeId, organizationId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.healthProbeRun.count({
        where: { probeId, organizationId },
      }),
    ]);

    const items: HealthProbeRunSummary[] = runs.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      probeId: r.probeId,
      serviceId: r.serviceId,
      environmentId: r.environmentId,
      status: r.status as any,
      startedAt: r.startedAt.toISOString(),
      completedAt: r.completedAt.toISOString(),
      latencyMs: r.latencyMs,
      httpStatusCode: r.httpStatusCode,
      failureCode: r.failureCode,
      failureMessage: r.failureMessage,
      createdAt: r.createdAt.toISOString(),
    }));

    return {
      items,
      total,
      page,
      limit,
    };
  }

  async getServiceHealth(
    organizationId: string,
    serviceId: string,
  ): Promise<{
    serviceId: string;
    healthStatus: ServiceHealthStatus;
    environments: Array<{
      id: string;
      name: string;
      isProduction: boolean;
      healthStatus: ServiceHealthStatus;
    }>;
  }> {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, organizationId },
      include: {
        environments: {
          include: {
            healthProbes: {
              include: { state: true },
            },
          },
        },
      },
    });

    if (!service) {
      throw new NotFoundException(`Service not found in this organization`);
    }

    const healthStatus = aggregateServiceHealth(service.environments as any);
    const environments = service.environments.map((e) => ({
      id: e.id,
      name: e.name,
      isProduction: e.isProduction,
      healthStatus: aggregateEnvironmentHealth(e.healthProbes as any),
    }));

    return {
      serviceId,
      healthStatus,
      environments,
    };
  }
}

