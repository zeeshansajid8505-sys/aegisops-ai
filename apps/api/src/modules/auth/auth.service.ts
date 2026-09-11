import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import type { AuthMeResponse, AuthUser, UserRole } from '@aegisops/types';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { SecurityLoggerService } from '../security/security-logger.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
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

  async register(
    dto: RegisterDto,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<{ user: AuthUser; rawToken: string; initialOrganizationId: string }> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const existingUser = await this.prisma.user.findUnique({
      where: { normalizedEmail },
    });

    if (existingUser) {
      this.securityLogger.logEvent({
        type: 'REGISTER_FAILED',
        targetEmail: normalizedEmail,
        ipAddress,
        userAgent,
        details: { reason: 'Email already exists' },
      });
      throw new ConflictException('An account with this email address already exists');
    }

    const passwordHash = await this.passwordService.hash(dto.password);
    const orgSlug = this.generateSlug(dto.organizationName);

    const { user, org } = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          displayName: dto.displayName.trim(),
          email: dto.email.trim(),
          normalizedEmail,
          passwordHash,
        },
      });

      const newOrg = await tx.organization.create({
        data: {
          name: dto.organizationName.trim(),
          slug: orgSlug,
          createdByUserId: newUser.id,
        },
      });

      await tx.membership.create({
        data: {
          userId: newUser.id,
          organizationId: newOrg.id,
          role: 'OWNER',
        },
      });

      return { user: newUser, org: newOrg };
    });

    const { rawToken } = await this.sessionService.createSession(user.id, userAgent, ipAddress);

    this.securityLogger.logEvent({
      type: 'REGISTER_SUCCESS',
      userId: user.id,
      organizationId: org.id,
      ipAddress,
      userAgent,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        isActive: user.isActive,
        createdAt: user.createdAt.toISOString(),
        lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      },
      rawToken,
      initialOrganizationId: org.id,
    };
  }

  async login(
    dto: LoginDto,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<{ user: AuthUser; rawToken: string }> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { normalizedEmail },
    });

    if (!user || !user.isActive) {
      this.securityLogger.logEvent({
        type: 'LOGIN_FAILED',
        targetEmail: normalizedEmail,
        ipAddress,
        userAgent,
        details: { reason: !user ? 'User not found' : 'User account inactive' },
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    const isValidPassword = await this.passwordService.verify(user.passwordHash, dto.password);
    if (!isValidPassword) {
      this.securityLogger.logEvent({
        type: 'LOGIN_FAILED',
        userId: user.id,
        targetEmail: normalizedEmail,
        ipAddress,
        userAgent,
        details: { reason: 'Password mismatch' },
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    const { rawToken } = await this.sessionService.createSession(user.id, userAgent, ipAddress);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    this.securityLogger.logEvent({
      type: 'LOGIN_SUCCESS',
      userId: user.id,
      ipAddress,
      userAgent,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        isActive: user.isActive,
        createdAt: user.createdAt.toISOString(),
        lastLoginAt: new Date().toISOString(),
      },
      rawToken,
    };
  }

  async getCurrentUser(userId: string): Promise<AuthMeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: {
            organization: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        isActive: user.isActive,
        createdAt: user.createdAt.toISOString(),
        lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      },
      memberships: user.memberships.map((m) => ({
        id: m.id,
        role: m.role as UserRole,
        organization: {
          id: m.organization.id,
          name: m.organization.name,
          slug: m.organization.slug,
          createdAt: m.organization.createdAt.toISOString(),
          createdByUserId: m.organization.createdByUserId ?? undefined,
        },
      })),
    };
  }

  async logout(rawToken: string, userId: string): Promise<void> {
    const tokenHash = this.sessionService.hashToken(rawToken);
    await this.sessionService.revokeSession(tokenHash);

    this.securityLogger.logEvent({
      type: 'LOGOUT',
      userId,
    });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.sessionService.revokeAllUserSessions(userId);

    this.securityLogger.logEvent({
      type: 'LOGOUT_ALL',
      userId,
    });
  }
}