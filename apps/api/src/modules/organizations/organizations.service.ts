import { Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import type { OrganizationSummary, UserRole } from '@aegisops/types';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityLoggerService } from '../security/security-logger.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@Injectable()
export class OrganizationsService {
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

  async listUserOrganizations(userId: string): Promise<Array<{ organization: OrganizationSummary; role: UserRole; membershipId: string }>> {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: {
        organization: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return memberships.map((m) => ({
      membershipId: m.id,
      role: m.role as UserRole,
      organization: {
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        createdAt: m.organization.createdAt.toISOString(),
        createdByUserId: m.organization.createdByUserId ?? undefined,
      },
    }));
  }

  async createOrganization(userId: string, dto: CreateOrganizationDto): Promise<OrganizationSummary> {
    const slug = this.generateSlug(dto.name);

    const { org } = await this.prisma.$transaction(async (tx) => {
      const newOrg = await tx.organization.create({
        data: {
          name: dto.name.trim(),
          slug,
          createdByUserId: userId,
        },
      });

      await tx.membership.create({
        data: {
          userId,
          organizationId: newOrg.id,
          role: 'OWNER',
        },
      });

      return { org: newOrg };
    });

    this.securityLogger.logEvent({
      type: 'ORGANIZATION_CREATED',
      userId,
      organizationId: org.id,
      details: { name: org.name, slug: org.slug },
    });

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      createdAt: org.createdAt.toISOString(),
      createdByUserId: org.createdByUserId ?? undefined,
    };
  }

  async getOrganizationDetails(organizationId: string): Promise<OrganizationSummary & { memberCount: number }> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        _count: {
          select: { memberships: true },
        },
      },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      createdAt: org.createdAt.toISOString(),
      createdByUserId: org.createdByUserId ?? undefined,
      memberCount: org._count.memberships,
    };
  }

  async updateOrganization(organizationId: string, dto: UpdateOrganizationDto): Promise<OrganizationSummary> {
    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      createdAt: updated.createdAt.toISOString(),
      createdByUserId: updated.createdByUserId ?? undefined,
    };
  }
}