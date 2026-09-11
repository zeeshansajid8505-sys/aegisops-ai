import { IsOptional, IsString, IsUUID, IsIn, IsInt, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AlertInstanceState } from '@aegisops/types';

export class QueryAlertsDto {
  @ApiPropertyOptional({ description: 'Filter by Service UUID' })
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @ApiPropertyOptional({ description: 'Filter by Environment UUID' })
  @IsOptional()
  @IsUUID()
  environmentId?: string;

  @ApiPropertyOptional({ description: 'Filter by Rule UUID' })
  @IsOptional()
  @IsUUID()
  ruleId?: string;

  @ApiPropertyOptional({
    description: 'Filter by Alert Instance State',
    enum: ['INACTIVE', 'PENDING', 'FIRING'],
  })
  @IsOptional()
  @IsIn(['INACTIVE', 'PENDING', 'FIRING'])
  state?: AlertInstanceState;

  @ApiPropertyOptional({ description: 'Filter by Severity Level', enum: ['SEV-1', 'SEV-2', 'SEV-3', 'SEV-4'] })
  @IsOptional()
  @IsIn(['SEV-1', 'SEV-2', 'SEV-3', 'SEV-4'])
  severity?: 'SEV-1' | 'SEV-2' | 'SEV-3' | 'SEV-4';

  @ApiPropertyOptional({ description: 'Search term for rule or service name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Maximum number of items to return', default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : 50))
  limit?: number;

  @ApiPropertyOptional({ description: 'Pagination offset', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : 0))
  offset?: number;
}

