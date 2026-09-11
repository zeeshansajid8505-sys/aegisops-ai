import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';
import type { HealthProbeSummary, HealthProbeRunSummary, ServiceHealthStatus } from '@aegisops/types';
import { HealthProbesService } from './health-probes.service';
import { CreateHealthProbeDto } from './dto/create-health-probe.dto';
import { UpdateHealthProbeDto } from './dto/update-health-probe.dto';
import { QueryRunsDto } from './dto/query-runs.dto';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

@ApiTags('Health Probes')
@Controller('v1/organizations/:organizationId')
@UseGuards(SessionAuthGuard, OrganizationMemberGuard, PermissionGuard)
@ApiCookieAuth()
export class HealthProbesController {
  constructor(private readonly healthProbesService: HealthProbesService) {}

  @Get('services/:serviceId/health-probes')
  @RequirePermission('health.read')
  @ApiOperation({ summary: 'List all health probes configured for a service' })
  @ApiResponse({ status: 200, description: 'List of health probes' })
  async listProbes(
    @Param('organizationId') organizationId: string,
    @Param('serviceId') serviceId: string,
  ): Promise<HealthProbeSummary[]> {
    return this.healthProbesService.listProbes(organizationId, serviceId);
  }

  @Post('services/:serviceId/health-probes')
  @RequirePermission('health.probes.manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an active HTTP or gRPC health probe' })
  @ApiResponse({ status: 201, description: 'Health probe created' })
  async createProbe(
    @Param('organizationId') organizationId: string,
    @Param('serviceId') serviceId: string,
    @Body() dto: CreateHealthProbeDto,
  ): Promise<HealthProbeSummary> {
    return this.healthProbesService.createProbe(organizationId, serviceId, dto);
  }

  @Get('health-probes/:probeId')
  @RequirePermission('health.read')
  @ApiOperation({ summary: 'Get health probe details by ID' })
  @ApiResponse({ status: 200, description: 'Health probe details' })
  async getProbe(
    @Param('organizationId') organizationId: string,
    @Param('probeId') probeId: string,
  ): Promise<HealthProbeSummary> {
    return this.healthProbesService.getProbe(organizationId, probeId);
  }

  @Patch('health-probes/:probeId')
  @RequirePermission('health.probes.manage')
  @ApiOperation({ summary: 'Update health probe configuration' })
  @ApiResponse({ status: 200, description: 'Health probe updated' })
  async updateProbe(
    @Param('organizationId') organizationId: string,
    @Param('probeId') probeId: string,
    @Body() dto: UpdateHealthProbeDto,
  ): Promise<HealthProbeSummary> {
    return this.healthProbesService.updateProbe(organizationId, probeId, dto);
  }

  @Delete('health-probes/:probeId')
  @RequirePermission('health.probes.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a health probe' })
  @ApiResponse({ status: 200, description: 'Health probe deleted' })
  async deleteProbe(
    @Param('organizationId') organizationId: string,
    @Param('probeId') probeId: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.healthProbesService.deleteProbe(organizationId, probeId);
  }

  @Post('health-probes/:probeId/run')
  @RequirePermission('health.probes.execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger an immediate manual health probe run' })
  @ApiResponse({ status: 200, description: 'Probe execution result' })
  async runNow(
    @Param('organizationId') organizationId: string,
    @Param('probeId') probeId: string,
  ): Promise<{ message: string; run: HealthProbeRunSummary }> {
    return this.healthProbesService.runNow(organizationId, probeId);
  }

  @Get('health-probes/:probeId/runs')
  @RequirePermission('health.read')
  @ApiOperation({ summary: 'Get paginated history of health probe execution runs' })
  @ApiResponse({ status: 200, description: 'List of historical probe runs' })
  async listRuns(
    @Param('organizationId') organizationId: string,
    @Param('probeId') probeId: string,
    @Query() query: QueryRunsDto,
  ): Promise<{ items: HealthProbeRunSummary[]; total: number; page: number; limit: number }> {
    return this.healthProbesService.listRuns(organizationId, probeId, query);
  }

  @Get('services/:serviceId/health')
  @RequirePermission('health.read')
  @ApiOperation({ summary: 'Get current aggregated health status for a service' })
  @ApiResponse({ status: 200, description: 'Aggregated service health report' })
  async getServiceHealth(
    @Param('organizationId') organizationId: string,
    @Param('serviceId') serviceId: string,
  ): Promise<{
    serviceId: string;
    healthStatus: ServiceHealthStatus;
    environments: Array<{
      id: string;
      name: string;
      isProduction: boolean;
      healthStatus: ServiceHealthStatus;
    }>;
  }> {
    return this.healthProbesService.getServiceHealth(organizationId, serviceId);
  }
}

