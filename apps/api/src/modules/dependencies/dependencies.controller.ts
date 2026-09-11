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
import type {
  DependencySummary,
  DependencyGraph,
  ServiceDependenciesResponse,
} from '@aegisops/types';
import { DependenciesService } from './dependencies.service';
import { CreateDependencyDto } from './dto/create-dependency.dto';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

@ApiTags('Dependencies')
@Controller('v1/organizations/:organizationId')
@UseGuards(SessionAuthGuard, OrganizationMemberGuard, PermissionGuard)
@ApiCookieAuth()
export class DependenciesController {
  constructor(private readonly dependenciesService: DependenciesService) {}

  @Get('dependencies')
  @RequirePermission('dependencies.read')
  @ApiOperation({ summary: 'List all service dependency edges in organization' })
  @ApiResponse({ status: 200, description: 'List of dependencies' })
  async listDependencies(
    @Param('organizationId') organizationId: string,
  ): Promise<DependencySummary[]> {
    return this.dependenciesService.listDependencies(organizationId);
  }

  @Post('dependencies')
  @RequirePermission('dependencies.manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create directed dependency edge (rejects cycles, self, and duplicates)' })
  @ApiResponse({ status: 201, description: 'Dependency edge created' })
  async createDependency(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateDependencyDto,
  ): Promise<DependencySummary> {
    return this.dependenciesService.createDependency(organizationId, dto);
  }

  @Delete('dependencies/:dependencyId')
  @RequirePermission('dependencies.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a dependency relationship' })
  @ApiResponse({ status: 200, description: 'Dependency deleted' })
  async deleteDependency(
    @Param('organizationId') organizationId: string,
    @Param('dependencyId') dependencyId: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.dependenciesService.deleteDependency(organizationId, dependencyId);
  }

  @Get('services/:serviceId/dependencies')
  @RequirePermission('dependencies.read')
  @ApiOperation({ summary: 'Get upstream and downstream dependencies for a service' })
  @ApiResponse({ status: 200, description: 'Upstream and downstream service lists' })
  async getServiceDependencies(
    @Param('organizationId') organizationId: string,
    @Param('serviceId') serviceId: string,
  ): Promise<ServiceDependenciesResponse> {
    return this.dependenciesService.getServiceDependencies(organizationId, serviceId);
  }

  @Get('dependency-graph')
  @RequirePermission('dependencies.read')
  @ApiOperation({ summary: 'Get full organization service dependency graph for visualization' })
  @ApiResponse({ status: 200, description: 'Nodes and edges for DAG rendering' })
  async getDependencyGraph(
    @Param('organizationId') organizationId: string,
  ): Promise<DependencyGraph> {
    return this.dependenciesService.getDependencyGraph(organizationId);
  }
}

