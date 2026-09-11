import {
  IsUUID,
  IsNotEmpty,
  IsIn,
  IsNumber,
  IsOptional,
  IsInt,
  Min,
  Max,
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
  AlertSeriesReduction,
} from '@aegisops/types';
import { MetricSeriesFilterDto } from './create-alert-rule.dto';

export class PreviewAlertRuleDto {
  @ApiProperty({ description: 'Service UUID' })
  @IsUUID()
  @IsNotEmpty()
  serviceId!: string;

  @ApiProperty({ description: 'Service Environment UUID' })
  @IsUUID()
  @IsNotEmpty()
  environmentId!: string;

  @ApiProperty({ description: 'Metric Definition UUID' })
  @IsUUID()
  @IsNotEmpty()
  metricDefinitionId!: string;

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
  windowSeconds: number = 300;

  @ApiPropertyOptional({ description: 'Exact attribute filters for target series (max 8)', type: [MetricSeriesFilterDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => MetricSeriesFilterDto)
  seriesFilters?: MetricSeriesFilterDto[];
}

