import {
  IsString,
  IsOptional,
  IsEnum,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceType, ServiceTier } from '@prisma/client';

export class UpdateServiceDto {
  @ApiPropertyOptional({ example: 'Payment & Billing Gateway' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'Updated description of checkout workloads' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ enum: ServiceType })
  @IsOptional()
  @IsEnum(ServiceType)
  serviceType?: ServiceType;

  @ApiPropertyOptional({ enum: ServiceTier })
  @IsOptional()
  @IsEnum(ServiceTier)
  tier?: ServiceTier;

  @ApiPropertyOptional({ description: 'ID of the team owning this service or null to unassign' })
  @IsOptional()
  @IsString()
  ownerTeamId?: string | null;

  @ApiPropertyOptional({ example: 'https://github.com/organization/payment-service' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  repositoryUrl?: string;

  @ApiPropertyOptional({ example: 'https://wiki.organization.internal/services/payments' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  documentationUrl?: string;
}

