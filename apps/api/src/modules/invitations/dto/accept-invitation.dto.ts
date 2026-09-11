import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AcceptInvitationDto {
  @ApiProperty({ example: 'inv_abc123...', description: 'One-time secure invitation acceptance token' })
  @IsString()
  @IsNotEmpty({ message: 'Invitation token is required' })
  token!: string;
}