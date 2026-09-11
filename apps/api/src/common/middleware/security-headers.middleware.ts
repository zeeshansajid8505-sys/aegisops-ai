import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // 1. Prevent MIME-type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // 2. Clickjacking protection: disallow framing except same-origin
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');

    // 3. Referrer Policy: strip path on cross-origin requests
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // 4. Permissions Policy: disable sensitive browser features
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

    // 5. Cross-Site Scripting filter for legacy browsers
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // 6. Content Security Policy (allows Swagger UI and WebSockets while restricting rogue execution)
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' ws: wss: http: https:; frame-ancestors 'self';",
    );

    // 7. Strict Transport Security (HSTS) in production
    if (process.env['NODE_ENV'] === 'production' && req.secure) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    next();
  }
}

