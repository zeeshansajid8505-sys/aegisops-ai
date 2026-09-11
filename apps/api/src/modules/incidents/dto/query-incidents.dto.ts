import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsUUID, IsInt, Min, Max, IsBoolean } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { IncidentStatus, IncidentSeverity, IncidentSource } from '@prisma/client';

export class QueryIncidentsDto {
  @ApiPropertyOptional({ enum: ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'MITIGATED', 'RESOLVED'] })
  @IsOptional()
  @IsEnum(['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'MITIGATED', 'RESOLVED'])
  status?: IncidentStatus;

  @ApiPropertyOptional({ enum: ['CRITICAL', 'ERROR', 'WARNING', 'INFO'] })
  @IsOptional()
  @IsEnum(['CRITICAL', 'ERROR', 'WARNING', 'INFO'])
  severity?: IncidentSeverity;

  @ApiPropertyOptional({ description: 'Filter by primary service ID' })
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @ApiPropertyOptional({ description: 'Filter by environment ID' })
  @IsOptional()
  @IsUUID()
  environmentId?: string;

  @ApiPropertyOptional({ description: 'Filter by commander membership ID' })
  @IsOptional()
  @IsUUID()
  commanderMembershipId?: string;

  @ApiPropertyOptional({ enum: ['AUTOMATED', 'MANUAL'] })
  @IsOptional()
  @IsEnum(['AUTOMATED', 'MANUAL'])
  source?: IncidentSource;

  @ApiPropertyOptional({ description: 'Filter by whether all signals have cleared' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  signalsCleared?: boolean;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;

  @ApiPropertyOptional({ description: 'Search term for title or key' })
  @IsOptional()
  @IsString()
  search?: string;
}

