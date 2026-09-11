import { IsString, IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryDefinitionsDto {
  @ApiPropertyOptional({ description: 'Optional Service Environment ID filter' })
  @IsOptional()
  @IsUUID()
  environmentId?: string;

  @ApiPropertyOptional({ description: 'Search metric name or description' })
  @IsOptional()
  @IsString()
  search?: string;
}

