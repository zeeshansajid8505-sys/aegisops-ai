import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const rawHeader = req.headers['x-correlation-id'] || req.headers['x-request-id'];
    let correlationId: string;

    if (typeof rawHeader === 'string' && rawHeader.trim().length > 0 && rawHeader.trim().length <= 128) {
      // Sanitize: allow alphanumeric and standard UUID/dashes only
      correlationId = rawHeader.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    } else {
      correlationId = crypto.randomUUID();
    }

    req.correlationId = correlationId;
    res.setHeader('X-Correlation-ID', correlationId);
    next();
  }
}

