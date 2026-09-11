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
import { AnomalyDetectorsService } from './anomaly-detectors.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentMembership } from '../auth/decorators/current-membership.decorator';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsInt,
  IsArray,
  Min,
  Max,
} from 'class-validator';
import { AnomalyEvaluationMode, AnomalySensitivity } from '@aegisops/types';

export class CreateAnomalyDetectorApiDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @IsNotEmpty()
  metricDefinitionId!: string;

  @IsOptional()
  @IsString()
  evaluationMode?: AnomalyEvaluationMode;

  @IsOptional()
  @IsArray()
  seriesFilters?: any[];

  @IsOptional()
  @IsInt()
  @Min(30)
  windowSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(10)
  evaluationIntervalSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  trainingLookbackHours?: number;

  @IsOptional()
  @IsInt()
  @Min(5)
  minimumTrainingWindows?: number;

  @IsOptional()
  @IsString()
  sensitivity?: AnomalySensitivity;

  @IsOptional()
  @IsNumber()
  @Min(0.001)
  @Max(0.5)
  contamination?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  pendingEvaluations?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  recoveryEvaluations?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  retrainIntervalHours?: number;
}

export class UpdateAnomalyDetectorApiDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  status?: any;

  @IsOptional()
  @IsString()
  evaluationMode?: AnomalyEvaluationMode;

  @IsOptional()
  @IsArray()
  seriesFilters?: any[];

  @IsOptional()
  @IsInt()
  windowSeconds?: number;

  @IsOptional()
  @IsInt()
  evaluationIntervalSeconds?: number;

  @IsOptional()
  @IsInt()
  trainingLookbackHours?: number;

  @IsOptional()
  @IsInt()
  minimumTrainingWindows?: number;

  @IsOptional()
  @IsNumber()
  contamination?: number;

  @IsOptional()
  @IsInt()
  pendingEvaluations?: number;

  @IsOptional()
  @IsInt()
  recoveryEvaluations?: number;

  @IsOptional()
  @IsInt()
  retrainIntervalHours?: number;
}

export class BacktestRequestDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  hours?: number;
}

@Controller('v1/organizations/:organizationId/anomaly-detectors')
@UseGuards(SessionAuthGuard, OrganizationMemberGuard)
export class AnomalyDetectorsController {
  constructor(private readonly detectorsService: AnomalyDetectorsService) {}

  @Get()
  @RequirePermission('anomalies.read')
  async findAll(
    @Param('organizationId') organizationId: string,
    @Query('serviceId') serviceId?: string,
    @Query('environmentId') environmentId?: string,
  ) {
    return this.detectorsService.findAll(organizationId, serviceId, environmentId);
  }

  @Get(':id')
  @RequirePermission('anomalies.read')
  async findById(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.detectorsService.findById(organizationId, id);
  }

  @Post()
  @RequirePermission('anomalies.detectors.manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('organizationId') organizationId: string,
    @CurrentMembership() membership: any,
    @Body() dto: CreateAnomalyDetectorApiDto,
  ) {
    return this.detectorsService.create(organizationId, membership.id, dto);
  }

  @Patch(':id')
  @RequirePermission('anomalies.detectors.manage')
  async update(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAnomalyDetectorApiDto,
  ) {
    return this.detectorsService.update(organizationId, id, dto);
  }

  @Delete(':id')
  @RequirePermission('anomalies.detectors.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    await this.detectorsService.archive(organizationId, id);
  }

  @Post(':id/train')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('anomalies.models.train')
  async triggerTraining(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.detectorsService.triggerTraining(organizationId, id);
  }

  @Post(':id/backtest')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('anomalies.read')
  async backtest(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: BacktestRequestDto,
  ) {
    return this.detectorsService.backtest(organizationId, id, dto.hours ?? 24);
  }

  @Post(':id/evaluate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('anomalies.read')
  async evaluateNow(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() body?: { points?: Array<{ timestamp: string; value: number }> },
  ) {
    return this.detectorsService.evaluateNow(organizationId, id, body?.points);
  }
}
