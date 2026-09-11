import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventPublisher } from '../realtime/realtime-event.publisher';
import { NotificationsQueueService } from './notifications-queue.service';
import { SecretEncryptionService } from '../security/secret-encryption.service';
import { SlackProvider } from './providers/slack.provider';
import { WebhookProvider } from './providers/webhook.provider';
import { IncidentSeverity, NotificationChannel } from '@prisma/client';

export interface RouteEventInput {
  organizationId: string;
  eventType: string;
  sourceModule: string;
  severity: IncidentSeverity;
  title: string;
  message: string;
  payload: Record<string, any>;
  serviceId?: string;
  environmentId?: string;
  actorUserId?: string;
  deepLink?: string;
}

const SEVERITY_RANKS: Record<IncidentSeverity, number> = {
  INFO: 1,
  WARNING: 2,
  ERROR: 3,
  CRITICAL: 4,
};

@Injectable()
export class NotificationRouterService {
  private readonly logger = new Logger(NotificationRouterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimePublisher: RealtimeEventPublisher,
    private readonly queueService: NotificationsQueueService,
    private readonly secretEncryption: SecretEncryptionService,
    private readonly slackProvider: SlackProvider,
    private readonly webhookProvider: WebhookProvider,
  ) {}

  private hashDestination(dest: string): string {
    return crypto.createHash('sha256').update(dest).digest('hex').substring(0, 32);
  }

  async routeEvent(input: RouteEventInput): Promise<{ eventId: string; notificationId?: string; deliveriesEnqueued: number }> {
    this.logger.log(`Routing event [${input.eventType}] for org ${input.organizationId} (sev: ${input.severity})`);

    // 1. Create NotificationEvent audit record
    const event = await this.prisma.notificationEvent.create({
      data: {
        organizationId: input.organizationId,
        eventType: input.eventType,
        sourceModule: input.sourceModule,
        severity: input.severity,
        serviceId: input.serviceId,
        environmentId: input.environmentId,
        title: input.title,
        message: input.message,
        payload: input.payload,
        actorUserId: input.actorUserId,
      },
    });

    // 2. Create In-App Notification
    const notification = await this.prisma.notification.create({
      data: {
        organizationId: input.organizationId,
        eventId: event.id,
        channel: NotificationChannel.IN_APP,
        title: input.title,
        message: input.message,
        severity: input.severity,
        deepLink: input.deepLink,
        metadata: input.payload,
      },
    });

    // 3. Find active users in organization and create receipts based on preferences
    const memberships = await this.prisma.membership.findMany({
      where: { organizationId: input.organizationId },
      include: { user: true },
    });

    const preferences = await this.prisma.userNotificationPreference.findMany({
      where: {
        organizationId: input.organizationId,
        channel: NotificationChannel.IN_APP,
      },
    });

    const prefMap = new Map(preferences.map((p) => [p.userId, p]));
    const eventRank = SEVERITY_RANKS[input.severity] ?? 1;

    const receiptsToCreate = [];
    for (const m of memberships) {
      const userPref = prefMap.get(m.userId);
      const isEnabled = userPref ? userPref.isEnabled : true;
      const minRank = userPref ? SEVERITY_RANKS[userPref.minSeverity] ?? 1 : 1;

      if (isEnabled && eventRank >= minRank) {
        receiptsToCreate.push({
          notificationId: notification.id,
          userId: m.userId,
          organizationId: input.organizationId,
        });
      }
    }

    if (receiptsToCreate.length > 0) {
      await this.prisma.notificationReceipt.createMany({
        data: receiptsToCreate,
        skipDuplicates: true,
      });
    }

    // 4. Emit realtime notification to websocket room
    await this.realtimePublisher.publish({
      id: crypto.randomUUID(),
      type: 'notification.created',
      organizationId: input.organizationId,
      targetRoom: `organization:${input.organizationId}`,
      timestamp: new Date().toISOString(),
      payload: {
        notificationId: notification.id,
        eventId: event.id,
        title: notification.title,
        message: notification.message,
        severity: notification.severity,
        deepLink: notification.deepLink,
        createdAt: notification.createdAt.toISOString(),
      },
    });

    // 5. Evaluate active notification policies
    const policies = await this.prisma.notificationPolicy.findMany({
      where: {
        organizationId: input.organizationId,
        isEnabled: true,
      },
      include: {
        slackConnection: true,
        webhookConnection: true,
      },
    });

    let deliveriesEnqueued = 0;

    for (const policy of policies) {
      // Event type check
      const matchesEvent =
        policy.eventTypes.length === 0 ||
        policy.eventTypes.includes('*') ||
        policy.eventTypes.includes(input.eventType);

      if (!matchesEvent) continue;

      // Min severity check
      const policyMinRank = SEVERITY_RANKS[policy.minSeverity] ?? 1;
      if (eventRank < policyMinRank) continue;

      // Service filter check
      if (policy.serviceIds.length > 0 && input.serviceId && !policy.serviceIds.includes(input.serviceId)) {
        continue;
      }

      // Environment filter check
      if (
        policy.environmentIds.length > 0 &&
        input.environmentId &&
        !policy.environmentIds.includes(input.environmentId)
      ) {
        continue;
      }

      // Cooldown check: Look for any delivery executed for this policy within cooldownSeconds
      if (policy.cooldownSeconds > 0) {
        const cooldownThreshold = new Date(Date.now() - policy.cooldownSeconds * 1000);
        const recentDelivery = await this.prisma.notificationDelivery.findFirst({
          where: {
            organizationId: input.organizationId,
            notificationPolicyId: policy.id,
            createdAt: { gte: cooldownThreshold },
          },
        });

        if (recentDelivery) {
          this.logger.debug(
            `Policy [${policy.name}] is under cooldown (${policy.cooldownSeconds}s). Suppressing outbound delivery.`
          );
          continue;
        }
      }

      // Channel: EMAIL
      if (policy.channels.includes(NotificationChannel.EMAIL) && policy.emailRecipients.length > 0) {
        for (const recipient of policy.emailRecipients) {
          const fingerprint = this.hashDestination(recipient.toLowerCase());
          try {
            const delivery = await this.prisma.notificationDelivery.create({
              data: {
                organizationId: input.organizationId,
                notificationEventId: event.id,
                notificationPolicyId: policy.id,
                channel: NotificationChannel.EMAIL,
                destination: recipient,
                destinationFingerprint: fingerprint,
                status: 'PENDING',
              },
            });

            await this.queueService.enqueueDelivery({
              deliveryId: delivery.id,
              organizationId: input.organizationId,
              channel: 'EMAIL',
              destination: recipient,
              notificationEventId: event.id,
              attemptNumber: 1,
            });
            deliveriesEnqueued++;
          } catch (err: any) {
            // Already delivered or duplicate fingerprint
            this.logger.debug(`Duplicate email delivery skipped for ${recipient}`);
          }
        }
      }

      // Channel: SLACK
      if (
        policy.channels.includes(NotificationChannel.SLACK) &&
        policy.slackConnection &&
        policy.slackConnection.isEnabled
      ) {
        const fingerprint = this.hashDestination(policy.slackConnection.targetUrl);
        try {
          const delivery = await this.prisma.notificationDelivery.create({
            data: {
              organizationId: input.organizationId,
              notificationEventId: event.id,
              notificationPolicyId: policy.id,
              integrationConnectionId: policy.slackConnection.id,
              channel: NotificationChannel.SLACK,
              destination: policy.slackConnection.targetUrl,
              destinationFingerprint: fingerprint,
              status: 'PENDING',
            },
          });

          await this.queueService.enqueueDelivery({
            deliveryId: delivery.id,
            organizationId: input.organizationId,
            channel: 'SLACK',
            destination: policy.slackConnection.targetUrl,
            notificationEventId: event.id,
            integrationConnectionId: policy.slackConnection.id,
            attemptNumber: 1,
          });
          deliveriesEnqueued++;
        } catch (err: any) {
          this.logger.debug(`Duplicate Slack delivery skipped for policy ${policy.name}`);
        }
      }

      // Channel: WEBHOOK
      if (
        policy.channels.includes(NotificationChannel.WEBHOOK) &&
        policy.webhookConnection &&
        policy.webhookConnection.isEnabled
      ) {
        const fingerprint = this.hashDestination(policy.webhookConnection.targetUrl);
        try {
          const delivery = await this.prisma.notificationDelivery.create({
            data: {
              organizationId: input.organizationId,
              notificationEventId: event.id,
              notificationPolicyId: policy.id,
              integrationConnectionId: policy.webhookConnection.id,
              channel: NotificationChannel.WEBHOOK,
              destination: policy.webhookConnection.targetUrl,
              destinationFingerprint: fingerprint,
              status: 'PENDING',
            },
          });

          await this.queueService.enqueueDelivery({
            deliveryId: delivery.id,
            organizationId: input.organizationId,
            channel: 'WEBHOOK',
            destination: policy.webhookConnection.targetUrl,
            notificationEventId: event.id,
            integrationConnectionId: policy.webhookConnection.id,
            attemptNumber: 1,
          });
          deliveriesEnqueued++;
        } catch (err: any) {
          this.logger.debug(`Duplicate Webhook delivery skipped for policy ${policy.name}`);
        }
      }
    }

    return {
      eventId: event.id,
      notificationId: notification.id,
      deliveriesEnqueued,
    };
  }

  async testIntegrationConnection(organizationId: string, connectionId: string): Promise<{ success: boolean; error?: string; status?: number; durationMs?: number }> {
    const conn = await this.prisma.integrationConnection.findFirst({
      where: { id: connectionId, organizationId },
    });

    if (!conn) {
      throw new Error('Integration connection not found');
    }

    let secretPlaintext: string | undefined;
    if (conn.secretCiphertext && conn.secretIv && conn.secretTag) {
      secretPlaintext = this.secretEncryption.decrypt({
        ciphertext: conn.secretCiphertext,
        iv: conn.secretIv,
        tag: conn.secretTag,
      });
    }

    let result: { success: boolean; responseStatus?: number; durationMs: number; errorMessage?: string; responseExcerpt?: string };

    if (conn.type === 'SLACK_WEBHOOK') {
      result = await this.slackProvider.send({
        webhookUrl: conn.targetUrl,
        title: 'AegisOps Integration Test',
        message: 'This is a test notification verifying your Slack webhook configuration.',
        severity: 'INFO',
        eventType: 'integration.test',
      });
    } else {
      result = await this.webhookProvider.send({
        targetUrl: conn.targetUrl,
        signingSecret: secretPlaintext,
        customHeaders: (conn.headers as Record<string, string>) || {},
        eventId: crypto.randomUUID(),
        eventType: 'integration.test',
        severity: 'INFO',
        sourceModule: 'notifications',
        title: 'AegisOps Integration Test',
        message: 'This is a test webhook payload verifying your webhook endpoint configuration.',
        payload: { test: true, timestamp: new Date().toISOString() },
        occurredAt: new Date().toISOString(),
      });
    }

    await this.prisma.integrationConnection.update({
      where: { id: connectionId },
      data: {
        lastTestedAt: new Date(),
        lastTestStatus: result.success ? 'SUCCESS' : 'FAILED',
        lastTestError: result.errorMessage || null,
      },
    });

    return {
      success: result.success,
      error: result.errorMessage,
      status: result.responseStatus,
      durationMs: result.durationMs,
    };
  }
}

