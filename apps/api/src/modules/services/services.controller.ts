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
import type { ServiceSummary, ServiceDetail, AuthUser } from '@aegisops/types';
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { UpdateServiceLifecycleDto } from './dto/update-lifecycle.dto';
import { ServiceFilterDto } from './dto/service-filter.dto';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Services')
@Controller('v1/organizations/:organizationId/services')
@UseGuards(SessionAuthGuard, OrganizationMemberGuard, PermissionGuard)
@ApiCookieAuth()
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  @RequirePermission('services.read')
  @ApiOperation({ summary: 'List and filter services in organization' })
  @ApiResponse({ status: 200, description: 'Paginated list of services' })
  async listServices(
    @Param('organizationId') organizationId: string,
    @Query() query: ServiceFilterDto,
  ): Promise<{ items: ServiceSummary[]; total: number; page: number; limit: number }> {
    return this.servicesService.listServices(organizationId, query);
  }

  @Post()
  @RequirePermission('services.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new service in the catalog' })
  @ApiResponse({ status: 201, description: 'Service registered successfully' })
  async createService(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateServiceDto,
  ): Promise<ServiceDetail> {
    return this.servicesService.createService(organizationId, user.id, dto);
  }

  @Get(':serviceId')
  @RequirePermission('services.read')
  @ApiOperation({ summary: 'Get service details by ID' })
  @ApiResponse({ status: 200, description: 'Detailed service profile' })
  async getService(
    @Param('organizationId') organizationId: string,
    @Param('serviceId') serviceId: string,
  ): Promise<ServiceDetail> {
    return this.servicesService.getService(organizationId, serviceId);
  }

  @Patch(':serviceId')
  @RequirePermission('services.update')
  @ApiOperation({ summary: 'Update service metadata' })
  @ApiResponse({ status: 200, description: 'Updated service profile' })
  async updateService(
    @Param('organizationId') organizationId: string,
    @Param('serviceId') serviceId: string,
    @Body() dto: UpdateServiceDto,
  ): Promise<ServiceDetail> {
    return this.servicesService.updateService(organizationId, serviceId, dto);
  }

  @Patch(':serviceId/lifecycle')
  @RequirePermission('services.lifecycle.update')
  @ApiOperation({ summary: 'Update service lifecycle status' })
  @ApiResponse({ status: 200, description: 'Service lifecycle updated' })
  async updateLifecycle(
    @Param('organizationId') organizationId: string,
    @Param('serviceId') serviceId: string,
    @Body() dto: UpdateServiceLifecycleDto,
  ): Promise<ServiceDetail> {
    return this.servicesService.updateLifecycle(organizationId, serviceId, dto);
  }

  @Delete(':serviceId')
  @RequirePermission('services.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a service (rejects if active dependencies exist)' })
  @ApiResponse({ status: 200, description: 'Service deleted' })
  async deleteService(
    @Param('organizationId') organizationId: string,
    @Param('serviceId') serviceId: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.servicesService.deleteService(organizationId, serviceId);
  }
}

