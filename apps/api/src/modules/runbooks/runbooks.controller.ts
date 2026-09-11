import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { RunbooksService } from './runbooks.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentMembership } from '../auth/decorators/current-membership.decorator';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  IsInt,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RunbookStepType } from '@aegisops/types';

export class CreateRunbookStepDto {
  @IsInt()
  order!: number;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  instruction!: string;

  @IsOptional()
  @IsString()
  stepType?: RunbookStepType;

  @IsOptional()
  @IsBoolean()
  requiresConfirmation?: boolean;
}

export class CreateRunbookDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  serviceId?: string;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRunbookStepDto)
  steps!: CreateRunbookStepDto[];
}

export class UpdateRunbookStepDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsInt()
  order!: number;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  instruction!: string;

  @IsOptional()
  @IsString()
  stepType?: RunbookStepType;

  @IsOptional()
  @IsBoolean()
  requiresConfirmation?: boolean;
}

export class UpdateRunbookDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  serviceId?: string;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateRunbookStepDto)
  steps?: UpdateRunbookStepDto[];
}

export class CompleteStepDto {
  @IsOptional()
  @IsString()
  note?: string;
}

@Controller('v1/organizations/:organizationId')
@UseGuards(SessionAuthGuard, OrganizationMemberGuard)
export class RunbooksController {
  constructor(private readonly runbooksService: RunbooksService) {}

  // ==========================================
  // Runbook Template Management
  // ==========================================

  @Get('runbooks')
  @RequirePermission('runbooks.read')
  async getRunbooks(
    @Param('organizationId') organizationId: string,
    @Query('serviceId') serviceId?: string,
  ) {
    return this.runbooksService.getRunbooks(organizationId, serviceId);
  }

  @Get('runbooks/:runbookId')
  @RequirePermission('runbooks.read')
  async getRunbookById(
    @Param('organizationId') organizationId: string,
    @Param('runbookId') runbookId: string,
  ) {
    return this.runbooksService.getRunbookById(organizationId, runbookId);
  }

  @Post('runbooks')
  @RequirePermission('runbooks.manage')
  @HttpCode(HttpStatus.CREATED)
  async createRunbook(
    @Param('organizationId') organizationId: string,
    @CurrentMembership() membership: any,
    @Body() dto: CreateRunbookDto,
  ) {
    return this.runbooksService.createRunbook(organizationId, membership.id, dto);
  }

  @Patch('runbooks/:runbookId')
  @RequirePermission('runbooks.manage')
  async updateRunbook(
    @Param('organizationId') organizationId: string,
    @Param('runbookId') runbookId: string,
    @Body() dto: UpdateRunbookDto,
  ) {
    return this.runbooksService.updateRunbook(organizationId, runbookId, dto);
  }

  @Delete('runbooks/:runbookId')
  @RequirePermission('runbooks.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRunbook(
    @Param('organizationId') organizationId: string,
    @Param('runbookId') runbookId: string,
  ) {
    await this.runbooksService.deleteRunbook(organizationId, runbookId);
  }

  // ==========================================
  // Incident Runbook Execution Runner
  // ==========================================

  @Post('incidents/:incidentId/runbooks/:runbookId/start')
  @RequirePermission('runbooks.execute')
  @HttpCode(HttpStatus.CREATED)
  async startExecution(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
    @Param('runbookId') runbookId: string,
    @CurrentMembership() membership: any,
  ) {
    return this.runbooksService.startExecution(
      organizationId,
      incidentId,
      runbookId,
      membership.id,
    );
  }

  @Get('incidents/:incidentId/runbook-executions')
  @RequirePermission('runbooks.read')
  async getExecutions(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
  ) {
    return this.runbooksService.getExecutionsForIncident(organizationId, incidentId);
  }

  @Post('incidents/:incidentId/runbook-executions/:executionId/steps/:stepId/complete')
  @RequirePermission('runbooks.execute')
  async completeStep(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
    @Param('executionId') executionId: string,
    @Param('stepId') stepId: string,
    @CurrentMembership() membership: any,
    @Body() dto: CompleteStepDto,
  ) {
    return this.runbooksService.completeExecutionStep(
      organizationId,
      incidentId,
      executionId,
      stepId,
      membership.id,
      dto.note,
    );
  }

  @Post('incidents/:incidentId/runbook-executions/:executionId/cancel')
  @RequirePermission('runbooks.execute')
  async cancelExecution(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
    @Param('executionId') executionId: string,
    @CurrentMembership() membership: any,
  ) {
    return this.runbooksService.cancelExecution(
      organizationId,
      incidentId,
      executionId,
      membership.id,
    );
  }
}
