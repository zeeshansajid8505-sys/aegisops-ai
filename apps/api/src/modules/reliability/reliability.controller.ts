import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';
import type {
  ReliabilityTimeRange,
  OrganizationReliabilitySummary,
  ServiceReliabilitySummary,
} from '@aegisops/types';
import { ReliabilityAnalyticsService } from './reliability-analytics.service';
import { ReliabilityRollupService } from './reliability-rollup.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

@ApiTags('Reliability')
@Controller('v1/organizations/:organizationId')
@UseGuards(SessionAuthGuard, OrganizationMemberGuard, PermissionGuard)
@ApiCookieAuth()
export class ReliabilityController {
  constructor(
    private readonly analyticsService: ReliabilityAnalyticsService,
    private readonly rollupService: ReliabilityRollupService,
  ) {}

  @Get('reliability/summary')
  @RequirePermission('reliability.read')
  @ApiOperation({ summary: 'Get organization-wide reliability analytics and response metrics' })
  @ApiResponse({ status: 200, description: 'Organization reliability analytics summary' })
  async getOrganizationSummary(
    @Param('organizationId') organizationId: string,
    @Query('timeRange') timeRange?: ReliabilityTimeRange,
  ): Promise<OrganizationReliabilitySummary> {
    return this.analyticsService.getOrganizationSummary(organizationId, timeRange || '30d');
  }

  @Get('services/:serviceId/reliability')
  @RequirePermission('reliability.read')
  @ApiOperation({ summary: 'Get service-scoped reliability metrics and trend' })
  @ApiResponse({ status: 200, description: 'Service reliability metrics summary' })
  async getServiceSummary(
    @Param('organizationId') organizationId: string,
    @Param('serviceId') serviceId: string,
    @Query('timeRange') timeRange?: ReliabilityTimeRange,
  ): Promise<ServiceReliabilitySummary> {
    return this.analyticsService.getServiceSummary(organizationId, serviceId, timeRange || '30d');
  }

  @Post('reliability/rollup/recompute')
  @RequirePermission('reliability.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recompute daily reliability rollups for historical dates' })
  @ApiResponse({ status: 200, description: 'Rollup computation result' })
  async recomputeRollups(
    @Param('organizationId') organizationId: string,
    @Body() body: { startDate?: string; endDate?: string; serviceId?: string },
  ): Promise<{ processed: number; message: string }> {
    const end = body.endDate ? new Date(body.endDate) : new Date();
    const start = body.startDate
      ? new Date(body.startDate)
      : new Date(end.getTime() - 30 * 86400000);

    const processed = await this.rollupService.computeRollupForDateRange(
      organizationId,
      start,
      end,
      body.serviceId,
    );

    return {
      processed,
      message: `Successfully computed ${processed} daily reliability rollup(s)`,
    };
  }
}

