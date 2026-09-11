import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import type { MembershipSummary, UserRole } from '@aegisops/types';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityLoggerService } from '../security/security-logger.service';
import { UpdateMemberRoleDto } from './dto/update-role.dto';

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityLogger: SecurityLoggerService,
  ) {}

  async listMembers(organizationId: string): Promise<MembershipSummary[]> {
    const members = await this.prisma.membership.findMany({
      where: { organizationId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return members.map((m) => ({
      id: m.id,
      userId: m.userId,
      organizationId: m.organizationId,
      role: m.role as UserRole,
      createdAt: m.createdAt.toISOString(),
      user: m.user,
    }));
  }

  async updateMemberRole(
    callerUserId: string,
    callerRole: UserRole,
    organizationId: string,
    membershipId: string,
    dto: UpdateMemberRoleDto,
  ): Promise<MembershipSummary> {
    const targetMembership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
    });

    if (!targetMembership || targetMembership.organizationId !== organizationId) {
      throw new NotFoundException('Membership record not found in this organization');
    }

    const currentRole = targetMembership.role as UserRole;
    const targetRole = dto.role;

    if (currentRole === targetRole) {
      return {
        id: targetMembership.id,
        userId: targetMembership.userId,
        organizationId: targetMembership.organizationId,
        role: currentRole,
        createdAt: targetMembership.createdAt.toISOString(),
      };
    }

    // RBAC Rule 1: Only OWNER can grant the OWNER role
    if (targetRole === 'OWNER' && callerRole !== 'OWNER') {
      throw new ForbiddenException('Only an organization OWNER may grant the OWNER role');
    }

    // RBAC Rule 2: Only OWNER can modify or demote an OWNER
    if (currentRole === 'OWNER' && callerRole !== 'OWNER') {
      throw new ForbiddenException('Only an organization OWNER may modify another OWNER role');
    }

    // RBAC Rule 3: Last OWNER safety guard — an organization can NEVER be left without an OWNER
    if (currentRole === 'OWNER' && targetRole !== 'OWNER') {
      const ownerCount = await this.prisma.membership.count({
        where: { organizationId, role: 'OWNER' },
      });

      if (ownerCount <= 1) {
        throw new ForbiddenException(
          'Cannot demote the last remaining OWNER of the organization. Transfer or grant ownership to another member first.',
        );
      }
    }

    const updated = await this.prisma.membership.update({
      where: { id: membershipId },
      data: { role: targetRole as any },
      include: {
        user: {
          select: { id: true, email: true, displayName: true },
        },
      },
    });

    this.securityLogger.logEvent({
      type: 'ROLE_CHANGED',
      userId: callerUserId,
      organizationId,
      targetUserId: updated.userId,
      details: { previousRole: currentRole, newRole: targetRole },
    });

    return {
      id: updated.id,
      userId: updated.userId,
      organizationId: updated.organizationId,
      role: updated.role as UserRole,
      createdAt: updated.createdAt.toISOString(),
      user: updated.user,
    };
  }

  async removeMember(
    callerUserId: string,
    callerRole: UserRole,
    organizationId: string,
    membershipId: string,
  ): Promise<{ message: string }> {
    const targetMembership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
    });

    if (!targetMembership || targetMembership.organizationId !== organizationId) {
      throw new NotFoundException('Membership record not found in this organization');
    }

    const targetRole = targetMembership.role as UserRole;
    const isSelfRemoval = targetMembership.userId === callerUserId;

    // RBAC Rule: Only an OWNER can remove an OWNER (even if caller is ADMIN)
    if (targetRole === 'OWNER' && callerRole !== 'OWNER' && !isSelfRemoval) {
      throw new ForbiddenException('Only an organization OWNER can remove another OWNER');
    }

    // Last OWNER safety guard: Last OWNER cannot be removed or remove themselves
    if (targetRole === 'OWNER') {
      const ownerCount = await this.prisma.membership.count({
        where: { organizationId, role: 'OWNER' },
      });

      if (ownerCount <= 1) {
        throw new ForbiddenException(
          'Cannot remove the last remaining OWNER of the organization. Promote another member to OWNER before leaving.',
        );
      }
    }

    await this.prisma.membership.delete({
      where: { id: membershipId },
    });

    this.securityLogger.logEvent({
      type: 'MEMBER_REMOVED',
      userId: callerUserId,
      organizationId,
      targetUserId: targetMembership.userId,
      details: { role: targetRole, isSelfRemoval },
    });

    return { message: 'Member successfully removed from organization' };
  }
}