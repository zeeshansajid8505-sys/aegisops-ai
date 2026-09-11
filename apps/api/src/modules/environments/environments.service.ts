import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import type { EnvironmentSummary } from '@aegisops/types';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityLoggerService } from '../security/security-logger.service';
import { CreateEnvironmentDto } from './dto/create-environment.dto';
import { UpdateEnvironmentDto } from './dto/update-environment.dto';
import { aggregateEnvironmentHealth } from '../health-probes/health-aggregation';

@Injectable()
export class EnvironmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityLogger: SecurityLoggerService,
  ) {}

  private generateKey(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 40);
  }

  async listEnvironments(
    organizationId: string,
    serviceId: string,
  ): Promise<EnvironmentSummary[]> {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, organizationId },
    });

    if (!service) {
      throw new NotFoundException(`Service not found in this organization`);
    }

    const envs = await this.prisma.serviceEnvironment.findMany({
      where: { serviceId, organizationId },
      include: {
        healthProbes: {
          select: {
            enabled: true,
            isCritical: true,
            state: {
              select: {
                status: true,
              },
            },
          },
        },
      },
      orderBy: { isProduction: 'desc' },
    });

    return envs.map((e) => ({
      id: e.id,
      organizationId: e.organizationId,
      serviceId: e.serviceId,
      name: e.name,
      key: e.key,
      kind: e.kind as any,
      baseUrl: e.baseUrl,
      isProduction: e.isProduction,
      isActive: e.isActive,
      healthStatus: aggregateEnvironmentHealth(e.healthProbes as any),
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    }));
  }

  async createEnvironment(
    organizationId: string,
    serviceId: string,
    dto: CreateEnvironmentDto,
  ): Promise<EnvironmentSummary> {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, organizationId },
    });

    if (!service) {
      throw new NotFoundException(`Service not found in this organization`);
    }

    const key = dto.key || this.generateKey(dto.name);

    const existing = await this.prisma.serviceEnvironment.findUnique({
      where: {
        serviceId_key: {
          serviceId,
          key,
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Environment with key "${key}" already exists for this service`);
    }

    const isProduction = dto.isProduction ?? (dto.kind === 'PRODUCTION');

    const env = await this.prisma.$transaction(async (tx) => {
      // If setting this environment as production, remove production flag from others for this service
      if (isProduction) {
        await tx.serviceEnvironment.updateMany({
          where: { serviceId, isProduction: true },
          data: { isProduction: false },
        });
      }

      return tx.serviceEnvironment.create({
        data: {
          organizationId,
          serviceId,
          name: dto.name.trim(),
          key,
          kind: dto.kind,
          baseUrl: dto.baseUrl?.trim(),
          isProduction,
          isActive: true,
        },
        include: {
          healthProbes: true,
        },
      });
    });

    this.securityLogger.logEvent({
      event: 'ENVIRONMENT_CREATED',
      organizationId,
      details: { serviceId, environmentId: env.id, name: env.name, key: env.key },
    });

    return {
      id: env.id,
      organizationId: env.organizationId,
      serviceId: env.serviceId,
      name: env.name,
      key: env.key,
      kind: env.kind as any,
      baseUrl: env.baseUrl,
      isProduction: env.isProduction,
      isActive: env.isActive,
      healthStatus: 'UNKNOWN',
      createdAt: env.createdAt.toISOString(),
      updatedAt: env.updatedAt.toISOString(),
    };
  }

  async updateEnvironment(
    organizationId: string,
    serviceId: string,
    environmentId: string,
    dto: UpdateEnvironmentDto,
  ): Promise<EnvironmentSummary> {
    const env = await this.prisma.serviceEnvironment.findFirst({
      where: { id: environmentId, serviceId, organizationId },
    });

    if (!env) {
      throw new NotFoundException(`Environment not found in this service`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.isProduction) {
        await tx.serviceEnvironment.updateMany({
          where: { serviceId, isProduction: true, NOT: { id: environmentId } },
          data: { isProduction: false },
        });
      }

      return tx.serviceEnvironment.update({
        where: { id: environmentId },
        data: {
          name: dto.name?.trim(),
          baseUrl: dto.baseUrl?.trim(),
          isProduction: dto.isProduction,
          isActive: dto.isActive,
        },
        include: {
          healthProbes: {
            select: {
              enabled: true,
              isCritical: true,
              state: {
                select: {
                  status: true,
                },
              },
            },
          },
        },
      });
    });

    return {
      id: updated.id,
      organizationId: updated.organizationId,
      serviceId: updated.serviceId,
      name: updated.name,
      key: updated.key,
      kind: updated.kind as any,
      baseUrl: updated.baseUrl,
      isProduction: updated.isProduction,
      isActive: updated.isActive,
      healthStatus: aggregateEnvironmentHealth(updated.healthProbes as any),
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async deleteEnvironment(
    organizationId: string,
    serviceId: string,
    environmentId: string,
  ): Promise<{ success: boolean; message: string }> {
    const env = await this.prisma.serviceEnvironment.findFirst({
      where: { id: environmentId, serviceId, organizationId },
      include: {
        _count: {
          select: {
            healthProbes: true,
          },
        },
      },
    });

    if (!env) {
      throw new NotFoundException(`Environment not found in this service`);
    }

    if (env._count.healthProbes > 0) {
      throw new BadRequestException(
        `Cannot delete environment "${env.name}" because it still has ${env._count.healthProbes} active health probe(s). Delete probes first.`,
      );
    }

    await this.prisma.serviceEnvironment.delete({
      where: { id: environmentId },
    });

    return { success: true, message: `Environment "${env.name}" deleted successfully` };
  }
}

