import { IsOptional, IsString, IsUUID, IsIn, IsInt, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AlertRuleStatus } from '@aegisops/types';

export class QueryAlertRulesDto {
  @ApiPropertyOptional({ description: 'Filter by Service UUID' })
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @ApiPropertyOptional({ description: 'Filter by Environment UUID' })
  @IsOptional()
  @IsUUID()
  environmentId?: string;

  @ApiPropertyOptional({ description: 'Filter by Rule Status', enum: ['ENABLED', 'DISABLED', 'ARCHIVED'] })
  @IsOptional()
  @IsIn(['ENABLED', 'DISABLED', 'ARCHIVED'])
  status?: AlertRuleStatus;

  @ApiPropertyOptional({ description: 'Filter by Severity Level', enum: ['SEV-1', 'SEV-2', 'SEV-3', 'SEV-4'] })
  @IsOptional()
  @IsIn(['SEV-1', 'SEV-2', 'SEV-3', 'SEV-4'])
  severity?: 'SEV-1' | 'SEV-2' | 'SEV-3' | 'SEV-4';

  @ApiPropertyOptional({ description: 'Search term by rule name or description' })
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

