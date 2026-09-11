import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';
import type {
  AlertInstanceSummary,
  AlertInstanceDetail,
  AlertEventSummary,
} from '@aegisops/types';
import { AlertsService } from './alerts.service';
import { QueryAlertsDto } from './dto/query-alerts.dto';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

@ApiTags('Alerts')
@Controller('v1/organizations/:organizationId/alerts')
@UseGuards(SessionAuthGuard, OrganizationMemberGuard, PermissionGuard)
@ApiCookieAuth()
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @RequirePermission('alerts.read')
  @ApiOperation({ summary: 'List and filter active or resolved alert instances' })
  @ApiResponse({ status: 200, description: 'List of alert instances' })
  async listAlerts(
    @Param('organizationId') organizationId: string,
    @Query() query: QueryAlertsDto,
  ): Promise<{ alerts: AlertInstanceSummary[]; total: number }> {
    return this.alertsService.listAlerts(organizationId, query);
  }

  @Get(':alertInstanceId')
  @RequirePermission('alerts.read')
  @ApiOperation({ summary: 'Get details for a specific alert instance' })
  @ApiResponse({ status: 200, description: 'Alert instance details' })
  async getAlert(
    @Param('organizationId') organizationId: string,
    @Param('alertInstanceId') alertInstanceId: string,
  ): Promise<AlertInstanceDetail> {
    return this.alertsService.getAlert(organizationId, alertInstanceId);
  }

  @Get(':alertInstanceId/events')
  @RequirePermission('alerts.read')
  @ApiOperation({ summary: 'Get state transition timeline events for an alert instance' })
  @ApiResponse({ status: 200, description: 'List of alert state change events' })
  async getAlertEvents(
    @Param('organizationId') organizationId: string,
    @Param('alertInstanceId') alertInstanceId: string,
    @Query('limit') limit?: string,
  ): Promise<AlertEventSummary[]> {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    return this.alertsService.getAlertEvents(organizationId, alertInstanceId, parsedLimit);
  }
}

