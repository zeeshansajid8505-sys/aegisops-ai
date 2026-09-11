import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';
import type { TelemetryIngestKeySummary, TelemetryIngestKeyCreateResponse } from '@aegisops/types';
import { TelemetryKeysService } from './telemetry-keys.service';
import { CreateTelemetryKeyDto } from './dto/create-telemetry-key.dto';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '@aegisops/types';

@ApiTags('Telemetry Ingestion Keys')
@Controller('v1/organizations/:organizationId/services/:serviceId/telemetry-keys')
@UseGuards(SessionAuthGuard, OrganizationMemberGuard, PermissionGuard)
@ApiCookieAuth()
export class TelemetryKeysController {
  constructor(private readonly keysService: TelemetryKeysService) {}

  @Get()
  @RequirePermission('telemetry.keys.read')
  @ApiOperation({ summary: 'List telemetry ingest keys for a service' })
  @ApiResponse({ status: 200, description: 'List of ingest keys' })
  async listKeys(
    @Param('organizationId') organizationId: string,
    @Param('serviceId') serviceId: string,
    @Query('environmentId') environmentId?: string,
  ): Promise<TelemetryIngestKeySummary[]> {
    return this.keysService.listKeys(organizationId, serviceId, environmentId);
  }

  @Post()
  @RequirePermission('telemetry.keys.manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate a new scoped telemetry ingest key' })
  @ApiResponse({ status: 201, description: 'Key generated (raw key returned once)' })
  async createKey(
    @Param('organizationId') organizationId: string,
    @Param('serviceId') serviceId: string,
    @Body() dto: CreateTelemetryKeyDto,
    @CurrentUser() user: AuthUser,
  ): Promise<TelemetryIngestKeyCreateResponse> {
    return this.keysService.createKey(organizationId, serviceId, dto, user.id);
  }

  @Delete(':keyId')
  @RequirePermission('telemetry.keys.manage')
  @ApiOperation({ summary: 'Revoke a telemetry ingest key' })
  @ApiResponse({ status: 200, description: 'Key revoked' })
  async revokeKey(
    @Param('organizationId') organizationId: string,
    @Param('serviceId') serviceId: string,
    @Param('keyId') keyId: string,
  ): Promise<TelemetryIngestKeySummary> {
    return this.keysService.revokeKey(organizationId, serviceId, keyId);
  }
}
