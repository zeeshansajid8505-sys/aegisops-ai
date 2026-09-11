import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import type { InvitationSummary, UserRole } from '@aegisops/types';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityLoggerService } from '../security/security-logger.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityLogger: SecurityLoggerService,
  ) {}

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async createInvitation(
    callerUserId: string,
    callerRole: UserRole,
    organizationId: string,
    dto: CreateInvitationDto,
  ): Promise<InvitationSummary & { inviteToken?: string; inviteUrl?: string }> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // RBAC: Only an OWNER can invite another OWNER
    if (dto.role === 'OWNER' && callerRole !== 'OWNER') {
      throw new ForbiddenException('Only an organization OWNER may invite another member as OWNER');
    }

    // Check if user is already a member
    const existingMember = await this.prisma.membership.findFirst({
      where: {
        organizationId,
        user: { normalizedEmail },
      },
    });

    if (existingMember) {
      throw new ConflictException('A user with this email is already a member of the organization');
    }

    // Revoke any existing active invitations for this email in this organization
    await this.prisma.organizationInvitation.updateMany({
      where: {
        organizationId,
        normalizedEmail,
        acceptedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invitation = await this.prisma.organizationInvitation.create({
      data: {
        organizationId,
        email: dto.email.trim(),
        normalizedEmail,
        role: dto.role as any,
        tokenHash,
        invitedByUserId: callerUserId,
        expiresAt,
      },
    });

    this.securityLogger.logEvent({
      type: 'INVITATION_CREATED',
      userId: callerUserId,
      organizationId,
      targetEmail: normalizedEmail,
      details: { role: dto.role },
    });

    const isDev = process.env['NODE_ENV'] !== 'production';
    const baseUrl = process.env['WEB_ORIGIN'] || 'http://localhost:3000';
    const inviteUrl = `${baseUrl}/invitations/accept?token=${rawToken}`;

    return {
      id: invitation.id,
      organizationId: invitation.organizationId,
      email: invitation.email,
      role: invitation.role as UserRole,
      invitedByUserId: invitation.invitedByUserId,
      expiresAt: invitation.expiresAt.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
      acceptedAt: invitation.acceptedAt ? invitation.acceptedAt.toISOString() : null,
      revokedAt: invitation.revokedAt ? invitation.revokedAt.toISOString() : null,
      // For development verification only, per prompt specifications
      ...(isDev ? { inviteToken: rawToken, inviteUrl } : {}),
    };
  }

  async listInvitations(organizationId: string): Promise<InvitationSummary[]> {
    const invites = await this.prisma.organizationInvitation.findMany({
      where: {
        organizationId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    return invites.map((inv) => ({
      id: inv.id,
      organizationId: inv.organizationId,
      email: inv.email,
      role: inv.role as UserRole,
      invitedByUserId: inv.invitedByUserId,
      expiresAt: inv.expiresAt.toISOString(),
      createdAt: inv.createdAt.toISOString(),
      acceptedAt: inv.acceptedAt ? inv.acceptedAt.toISOString() : null,
      revokedAt: inv.revokedAt ? inv.revokedAt.toISOString() : null,
    }));
  }

  async revokeInvitation(callerUserId: string, organizationId: string, invitationId: string): Promise<{ message: string }> {
    const invitation = await this.prisma.organizationInvitation.findUnique({
      where: { id: invitationId },
    });

    if (!invitation || invitation.organizationId !== organizationId) {
      throw new NotFoundException('Invitation not found in this organization');
    }

    if (invitation.revokedAt || invitation.acceptedAt) {
      throw new BadRequestException('Invitation is already inactive');
    }

    await this.prisma.organizationInvitation.update({
      where: { id: invitationId },
      data: { revokedAt: new Date() },
    });

    this.securityLogger.logEvent({
      type: 'INVITATION_REVOKED',
      userId: callerUserId,
      organizationId,
      details: { invitationId },
    });

    return { message: 'Invitation successfully revoked' };
  }

  async acceptInvitation(userId: string, userNormalizedEmail: string, token: string): Promise<{ message: string; organizationId: string }> {
    const tokenHash = this.hashToken(token);

    const invitation = await this.prisma.organizationInvitation.findUnique({
      where: { tokenHash },
    });

    if (!invitation) {
      throw new BadRequestException('Invalid invitation token');
    }

    if (invitation.revokedAt) {
      throw new BadRequestException('This invitation has been revoked');
    }

    if (invitation.acceptedAt) {
      throw new BadRequestException('This invitation has already been accepted');
    }

    if (invitation.expiresAt < new Date()) {
      throw new BadRequestException('This invitation has expired');
    }

    // Safety: Verify current user's email matches the intended invitation email
    if (invitation.normalizedEmail !== userNormalizedEmail) {
      throw new ForbiddenException(
        `This invitation was issued to ${invitation.email}. You are currently authenticated as ${userNormalizedEmail}.`,
      );
    }

    // Atomically link membership and mark accepted in a single transaction
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.membership.findUnique({
        where: {
          userId_organizationId: {
            userId,
            organizationId: invitation.organizationId,
          },
        },
      });

      if (!existing) {
        await tx.membership.create({
          data: {
            userId,
            organizationId: invitation.organizationId,
            role: invitation.role,
          },
        });
      }

      await tx.organizationInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
    });

    this.securityLogger.logEvent({
      type: 'INVITATION_ACCEPTED',
      userId,
      organizationId: invitation.organizationId,
      details: { role: invitation.role },
    });

    return {
      message: 'Invitation accepted successfully',
      organizationId: invitation.organizationId,
    };
  }
}