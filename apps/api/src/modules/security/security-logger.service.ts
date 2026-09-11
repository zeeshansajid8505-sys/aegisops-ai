import { Injectable, Logger } from '@nestjs/common';

export type SecurityEventType =
  | 'REGISTER_SUCCESS'
  | 'REGISTER_FAILED'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'LOGOUT_ALL'
  | 'SESSION_REVOKED'
  | 'ORGANIZATION_CREATED'
  | 'ROLE_CHANGED'
  | 'MEMBER_REMOVED'
  | 'INVITATION_CREATED'
  | 'INVITATION_ACCEPTED'
  | 'INVITATION_REVOKED'
  | 'UNAUTHORIZED_ACCESS_ATTEMPT';

export interface SecurityEventPayload {
  type?: SecurityEventType | string;
  event?: string;
  userId?: string;
  organizationId?: string;
  targetUserId?: string;
  targetEmail?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
}

@Injectable()
export class SecurityLoggerService {
  private readonly logger = new Logger('SecurityAudit');

  logEvent(payload: SecurityEventPayload): void {
    const timestamp = new Date().toISOString();
    this.logger.log({
      event: payload.type || payload.event || 'UNKNOWN_EVENT',
      timestamp,
      userId: payload.userId ?? 'anonymous',
      organizationId: payload.organizationId ?? 'none',
      targetUserId: payload.targetUserId,
      targetEmail: payload.targetEmail,
      ip: payload.ipAddress ?? 'unknown',
      details: payload.details,
    });
  }
}