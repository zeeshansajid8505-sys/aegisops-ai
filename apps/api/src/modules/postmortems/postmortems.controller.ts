import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';
import type {
  IncidentPostmortemDetail,
  PostmortemActionItemSummary,
  PostmortemRevisionSummary,
  UpdatePostmortemDto,
  ApprovePostmortemDto,
  CreatePostmortemActionItemDto,
  UpdatePostmortemActionItemDto,
} from '@aegisops/types';
import { PostmortemsService } from './postmortems.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentMembership } from '../auth/decorators/current-membership.decorator';

@ApiTags('Postmortems')
@Controller('v1/organizations/:organizationId/incidents/:incidentId/postmortem')
@UseGuards(SessionAuthGuard, OrganizationMemberGuard, PermissionGuard)
@ApiCookieAuth()
export class PostmortemsController {
  constructor(private readonly postmortemsService: PostmortemsService) {}

  @Get()
  @RequirePermission('postmortems.read')
  @ApiOperation({ summary: 'Get incident postmortem details' })
  @ApiResponse({ status: 200, description: 'Postmortem details' })
  async getPostmortem(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
  ): Promise<IncidentPostmortemDetail | null> {
    return this.postmortemsService.getPostmortem(organizationId, incidentId);
  }

  @Post('generate')
  @RequirePermission('postmortems.create')
  @ApiOperation({ summary: 'Generate evidence-grounded postmortem draft' })
  @ApiResponse({ status: 201, description: 'Postmortem draft generated' })
  async generateDraft(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
    @CurrentMembership() membership: { id: string },
  ): Promise<IncidentPostmortemDetail> {
    return this.postmortemsService.generateDraft(organizationId, incidentId, membership.id);
  }

  @Patch()
  @RequirePermission('postmortems.edit')
  @ApiOperation({ summary: 'Update postmortem content' })
  @ApiResponse({ status: 200, description: 'Postmortem updated' })
  async updatePostmortem(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
    @CurrentMembership() membership: { id: string },
    @Body() dto: UpdatePostmortemDto,
  ): Promise<IncidentPostmortemDetail> {
    return this.postmortemsService.updatePostmortem(organizationId, incidentId, membership.id, dto);
  }

  @Post('submit-review')
  @RequirePermission('postmortems.edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit postmortem draft for peer review' })
  @ApiResponse({ status: 200, description: 'Postmortem status set to IN_REVIEW' })
  async submitForReview(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
    @CurrentMembership() membership: { id: string },
  ): Promise<IncidentPostmortemDetail> {
    return this.postmortemsService.submitForReview(organizationId, incidentId, membership.id);
  }

  @Post('approve')
  @RequirePermission('postmortems.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve postmortem (human SRE/Admin/Owner only)' })
  @ApiResponse({ status: 200, description: 'Postmortem approved' })
  async approvePostmortem(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
    @CurrentMembership() membership: { id: string },
    @Body() dto: ApprovePostmortemDto,
  ): Promise<IncidentPostmortemDetail> {
    return this.postmortemsService.approvePostmortem(organizationId, incidentId, membership.id, dto);
  }

  @Get('revisions')
  @RequirePermission('postmortems.read')
  @ApiOperation({ summary: 'List historical revisions of the postmortem' })
  @ApiResponse({ status: 200, description: 'List of revisions' })
  async getRevisions(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
  ): Promise<PostmortemRevisionSummary[]> {
    return this.postmortemsService.getRevisions(organizationId, incidentId);
  }

  // Action Items Endpoints

  @Post('action-items')
  @RequirePermission('postmortems.action-items.manage')
  @ApiOperation({ summary: 'Create a postmortem action item' })
  @ApiResponse({ status: 201, description: 'Action item created' })
  async createActionItem(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
    @CurrentMembership() membership: { id: string },
    @Body() dto: CreatePostmortemActionItemDto,
  ): Promise<PostmortemActionItemSummary> {
    return this.postmortemsService.createActionItem(organizationId, incidentId, membership.id, dto);
  }

  @Patch('action-items/:actionItemId')
  @RequirePermission('postmortems.action-items.manage')
  @ApiOperation({ summary: 'Update a postmortem action item' })
  @ApiResponse({ status: 200, description: 'Action item updated' })
  async updateActionItem(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
    @Param('actionItemId') actionItemId: string,
    @Body() dto: UpdatePostmortemActionItemDto,
  ): Promise<PostmortemActionItemSummary> {
    return this.postmortemsService.updateActionItem(organizationId, incidentId, actionItemId, dto);
  }

  @Delete('action-items/:actionItemId')
  @RequirePermission('postmortems.action-items.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a postmortem action item' })
  @ApiResponse({ status: 204, description: 'Action item deleted' })
  async deleteActionItem(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
    @Param('actionItemId') actionItemId: string,
  ): Promise<void> {
    await this.postmortemsService.deleteActionItem(organizationId, incidentId, actionItemId);
  }
}

