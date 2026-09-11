import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';
import type { AuthUser, OrganizationSummary } from '@aegisops/types';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Organizations')
@Controller('v1/organizations')
@UseGuards(SessionAuthGuard)
@ApiCookieAuth()
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  @ApiOperation({ summary: 'List all organizations the authenticated user belongs to' })
  @ApiResponse({ status: 200, description: 'List of user organizations with roles' })
  async listUserOrganizations(@CurrentUser() user: AuthUser) {
    return this.organizationsService.listUserOrganizations(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new organization (creator automatically assigned OWNER role)' })
  @ApiResponse({ status: 201, description: 'Organization created successfully' })
  async createOrganization(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOrganizationDto,
  ): Promise<OrganizationSummary> {
    return this.organizationsService.createOrganization(user.id, dto);
  }

  @Get(':organizationId')
  @UseGuards(OrganizationMemberGuard, PermissionGuard)
  @RequirePermission('organization.read')
  @ApiOperation({ summary: 'Get organization details (enforces tenant membership)' })
  @ApiResponse({ status: 200, description: 'Organization details' })
  async getOrganizationDetails(@Param('organizationId') organizationId: string) {
    return this.organizationsService.getOrganizationDetails(organizationId);
  }

  @Patch(':organizationId')
  @UseGuards(OrganizationMemberGuard, PermissionGuard)
  @RequirePermission('organization.update')
  @ApiOperation({ summary: 'Update organization name (requires OWNER or ADMIN permission)' })
  @ApiResponse({ status: 200, description: 'Updated organization' })
  async updateOrganization(
    @Param('organizationId') organizationId: string,
    @Body() dto: UpdateOrganizationDto,
  ): Promise<OrganizationSummary> {
    return this.organizationsService.updateOrganization(organizationId, dto);
  }
}