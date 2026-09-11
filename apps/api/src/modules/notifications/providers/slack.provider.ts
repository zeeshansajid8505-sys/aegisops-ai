import { Injectable, Logger } from '@nestjs/common';
import { SSRFValidatorService } from '../../security/ssrf-validator.service';

export interface SlackSendOptions {
  webhookUrl: string;
  title: string;
  message: string;
  severity: string;
  deepLink?: string;
  eventType?: string;
  serviceName?: string;
  environmentName?: string;
  metadata?: Record<string, any>;
}

export interface SlackSendResult {
  success: boolean;
  responseStatus: number;
  durationMs: number;
  responseExcerpt: string;
  errorMessage?: string;
}

@Injectable()
export class SlackProvider {
  private readonly logger = new Logger(SlackProvider.name);

  constructor(private readonly ssrfValidator: SSRFValidatorService) {}

  buildBlocks(options: SlackSendOptions) {
    const severityIcons: Record<string, string> = {
      CRITICAL: '🔴 *CRITICAL*',
      ERROR: '🟠 *ERROR*',
      WARNING: '🟡 *WARNING*',
      INFO: '🔵 *INFO*',
    };
    const sevBadge = severityIcons[options.severity] || `*${options.severity}*`;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const deepLinkUrl = options.deepLink
      ? options.deepLink.startsWith('http')
        ? options.deepLink
        : `${baseUrl}${options.deepLink.startsWith('/') ? '' : '/'}${options.deepLink}`
      : baseUrl;

    const fields: Array<{ type: 'mrkdwn'; text: string }> = [
      { type: 'mrkdwn', text: `*Severity:*\n${sevBadge}` },
      { type: 'mrkdwn', text: `*Event:*\n\`${options.eventType || 'operational.event'}\`` },
    ];

    if (options.serviceName) {
      fields.push({ type: 'mrkdwn', text: `*Service:*\n${options.serviceName}` });
    }
    if (options.environmentName) {
      fields.push({ type: 'mrkdwn', text: `*Environment:*\n${options.environmentName}` });
    }

    const blocks: any[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `🚨 ${options.title.slice(0, 140)}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: options.message,
        },
        fields,
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View in AegisOps ↗',
              emoji: true,
            },
            url: deepLinkUrl,
            style: options.severity === 'CRITICAL' || options.severity === 'ERROR' ? 'danger' : 'primary',
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Delivered by *AegisOps AI Notification Engine* • <!date^${Math.floor(
              Date.now() / 1000
            )}^{date_num} {time_secs}|${new Date().toISOString()}>`,
          },
        ],
      },
    ];

    return blocks;
  }

  async send(options: SlackSendOptions): Promise<SlackSendResult> {
    const startTime = Date.now();

    // 1. Validate destination URL against SSRF
    const validation = await this.ssrfValidator.validateTargetUrl(options.webhookUrl);
    if (!validation.valid) {
      this.logger.warn(`SSRF validation failed for Slack target: ${validation.error}`);
      return {
        success: false,
        responseStatus: 400,
        durationMs: Date.now() - startTime,
        responseExcerpt: `SSRF Block: ${validation.error}`,
        errorMessage: validation.error,
      };
    }

    const blocks = this.buildBlocks(options);
    const payload = {
      text: `[${options.severity}] ${options.title} - ${options.message}`,
      blocks,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(options.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'AegisOps-Notification-Engine/1.0',
        },
        body: JSON.stringify(payload),
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
        errorMessage: isOk ? undefined : `Slack HTTP ${res.status}: ${excerpt}`,
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

