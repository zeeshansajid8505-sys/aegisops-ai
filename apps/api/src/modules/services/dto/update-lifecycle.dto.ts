import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ServiceLifecycle } from '@prisma/client';

export class UpdateServiceLifecycleDto {
  @ApiProperty({ enum: ServiceLifecycle, example: ServiceLifecycle.DEPRECATED })
  @IsNotEmpty()
  @IsEnum(ServiceLifecycle)
  lifecycleStatus!: ServiceLifecycle;
}

