import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsEnum, IsUUID } from 'class-validator';
import { IncidentStatus, IncidentSeverity, IncidentResponderRole } from '@prisma/client';

export class TransitionIncidentDto {
  @ApiProperty({ enum: ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'MITIGATED', 'RESOLVED'] })
  @IsEnum(['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'MITIGATED', 'RESOLVED'])
  @IsNotEmpty()
  status!: IncidentStatus;

  @ApiPropertyOptional({ description: 'Optional operational reason for transition' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class AcknowledgeIncidentDto {
  @ApiPropertyOptional({ description: 'Optional note on acknowledgement' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class ResolveIncidentDto {
  @ApiProperty({ description: 'Mandatory resolution summary explaining remediation' })
  @IsString()
  @IsNotEmpty()
  resolutionSummary!: string;
}

export class ReopenIncidentDto {
  @ApiProperty({ description: 'Mandatory reason for reopening the resolved incident' })
  @IsString()
  @IsNotEmpty()
  reopenReason!: string;
}

export class AssignCommanderDto {
  @ApiProperty({ description: 'Membership ID to assign as Incident Commander' })
  @IsUUID()
  @IsNotEmpty()
  commanderMembershipId!: string;
}

export class AddResponderDto {
  @ApiProperty({ description: 'Membership ID to add as incident responder' })
  @IsUUID()
  @IsNotEmpty()
  membershipId!: string;

  @ApiPropertyOptional({ enum: ['COMMANDER', 'RESPONDER'], default: 'RESPONDER' })
  @IsOptional()
  @IsEnum(['COMMANDER', 'RESPONDER'])
  role?: IncidentResponderRole;
}

export class AddIncidentNoteDto {
  @ApiProperty({ description: 'Investigation note or status update message' })
  @IsString()
  @IsNotEmpty()
  note!: string;
}

export class AttachAlertDto {
  @ApiProperty({ description: 'AlertEvent ID to manually attach to this incident' })
  @IsUUID()
  @IsNotEmpty()
  alertEventId!: string;

  @ApiPropertyOptional({ description: 'Operational reason for manually attaching alert' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class UnlinkAlertDto {
  @ApiProperty({ description: 'Mandatory reason for unlinking alert from this incident' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class UpdateSeverityDto {
  @ApiProperty({ enum: ['CRITICAL', 'ERROR', 'WARNING', 'INFO'] })
  @IsEnum(['CRITICAL', 'ERROR', 'WARNING', 'INFO'])
  @IsNotEmpty()
  severity!: IncidentSeverity;

  @ApiProperty({ description: 'Reason for changing severity level' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

