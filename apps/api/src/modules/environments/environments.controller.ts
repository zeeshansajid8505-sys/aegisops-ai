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
import type { EnvironmentSummary } from '@aegisops/types';
import { EnvironmentsService } from './environments.service';
import { CreateEnvironmentDto } from './dto/create-environment.dto';
import { UpdateEnvironmentDto } from './dto/update-environment.dto';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

@ApiTags('Environments')
@Controller('v1/organizations/:organizationId/services/:serviceId/environments')
@UseGuards(SessionAuthGuard, OrganizationMemberGuard, PermissionGuard)
@ApiCookieAuth()
export class EnvironmentsController {
  constructor(private readonly environmentsService: EnvironmentsService) {}

  @Get()
  @RequirePermission('environments.read')
  @ApiOperation({ summary: 'List environments for a service' })
  @ApiResponse({ status: 200, description: 'List of environment summaries' })
  async listEnvironments(
    @Param('organizationId') organizationId: string,
    @Param('serviceId') serviceId: string,
  ): Promise<EnvironmentSummary[]> {
    return this.environmentsService.listEnvironments(organizationId, serviceId);
  }

  @Post()
  @RequirePermission('environments.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an environment for a service' })
  @ApiResponse({ status: 201, description: 'Environment created' })
  async createEnvironment(
    @Param('organizationId') organizationId: string,
    @Param('serviceId') serviceId: string,
    @Body() dto: CreateEnvironmentDto,
  ): Promise<EnvironmentSummary> {
    return this.environmentsService.createEnvironment(organizationId, serviceId, dto);
  }

  @Patch(':environmentId')
  @RequirePermission('environments.update')
  @ApiOperation({ summary: 'Update environment configuration' })
  @ApiResponse({ status: 200, description: 'Environment updated' })
  async updateEnvironment(
    @Param('organizationId') organizationId: string,
    @Param('serviceId') serviceId: string,
    @Param('environmentId') environmentId: string,
    @Body() dto: UpdateEnvironmentDto,
  ): Promise<EnvironmentSummary> {
    return this.environmentsService.updateEnvironment(
      organizationId,
      serviceId,
      environmentId,
      dto,
    );
  }

  @Delete(':environmentId')
  @RequirePermission('environments.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an environment (rejects if active probes exist)' })
  @ApiResponse({ status: 200, description: 'Environment deleted' })
  async deleteEnvironment(
    @Param('organizationId') organizationId: string,
    @Param('serviceId') serviceId: string,
    @Param('environmentId') environmentId: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.environmentsService.deleteEnvironment(
      organizationId,
      serviceId,
      environmentId,
    );
  }
}

