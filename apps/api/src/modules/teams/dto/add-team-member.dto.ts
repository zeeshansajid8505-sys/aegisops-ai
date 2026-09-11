import { IsUUID, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TeamRole } from '@prisma/client';

export class AddTeamMemberDto {
  @ApiProperty({ description: 'Organization Membership ID to add to this team' })
  @IsUUID()
  membershipId!: string;

  @ApiPropertyOptional({ enum: TeamRole, default: TeamRole.MEMBER })
  @IsOptional()
  @IsEnum(TeamRole)
  role?: TeamRole;
}

