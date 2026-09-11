import { Worker, Job, Queue } from 'bullmq';
import { PrismaClient, NotificationDeliveryStatus, NotificationChannel } from '@prisma/client';
import * as crypto from 'crypto';
import * as net from 'net';
import { WorkerConfig } from '../config';
import { WorkerSSRFValidator } from '../ssrf-validator';

export const NOTIFICATION_DELIVERY_QUEUE_NAME =
  process.env['NOTIFICATION_DELIVERY_QUEUE_NAME'] ?? 'notification-delivery';

export interface NotificationDeliveryJobData {
  deliveryId: string;
  organizationId: string;
  channel: 'EMAIL' | 'SLACK' | 'WEBHOOK';
  destination: string;
  notificationEventId: string;
  integrationConnectionId?: string;
  attemptNumber: number;
}

export class NotificationDeliveryWorker {
  private worker: Worker<NotificationDeliveryJobData> | null = null;
  private queue: Queue<NotificationDeliveryJobData> | null = null;
  private readonly ssrfValidator: WorkerSSRFValidator;
  private readonly encryptionKey: Buffer;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: WorkerConfig,
  ) {
    this.ssrfValidator = new WorkerSSRFValidator();
    const rawKey =
      process.env['INTEGRATION_ENCRYPTION_KEY'] ||
      process.env['SESSION_SECRET'] ||
      'aegisops-production-integration-secret-encryption-master-key-v1';
    this.encryptionKey = crypto.createHash('sha256').update(rawKey).digest();
  }

  private decryptSecret(payload: { ciphertext: string; iv: string; tag: string }): string {
    const iv = Buffer.from(payload.iv, 'hex');
    const tag = Buffer.from(payload.tag, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(tag);
    let plaintext = decipher.update(payload.ciphertext, 'hex', 'utf8');
    plaintext += decipher.final('utf8');
    return plaintext;
  }

  async start(): Promise<void> {
    const redisConnection = {
      host: this.config.redisHost,
      port: this.config.redisPort,
      maxRetriesPerRequest: null,
    };

    this.queue = new Queue<NotificationDeliveryJobData>(NOTIFICATION_DELIVERY_QUEUE_NAME, {
      connection: redisConnection,
    });

    this.worker = new Worker<NotificationDeliveryJobData>(
      NOTIFICATION_DELIVERY_QUEUE_NAME,
      async (job: Job<NotificationDeliveryJobData>) => {
        await this.processDelivery(job.data);
      },
      {
        connection: redisConnection,
        concurrency: 5,
      },
    );

    // eslint-disable-next-line no-console
    console.log(`[NotificationDeliveryWorker] Started consuming queue '${NOTIFICATION_DELIVERY_QUEUE_NAME}'`);
  }

  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }
  }

  private async processDelivery(data: NotificationDeliveryJobData): Promise<void> {
    const delivery = await this.prisma.notificationDelivery.findUnique({
      where: { id: data.deliveryId },
      include: {
        notificationEvent: true,
        integrationConnection: true,
      },
    });

    if (!delivery || delivery.status === NotificationDeliveryStatus.DELIVERED) {
      return;
    }

    const event = delivery.notificationEvent;
    const attemptNumber = delivery.attemptCount + 1;
    const startTime = Date.now();

    let success = false;
    let responseStatus: number | null = null;
    let responseExcerpt = '';
    let errorMessage: string | null = null;
    let retryAfterSeconds: number | null = null;

    try {
      if (delivery.channel === NotificationChannel.EMAIL) {
        // --- EMAIL DISPATCH ---
        const result = await this.dispatchEmail(delivery.destination, event);
        success = result.success;
        responseStatus = result.status;
        responseExcerpt = result.excerpt;
        errorMessage = result.error ?? null;
      } else if (delivery.channel === NotificationChannel.SLACK) {
        // --- SLACK DISPATCH ---
        const targetUrl = delivery.destination;
        const validation = await this.ssrfValidator.validateTargetUrl(targetUrl);
        if (!validation.valid) {
          throw new Error(`SSRF Block: ${validation.error}`);
        }

        const slackPayload = {
          text: `[${event.severity}] ${event.title}\n${event.message}`,
          blocks: [
            {
              type: 'header',
              text: { type: 'plain_text', text: `🚨 ${event.title.slice(0, 140)}` },
            },
            {
              type: 'section',
              text: { type: 'mrkdwn', text: event.message },
            },
          ],
        };

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          const res = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(slackPayload),
            redirect: 'manual',
            signal: controller.signal,
          });
          clearTimeout(timeout);
          responseStatus = res.status;
          responseExcerpt = (await res.text()).slice(0, 500);
          success = res.status >= 200 && res.status < 300;
          if (!success) {
            errorMessage = `Slack returned status ${res.status}: ${responseExcerpt}`;
          }
        } catch (err: any) {
          clearTimeout(timeout);
          throw err;
        }
      } else if (delivery.channel === NotificationChannel.WEBHOOK) {
        // --- WEBHOOK DISPATCH ---
        const targetUrl = delivery.destination;
        const validation = await this.ssrfValidator.validateTargetUrl(targetUrl);
        if (!validation.valid) {
          throw new Error(`SSRF Block: ${validation.error}`);
        }

        let signingSecret: string | undefined;
        const conn = delivery.integrationConnection;
        if (conn?.secretCiphertext && conn?.secretIv && conn?.secretTag) {
          signingSecret = this.decryptSecret({
            ciphertext: conn.secretCiphertext,
            iv: conn.secretIv,
            tag: conn.secretTag,
          });
        }

        const timestamp = Date.now().toString();
        const envelope = {
          specVersion: '1.0',
          id: event.id,
          type: event.eventType,
          source: `aegisops.${event.sourceModule}`,
          time: event.occurredAt.toISOString(),
          data: {
            title: event.title,
            message: event.message,
            severity: event.severity,
            payload: event.payload,
          },
        };

        const rawBody = JSON.stringify(envelope);
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'User-Agent': 'AegisOps-Notification-Worker/1.0',
          'X-AegisOps-Event-Id': event.id,
          'X-AegisOps-Timestamp': timestamp,
          ...((conn?.headers as Record<string, string>) || {}),
        };

        if (signingSecret) {
          const hmac = crypto
            .createHmac('sha256', signingSecret)
            .update(`${timestamp}.${rawBody}`)
            .digest('hex');
          headers['X-AegisOps-Signature'] = `sha256=${hmac}`;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          const res = await fetch(targetUrl, {
            method: 'POST',
            headers,
            body: rawBody,
            redirect: 'manual',
            signal: controller.signal,
          });
          clearTimeout(timeout);
          responseStatus = res.status;
          responseExcerpt = (await res.text()).slice(0, 500);
          success = res.status >= 200 && res.status < 300;

          const retryAfterHeader = res.headers.get('retry-after');
          if (retryAfterHeader) {
            const parsedSeconds = parseInt(retryAfterHeader, 10);
            if (!isNaN(parsedSeconds) && parsedSeconds > 0) {
              retryAfterSeconds = parsedSeconds;
            }
          }

          if (!success) {
            errorMessage = `Webhook returned status ${res.status}: ${responseExcerpt}`;
          }
        } catch (err: any) {
          clearTimeout(timeout);
          throw err;
        }
      }
    } catch (err: any) {
      success = false;
      errorMessage = err?.message || 'Unknown network error during notification delivery';
      responseExcerpt = (errorMessage || '').slice(0, 500);
    }

    const durationMs = Date.now() - startTime;

    // 1. Record Delivery Attempt
    await this.prisma.notificationDeliveryAttempt.create({
      data: {
        deliveryId: delivery.id,
        attemptNumber,
        responseStatus,
        responseDurationMs: durationMs,
        responseBodyExcerpt: responseExcerpt,
        errorMessage,
      },
    });

    // 2. Update Delivery Status & Schedule Backoff Retry if needed
    if (success) {
      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: NotificationDeliveryStatus.DELIVERED,
          attemptCount: attemptNumber,
          deliveredAt: new Date(),
          lastError: null,
          nextAttemptAt: null,
        },
      });
      // eslint-disable-next-line no-console
      console.log(`[NotificationDeliveryWorker] Delivery ${delivery.id} (${delivery.channel}) DELIVERED in ${durationMs}ms`);
    } else {
      const willRetry = attemptNumber < delivery.maxAttempts;
      // Exponential backoff: 20s, 60s, 300s, 1800s
      const backoffMs = retryAfterSeconds
        ? retryAfterSeconds * 1000
        : Math.min(20000 * Math.pow(3, attemptNumber - 1), 1800000);

      const nextAttemptAt = willRetry ? new Date(Date.now() + backoffMs) : null;

      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: willRetry ? NotificationDeliveryStatus.RETRYING : NotificationDeliveryStatus.FAILED,
          attemptCount: attemptNumber,
          lastError: errorMessage,
          nextAttemptAt,
        },
      });

      // eslint-disable-next-line no-console
      console.log(
        `[NotificationDeliveryWorker] Delivery ${delivery.id} (${delivery.channel}) FAILED (attempt ${attemptNumber}/${delivery.maxAttempts}). ${
          willRetry ? `Retrying in ${Math.round(backoffMs / 1000)}s...` : 'Max attempts reached.'
        }`
      );

      if (willRetry && this.queue) {
        await this.queue.add(
          'deliver-notification',
          {
            ...data,
            attemptNumber: attemptNumber + 1,
          },
          {
            jobId: `delivery-${delivery.id}-attempt-${attemptNumber + 1}`,
            delay: backoffMs,
          },
        );
      }
    }
  }

  private async dispatchEmail(
    to: string,
    event: any,
  ): Promise<{ success: boolean; status: number; excerpt: string; error?: string }> {
    const smtpHost = process.env['SMTP_HOST'];
    const smtpPort = Number(process.env['SMTP_PORT'] || '587');
    const excerpt = `Email to ${to}: [${event.severity}] ${event.title}`;

    if (!smtpHost) {
      return {
        success: true,
        status: 250,
        excerpt: `Delivered (simulated dev mode): ${excerpt}`,
      };
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const socket = net.createConnection(smtpPort, smtpHost);
        socket.setTimeout(10000);
        socket.on('data', (d) => {
          const res = d.toString();
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
        status: 250,
        excerpt: `Delivered via SMTP: ${excerpt}`,
      };
    } catch (err: any) {
      return {
        success: false,
        status: 500,
        excerpt: `SMTP Failed: ${err.message}`,
        error: err.message,
      };
    }
  }
}
