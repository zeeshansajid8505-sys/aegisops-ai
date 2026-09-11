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
import type {
  AlertRuleSummary,
  AlertRuleDetail,
  AlertPreviewResponse,
  AlertEvaluationSummary,
  AuthUser,
} from '@aegisops/types';
import { AlertRulesService } from './alert-rules.service';
import { CreateAlertRuleDto } from './dto/create-alert-rule.dto';
import { UpdateAlertRuleDto } from './dto/update-alert-rule.dto';
import { QueryAlertRulesDto } from './dto/query-alert-rules.dto';
import { PreviewAlertRuleDto } from './dto/preview-alert-rule.dto';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Alert Rules')
@Controller('v1/organizations/:organizationId')
@UseGuards(SessionAuthGuard, OrganizationMemberGuard, PermissionGuard)
@ApiCookieAuth()
export class AlertRulesController {
  constructor(private readonly alertRulesService: AlertRulesService) {}

  @Post('services/:serviceId/environments/:environmentId/alert-rules')
  @RequirePermission('alerts.rules.manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new alert rule for a service environment' })
  @ApiResponse({ status: 201, description: 'Alert rule created successfully' })
  async createRule(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('serviceId') serviceId: string,
    @Param('environmentId') environmentId: string,
    @Body() dto: CreateAlertRuleDto,
  ): Promise<AlertRuleSummary> {
    return this.alertRulesService.createRule(
      organizationId,
      serviceId,
      environmentId,
      user.id,
      dto,
    );
  }

  @Get('alert-rules')
  @RequirePermission('alerts.rules.read')
  @ApiOperation({ summary: 'List and filter alert rules in organization' })
  @ApiResponse({ status: 200, description: 'List of alert rules' })
  async listRules(
    @Param('organizationId') organizationId: string,
    @Query() query: QueryAlertRulesDto,
  ): Promise<{ rules: AlertRuleSummary[]; total: number }> {
    return this.alertRulesService.listRules(organizationId, query);
  }

  @Post('alert-rules/preview')
  @RequirePermission('alerts.rules.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Preview alert rule evaluation against real telemetry without persisting' })
  @ApiResponse({ status: 200, description: 'Preview evaluation result' })
  async previewRule(
    @Param('organizationId') organizationId: string,
    @Body() dto: PreviewAlertRuleDto,
  ): Promise<AlertPreviewResponse> {
    return this.alertRulesService.previewRule(organizationId, dto);
  }

  @Get('alert-rules/:ruleId')
  @RequirePermission('alerts.rules.read')
  @ApiOperation({ summary: 'Get alert rule details by ID' })
  @ApiResponse({ status: 200, description: 'Alert rule details' })
  async getRule(
    @Param('organizationId') organizationId: string,
    @Param('ruleId') ruleId: string,
  ): Promise<AlertRuleDetail> {
    return this.alertRulesService.getRule(organizationId, ruleId);
  }

  @Patch('alert-rules/:ruleId')
  @RequirePermission('alerts.rules.manage')
  @ApiOperation({ summary: 'Update alert rule configuration' })
  @ApiResponse({ status: 200, description: 'Alert rule updated successfully' })
  async updateRule(
    @Param('organizationId') organizationId: string,
    @Param('ruleId') ruleId: string,
    @Body() dto: UpdateAlertRuleDto,
  ): Promise<AlertRuleSummary> {
    return this.alertRulesService.updateRule(organizationId, ruleId, dto);
  }

  @Post('alert-rules/:ruleId/enable')
  @RequirePermission('alerts.rules.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enable an alert rule and start evaluation schedule' })
  @ApiResponse({ status: 200, description: 'Alert rule enabled' })
  async enableRule(
    @Param('organizationId') organizationId: string,
    @Param('ruleId') ruleId: string,
  ): Promise<AlertRuleSummary> {
    return this.alertRulesService.enableRule(organizationId, ruleId);
  }

  @Post('alert-rules/:ruleId/disable')
  @RequirePermission('alerts.rules.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable an alert rule and remove evaluation schedule' })
  @ApiResponse({ status: 200, description: 'Alert rule disabled' })
  async disableRule(
    @Param('organizationId') organizationId: string,
    @Param('ruleId') ruleId: string,
  ): Promise<AlertRuleSummary> {
    return this.alertRulesService.disableRule(organizationId, ruleId);
  }

  @Delete('alert-rules/:ruleId')
  @RequirePermission('alerts.rules.manage')
  @ApiOperation({ summary: 'Archive an alert rule' })
  @ApiResponse({ status: 200, description: 'Alert rule archived' })
  async archiveRule(
    @Param('organizationId') organizationId: string,
    @Param('ruleId') ruleId: string,
  ): Promise<AlertRuleSummary> {
    return this.alertRulesService.archiveRule(organizationId, ruleId);
  }

  @Post('alert-rules/:ruleId/evaluate')
  @RequirePermission('alerts.rules.evaluate')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Trigger an immediate manual evaluation of the alert rule' })
  @ApiResponse({ status: 202, description: 'Evaluation enqueued' })
  async evaluateNow(
    @Param('organizationId') organizationId: string,
    @Param('ruleId') ruleId: string,
  ): Promise<{ message: string; runId: string; jobId: string }> {
    return this.alertRulesService.evaluateNow(organizationId, ruleId);
  }

  @Get('alert-rules/:ruleId/evaluations')
  @RequirePermission('alerts.rules.read')
  @ApiOperation({ summary: 'Get evaluation history for an alert rule' })
  @ApiResponse({ status: 200, description: 'List of evaluation records' })
  async getRuleEvaluations(
    @Param('organizationId') organizationId: string,
    @Param('ruleId') ruleId: string,
    @Query('limit') limit?: string,
  ): Promise<AlertEvaluationSummary[]> {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    return this.alertRulesService.getRuleEvaluations(organizationId, ruleId, parsedLimit);
  }
}

