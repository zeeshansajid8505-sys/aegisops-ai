import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { RcaService } from './rca.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentMembership } from '../auth/decorators/current-membership.decorator';

export class TriggerAnalysisDto {
  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @IsOptional()
  @IsBoolean()
  sync?: boolean;
}

export class ConfirmRootCauseDto {
  @IsOptional()
  @IsString()
  summary?: string;
}

export class RejectHypothesisDto {
  @IsString()
  @IsNotEmpty()
  rejectionReason!: string;
}

@Controller('v1/organizations/:organizationId/incidents/:incidentId')
@UseGuards(SessionAuthGuard, OrganizationMemberGuard)
export class RcaController {
  constructor(private readonly rcaService: RcaService) {}

  @Post('analysis')
  @RequirePermission('ai.analysis.run')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerAnalysis(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
    @Body() dto: TriggerAnalysisDto,
  ) {
    return this.rcaService.triggerAnalysis(organizationId, incidentId, dto);
  }

  @Get('analysis')
  @RequirePermission('ai.analysis.read')
  async getLatestAnalysis(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
  ) {
    return this.rcaService.getLatestAnalysis(organizationId, incidentId);
  }

  @Get('analysis/history')
  @RequirePermission('ai.analysis.read')
  async getAnalysisHistory(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
  ) {
    return this.rcaService.getAnalysisHistory(organizationId, incidentId);
  }

  @Post('hypotheses/:hypothesisId/confirm')
  @RequirePermission('ai.analysis.feedback')
  async confirmRootCause(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
    @Param('hypothesisId') hypothesisId: string,
    @CurrentMembership() membership: any,
    @Body() dto: ConfirmRootCauseDto,
  ) {
    return this.rcaService.confirmRootCause(
      organizationId,
      incidentId,
      hypothesisId,
      membership.id,
      dto.summary,
    );
  }

  @Post('hypotheses/:hypothesisId/reject')
  @RequirePermission('ai.analysis.feedback')
  async rejectHypothesis(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
    @Param('hypothesisId') hypothesisId: string,
    @CurrentMembership() membership: any,
    @Body() dto: RejectHypothesisDto,
  ) {
    return this.rcaService.rejectHypothesis(
      organizationId,
      incidentId,
      hypothesisId,
      membership.id,
      dto.rejectionReason,
    );
  }
}
