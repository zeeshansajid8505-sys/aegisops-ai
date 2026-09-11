import { IsString, IsNotEmpty, IsUUID, IsOptional, IsArray, IsDateString, IsInt, Min, Max, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class QueryMetricsDto {
  @ApiProperty({ description: 'Service Environment ID to query metrics for' })
  @IsUUID()
  @IsNotEmpty()
  environmentId!: string;

  @ApiProperty({ description: 'List of metric names to query', type: [String] })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return value;
  })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  metricNames!: string[];

  @ApiPropertyOptional({ description: 'Filter by specific series hash' })
  @IsOptional()
  @IsString()
  seriesHash?: string;

  @ApiProperty({ description: 'Start time in ISO 8601 format' })
  @IsDateString()
  @IsNotEmpty()
  startTime!: string;

  @ApiProperty({ description: 'End time in ISO 8601 format' })
  @IsDateString()
  @IsNotEmpty()
  endTime!: string;

  @ApiPropertyOptional({ description: 'Resolution of metric data points', enum: ['raw', '1m', '5m', '1h'], default: 'raw' })
  @IsOptional()
  @IsIn(['raw', '1m', '5m', '1h'])
  resolution?: 'raw' | '1m' | '5m' | '1h';

  @ApiPropertyOptional({ description: 'Maximum points to return per series', default: 500 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000)
  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : 500))
  limit?: number;
}

