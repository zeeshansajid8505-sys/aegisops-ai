import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import { OperationsService } from './operations.service';
import type { OperationsOverview } from '@aegisops/types';

@ApiTags('Operations')
@ApiCookieAuth()
@Controller('v1/organizations/:organizationId/operations')
@UseGuards(SessionAuthGuard, OrganizationMemberGuard)
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  @Get('overview')
  @ApiOperation({
    summary: 'Get consolidated real-time operational overview for organization',
    description:
      'Provides bounded O(1) query breakdown of service health, prioritized Needs Attention items, active alerts preview, active incidents preview, and recent operational activity.',
  })
  @ApiResponse({
    status: 200,
    description: 'Operations overview retrieved successfully',
  })
  async getOverview(@Param('organizationId') organizationId: string): Promise<OperationsOverview> {
    return this.operationsService.getOverview(organizationId);
  }
}

