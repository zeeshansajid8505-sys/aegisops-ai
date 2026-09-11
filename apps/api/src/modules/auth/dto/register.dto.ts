import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'Zeeshan Sajid', description: 'User full display name' })
  @IsString()
  @IsNotEmpty()
  @Length(2, 60)
  displayName!: string;

  @ApiProperty({ example: 'engineer@aegisops.io', description: 'Corporate email address' })
  @IsEmail({}, { message: 'Must provide a valid email address' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @ApiProperty({ example: 'P@ssw0rdSecure2026', description: 'Strong password with min 8 characters' })
  @IsString()
  @Length(8, 128, { message: 'Password must be between 8 and 128 characters long' })
  password!: string;

  @ApiProperty({ example: 'AegisOps Primary Ops', description: 'Initial organization name to create' })
  @IsString()
  @IsNotEmpty()
  @Length(2, 64)
  organizationName!: string;
}