import { ServiceHealthStatus } from './catalog';
import { IncidentSeverity, IncidentStatus } from './incidents';

export interface OperationsSummary {
  servicesCount: number;
  healthyServicesCount: number;
  degradedServicesCount: number;
  downServicesCount: number;
  activeAlertsCount: number;
  activeIncidentsCount: number;
  criticalIncidentsCount: number;
}

export type AttentionItemType = 'incident' | 'alert' | 'service' | 'anomaly';
export type AttentionPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface AttentionItem {
  id: string;
  type: AttentionItemType;
  priority: AttentionPriority;
  title: string;
  description: string;
  timestamp: string;
  targetUrl: string;
  serviceName?: string | null;
  metadata?: Record<string, any>;
}

export interface ServiceOperationalSummary {
  id: string;
  name: string;
  slug: string;
  tier: string;
  healthStatus: ServiceHealthStatus;
  activeIncidentsCount: number;
  activeAlertsCount: number;
  updatedAt: string;
}

export interface OperationsAlertItem {
  id: string;
  ruleName: string;
  serviceName: string;
  environmentName: string;
  severity: string;
  state: string;
  firingStartedAt: string | null;
  currentValue?: number | null;
  thresholdValue?: number | null;
}

export interface OperationsIncidentItem {
  id: string;
  incidentKey: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  primaryServiceName: string | null;
  commanderName: string | null;
  activeAlertsCount: number;
  detectedAt: string;
}

export interface OperationsActivityItem {
  id: string;
  type: 'incident' | 'alert' | 'health';
  title: string;
  description: string;
  timestamp: string;
  actorName?: string | null;
  targetUrl?: string;
}

export interface OperationsOverview {
  organizationId: string;
  generatedAt: string;
  summary: OperationsSummary;
  needsAttention: AttentionItem[];
  servicesHealthSummary: ServiceOperationalSummary[];
  activeAlertsPreview: OperationsAlertItem[];
  activeIncidentsPreview: OperationsIncidentItem[];
  recentActivity: OperationsActivityItem[];
}

