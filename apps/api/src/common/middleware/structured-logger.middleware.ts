import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

const SENSITIVE_KEYS = new Set([
  'password',
  'newpassword',
  'token',
  'rawtoken',
  'secret',
  'signingsecret',
  'apikey',
  'telemetrykey',
  'authorization',
  'cookie',
  'set-cookie',
]);

export function redactSensitiveData(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(redactSensitiveData);
  }

  const redacted: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    const lower = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lower) || lower.includes('secret') || lower.includes('password')) {
      redacted[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      redacted[key] = redactSensitiveData(val);
    } else {
      redacted[key] = val;
    }
  }
  return redacted;
}

@Injectable()
export class StructuredLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();
    const correlationId = req.correlationId || (req.headers['x-correlation-id'] as string) || 'none';
    const method = req.method;
    const url = req.originalUrl || req.url;

    // Do not log noisy health probes repeatedly in dev
    const isHealthCheck = url.includes('/api/health') || url.includes('/api/live') || url.includes('/api/ready');

    res.on('finish', () => {
      const durationMs = Date.now() - start;
      const statusCode = res.statusCode;
      const organizationId = (req as any).organization?.id || (req as any).params?.organizationId || req.headers['x-organization-id'] || null;

      if (!isHealthCheck || statusCode >= 400) {
        const logPayload = {
          timestamp: new Date().toISOString(),
          level: statusCode >= 500 ? 'ERROR' : statusCode >= 400 ? 'WARN' : 'INFO',
          correlationId,
          method,
          url,
          statusCode,
          durationMs,
          organizationId,
          ip: req.ip || req.socket.remoteAddress,
        };

        const message = `${method} ${url} ${statusCode} [${durationMs}ms] - ${correlationId}`;
        if (statusCode >= 500) {
          this.logger.error(message, JSON.stringify(logPayload));
        } else if (statusCode >= 400) {
          this.logger.warn(message);
        } else {
          this.logger.log(message);
        }
      }
    });

    next();
  }
}

