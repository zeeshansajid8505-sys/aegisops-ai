import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionService } from '../session.service';

@Injectable()
export class OriginCsrfGuard implements CanActivate {
  private readonly logger = new Logger(OriginCsrfGuard.name);
  private readonly allowedOrigins: string[];

  constructor() {
    const configured = (process.env['CORS_ORIGINS'] ?? 'http://localhost:3000')
      .split(',')
      .map((s) => s.trim().toLowerCase());
    this.allowedOrigins = [
      ...configured,
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3001',
    ];
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const method = req.method.toUpperCase();

    // Safe read-only HTTP methods are exempt from CSRF checks
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return true;
    }

    // Machine-to-machine / service-to-service calls using API headers are exempt
    const hasApiKeyHeader =
      req.headers['authorization']?.startsWith('Bearer aeg_') ||
      req.headers['x-aegis-telemetry-key'] ||
      req.headers['x-internal-service-key'];

    if (hasApiKeyHeader) {
      return true;
    }

    // Only apply CSRF check if request relies on session cookie authentication
    const cookieHeader = req.headers['cookie'] || '';
    const hasSessionCookie = Boolean(
      req.cookies?.[SessionService.COOKIE_NAME] || cookieHeader.includes(SessionService.COOKIE_NAME),
    );
    if (!hasSessionCookie) {
      return true;
    }

    // Validate Origin or Referer header
    const rawOrigin = req.headers['origin'] || req.headers['referer'];
    if (!rawOrigin || typeof rawOrigin !== 'string') {
      // Allow in development for scripts/tools omitting origin
      if (process.env['NODE_ENV'] === 'production') {
        throw new ForbiddenException('CSRF Protection: Missing Origin or Referer header on state-changing request');
      }
      return true;
    }

    try {
      const parsedOrigin = new URL(rawOrigin).origin.toLowerCase();
      const isAllowed = this.allowedOrigins.some((allowed) => {
        try {
          return new URL(allowed).origin.toLowerCase() === parsedOrigin;
        } catch {
          return allowed.toLowerCase() === parsedOrigin;
        }
      });

      if (!isAllowed) {
        this.logger.warn(`CSRF Block: Rejected state-changing ${method} request from origin: ${parsedOrigin}`);
        throw new ForbiddenException('Cross-Site Request Forgery (CSRF) origin verification failed');
      }

      return true;
    } catch (err: any) {
      if (err instanceof ForbiddenException) throw err;
      throw new ForbiddenException('CSRF Protection: Invalid Origin header format');
    }
  }
}

