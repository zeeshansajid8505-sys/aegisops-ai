import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { TelemetryKeysService } from '../telemetry-keys.service';

export interface TelemetryAuthContext {
  organizationId: string;
  serviceId: string;
  environmentId: string;
  ingestKeyId: string;
  rateLimitRpm: number;
  rateLimitPts: number;
}

export interface TelemetryRequest extends Request {
  telemetryAuth?: TelemetryAuthContext;
}

@Injectable()
export class MachineTelemetryAuthGuard implements CanActivate {
  constructor(private readonly telemetryKeysService: TelemetryKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TelemetryRequest>();

    // 1. Extract raw key from Authorization or X-Aegis-Telemetry-Key header
    let rawKey: string | null = null;
    const authHeader = request.headers['authorization'];
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      rawKey = authHeader.slice(7).trim();
    } else {
      const xKey = request.headers['x-aegis-telemetry-key'];
      if (xKey && typeof xKey === 'string') {
        rawKey = xKey.trim();
      }
    }

    if (!rawKey) {
      throw new UnauthorizedException(
        'Missing telemetry ingestion key. Provide via "Authorization: Bearer <key>" or "X-Aegis-Telemetry-Key" header.',
      );
    }

    if (!rawKey.startsWith('aeg_ing_')) {
      throw new UnauthorizedException('Invalid telemetry ingestion key format');
    }

    const validated = await this.telemetryKeysService.validateRawKey(rawKey);
    if (!validated) {
      throw new UnauthorizedException('Telemetry ingestion key is invalid, revoked, or expired');
    }

    request.telemetryAuth = {
      organizationId: validated.organizationId,
      serviceId: validated.serviceId,
      environmentId: validated.environmentId,
      ingestKeyId: validated.id,
      rateLimitRpm: validated.rateLimitRpm,
      rateLimitPts: validated.rateLimitPts,
    };

    return true;
  }
}

