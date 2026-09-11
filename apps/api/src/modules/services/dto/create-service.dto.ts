import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsUrl,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceType, ServiceTier, ServiceLifecycle } from '@prisma/client';

export class CreateServiceDto {
  @ApiProperty({ example: 'Payment Processing Service' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: 'payment-service' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug must be lowercase alphanumeric and single hyphens',
  })
  slug?: string;

  @ApiPropertyOptional({ example: 'Handles credit card, Stripe, and wire checkout pipelines' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ enum: ServiceType, default: ServiceType.API })
  @IsEnum(ServiceType)
  serviceType!: ServiceType;

  @ApiProperty({ enum: ServiceTier, default: ServiceTier.TIER_2 })
  @IsEnum(ServiceTier)
  tier!: ServiceTier;

  @ApiPropertyOptional({ enum: ServiceLifecycle, default: ServiceLifecycle.ACTIVE })
  @IsOptional()
  @IsEnum(ServiceLifecycle)
  lifecycleStatus?: ServiceLifecycle;

  @ApiPropertyOptional({ description: 'ID of the team owning this service' })
  @IsOptional()
  @IsString()
  ownerTeamId?: string;

  @ApiPropertyOptional({ example: 'https://github.com/organization/payment-service' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  repositoryUrl?: string;

  @ApiPropertyOptional({ example: 'https://wiki.organization.internal/services/payments' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  documentationUrl?: string;
}

