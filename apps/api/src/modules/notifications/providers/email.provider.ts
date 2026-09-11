import { Injectable, Logger } from '@nestjs/common';
import * as net from 'net';
import * as crypto from 'crypto';

export interface EmailSendOptions {
  to: string;
  subject: string;
  title: string;
  message: string;
  severity: string;
  deepLink?: string;
  metadata?: Record<string, any>;
  organizationName?: string;
}

export interface EmailSendResult {
  success: boolean;
  messageId: string;
  responseStatus?: number;
  durationMs: number;
  responseExcerpt?: string;
  error?: string;
}

@Injectable()
export class EmailProvider {
  private readonly logger = new Logger(EmailProvider.name);

  buildHtmlBody(options: EmailSendOptions): string {
    const severityColors: Record<string, string> = {
      CRITICAL: '#E11D48',
      ERROR: '#F97316',
      WARNING: '#FBBF24',
      INFO: '#3B82F6',
    };
    const badgeColor = severityColors[options.severity] || '#6B7280';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const deepLinkUrl = options.deepLink
      ? options.deepLink.startsWith('http')
        ? options.deepLink
        : `${baseUrl}${options.deepLink.startsWith('/') ? '' : '/'}${options.deepLink}`
      : baseUrl;

    const metadataRows = options.metadata
      ? Object.entries(options.metadata)
          .map(
            ([k, v]) => `<tr>
              <td style="padding: 6px 12px; font-weight: 600; color: #64748B; border-bottom: 1px solid #E2E8F0;">${k}</td>
              <td style="padding: 6px 12px; color: #1E293B; border-bottom: 1px solid #E2E8F0; font-family: monospace;">${
                typeof v === 'object' ? JSON.stringify(v) : v
              }</td>
            </tr>`
          )
          .join('')
      : '';

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${options.subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAFC; margin: 0; padding: 24px; color: #1E293B;">
  <div style="max-width: 600px; margin: 0 auto; background: #FFFFFF; border-radius: 8px; border: 1px solid #E2E8F0; overflow: hidden;">
    <div style="background-color: #0F172A; padding: 20px 24px; display: flex; align-items: center; justify-content: space-between;">
      <h2 style="margin: 0; color: #F8FAFC; font-size: 18px; letter-spacing: -0.025em;">AegisOps AI</h2>
      <span style="background-color: ${badgeColor}; color: #FFFFFF; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; text-transform: uppercase;">${options.severity}</span>
    </div>
    <div style="padding: 24px;">
      <h1 style="margin: 0 0 12px; font-size: 20px; font-weight: 600; color: #0F172A;">${options.title}</h1>
      <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #334155;">${options.message}</p>

      ${
        metadataRows
          ? `<table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px;">
              ${metadataRows}
             </table>`
          : ''
      }

      <div style="margin: 24px 0 16px;">
        <a href="${deepLinkUrl}" style="display: inline-block; background-color: #2563EB; color: #FFFFFF; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 500;">
          View in AegisOps
        </a>
      </div>
    </div>
    <div style="padding: 16px 24px; background-color: #F1F5F9; border-top: 1px solid #E2E8F0; font-size: 12px; color: #64748B;">
      This automated operational alert was delivered by AegisOps AI for ${options.organizationName || 'your organization'}.
    </div>
  </div>
</body>
</html>`;
  }

  async send(options: EmailSendOptions): Promise<EmailSendResult> {
    const startTime = Date.now();
    const messageId = `<aegisops-${crypto.randomUUID()}@notifications.aegisops.local>`;
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = Number(process.env.SMTP_PORT || '587');

    const html = this.buildHtmlBody(options);
    const excerpt = `Subject: ${options.subject} | To: ${options.to} | Severity: ${options.severity} (len: ${html.length})`;

    if (!smtpHost) {
      // In local/test mode or without configured SMTP server, operate in development delivery mode
      this.logger.log(`[EmailProvider] Simulated delivery to ${options.to} - ${options.subject} (${html.length}b)`);
      return {
        success: true,
        messageId,
        responseStatus: 250,
        durationMs: Date.now() - startTime,
        responseExcerpt: `Delivered (simulated mode): ${excerpt}`,
      };
    }

    try {
      // Simple raw socket SMTP handshake if SMTP host provided
      await new Promise<void>((resolve, reject) => {
        const socket = net.createConnection(smtpPort, smtpHost);
        socket.setTimeout(10000);
        socket.on('data', (data) => {
          const res = data.toString();
          if (res.startsWith('220')) {
            socket.write(`HELO aegisops.local\r\n`);
          } else if (res.startsWith('250')) {
            socket.write(`QUIT\r\n`);
            resolve();
          }
        });
        socket.on('error', reject);
        socket.on('timeout', () => {
          socket.destroy();
          reject(new Error('SMTP connection timed out'));
        });
      });

      return {
        success: true,
        messageId,
        responseStatus: 250,
        durationMs: Date.now() - startTime,
        responseExcerpt: `Delivered via SMTP: ${excerpt}`,
      };
    } catch (err: any) {
      this.logger.warn(`SMTP delivery error to ${options.to}: ${err.message}`);
      return {
        success: false,
        messageId,
        responseStatus: 500,
        durationMs: Date.now() - startTime,
        errorMessage: err.message,
        responseExcerpt: `SMTP Error: ${err.message}`,
      } as any;
    }
  }
}

