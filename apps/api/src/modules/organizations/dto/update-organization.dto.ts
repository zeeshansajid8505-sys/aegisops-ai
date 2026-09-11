import { IsOptional, IsString, Length } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ example: 'Global SRE & Incident Ops', description: 'Updated organization name' })
  @IsOptional()
  @IsString()
  @Length(2, 64)
  name?: string;
}