import { IsString, IsNotEmpty, IsOptional, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTeamDto {
  @ApiProperty({ example: 'Reliability Engineering' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: 'sre-reliability' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug must be lowercase alphanumeric and single hyphens',
  })
  slug?: string;

  @ApiPropertyOptional({ example: 'Core platform reliability and production infrastructure' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

