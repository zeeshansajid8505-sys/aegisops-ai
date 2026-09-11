import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface RateLimitRecord {
  timestamps: number[];
}

@Injectable()
export class AuthRateLimiterGuard implements CanActivate {
  private readonly logger = new Logger(AuthRateLimiterGuard.name);
  private readonly windowMs = 60 * 1000; // 1 minute
  private readonly maxAttempts: number;
  private readonly store = new Map<string, RateLimitRecord>();

  constructor() {
    this.maxAttempts = parseInt(process.env['AUTH_RATE_LIMIT_MAX'] || '15', 10);
    // Periodic cleanup of stale entries every 5 minutes
    setInterval(() => this.cleanupStale(), 5 * 60 * 1000).unref();
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const windowStart = now - this.windowMs;

    let record = this.store.get(ip);
    if (!record) {
      record = { timestamps: [] };
      this.store.set(ip, record);
    }

    // Filter out timestamps outside current window
    record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

    if (record.timestamps.length >= this.maxAttempts) {
      this.logger.warn(`Auth Rate Limit Exceeded for IP: ${ip} on ${req.method} ${req.url}`);
      res.setHeader('Retry-After', '60');
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: 'Too many authentication attempts. Please wait 60 seconds and try again.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    record.timestamps.push(now);
    return true;
  }

  private cleanupStale(): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    for (const [ip, record] of this.store.entries()) {
      record.timestamps = record.timestamps.filter((ts) => ts > windowStart);
      if (record.timestamps.length === 0) {
        this.store.delete(ip);
      }
    }
  }
}

