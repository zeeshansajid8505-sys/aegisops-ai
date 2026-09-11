import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { SSRFValidatorService } from '../../security/ssrf-validator.service';

export interface WebhookSendOptions {
  targetUrl: string;
  signingSecret?: string;
  customHeaders?: Record<string, string>;
  eventId: string;
  eventType: string;
  severity: string;
  sourceModule: string;
  title: string;
  message: string;
  payload: Record<string, any>;
  occurredAt: string;
}

export interface WebhookSendResult {
  success: boolean;
  responseStatus: number;
  durationMs: number;
  responseExcerpt: string;
  errorMessage?: string;
}

@Injectable()
export class WebhookProvider {
  private readonly logger = new Logger(WebhookProvider.name);

  constructor(private readonly ssrfValidator: SSRFValidatorService) {}

  async send(options: WebhookSendOptions): Promise<WebhookSendResult> {
    const startTime = Date.now();

    // 1. SSRF validation
    const validation = await this.ssrfValidator.validateTargetUrl(options.targetUrl);
    if (!validation.valid) {
      this.logger.warn(`SSRF validation failed for webhook target: ${validation.error}`);
      return {
        success: false,
        responseStatus: 400,
        durationMs: Date.now() - startTime,
        responseExcerpt: `SSRF Block: ${validation.error}`,
        errorMessage: validation.error,
      };
    }

    const timestamp = Date.now().toString();
    const eventEnvelope = {
      specVersion: '1.0',
      id: options.eventId,
      type: options.eventType,
      source: `aegisops.${options.sourceModule}`,
      time: options.occurredAt || new Date().toISOString(),
      data: {
        title: options.title,
        message: options.message,
        severity: options.severity,
        payload: options.payload,
      },
    };

    const rawBody = JSON.stringify(eventEnvelope);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'AegisOps-Webhook-Dispatcher/1.0',
      'X-AegisOps-Event-Id': options.eventId,
      'X-AegisOps-Timestamp': timestamp,
      ...(options.customHeaders || {}),
    };

    // 2. HMAC-SHA256 signature if secret is provided
    if (options.signingSecret) {
      const signaturePayload = `${timestamp}.${rawBody}`;
      const hmac = crypto
        .createHmac('sha256', options.signingSecret)
        .update(signaturePayload)
        .digest('hex');
      headers['X-AegisOps-Signature'] = `sha256=${hmac}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(options.targetUrl, {
        method: 'POST',
        headers,
        body: rawBody,
        redirect: 'manual',
        signal: controller.signal,
      });

      const responseText = await res.text();
      const excerpt = responseText.slice(0, 500);
      const isOk = res.status >= 200 && res.status < 300;

      return {
        success: isOk,
        responseStatus: res.status,
        durationMs: Date.now() - startTime,
        responseExcerpt: excerpt,
        errorMessage: isOk ? undefined : `Webhook HTTP ${res.status}: ${excerpt}`,
      };
    } catch (err: any) {
      const isAbort = err.name === 'AbortError';
      const errMsg = isAbort ? 'Request timed out after 10000ms' : err.message || 'Unknown network error';
      return {
        success: false,
        responseStatus: 504,
        durationMs: Date.now() - startTime,
        responseExcerpt: errMsg,
        errorMessage: errMsg,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

