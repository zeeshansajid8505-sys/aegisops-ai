import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsEnum, IsUUID } from 'class-validator';
import { IncidentSeverity } from '@prisma/client';

export class CreateIncidentDto {
  @ApiProperty({ description: 'Title of the incident', example: 'API Gateway 5xx Spike' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional({ description: 'Optional initial summary/description' })
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiPropertyOptional({ enum: ['CRITICAL', 'ERROR', 'WARNING', 'INFO'], default: 'WARNING' })
  @IsOptional()
  @IsEnum(['CRITICAL', 'ERROR', 'WARNING', 'INFO'])
  severity?: IncidentSeverity;

  @ApiPropertyOptional({ description: 'Primary impacted service ID' })
  @IsOptional()
  @IsUUID()
  primaryServiceId?: string;

  @ApiPropertyOptional({ description: 'Impacted environment ID' })
  @IsOptional()
  @IsUUID()
  environmentId?: string;

  @ApiPropertyOptional({ description: 'Incident commander membership ID' })
  @IsOptional()
  @IsUUID()
  commanderMembershipId?: string;

  @ApiPropertyOptional({ description: 'Assigned team ID' })
  @IsOptional()
  @IsUUID()
  assignedTeamId?: string;
}

