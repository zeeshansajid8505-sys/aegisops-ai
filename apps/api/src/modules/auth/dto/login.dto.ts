import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'engineer@aegisops.io', description: 'User email address' })
  @IsEmail({}, { message: 'Must provide a valid email address' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @ApiProperty({ example: 'P@ssw0rdSecure2026', description: 'Account password' })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  password!: string;
}