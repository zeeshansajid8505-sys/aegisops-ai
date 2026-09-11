import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsOptional,
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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AlertAggregation,
  AlertComparisonOperator,
  AlertEvaluationMode,
  AlertNoDataPolicy,
  AlertRuleStatus,
  AlertSeriesReduction,
  MetricSeriesFilter,
} from '@aegisops/types';

export class MetricSeriesFilterDto implements MetricSeriesFilter {
  @ApiProperty({ description: 'Metric attribute key', example: 'http.status_code' })
  @IsString()
  @IsNotEmpty()
  key!: string;

  @ApiProperty({ description: 'Filter operator', enum: ['EQUALS', 'NOT_EQUALS'] })
  @IsIn(['EQUALS', 'NOT_EQUALS'])
  operator!: 'EQUALS' | 'NOT_EQUALS';

  @ApiProperty({ description: 'Expected attribute value', example: '500' })
  @IsString()
  value!: string;
}

export class CreateAlertRuleDto {
  @ApiProperty({ description: 'Descriptive name for the alert rule' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: 'Optional explanation of the alert condition' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Target MetricDefinition UUID' })
  @IsUUID()
  @IsNotEmpty()
  metricDefinitionId!: string;

  @ApiProperty({ description: 'Severity level', enum: ['SEV-1', 'SEV-2', 'SEV-3', 'SEV-4'] })
  @IsIn(['SEV-1', 'SEV-2', 'SEV-3', 'SEV-4'])
  severity!: 'SEV-1' | 'SEV-2' | 'SEV-3' | 'SEV-4';

  @ApiPropertyOptional({ description: 'Initial status', enum: ['ENABLED', 'DISABLED'], default: 'ENABLED' })
  @IsOptional()
  @IsIn(['ENABLED', 'DISABLED'])
  status?: AlertRuleStatus;

  @ApiProperty({ description: 'Evaluation mode', enum: ['PER_SERIES', 'AGGREGATE_SERIES'] })
  @IsIn(['PER_SERIES', 'AGGREGATE_SERIES'])
  evaluationMode!: AlertEvaluationMode;

  @ApiProperty({
    description: 'Sliding window metric aggregation',
    enum: ['AVG', 'MIN', 'MAX', 'SUM', 'LAST', 'RATE', 'P50', 'P90', 'P99'],
  })
  @IsIn(['AVG', 'MIN', 'MAX', 'SUM', 'LAST', 'RATE', 'P50', 'P90', 'P99'])
  aggregation!: AlertAggregation;

  @ApiPropertyOptional({
    description: 'Cross-series reduction for AGGREGATE_SERIES mode',
    enum: ['MAX', 'MIN', 'AVG', 'SUM'],
  })
  @IsOptional()
  @IsIn(['MAX', 'MIN', 'AVG', 'SUM'])
  seriesReduction?: AlertSeriesReduction;

  @ApiProperty({
    description: 'Comparison operator against threshold',
    enum: ['GT', 'GTE', 'LT', 'LTE', 'EQ', 'NEQ'],
  })
  @IsIn(['GT', 'GTE', 'LT', 'LTE', 'EQ', 'NEQ'])
  comparisonOperator!: AlertComparisonOperator;

  @ApiProperty({ description: 'Numeric threshold value' })
  @IsNumber()
  thresholdValue!: number;

  @ApiPropertyOptional({ description: 'Sliding window duration in seconds (30 - 86400)', default: 300 })
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(86400)
  windowSeconds?: number;

  @ApiPropertyOptional({ description: 'Evaluation interval schedule in seconds (15 - 300)', default: 60 })
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(300)
  evaluationIntervalSeconds?: number;

  @ApiPropertyOptional({ description: 'Duration violation must persist before FIRING in seconds', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86400)
  pendingDurationSeconds?: number;

  @ApiPropertyOptional({ description: 'Duration recovery must persist before RESOLVED in seconds', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86400)
  recoveryDurationSeconds?: number;

  @ApiPropertyOptional({ description: 'Behavior when telemetry data is missing', enum: ['IGNORE', 'OK', 'ALERT'], default: 'IGNORE' })
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

