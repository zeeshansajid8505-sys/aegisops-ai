import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission, type Permission, type UserRole } from '@aegisops/types';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermission = this.reflector.getAllAndOverride<Permission | undefined>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const membership = request.membership;

    if (!membership || !membership.role) {
      throw new ForbiddenException('Organization membership context required for permission check');
    }

    const allowed = hasPermission(membership.role as UserRole, requiredPermission);
    if (!allowed) {
      throw new ForbiddenException(
        `Insufficient privileges: role "${membership.role}" does not have "${requiredPermission}" permission`,
      );
    }

    return true;
  }
}