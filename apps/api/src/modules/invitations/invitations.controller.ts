import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';
import type { AuthUser, InvitationSummary } from '@aegisops/types';
import { InvitationsService } from './invitations.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentMembership } from '../auth/decorators/current-membership.decorator';

@ApiTags('Invitations')
@Controller('v1')
@UseGuards(SessionAuthGuard)
@ApiCookieAuth()
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post('organizations/:organizationId/invitations')
  @UseGuards(OrganizationMemberGuard, PermissionGuard)
  @RequirePermission('members.invite')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an invitation for a new member' })
  @ApiResponse({ status: 201, description: 'Invitation created' })
  async createInvitation(
    @CurrentUser() user: AuthUser,
    @CurrentMembership() callerMembership: any,
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateInvitationDto,
  ): Promise<InvitationSummary> {
    return this.invitationsService.createInvitation(
      user.id,
      callerMembership.role,
      organizationId,
      dto,
    );
  }

  @Get('organizations/:organizationId/invitations')
  @UseGuards(OrganizationMemberGuard, PermissionGuard)
  @RequirePermission('members.read')
  @ApiOperation({ summary: 'List pending invitations for the organization' })
  @ApiResponse({ status: 200, description: 'List of active invitations' })
  async listInvitations(
    @Param('organizationId') organizationId: string,
  ): Promise<InvitationSummary[]> {
    return this.invitationsService.listInvitations(organizationId);
  }

  @Delete('organizations/:organizationId/invitations/:invitationId')
  @UseGuards(OrganizationMemberGuard, PermissionGuard)
  @RequirePermission('members.invite')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a pending invitation' })
  @ApiResponse({ status: 200, description: 'Invitation revoked successfully' })
  async revokeInvitation(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('invitationId') invitationId: string,
  ): Promise<{ message: string }> {
    return this.invitationsService.revokeInvitation(user.id, organizationId, invitationId);
  }

  @Post('invitations/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an invitation with a valid token' })
  @ApiResponse({ status: 200, description: 'Invitation accepted and membership created' })
  async acceptInvitation(
    @CurrentUser() user: AuthUser,
    @Body() dto: AcceptInvitationDto,
  ): Promise<{ message: string; organizationId: string }> {
    return this.invitationsService.acceptInvitation(
      user.id,
      user.email.trim().toLowerCase(),
      dto.token,
    );
  }
}