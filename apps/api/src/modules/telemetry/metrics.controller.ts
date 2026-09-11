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
  MetricDefinitionSummary,
  MetricTimeseriesResponse,
  TelemetryStatusResponse,
} from '@aegisops/types';
import { MetricQueryService } from './metric-query.service';
import { QueryDefinitionsDto } from './dto/query-definitions.dto';
import { QueryMetricsDto } from './dto/query-metrics.dto';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

@ApiTags('Service Metrics & Telemetry')
@Controller('v1/organizations/:organizationId/services/:serviceId')
@UseGuards(SessionAuthGuard, OrganizationMemberGuard, PermissionGuard)
@ApiCookieAuth()
export class MetricsController {
  constructor(private readonly queryService: MetricQueryService) {}

  @Get('telemetry/status')
  @RequirePermission('telemetry.read')
  @ApiOperation({ summary: 'Get telemetry ingestion summary and status for a service' })
  @ApiResponse({ status: 200, description: 'Telemetry status summary' })
  async getStatus(
    @Param('organizationId') organizationId: string,
    @Param('serviceId') serviceId: string,
  ): Promise<TelemetryStatusResponse> {
    return this.queryService.getTelemetryStatus(organizationId, serviceId);
  }

  @Get('metrics/definitions')
  @RequirePermission('telemetry.read')
  @ApiOperation({ summary: 'List discovered metric definitions for a service' })
  @ApiResponse({ status: 200, description: 'List of metric definitions' })
  async getDefinitions(
    @Param('organizationId') organizationId: string,
    @Param('serviceId') serviceId: string,
    @Query() dto: QueryDefinitionsDto,
  ): Promise<MetricDefinitionSummary[]> {
    return this.queryService.getDefinitions(organizationId, serviceId, dto);
  }

  @Post('metrics/query')
  @RequirePermission('telemetry.query')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Query metric time-series data with raw and rollup support' })
  @ApiResponse({ status: 200, description: 'Time-series query response' })
  async queryMetrics(
    @Param('organizationId') organizationId: string,
    @Param('serviceId') serviceId: string,
    @Body() dto: QueryMetricsDto,
  ): Promise<MetricTimeseriesResponse> {
    return this.queryService.queryMetrics(organizationId, serviceId, dto);
  }
}

