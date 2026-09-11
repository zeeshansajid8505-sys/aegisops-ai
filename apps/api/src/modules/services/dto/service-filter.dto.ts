import {
  IsOptional,
  IsString,
  IsEnum,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ServiceType,
  ServiceTier,
  ServiceLifecycle,
  ServiceHealthStatus,
} from '@prisma/client';

export class ServiceFilterDto {
  @ApiPropertyOptional({ description: 'Text search matching service name, slug, or description' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: ServiceTier })
  @IsOptional()
  @IsEnum(ServiceTier)
  tier?: ServiceTier;

  @ApiPropertyOptional({ enum: ServiceType })
  @IsOptional()
  @IsEnum(ServiceType)
  serviceType?: ServiceType;

  @ApiPropertyOptional({ enum: ServiceLifecycle })
  @IsOptional()
  @IsEnum(ServiceLifecycle)
  lifecycleStatus?: ServiceLifecycle;

  @ApiPropertyOptional({ description: 'Filter by owner team ID' })
  @IsOptional()
  @IsString()
  ownerTeamId?: string;

  @ApiPropertyOptional({ enum: ServiceHealthStatus })
  @IsOptional()
  @IsEnum(ServiceHealthStatus)
  healthStatus?: ServiceHealthStatus;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

