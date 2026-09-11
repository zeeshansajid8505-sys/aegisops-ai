import { IsNotEmpty, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Production SRE Team', description: 'Organization display name' })
  @IsString()
  @IsNotEmpty()
  @Length(2, 64)
  name!: string;
}