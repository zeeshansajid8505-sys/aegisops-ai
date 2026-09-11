import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SecretEncryptionService } from '../security/secret-encryption.service';
import { NotificationRouterService } from './notification-router.service';
import { RealtimeEventPublisher } from '../realtime/realtime-event.publisher';
import {
  IncidentSeverity,
  IntegrationType,
  NotificationChannel,
  NotificationDeliveryStatus,
} from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secretEncryption: SecretEncryptionService,
    private readonly routerService: NotificationRouterService,
    private readonly realtimePublisher: RealtimeEventPublisher,
  ) {}

  // ==========================================
  // IN-APP NOTIFICATIONS & RECEIPTS
  // ==========================================

  async listNotifications(
    userId: string,
    organizationId: string,
    options: { unreadOnly?: boolean; limit?: number; offset?: number } = {},
  ) {
    const limit = Math.min(options.limit || 20, 100);
    const offset = options.offset || 0;

    const where: any = {
      userId,
      organizationId,
    };

    if (options.unreadOnly) {
      where.readAt = null;
    }

    const [totalUnread, receipts, totalCount] = await Promise.all([
      this.prisma.notificationReceipt.count({
        where: { userId, organizationId, readAt: null },
      }),
      this.prisma.notificationReceipt.findMany({
        where,
        include: {
          notification: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.notificationReceipt.count({ where }),
    ]);

    const items = receipts.map((r) => ({
      id: r.notification.id,
      receiptId: r.id,
      title: r.notification.title,
      message: r.notification.message,
      severity: r.notification.severity,
      deepLink: r.notification.deepLink,
      createdAt: r.notification.createdAt.toISOString(),
      readAt: r.readAt ? r.readAt.toISOString() : null,
      isRead: !!r.readAt,
      metadata: r.notification.metadata,
    }));

    return {
      items,
      totalCount,
      unreadCount: totalUnread,
      hasMore: offset + items.length < totalCount,
    };
  }

  async markAsRead(userId: string, organizationId: string, notificationId: string) {
    const receipt = await this.prisma.notificationReceipt.findFirst({
      where: { notificationId, userId, organizationId },
    });

    if (!receipt) {
      throw new NotFoundException('Notification receipt not found');
    }

    const updated = await this.prisma.notificationReceipt.update({
      where: { id: receipt.id },
      data: { readAt: new Date() },
    });

    const unreadCount = await this.prisma.notificationReceipt.count({
      where: { userId, organizationId, readAt: null },
    });

    await this.realtimePublisher.publish({
      id: crypto.randomUUID(),
      type: 'notification.read',
      organizationId,
      targetRoom: `organization:${organizationId}`,
      timestamp: new Date().toISOString(),
      payload: { notificationId, userId, unreadCount },
    });

    return { success: true, readAt: updated.readAt, unreadCount };
  }

  async markAllAsRead(userId: string, organizationId: string) {
    const now = new Date();
    await this.prisma.notificationReceipt.updateMany({
      where: { userId, organizationId, readAt: null },
      data: { readAt: now },
    });

    await this.realtimePublisher.publish({
      id: crypto.randomUUID(),
      type: 'notification.read',
      organizationId,
      targetRoom: `organization:${organizationId}`,
      timestamp: now.toISOString(),
      payload: { all: true, userId, unreadCount: 0 },
    });

    return { success: true, unreadCount: 0 };
  }

  // ==========================================
  // USER NOTIFICATION PREFERENCES
  // ==========================================

  async getUserPreferences(userId: string, organizationId: string) {
    const prefs = await this.prisma.userNotificationPreference.findMany({
      where: { userId, organizationId },
    });

    // Default channels
    const channels: NotificationChannel[] = ['IN_APP', 'EMAIL', 'SLACK', 'WEBHOOK'];
    const prefMap = new Map(prefs.map((p) => [p.channel, p]));

    return channels.map((channel) => {
      const existing = prefMap.get(channel);
      return {
        id: existing?.id,
        channel,
        isEnabled: existing ? existing.isEnabled : true,
        minSeverity: existing ? existing.minSeverity : 'INFO',
      };
    });
  }

  async updatePreference(
    userId: string,
    organizationId: string,
    channel: NotificationChannel,
    isEnabled: boolean,
    minSeverity: IncidentSeverity = 'INFO',
  ) {
    return this.prisma.userNotificationPreference.upsert({
      where: {
        userId_organizationId_channel: {
          userId,
          organizationId,
          channel,
        },
      },
      create: {
        userId,
        organizationId,
        channel,
        isEnabled,
        minSeverity,
      },
      update: {
        isEnabled,
        minSeverity,
      },
    });
  }

  // ==========================================
  // INTEGRATIONS MANAGEMENT
  // ==========================================

  async listIntegrations(organizationId: string) {
    const items = await this.prisma.integrationConnection.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        organizationId: true,
        name: true,
        type: true,
        description: true,
        targetUrl: true,
        secretMask: true,
        secretVersion: true,
        headers: true,
        isEnabled: true,
        lastTestedAt: true,
        lastTestStatus: true,
        lastTestError: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return items;
  }

  async createIntegration(
    organizationId: string,
    userId: string,
    data: {
      name: string;
      type: IntegrationType;
      description?: string;
      targetUrl: string;
      secret?: string;
      headers?: Record<string, string>;
      isEnabled?: boolean;
    },
  ) {
    let secretData: {
      secretCiphertext?: string;
      secretIv?: string;
      secretTag?: string;
      secretMask?: string;
    } = {};

    if (data.secret) {
      const encrypted = this.secretEncryption.encrypt(data.secret);
      secretData = {
        secretCiphertext: encrypted.ciphertext,
        secretIv: encrypted.iv,
        secretTag: encrypted.tag,
        secretMask: encrypted.mask,
      };
    }

    const created = await this.prisma.integrationConnection.create({
      data: {
        organizationId,
        name: data.name,
        type: data.type,
        description: data.description,
        targetUrl: data.targetUrl,
        headers: data.headers || {},
        isEnabled: data.isEnabled ?? true,
        createdByUserId: userId,
        ...secretData,
      },
      select: {
        id: true,
        organizationId: true,
        name: true,
        type: true,
        description: true,
        targetUrl: true,
        secretMask: true,
        headers: true,
        isEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return created;
  }

  async updateIntegration(
    organizationId: string,
    integrationId: string,
    data: {
      name?: string;
      description?: string;
      targetUrl?: string;
      secret?: string;
      headers?: Record<string, string>;
      isEnabled?: boolean;
    },
  ) {
    const existing = await this.prisma.integrationConnection.findFirst({
      where: { id: integrationId, organizationId },
    });
    if (!existing) {
      throw new NotFoundException('Integration connection not found');
    }

    let secretData: Record<string, any> = {};
    if (data.secret) {
      const encrypted = this.secretEncryption.encrypt(data.secret);
      secretData = {
        secretCiphertext: encrypted.ciphertext,
        secretIv: encrypted.iv,
        secretTag: encrypted.tag,
        secretMask: encrypted.mask,
        secretVersion: existing.secretVersion + 1,
      };
    }

    return this.prisma.integrationConnection.update({
      where: { id: integrationId },
      data: {
        name: data.name,
        description: data.description,
        targetUrl: data.targetUrl,
        headers: data.headers,
        isEnabled: data.isEnabled,
        ...secretData,
      },
      select: {
        id: true,
        organizationId: true,
        name: true,
        type: true,
        description: true,
        targetUrl: true,
        secretMask: true,
        headers: true,
        isEnabled: true,
        lastTestedAt: true,
        lastTestStatus: true,
        lastTestError: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async deleteIntegration(organizationId: string, integrationId: string) {
    const existing = await this.prisma.integrationConnection.findFirst({
      where: { id: integrationId, organizationId },
    });
    if (!existing) {
      throw new NotFoundException('Integration connection not found');
    }

    await this.prisma.integrationConnection.delete({
      where: { id: integrationId },
    });

    return { success: true };
  }

  async testIntegration(organizationId: string, integrationId: string) {
    return this.routerService.testIntegrationConnection(organizationId, integrationId);
  }

  // ==========================================
  // NOTIFICATION POLICIES
  // ==========================================

  async listPolicies(organizationId: string) {
    return this.prisma.notificationPolicy.findMany({
      where: { organizationId },
      include: {
        slackConnection: {
          select: { id: true, name: true, type: true, targetUrl: true },
        },
        webhookConnection: {
          select: { id: true, name: true, type: true, targetUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPolicy(
    organizationId: string,
    userId: string,
    data: {
      name: string;
      description?: string;
      isEnabled?: boolean;
      eventTypes: string[];
      minSeverity?: IncidentSeverity;
      serviceIds?: string[];
      environmentIds?: string[];
      channels: NotificationChannel[];
      emailRecipients?: string[];
      slackConnectionId?: string;
      webhookConnectionId?: string;
      cooldownSeconds?: number;
    },
  ) {
    return this.prisma.notificationPolicy.create({
      data: {
        organizationId,
        name: data.name,
        description: data.description,
        isEnabled: data.isEnabled ?? true,
        eventTypes: data.eventTypes,
        minSeverity: data.minSeverity || 'INFO',
        serviceIds: data.serviceIds || [],
        environmentIds: data.environmentIds || [],
        channels: data.channels,
        emailRecipients: data.emailRecipients || [],
        slackConnectionId: data.slackConnectionId,
        webhookConnectionId: data.webhookConnectionId,
        cooldownSeconds: data.cooldownSeconds ?? 60,
        createdByUserId: userId,
      },
      include: {
        slackConnection: {
          select: { id: true, name: true, type: true, targetUrl: true },
        },
        webhookConnection: {
          select: { id: true, name: true, type: true, targetUrl: true },
        },
      },
    });
  }

  async updatePolicy(
    organizationId: string,
    policyId: string,
    data: {
      name?: string;
      description?: string;
      isEnabled?: boolean;
      eventTypes?: string[];
      minSeverity?: IncidentSeverity;
      serviceIds?: string[];
      environmentIds?: string[];
      channels?: NotificationChannel[];
      emailRecipients?: string[];
      slackConnectionId?: string;
      webhookConnectionId?: string;
      cooldownSeconds?: number;
    },
  ) {
    const existing = await this.prisma.notificationPolicy.findFirst({
      where: { id: policyId, organizationId },
    });
    if (!existing) {
      throw new NotFoundException('Notification policy not found');
    }

    return this.prisma.notificationPolicy.update({
      where: { id: policyId },
      data: {
        name: data.name,
        description: data.description,
        isEnabled: data.isEnabled,
        eventTypes: data.eventTypes,
        minSeverity: data.minSeverity,
        serviceIds: data.serviceIds,
        environmentIds: data.environmentIds,
        channels: data.channels,
        emailRecipients: data.emailRecipients,
        slackConnectionId: data.slackConnectionId,
        webhookConnectionId: data.webhookConnectionId,
        cooldownSeconds: data.cooldownSeconds,
      },
      include: {
        slackConnection: {
          select: { id: true, name: true, type: true, targetUrl: true },
        },
        webhookConnection: {
          select: { id: true, name: true, type: true, targetUrl: true },
        },
      },
    });
  }

  async deletePolicy(organizationId: string, policyId: string) {
    const existing = await this.prisma.notificationPolicy.findFirst({
      where: { id: policyId, organizationId },
    });
    if (!existing) {
      throw new NotFoundException('Notification policy not found');
    }

    await this.prisma.notificationPolicy.delete({
      where: { id: policyId },
    });

    return { success: true };
  }

  // ==========================================
  // DELIVERY AUDIT HISTORY
  // ==========================================

  async listDeliveries(
    organizationId: string,
    options: {
      status?: NotificationDeliveryStatus;
      channel?: NotificationChannel;
      limit?: number;
      offset?: number;
    } = {},
  ) {
    const limit = Math.min(options.limit || 50, 100);
    const offset = options.offset || 0;

    const where: any = { organizationId };
    if (options.status) where.status = options.status;
    if (options.channel) where.channel = options.channel;

    const [items, total] = await Promise.all([
      this.prisma.notificationDelivery.findMany({
        where,
        include: {
          notificationEvent: {
            select: {
              id: true,
              eventType: true,
              title: true,
              severity: true,
              occurredAt: true,
            },
          },
          notificationPolicy: {
            select: { id: true, name: true },
          },
          integrationConnection: {
            select: { id: true, name: true, type: true },
          },
          attempts: {
            orderBy: { attemptNumber: 'desc' },
            take: 5,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.notificationDelivery.count({ where }),
    ]);

    return {
      items,
      total,
      hasMore: offset + items.length < total,
    };
  }
}

