import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  path: string;
  maxAge: number;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  public static readonly COOKIE_NAME = 'aegisops_session';
  public static readonly DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  constructor(private readonly prisma: PrismaService) {}

  generateRawToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  getCookieOptions(): CookieOptions {
    const isProd = process.env['NODE_ENV'] === 'production';
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: SessionService.DEFAULT_TTL_MS,
    };
  }

  attachSessionCookie(res: Response, rawToken: string): void {
    res.cookie(SessionService.COOKIE_NAME, rawToken, this.getCookieOptions());
  }

  clearSessionCookie(res: Response): void {
    const options = this.getCookieOptions();
    res.clearCookie(SessionService.COOKIE_NAME, {
      httpOnly: options.httpOnly,
      secure: options.secure,
      sameSite: options.sameSite,
      path: options.path,
    });
  }

  async createSession(userId: string, userAgent?: string, ipAddress?: string): Promise<{ rawToken: string; id: string }> {
    const rawToken = this.generateRawToken();
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + SessionService.DEFAULT_TTL_MS);

    const session = await this.prisma.session.create({
      data: {
        userId,
        tokenHash,
        userAgent: userAgent?.slice(0, 255),
        ipAddress: ipAddress?.slice(0, 45),
        expiresAt,
      },
    });

    return { rawToken, id: session.id };
  }

  async validateSession(rawToken: string): Promise<any | null> {
    if (!rawToken || typeof rawToken !== 'string') return null;

    const tokenHash = this.hashToken(rawToken);
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            isActive: true,
            createdAt: true,
            lastLoginAt: true,
          },
        },
      },
    });

    if (!session) return null;

    // Check expiration or revocation
    if (session.revokedAt || session.expiresAt < new Date()) {
      return null;
    }

    if (!session.user.isActive) {
      return null;
    }

    // Throttled lastUsedAt update: write only once per 60 seconds
    const now = Date.now();
    if (now - session.lastUsedAt.getTime() > 60 * 1000) {
      this.prisma.session.update({
        where: { id: session.id },
        data: { lastUsedAt: new Date() },
      }).catch((err) => {
        this.logger.debug(`Failed to update lastUsedAt: ${err.message}`);
      });
    }

    return session;
  }

  async revokeSession(tokenHash: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}