import { IsString, IsNotEmpty, IsUUID, IsOptional, IsInt, Min, Max, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTelemetryKeyDto {
  @ApiProperty({ description: 'Human-friendly name for this ingest key', example: 'production-collector' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ description: 'Target Service Environment ID' })
  @IsUUID()
  @IsNotEmpty()
  environmentId!: string;

  @ApiPropertyOptional({ description: 'Maximum requests allowed per minute', default: 120 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  rateLimitRpm?: number;

  @ApiPropertyOptional({ description: 'Maximum metric points allowed per minute', default: 100000 })
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(1000000)
  rateLimitPts?: number;

  @ApiPropertyOptional({ description: 'Optional expiration timestamp in ISO 8601 format' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

