import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const correlationId = request.correlationId || (request.headers['x-correlation-id'] as string) || 'unknown';
    const timestamp = new Date().toISOString();
    const path = request.url;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let errorType = 'InternalServerError';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, any>;
        message = resObj['message'] || exception.message;
        errorType = resObj['error'] || exception.name;
      }
    } else if (exception instanceof Error) {
      if (exception.message.toLowerCase().includes('cors')) {
        status = HttpStatus.FORBIDDEN;
        errorType = 'Forbidden';
        message = 'Cross-Origin Request Blocked by Security Policy';
      } else {
        // Unhandled server error: log stack trace internally with correlation ID
        this.logger.error(
          `[${correlationId}] Unhandled exception on ${request.method} ${path}: ${exception.message}`,
          exception.stack,
        );
        // In production, never expose raw error messages/stack traces to client
        if (process.env['NODE_ENV'] !== 'production') {
          message = exception.message;
        }
      }
    }

    // RFC 7807 compliant problem details response
    response.status(status).json({
      statusCode: status,
      error: errorType,
      message,
      correlationId,
      timestamp,
      path,
    });
  }
}

