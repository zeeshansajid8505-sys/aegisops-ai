import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionService } from '../session.service';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly sessionService: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    let rawToken: string | undefined = request.cookies?.[SessionService.COOKIE_NAME];

    // Optional bearer fallback for programmatic API testing and integration tests
    if (!rawToken && request.headers.authorization?.startsWith('Bearer ')) {
      rawToken = request.headers.authorization.substring(7).trim();
    }

    if (!rawToken) {
      throw new UnauthorizedException('Authentication required: no active session found');
    }

    const session = await this.sessionService.validateSession(rawToken);
    if (!session) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    // Attach authenticated state to request
    (request as any).user = session.user;
    (request as any).session = session;
    (request as any).rawToken = rawToken;

    return true;
  }
}