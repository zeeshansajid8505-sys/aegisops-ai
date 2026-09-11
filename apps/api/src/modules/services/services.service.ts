import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import type {
  ServiceSummary,
  ServiceDetail,
  EnvironmentSummary,
} from '@aegisops/types';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityLoggerService } from '../security/security-logger.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { UpdateServiceLifecycleDto } from './dto/update-lifecycle.dto';
import { ServiceFilterDto } from './dto/service-filter.dto';
import {
  aggregateServiceHealth,
  aggregateEnvironmentHealth,
} from '../health-probes/health-aggregation';

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityLogger: SecurityLoggerService,
  ) {}

  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 40);
    const suffix = crypto.randomBytes(3).toString('hex');
    return `${base}-${suffix}`;
  }

  async listServices(
    organizationId: string,
    query: ServiceFilterDto,
  ): Promise<{ items: ServiceSummary[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = { organizationId };

    if (query.tier) {
      where.tier = query.tier;
    }
    if (query.serviceType) {
      where.serviceType = query.serviceType;
    }
    if (query.lifecycleStatus) {
      where.lifecycleStatus = query.lifecycleStatus;
    }
    if (query.ownerTeamId) {
      where.ownerTeamId = query.ownerTeamId;
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { slug: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [rawServices, total] = await Promise.all([
      this.prisma.service.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          ownerTeam: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          environments: {
            select: {
              id: true,
              isProduction: true,
              isActive: true,
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
          },
        },
      }),
      this.prisma.service.count({ where }),
    ]);

    let items: ServiceSummary[] = rawServices.map((s) => {
      const healthStatus = aggregateServiceHealth(s.environments as any);
      return {
        id: s.id,
        organizationId: s.organizationId,
        name: s.name,
        slug: s.slug,
        description: s.description,
        serviceType: s.serviceType as any,
        tier: s.tier as any,
        lifecycleStatus: s.lifecycleStatus as any,
        ownerTeamId: s.ownerTeamId,
        ownerTeam: s.ownerTeam,
        healthStatus,
        environmentCount: s.environments.length,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      };
    });

    if (query.healthStatus) {
      items = items.filter((i) => i.healthStatus === query.healthStatus);
    }

    return {
      items,
      total,
      page,
      limit,
    };
  }

  async getService(organizationId: string, serviceId: string): Promise<ServiceDetail> {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, organizationId },
      include: {
        ownerTeam: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        environments: {
          orderBy: { isProduction: 'desc' },
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
        },
        _count: {
          select: {
            dependencies: true,
            dependents: true,
          },
        },
      },
    });

    if (!service) {
      throw new NotFoundException(`Service not found in this organization`);
    }

    const healthStatus = aggregateServiceHealth(service.environments as any);

    const environmentSummaries: EnvironmentSummary[] = service.environments.map((e) => ({
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

    return {
      id: service.id,
      organizationId: service.organizationId,
      name: service.name,
      slug: service.slug,
      description: service.description,
      serviceType: service.serviceType as any,
      tier: service.tier as any,
      lifecycleStatus: service.lifecycleStatus as any,
      ownerTeamId: service.ownerTeamId,
      ownerTeam: service.ownerTeam,
      healthStatus,
      environmentCount: service.environments.length,
      environments: environmentSummaries,
      upstreamCount: service._count.dependencies,
      downstreamCount: service._count.dependents,
      repositoryUrl: service.repositoryUrl,
      documentationUrl: service.documentationUrl,
      createdAt: service.createdAt.toISOString(),
      updatedAt: service.updatedAt.toISOString(),
    };
  }

  async createService(
    organizationId: string,
    userId: string,
    dto: CreateServiceDto,
  ): Promise<ServiceDetail> {
    // Cross-tenant verification: owner team must belong to the same organization
    if (dto.ownerTeamId) {
      const team = await this.prisma.team.findFirst({
        where: { id: dto.ownerTeamId, organizationId },
      });
      if (!team) {
        throw new BadRequestException(`Owner team does not exist in this organization`);
      }
    }

    const slug = dto.slug || this.generateSlug(dto.name);

    const existing = await this.prisma.service.findUnique({
      where: {
        organizationId_slug: {
          organizationId,
          slug,
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Service with slug "${slug}" already exists in this organization`);
    }

    const service = await this.prisma.service.create({
      data: {
        organizationId,
        name: dto.name.trim(),
        slug,
        description: dto.description?.trim(),
        serviceType: dto.serviceType,
        tier: dto.tier,
        lifecycleStatus: dto.lifecycleStatus || 'ACTIVE',
        ownerTeamId: dto.ownerTeamId,
        repositoryUrl: dto.repositoryUrl?.trim(),
        documentationUrl: dto.documentationUrl?.trim(),
        createdByUserId: userId,
      },
      include: {
        ownerTeam: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        environments: true,
        _count: {
          select: {
            dependencies: true,
            dependents: true,
          },
        },
      },
    });

    this.securityLogger.logEvent({
      event: 'SERVICE_CREATED',
      organizationId,
      userId,
      details: { serviceId: service.id, name: service.name, slug: service.slug },
    });

    return {
      id: service.id,
      organizationId: service.organizationId,
      name: service.name,
      slug: service.slug,
      description: service.description,
      serviceType: service.serviceType as any,
      tier: service.tier as any,
      lifecycleStatus: service.lifecycleStatus as any,
      ownerTeamId: service.ownerTeamId,
      ownerTeam: service.ownerTeam,
      healthStatus: 'UNKNOWN',
      environmentCount: 0,
      environments: [],
      upstreamCount: 0,
      downstreamCount: 0,
      repositoryUrl: service.repositoryUrl,
      documentationUrl: service.documentationUrl,
      createdAt: service.createdAt.toISOString(),
      updatedAt: service.updatedAt.toISOString(),
    };
  }

  async updateService(
    organizationId: string,
    serviceId: string,
    dto: UpdateServiceDto,
  ): Promise<ServiceDetail> {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, organizationId },
    });

    if (!service) {
      throw new NotFoundException(`Service not found in this organization`);
    }

    if (dto.ownerTeamId !== undefined && dto.ownerTeamId !== null) {
      const team = await this.prisma.team.findFirst({
        where: { id: dto.ownerTeamId, organizationId },
      });
      if (!team) {
        throw new BadRequestException(`Owner team does not exist in this organization`);
      }
    }

    await this.prisma.service.update({
      where: { id: serviceId },
      data: {
        name: dto.name?.trim(),
        description: dto.description?.trim(),
        serviceType: dto.serviceType,
        tier: dto.tier,
        ownerTeamId: dto.ownerTeamId,
        repositoryUrl: dto.repositoryUrl?.trim(),
        documentationUrl: dto.documentationUrl?.trim(),
      },
    });

    return this.getService(organizationId, serviceId);
  }

  async updateLifecycle(
    organizationId: string,
    serviceId: string,
    dto: UpdateServiceLifecycleDto,
  ): Promise<ServiceDetail> {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, organizationId },
    });

    if (!service) {
      throw new NotFoundException(`Service not found in this organization`);
    }

    await this.prisma.service.update({
      where: { id: serviceId },
      data: {
        lifecycleStatus: dto.lifecycleStatus,
      },
    });

    this.securityLogger.logEvent({
      event: 'SERVICE_LIFECYCLE_UPDATED',
      organizationId,
      details: { serviceId, oldStatus: service.lifecycleStatus, newStatus: dto.lifecycleStatus },
    });

    return this.getService(organizationId, serviceId);
  }

  async deleteService(
    organizationId: string,
    serviceId: string,
  ): Promise<{ success: boolean; message: string }> {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, organizationId },
      include: {
        _count: {
          select: {
            dependencies: true,
            dependents: true,
            healthProbes: true,
          },
        },
      },
    });

    if (!service) {
      throw new NotFoundException(`Service not found in this organization`);
    }

    if (service._count.dependencies > 0 || service._count.dependents > 0) {
      throw new BadRequestException(
        `Cannot delete service "${service.name}" with active dependency relationships (${service._count.dependencies} upstream, ${service._count.dependents} downstream). Remove dependencies first or retire the service.`,
      );
    }

    await this.prisma.service.delete({
      where: { id: serviceId },
    });

    this.securityLogger.logEvent({
      event: 'SERVICE_DELETED',
      organizationId,
      details: { serviceId, name: service.name },
    });

    return { success: true, message: `Service "${service.name}" deleted successfully` };
  }
}

