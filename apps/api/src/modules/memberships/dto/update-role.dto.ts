import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@aegisops/types';

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: ['OWNER', 'ADMIN', 'SRE', 'ENGINEER', 'MANAGER', 'VIEWER'], description: 'Assigned organization role' })
  @IsEnum(['OWNER', 'ADMIN', 'SRE', 'ENGINEER', 'MANAGER', 'VIEWER'] as const, {
    message: 'Role must be one of OWNER, ADMIN, SRE, ENGINEER, MANAGER, VIEWER',
  })
  @IsNotEmpty()
  role!: UserRole;
}