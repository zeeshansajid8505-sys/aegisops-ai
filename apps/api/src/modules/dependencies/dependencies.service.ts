import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import type {
  DependencySummary,
  DependencyGraph,
  DependencyNode,
  DependencyEdge,
  ServiceDependenciesResponse,
  ServiceSummary,
} from '@aegisops/types';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityLoggerService } from '../security/security-logger.service';
import { CreateDependencyDto } from './dto/create-dependency.dto';
import { wouldCreateCycle } from './cycle-detector';
import { aggregateServiceHealth } from '../health-probes/health-aggregation';

@Injectable()
export class DependenciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityLogger: SecurityLoggerService,
  ) {}

  async createDependency(
    organizationId: string,
    dto: CreateDependencyDto,
  ): Promise<DependencySummary> {
    if (dto.sourceServiceId === dto.targetServiceId) {
      throw new BadRequestException('A service cannot depend on itself (self-dependency rejected)');
    }

    // Verify both services exist and belong to the specified organization
    const [sourceService, targetService] = await Promise.all([
      this.prisma.service.findFirst({
        where: { id: dto.sourceServiceId, organizationId },
      }),
      this.prisma.service.findFirst({
        where: { id: dto.targetServiceId, organizationId },
      }),
    ]);

    if (!sourceService) {
      throw new NotFoundException(`Source service not found in this organization`);
    }
    if (!targetService) {
      throw new NotFoundException(`Target service not found in this organization`);
    }

    // Check for duplicate dependency edge
    const existing = await this.prisma.serviceDependency.findUnique({
      where: {
        organizationId_sourceServiceId_targetServiceId: {
          organizationId,
          sourceServiceId: dto.sourceServiceId,
          targetServiceId: dto.targetServiceId,
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Dependency relationship already exists between these services`);
    }

    // Graph cycle detection: verify inside transaction
    const dependency = await this.prisma.$transaction(async (tx) => {
      const allEdges = await tx.serviceDependency.findMany({
        where: { organizationId },
        select: {
          sourceServiceId: true,
          targetServiceId: true,
        },
      });

      if (wouldCreateCycle(allEdges, dto.sourceServiceId, dto.targetServiceId)) {
        throw new BadRequestException(
          `Circular dependency detected: adding "${sourceService.name}" -> "${targetService.name}" would create a cycle in the service graph`,
        );
      }

      return tx.serviceDependency.create({
        data: {
          organizationId,
          sourceServiceId: dto.sourceServiceId,
          targetServiceId: dto.targetServiceId,
          dependencyType: dto.dependencyType || 'SYNCHRONOUS',
          isCritical: dto.isCritical ?? false,
          description: dto.description?.trim(),
        },
        include: {
          sourceService: {
            select: { id: true, name: true, slug: true, tier: true },
          },
          targetService: {
            select: { id: true, name: true, slug: true, tier: true },
          },
        },
      });
    });

    this.securityLogger.logEvent({
      event: 'SERVICE_DEPENDENCY_CREATED',
      organizationId,
      details: {
        dependencyId: dependency.id,
        source: dependency.sourceServiceId,
        target: dependency.targetServiceId,
        isCritical: dependency.isCritical,
      },
    });

    return {
      id: dependency.id,
      organizationId: dependency.organizationId,
      sourceServiceId: dependency.sourceServiceId,
      targetServiceId: dependency.targetServiceId,
      sourceService: {
        id: dependency.sourceService.id,
        name: dependency.sourceService.name,
        slug: dependency.sourceService.slug,
        tier: dependency.sourceService.tier as any,
        healthStatus: 'UNKNOWN',
      },
      targetService: {
        id: dependency.targetService.id,
        name: dependency.targetService.name,
        slug: dependency.targetService.slug,
        tier: dependency.targetService.tier as any,
        healthStatus: 'UNKNOWN',
      },
      dependencyType: dependency.dependencyType as any,
      isCritical: dependency.isCritical,
      description: dependency.description,
      createdAt: dependency.createdAt.toISOString(),
    };
  }

  async listDependencies(organizationId: string): Promise<DependencySummary[]> {
    const dependencies = await this.prisma.serviceDependency.findMany({
      where: { organizationId },
      include: {
        sourceService: {
          select: { id: true, name: true, slug: true, tier: true },
        },
        targetService: {
          select: { id: true, name: true, slug: true, tier: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return dependencies.map((d) => ({
      id: d.id,
      organizationId: d.organizationId,
      sourceServiceId: d.sourceServiceId,
      targetServiceId: d.targetServiceId,
      sourceService: {
        id: d.sourceService.id,
        name: d.sourceService.name,
        slug: d.sourceService.slug,
        tier: d.sourceService.tier as any,
        healthStatus: 'UNKNOWN',
      },
      targetService: {
        id: d.targetService.id,
        name: d.targetService.name,
        slug: d.targetService.slug,
        tier: d.targetService.tier as any,
        healthStatus: 'UNKNOWN',
      },
      dependencyType: d.dependencyType as any,
      isCritical: d.isCritical,
      description: d.description,
      createdAt: d.createdAt.toISOString(),
    }));
  }

  async deleteDependency(
    organizationId: string,
    dependencyId: string,
  ): Promise<{ success: boolean; message: string }> {
    const dep = await this.prisma.serviceDependency.findFirst({
      where: { id: dependencyId, organizationId },
    });

    if (!dep) {
      throw new NotFoundException(`Dependency relationship not found in this organization`);
    }

    await this.prisma.serviceDependency.delete({
      where: { id: dependencyId },
    });

    this.securityLogger.logEvent({
      event: 'SERVICE_DEPENDENCY_DELETED',
      organizationId,
      details: { dependencyId, source: dep.sourceServiceId, target: dep.targetServiceId },
    });

    return { success: true, message: `Dependency relationship deleted successfully` };
  }

  async getServiceDependencies(
    organizationId: string,
    serviceId: string,
  ): Promise<ServiceDependenciesResponse> {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, organizationId },
    });

    if (!service) {
      throw new NotFoundException(`Service not found in this organization`);
    }

    const [upstreamEdges, downstreamEdges] = await Promise.all([
      // Upstream: services that this service relies on (source = serviceId)
      this.prisma.serviceDependency.findMany({
        where: { sourceServiceId: serviceId, organizationId },
        include: {
          targetService: {
            include: {
              ownerTeam: true,
              environments: {
                include: {
                  healthProbes: {
                    include: { state: true },
                  },
                },
              },
            },
          },
        },
      }),
      // Downstream: services that rely on this service (target = serviceId)
      this.prisma.serviceDependency.findMany({
        where: { targetServiceId: serviceId, organizationId },
        include: {
          sourceService: {
            include: {
              ownerTeam: true,
              environments: {
                include: {
                  healthProbes: {
                    include: { state: true },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    const formatSummary = (s: any): ServiceSummary => ({
      id: s.id,
      organizationId: s.organizationId,
      name: s.name,
      slug: s.slug,
      description: s.description,
      serviceType: s.serviceType,
      tier: s.tier,
      lifecycleStatus: s.lifecycleStatus,
      ownerTeamId: s.ownerTeamId,
      ownerTeam: s.ownerTeam,
      healthStatus: aggregateServiceHealth(s.environments),
      environmentCount: s.environments?.length || 0,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    });

    return {
      upstream: upstreamEdges.map((e) => formatSummary(e.targetService)),
      downstream: downstreamEdges.map((e) => formatSummary(e.sourceService)),
    };
  }

  async getDependencyGraph(organizationId: string): Promise<DependencyGraph> {
    const [services, edges] = await Promise.all([
      this.prisma.service.findMany({
        where: { organizationId },
        include: {
          ownerTeam: {
            select: { name: true },
          },
          environments: {
            include: {
              healthProbes: {
                include: { state: true },
              },
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.serviceDependency.findMany({
        where: { organizationId },
        select: {
          id: true,
          sourceServiceId: true,
          targetServiceId: true,
          dependencyType: true,
          isCritical: true,
        },
      }),
    ]);

    const nodes: DependencyNode[] = services.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      tier: s.tier as any,
      serviceType: s.serviceType as any,
      healthStatus: aggregateServiceHealth(s.environments as any),
      ownerTeamName: s.ownerTeam?.name || null,
    }));

    const formattedEdges: DependencyEdge[] = edges.map((e) => ({
      id: e.id,
      source: e.sourceServiceId,
      target: e.targetServiceId,
      dependencyType: e.dependencyType as any,
      isCritical: e.isCritical,
    }));

    return {
      nodes,
      edges: formattedEdges,
    };
  }
}

