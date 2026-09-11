import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AnomalyFindingsService } from './anomaly-findings.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentMembership } from '../auth/decorators/current-membership.decorator';
import { IsString, IsNotEmpty, IsOptional, IsInt, Min, Max } from 'class-validator';
import { AnomalyFindingState, AnomalyFeedbackClassification } from '@aegisops/types';

export class SubmitFeedbackApiDto {
  @IsString()
  @IsNotEmpty()
  classification!: AnomalyFeedbackClassification;

  @IsOptional()
  @IsString()
  note?: string;
}

export class QueryFindingsDto {
  @IsOptional()
  @IsString()
  serviceId?: string;

  @IsOptional()
  @IsString()
  state?: AnomalyFindingState;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

@Controller('v1/organizations/:organizationId/anomalies')
@UseGuards(SessionAuthGuard, OrganizationMemberGuard)
export class AnomaliesController {
  constructor(private readonly findingsService: AnomalyFindingsService) {}

  @Get('findings')
  @RequirePermission('anomalies.read')
  async getFindings(
    @Param('organizationId') organizationId: string,
    @Query() query: QueryFindingsDto,
  ) {
    return this.findingsService.findAll(organizationId, {
      serviceId: query.serviceId,
      state: query.state as any,
      limit: query.limit,
    });
  }

  @Get('findings/:id')
  @RequirePermission('anomalies.read')
  async getFindingById(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.findingsService.findById(organizationId, id);
  }

  @Post('findings/:id/feedback')
  @RequirePermission('anomalies.feedback')
  @HttpCode(HttpStatus.CREATED)
  async submitFeedback(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @CurrentMembership() membership: any,
    @Body() dto: SubmitFeedbackApiDto,
  ) {
    return this.findingsService.submitFeedback(
      organizationId,
      id,
      membership.id,
      dto,
    );
  }
}

