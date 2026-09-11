import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';
import type { AuthUser, MembershipSummary } from '@aegisops/types';
import { MembershipsService } from './memberships.service';
import { UpdateMemberRoleDto } from './dto/update-role.dto';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentMembership } from '../auth/decorators/current-membership.decorator';

@ApiTags('Memberships')
@Controller('v1/organizations/:organizationId/members')
@UseGuards(SessionAuthGuard, OrganizationMemberGuard, PermissionGuard)
@ApiCookieAuth()
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Get()
  @RequirePermission('members.read')
  @ApiOperation({ summary: 'List all members in the specified organization' })
  @ApiResponse({ status: 200, description: 'List of memberships with user profiles' })
  async listMembers(@Param('organizationId') organizationId: string): Promise<MembershipSummary[]> {
    return this.membershipsService.listMembers(organizationId);
  }

  @Patch(':membershipId/role')
  @RequirePermission('members.role.update')
  @ApiOperation({ summary: 'Update an organization member role (applies RBAC and Last-Owner rules)' })
  @ApiResponse({ status: 200, description: 'Updated membership record' })
  async updateMemberRole(
    @CurrentUser() user: AuthUser,
    @CurrentMembership() callerMembership: any,
    @Param('organizationId') organizationId: string,
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateMemberRoleDto,
  ): Promise<MembershipSummary> {
    return this.membershipsService.updateMemberRole(
      user.id,
      callerMembership.role,
      organizationId,
      membershipId,
      dto,
    );
  }

  @Delete(':membershipId')
  @RequirePermission('members.remove')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a member from the organization (applies Last-Owner safety)' })
  @ApiResponse({ status: 200, description: 'Member removed successfully' })
  async removeMember(
    @CurrentUser() user: AuthUser,
    @CurrentMembership() callerMembership: any,
    @Param('organizationId') organizationId: string,
    @Param('membershipId') membershipId: string,
  ): Promise<{ message: string }> {
    return this.membershipsService.removeMember(
      user.id,
      callerMembership.role,
      organizationId,
      membershipId,
    );
  }
}