import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  Max,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateHealthProbeDto {
  @ApiPropertyOptional({ example: 'Updated HTTP Liveness Probe' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isCritical?: boolean;

  @ApiPropertyOptional({ example: 30, minimum: 10, maximum: 900 })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(900)
  intervalSeconds?: number;

  @ApiPropertyOptional({ example: 5000, minimum: 250, maximum: 10000 })
  @IsOptional()
  @IsInt()
  @Min(250)
  @Max(10000)
  timeoutMs?: number;

  @ApiPropertyOptional({ example: 3, minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  failureThreshold?: number;

  @ApiPropertyOptional({ example: 2, minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  successThreshold?: number;

  @ApiPropertyOptional({ example: 'GET', enum: ['GET', 'HEAD'] })
  @IsOptional()
  @IsString()
  @Matches(/^(GET|HEAD)$/, { message: 'HTTP method must be GET or HEAD' })
  httpMethod?: string;

  @ApiPropertyOptional({ example: '/health' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(/^\/[a-zA-Z0-9_\-\.\/]*$/, { message: 'HTTP path must begin with a forward slash /' })
  httpPath?: string;

  @ApiPropertyOptional({ example: 200, minimum: 100, maximum: 599 })
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(599)
  httpExpectedStatusMin?: number;

  @ApiPropertyOptional({ example: 299, minimum: 100, maximum: 599 })
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(599)
  httpExpectedStatusMax?: number;

  @ApiPropertyOptional({ example: 'grpc.internal.service:50051' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  grpcHost?: string;

  @ApiPropertyOptional({ example: 'grpc.health.v1.Health' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  grpcService?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  grpcUseTls?: boolean;
}

