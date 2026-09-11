import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OrganizationMemberGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User is not authenticated');
    }

    // Extract organizationId from route params, query, or custom header
    const organizationId =
      request.params?.organizationId ||
      request.params?.id ||
      request.headers['x-organization-id'] ||
      request.body?.organizationId;

    if (!organizationId || typeof organizationId !== 'string') {
      throw new BadRequestException('Organization identifier is required in request context');
    }

    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId,
        },
      },
      include: {
        organization: true,
      },
    });

    if (!membership) {
      // Enforce strict multi-tenant boundary: user cannot access organizations they do not belong to
      throw new ForbiddenException('Access denied: user is not a member of this organization');
    }

    request.membership = membership;
    request.organization = membership.organization;

    return true;
  }
}