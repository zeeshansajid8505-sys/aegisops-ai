import {
  IsUUID,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DependencyType } from '@prisma/client';

export class CreateDependencyDto {
  @ApiProperty({ description: 'ID of the dependent service (source)' })
  @IsUUID()
  sourceServiceId!: string;

  @ApiProperty({ description: 'ID of the dependency service (target)' })
  @IsUUID()
  targetServiceId!: string;

  @ApiPropertyOptional({ enum: DependencyType, default: DependencyType.SYNCHRONOUS })
  @IsOptional()
  @IsEnum(DependencyType)
  dependencyType?: DependencyType;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isCritical?: boolean;

  @ApiPropertyOptional({ example: 'Primary payment transaction RPC integration' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

