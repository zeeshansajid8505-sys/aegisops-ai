export type IntegrationType = 'SLACK' | 'GENERIC_WEBHOOK';

export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'SLACK' | 'WEBHOOK';

export type NotificationDeliveryStatus =
  | 'QUEUED'
  | 'SENDING'
  | 'DELIVERED'
  | 'RETRYING'
  | 'FAILED'
  | 'CANCELLED';

export type NotificationEntityType = 'INCIDENT' | 'ALERT' | 'ANOMALY' | 'RCA' | 'SYSTEM';

export interface NotificationSummary {
  id: string;
  organizationId: string;
  eventId?: string | null;
  type: string;
  title: string;
  message: string;
  severity?: string | null;
  entityType: string;
  entityId: string;
  actionUrl?: string | null;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationDetail extends NotificationSummary {
  receiptsCount?: number;
}

export interface NotificationPolicySummary {
  id: string;
  organizationId: string;
  name: string;
  description?: string | null;
  isEnabled: boolean;
  eventTypes: string[];
  severityFilter: string[];
  serviceIds: string[];
  environmentIds: string[];
  channels: NotificationChannel[];
  cooldownSeconds: number;
  slackConnectionId?: string | null;
  slackConnectionName?: string | null;
  webhookConnectionId?: string | null;
  webhookConnectionName?: string | null;
  emailRecipients: string[];
  createdByMembershipId?: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
}

export interface NotificationPolicyDetail extends NotificationPolicySummary {
  deliveriesCount?: number;
}

export interface CreateNotificationPolicyDto {
  name: string;
  description?: string;
  isEnabled?: boolean;
  eventTypes: string[];
  severityFilter?: string[];
  serviceIds?: string[];
  environmentIds?: string[];
  channels: NotificationChannel[];
  cooldownSeconds?: number;
  slackConnectionId?: string;
  webhookConnectionId?: string;
  emailRecipients?: string[];
}

export interface UpdateNotificationPolicyDto {
  name?: string;
  description?: string;
  isEnabled?: boolean;
  eventTypes?: string[];
  severityFilter?: string[];
  serviceIds?: string[];
  environmentIds?: string[];
  channels?: NotificationChannel[];
  cooldownSeconds?: number;
  slackConnectionId?: string | null;
  webhookConnectionId?: string | null;
  emailRecipients?: string[];
}

export interface IntegrationSummary {
  id: string;
  organizationId: string;
  type: IntegrationType;
  name: string;
  description?: string | null;
  isEnabled: boolean;
  configuration: Record<string, any>;
  secretMasked?: string | null;
  secretVersion: number;
  lastTestedAt?: string | null;
  lastTestStatus?: 'SUCCESS' | 'FAILED' | null;
  lastTestError?: string | null;
  createdByMembershipId?: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
}

export interface IntegrationDetail extends IntegrationSummary {
  policiesCount?: number;
}

export interface CreateIntegrationDto {
  type: IntegrationType;
  name: string;
  description?: string;
  configuration?: Record<string, any>;
  secret?: string; // Plaintext secret provided only at creation/update
}

export interface UpdateIntegrationDto {
  name?: string;
  description?: string;
  isEnabled?: boolean;
  configuration?: Record<string, any>;
  secret?: string;
}

export interface TestIntegrationResult {
  success: boolean;
  testedAt: string;
  httpStatus?: number;
  durationMs: number;
  error?: string;
}

export interface NotificationDeliveryAttemptSummary {
  id: string;
  attemptNumber: number;
  startedAt: string;
  completedAt?: string | null;
  status: NotificationDeliveryStatus;
  httpStatus?: number | null;
  providerMessageId?: string | null;
  errorCode?: string | null;
  safeErrorMessage?: string | null;
  durationMs: number;
  createdAt: string;
}

export interface NotificationDeliverySummary {
  id: string;
  organizationId: string;
  notificationEventId: string;
  notificationPolicyId?: string | null;
  policyName?: string | null;
  channel: NotificationChannel;
  integrationConnectionId?: string | null;
  integrationName?: string | null;
  destinationFingerprint: string;
  status: NotificationDeliveryStatus;
  attemptCount: number;
  firstAttemptAt?: string | null;
  lastAttemptAt?: string | null;
  nextRetryAt?: string | null;
  deliveredAt?: string | null;
  failedAt?: string | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
  attempts?: NotificationDeliveryAttemptSummary[];
}

export interface UserNotificationPreference {
  id: string;
  organizationId: string;
  userId: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  minimumSeverity: string;
  incidentCreated: boolean;
  incidentEscalated: boolean;
  incidentResolved: boolean;
  criticalAlert: boolean;
  anomalyDetected: boolean;
  analysisCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateUserNotificationPreferenceDto {
  inAppEnabled?: boolean;
  emailEnabled?: boolean;
  minimumSeverity?: string;
  incidentCreated?: boolean;
  incidentEscalated?: boolean;
  incidentResolved?: boolean;
  criticalAlert?: boolean;
  anomalyDetected?: boolean;
  analysisCompleted?: boolean;
}

export interface WebhookEventEnvelope {
  version: '1.0.0';
  eventId: string;
  eventType: string;
  organizationId: string;
  occurredAt: string;
  data: Record<string, any>;
}

