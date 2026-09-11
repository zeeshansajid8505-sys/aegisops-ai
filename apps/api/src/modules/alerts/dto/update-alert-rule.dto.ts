import {
  IsString,
  IsOptional,
  IsUUID,
  IsNumber,
  IsInt,
  Min,
  Max,
  IsIn,
  IsArray,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  AlertAggregation,
  AlertComparisonOperator,
  AlertEvaluationMode,
  AlertNoDataPolicy,
  AlertRuleStatus,
  AlertSeriesReduction,
} from '@aegisops/types';
import { MetricSeriesFilterDto } from './create-alert-rule.dto';

export class UpdateAlertRuleDto {
  @ApiPropertyOptional({ description: 'Descriptive name for the alert rule' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Optional explanation of the alert condition' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Target MetricDefinition UUID' })
  @IsOptional()
  @IsUUID()
  metricDefinitionId?: string;

  @ApiPropertyOptional({ description: 'Severity level', enum: ['SEV-1', 'SEV-2', 'SEV-3', 'SEV-4'] })
  @IsOptional()
  @IsIn(['SEV-1', 'SEV-2', 'SEV-3', 'SEV-4'])
  severity?: 'SEV-1' | 'SEV-2' | 'SEV-3' | 'SEV-4';

  @ApiPropertyOptional({ description: 'Status', enum: ['ENABLED', 'DISABLED', 'ARCHIVED'] })
  @IsOptional()
  @IsIn(['ENABLED', 'DISABLED', 'ARCHIVED'])
  status?: AlertRuleStatus;

  @ApiPropertyOptional({ description: 'Evaluation mode', enum: ['PER_SERIES', 'AGGREGATE_SERIES'] })
  @IsOptional()
  @IsIn(['PER_SERIES', 'AGGREGATE_SERIES'])
  evaluationMode?: AlertEvaluationMode;

  @ApiPropertyOptional({
    description: 'Sliding window metric aggregation',
    enum: ['AVG', 'MIN', 'MAX', 'SUM', 'LAST', 'RATE', 'P50', 'P90', 'P99'],
  })
  @IsOptional()
  @IsIn(['AVG', 'MIN', 'MAX', 'SUM', 'LAST', 'RATE', 'P50', 'P90', 'P99'])
  aggregation?: AlertAggregation;

  @ApiPropertyOptional({
    description: 'Cross-series reduction for AGGREGATE_SERIES mode',
    enum: ['MAX', 'MIN', 'AVG', 'SUM'],
  })
  @IsOptional()
  @IsIn(['MAX', 'MIN', 'AVG', 'SUM'])
  seriesReduction?: AlertSeriesReduction;

  @ApiPropertyOptional({
    description: 'Comparison operator against threshold',
    enum: ['GT', 'GTE', 'LT', 'LTE', 'EQ', 'NEQ'],
  })
  @IsOptional()
  @IsIn(['GT', 'GTE', 'LT', 'LTE', 'EQ', 'NEQ'])
  comparisonOperator?: AlertComparisonOperator;

  @ApiPropertyOptional({ description: 'Numeric threshold value' })
  @IsOptional()
  @IsNumber()
  thresholdValue?: number;

  @ApiPropertyOptional({ description: 'Sliding window duration in seconds (30 - 86400)' })
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(86400)
  windowSeconds?: number;

  @ApiPropertyOptional({ description: 'Evaluation interval schedule in seconds (15 - 300)' })
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(300)
  evaluationIntervalSeconds?: number;

  @ApiPropertyOptional({ description: 'Duration violation must persist before FIRING in seconds' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86400)
  pendingDurationSeconds?: number;

  @ApiPropertyOptional({ description: 'Duration recovery must persist before RESOLVED in seconds' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86400)
  recoveryDurationSeconds?: number;

  @ApiPropertyOptional({ description: 'Behavior when telemetry data is missing', enum: ['IGNORE', 'OK', 'ALERT'] })
  @IsOptional()
  @IsIn(['IGNORE', 'OK', 'ALERT'])
  noDataPolicy?: AlertNoDataPolicy;

  @ApiPropertyOptional({ description: 'Exact attribute filters for target series (max 8)', type: [MetricSeriesFilterDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => MetricSeriesFilterDto)
  seriesFilters?: MetricSeriesFilterDto[];
}

