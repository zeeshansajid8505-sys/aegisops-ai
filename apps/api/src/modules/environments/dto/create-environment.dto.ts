import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsUrl,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EnvironmentKind } from '@prisma/client';

export class CreateEnvironmentDto {
  @ApiProperty({ example: 'Production US-East' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: 'production' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Key must be lowercase alphanumeric and single hyphens',
  })
  key?: string;

  @ApiProperty({ enum: EnvironmentKind, default: EnvironmentKind.DEVELOPMENT })
  @IsEnum(EnvironmentKind)
  kind!: EnvironmentKind;

  @ApiPropertyOptional({ example: 'https://api.aegisops.internal' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  baseUrl?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isProduction?: boolean;
}

