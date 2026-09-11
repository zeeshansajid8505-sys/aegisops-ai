import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '@aegisops/types';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsArray,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import {
  IntegrationType,
  NotificationChannel,
  IncidentSeverity,
  NotificationDeliveryStatus,
} from '@prisma/client';

export class QueryNotificationsDto {
  @IsOptional()
  unreadOnly?: string;

  @IsOptional()
  limit?: string;

  @IsOptional()
  offset?: string;
}

export class UpdatePreferenceDto {
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @IsBoolean()
  isEnabled!: boolean;

  @IsOptional()
  @IsEnum(IncidentSeverity)
  minSeverity?: IncidentSeverity;
}

export class CreateIntegrationDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(IntegrationType)
  type!: IntegrationType;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @IsNotEmpty()
  targetUrl!: string;

  @IsOptional()
  @IsString()
  secret?: string;

  @IsOptional()
  headers?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

export class UpdateIntegrationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  targetUrl?: string;

  @IsOptional()
  @IsString()
  secret?: string;

  @IsOptional()
  headers?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

export class CreatePolicyDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsArray()
  @IsString({ each: true })
  eventTypes!: string[];

  @IsOptional()
  @IsEnum(IncidentSeverity)
  minSeverity?: IncidentSeverity;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  environmentIds?: string[];

  @IsArray()
  @IsEnum(NotificationChannel, { each: true })
  channels!: NotificationChannel[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  emailRecipients?: string[];

  @IsOptional()
  @IsString()
  slackConnectionId?: string;

  @IsOptional()
  @IsString()
  webhookConnectionId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86400)
  cooldownSeconds?: number;
}

export class UpdatePolicyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  eventTypes?: string[];

  @IsOptional()
  @IsEnum(IncidentSeverity)
  minSeverity?: IncidentSeverity;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  environmentIds?: string[];

  @IsOptional()
  @IsArray()
  @IsEnum(NotificationChannel, { each: true })
  channels?: NotificationChannel[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  emailRecipients?: string[];

  @IsOptional()
  @IsString()
  slackConnectionId?: string;

  @IsOptional()
  @IsString()
  webhookConnectionId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86400)
  cooldownSeconds?: number;
}

export class QueryDeliveriesDto {
  @IsOptional()
  @IsEnum(NotificationDeliveryStatus)
  status?: NotificationDeliveryStatus;

  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @IsOptional()
  limit?: string;

  @IsOptional()
  offset?: string;
}

@Controller('v1/organizations/:organizationId')
@UseGuards(SessionAuthGuard, OrganizationMemberGuard, PermissionGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // ==========================================
  // IN-APP NOTIFICATIONS
  // ==========================================

  @Get('notifications')
  @RequirePermission('notifications.read')
  async listNotifications(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthUser,
    @Query() query: QueryNotificationsDto,
  ) {
    return this.notificationsService.listNotifications(user.id, organizationId, {
      unreadOnly: query.unreadOnly === 'true',
      limit: query.limit ? parseInt(query.limit, 10) : 20,
      offset: query.offset ? parseInt(query.offset, 10) : 0,
    });
  }

  @Post('notifications/:id/read')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('notifications.read')
  async markAsRead(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.notificationsService.markAsRead(user.id, organizationId, id);
  }

  @Post('notifications/read-all')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('notifications.read')
  async markAllAsRead(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.notificationsService.markAllAsRead(user.id, organizationId);
  }

  // ==========================================
  // USER PREFERENCES
  // ==========================================

  @Get('notifications/preferences')
  @RequirePermission('notifications.preferences.manage')
  async getPreferences(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.notificationsService.getUserPreferences(user.id, organizationId);
  }

  @Put('notifications/preferences')
  @RequirePermission('notifications.preferences.manage')
  async updatePreference(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: UpdatePreferenceDto,
  ) {
    return this.notificationsService.updatePreference(
      user.id,
      organizationId,
      body.channel,
      body.isEnabled,
      body.minSeverity,
    );
  }

  // ==========================================
  // INTEGRATIONS
  // ==========================================

  @Get('integrations')
  @RequirePermission('integrations.read')
  async listIntegrations(@Param('organizationId') organizationId: string) {
    return this.notificationsService.listIntegrations(organizationId);
  }

  @Post('integrations')
  @RequirePermission('integrations.manage')
  async createIntegration(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: CreateIntegrationDto,
  ) {
    return this.notificationsService.createIntegration(organizationId, user.id, body);
  }

  @Put('integrations/:id')
  @RequirePermission('integrations.manage')
  async updateIntegration(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() body: UpdateIntegrationDto,
  ) {
    return this.notificationsService.updateIntegration(organizationId, id, body);
  }

  @Delete('integrations/:id')
  @RequirePermission('integrations.manage')
  async deleteIntegration(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.notificationsService.deleteIntegration(organizationId, id);
  }

  @Post('integrations/:id/test')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('integrations.test')
  async testIntegration(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.notificationsService.testIntegration(organizationId, id);
  }

  // ==========================================
  // NOTIFICATION POLICIES
  // ==========================================

  @Get('notification-policies')
  @RequirePermission('notifications.read')
  async listPolicies(@Param('organizationId') organizationId: string) {
    return this.notificationsService.listPolicies(organizationId);
  }

  @Post('notification-policies')
  @RequirePermission('notifications.policies.manage')
  async createPolicy(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: CreatePolicyDto,
  ) {
    return this.notificationsService.createPolicy(organizationId, user.id, body);
  }

  @Put('notification-policies/:id')
  @RequirePermission('notifications.policies.manage')
  async updatePolicy(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() body: UpdatePolicyDto,
  ) {
    return this.notificationsService.updatePolicy(organizationId, id, body);
  }

  @Delete('notification-policies/:id')
  @RequirePermission('notifications.policies.manage')
  async deletePolicy(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.notificationsService.deletePolicy(organizationId, id);
  }

  // ==========================================
  // DELIVERIES AUDIT
  // ==========================================

  @Get('notification-deliveries')
  @RequirePermission('notifications.read')
  async listDeliveries(
    @Param('organizationId') organizationId: string,
    @Query() query: QueryDeliveriesDto,
  ) {
    return this.notificationsService.listDeliveries(organizationId, {
      status: query.status,
      channel: query.channel,
      limit: query.limit ? parseInt(query.limit, 10) : 50,
      offset: query.offset ? parseInt(query.offset, 10) : 0,
    });
  }
}

