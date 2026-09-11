import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import type { TeamSummary, TeamMemberSummary } from '@aegisops/types';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityLoggerService } from '../security/security-logger.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { AddTeamMemberDto } from './dto/add-team-member.dto';

@Injectable()
export class TeamsService {
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

  async listTeams(organizationId: string): Promise<TeamSummary[]> {
    const teams = await this.prisma.team.findMany({
      where: { organizationId },
      include: {
        _count: {
          select: {
            members: true,
            ownedServices: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return teams.map((t) => ({
      id: t.id,
      organizationId: t.organizationId,
      name: t.name,
      slug: t.slug,
      description: t.description,
      memberCount: t._count.members,
      ownedServiceCount: t._count.ownedServices,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }));
  }

  async getTeam(organizationId: string, teamId: string): Promise<TeamSummary> {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, organizationId },
      include: {
        _count: {
          select: {
            members: true,
            ownedServices: true,
          },
        },
      },
    });

    if (!team) {
      throw new NotFoundException(`Team not found in this organization`);
    }

    return {
      id: team.id,
      organizationId: team.organizationId,
      name: team.name,
      slug: team.slug,
      description: team.description,
      memberCount: team._count.members,
      ownedServiceCount: team._count.ownedServices,
      createdAt: team.createdAt.toISOString(),
      updatedAt: team.updatedAt.toISOString(),
    };
  }

  async createTeam(organizationId: string, dto: CreateTeamDto): Promise<TeamSummary> {
    const slug = dto.slug || this.generateSlug(dto.name);

    // Check slug collision in organization
    const existing = await this.prisma.team.findUnique({
      where: {
        organizationId_slug: {
          organizationId,
          slug,
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Team with slug "${slug}" already exists in this organization`);
    }

    const team = await this.prisma.team.create({
      data: {
        organizationId,
        name: dto.name.trim(),
        slug,
        description: dto.description?.trim(),
      },
      include: {
        _count: {
          select: {
            members: true,
            ownedServices: true,
          },
        },
      },
    });

    this.securityLogger.logEvent({
      event: 'TEAM_CREATED',
      organizationId,
      details: { teamId: team.id, name: team.name, slug: team.slug },
    });

    return {
      id: team.id,
      organizationId: team.organizationId,
      name: team.name,
      slug: team.slug,
      description: team.description,
      memberCount: team._count.members,
      ownedServiceCount: team._count.ownedServices,
      createdAt: team.createdAt.toISOString(),
      updatedAt: team.updatedAt.toISOString(),
    };
  }

  async updateTeam(
    organizationId: string,
    teamId: string,
    dto: UpdateTeamDto,
  ): Promise<TeamSummary> {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, organizationId },
    });

    if (!team) {
      throw new NotFoundException(`Team not found in this organization`);
    }

    const updated = await this.prisma.team.update({
      where: { id: teamId },
      data: {
        name: dto.name?.trim(),
        description: dto.description?.trim(),
      },
      include: {
        _count: {
          select: {
            members: true,
            ownedServices: true,
          },
        },
      },
    });

    return {
      id: updated.id,
      organizationId: updated.organizationId,
      name: updated.name,
      slug: updated.slug,
      description: updated.description,
      memberCount: updated._count.members,
      ownedServiceCount: updated._count.ownedServices,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async deleteTeam(organizationId: string, teamId: string): Promise<{ success: boolean; message: string }> {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, organizationId },
      include: {
        _count: {
          select: {
            ownedServices: true,
          },
        },
      },
    });

    if (!team) {
      throw new NotFoundException(`Team not found in this organization`);
    }

    if (team._count.ownedServices > 0) {
      throw new BadRequestException(
        `Cannot delete team "${team.name}" because it still owns ${team._count.ownedServices} service(s). Reassign service ownership first.`,
      );
    }

    await this.prisma.team.delete({
      where: { id: teamId },
    });

    this.securityLogger.logEvent({
      event: 'TEAM_DELETED',
      organizationId,
      details: { teamId, name: team.name },
    });

    return { success: true, message: `Team "${team.name}" deleted successfully` };
  }

  async listTeamMembers(organizationId: string, teamId: string): Promise<TeamMemberSummary[]> {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, organizationId },
    });

    if (!team) {
      throw new NotFoundException(`Team not found in this organization`);
    }

    const members = await this.prisma.teamMember.findMany({
      where: { teamId },
      include: {
        membership: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return members.map((m) => ({
      id: m.id,
      teamId: m.teamId,
      membershipId: m.membershipId,
      role: m.role as any,
      user: {
        id: m.membership.user.id,
        displayName: m.membership.user.displayName,
        email: m.membership.user.email,
      },
      createdAt: m.createdAt.toISOString(),
    }));
  }

  async addTeamMember(
    organizationId: string,
    teamId: string,
    dto: AddTeamMemberDto,
  ): Promise<TeamMemberSummary> {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, organizationId },
    });

    if (!team) {
      throw new NotFoundException(`Team not found in this organization`);
    }

    // Strict multi-tenant verification: membership MUST belong to the SAME organization
    const membership = await this.prisma.membership.findFirst({
      where: {
        id: dto.membershipId,
        organizationId,
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
      },
    });

    if (!membership) {
      throw new BadRequestException(
        `Membership does not exist or does not belong to this organization`,
      );
    }

    // Check for duplicate membership in team
    const existing = await this.prisma.teamMember.findUnique({
      where: {
        teamId_membershipId: {
          teamId,
          membershipId: dto.membershipId,
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Member is already assigned to this team`);
    }

    const member = await this.prisma.teamMember.create({
      data: {
        teamId,
        membershipId: dto.membershipId,
        role: dto.role || 'MEMBER',
      },
    });

    this.securityLogger.logEvent({
      event: 'TEAM_MEMBER_ADDED',
      organizationId,
      details: { teamId, membershipId: dto.membershipId, role: member.role },
    });

    return {
      id: member.id,
      teamId: member.teamId,
      membershipId: member.membershipId,
      role: member.role as any,
      user: {
        id: membership.user.id,
        displayName: membership.user.displayName,
        email: membership.user.email,
      },
      createdAt: member.createdAt.toISOString(),
    };
  }

  async removeTeamMember(
    organizationId: string,
    teamId: string,
    membershipId: string,
  ): Promise<{ success: boolean; message: string }> {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, organizationId },
    });

    if (!team) {
      throw new NotFoundException(`Team not found in this organization`);
    }

    const teamMember = await this.prisma.teamMember.findUnique({
      where: {
        teamId_membershipId: {
          teamId,
          membershipId,
        },
      },
    });

    if (!teamMember) {
      throw new NotFoundException(`Member not found in this team`);
    }

    await this.prisma.teamMember.delete({
      where: { id: teamMember.id },
    });

    return { success: true, message: `Member removed from team successfully` };
  }
}

