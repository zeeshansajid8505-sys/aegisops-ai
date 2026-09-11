import {
  IsString,
  IsOptional,
  IsBoolean,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateEnvironmentDto {
  @ApiPropertyOptional({ example: 'Production EU-West' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'https://api-eu.aegisops.internal' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  baseUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isProduction?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

