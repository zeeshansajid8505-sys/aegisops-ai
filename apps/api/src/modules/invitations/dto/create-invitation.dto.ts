import { IsEmail, IsEnum, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@aegisops/types';

export class CreateInvitationDto {
  @ApiProperty({ example: 'colleague@aegisops.io', description: 'Invitee email address' })
  @IsEmail({}, { message: 'Must provide a valid email address' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @ApiProperty({ enum: ['OWNER', 'ADMIN', 'SRE', 'ENGINEER', 'MANAGER', 'VIEWER'], description: 'Assigned organization role' })
  @IsEnum(['OWNER', 'ADMIN', 'SRE', 'ENGINEER', 'MANAGER', 'VIEWER'] as const, {
    message: 'Role must be one of OWNER, ADMIN, SRE, ENGINEER, MANAGER, VIEWER',
  })
  @IsNotEmpty()
  role!: UserRole;
}