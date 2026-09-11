import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTeamDto {
  @ApiPropertyOptional({ example: 'Platform Infrastructure SRE' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'Updated mission and team charter' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

