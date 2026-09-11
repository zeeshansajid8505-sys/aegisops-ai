import { AlertSeverity } from './alerts';

export type IncidentStatus = 'OPEN' | 'ACKNOWLEDGED' | 'INVESTIGATING' | 'MITIGATED' | 'RESOLVED';
export type IncidentSource = 'AUTOMATED' | 'MANUAL';
export type IncidentSeverity = 'CRITICAL' | 'ERROR' | 'WARNING' | 'INFO';

export type IncidentTimelineEventType =
  | 'INCIDENT_CREATED'
  | 'ALERT_ATTACHED'
  | 'ALERT_RESOLVED'
  | 'ALL_LINKED_SIGNALS_CLEARED'
  | 'ACKNOWLEDGED'
  | 'STATUS_CHANGED'
  | 'SEVERITY_ESCALATED'
  | 'SEVERITY_CHANGED'
  | 'COMMANDER_ASSIGNED'
  | 'COMMANDER_CHANGED'
  | 'RESPONDER_ADDED'
  | 'RESPONDER_REMOVED'
  | 'NOTE_ADDED'
  | 'TITLE_UPDATED'
  | 'SUMMARY_UPDATED'
  | 'REOPENED'
  | 'RESOLVED'
  | 'MANUAL_ALERT_ATTACHED'
  | 'ALERT_UNLINKED'
  | 'ANALYSIS_STARTED'
  | 'ANALYSIS_COMPLETED'
  | 'ROOT_CAUSE_CONFIRMED'
  | 'HYPOTHESIS_REJECTED'
  | 'RUNBOOK_STARTED'
  | 'RUNBOOK_STEP_COMPLETED'
  | 'RUNBOOK_COMPLETED';

export type IncidentResponderRole = 'COMMANDER' | 'RESPONDER';

export type CorrelationTriggerStatus = 'PENDING' | 'QUEUED' | 'PROCESSED' | 'FAILED';

export interface IncidentCorrelationReason {
  code: 'SAME_SERVICE' | 'DIRECT_DEPENDENCY' | 'SAME_OWNER_TEAM' | 'TIME_PROXIMITY';
  score: number;
  description: string;
  metadata?: Record<string, unknown>;
}

export interface IncidentCorrelationResult {
  matchedIncidentId: string | null;
  score: number;
  reasons: IncidentCorrelationReason[];
  isEscalated: boolean;
  escalatedSeverity?: IncidentSeverity;
}

export interface IncidentAlertSummary {
  id: string;
  incidentId: string;
  alertInstanceId: string;
  triggerAlertEventId: string;
  alertRuleId: string;
  alertRuleName?: string;
  serviceId: string;
  serviceName?: string;
  environmentId: string;
  environmentName?: string;
  alertSeverity: AlertSeverity;
  correlationScore: number;
  correlationReasons: IncidentCorrelationReason[];
  linkedAt: string;
  resolvedAt: string | null;
  unlinkedAt: string | null;
  unlinkedByMembershipId?: string | null;
  unlinkReason?: string | null;
}

export interface IncidentTimelineEventSummary {
  id: string;
  incidentId: string;
  eventType: IncidentTimelineEventType;
  actorMembershipId: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  occurredAt: string;
  message: string;
  metadata?: Record<string, unknown> | null;
}

export interface IncidentResponderSummary {
  id: string;
  incidentId: string;
  membershipId: string;
  userName?: string;
  userEmail?: string;
  role: IncidentResponderRole;
  joinedAt: string;
  removedAt: string | null;
}

export interface IncidentSummary {
  id: string;
  organizationId: string;
  incidentKey: string;
  title: string;
  summary: string | null;
  source: IncidentSource;
  status: IncidentStatus;
  severity: IncidentSeverity;
  primaryServiceId: string | null;
  primaryServiceName?: string | null;
  environmentId: string | null;
  environmentName?: string | null;
  commanderMembershipId: string | null;
  commanderName?: string | null;
  commanderEmail?: string | null;
  assignedTeamId: string | null;
  assignedTeamName?: string | null;
  createdByMembershipId: string | null;
  detectedAt: string;
  acknowledgedAt: string | null;
  investigationStartedAt: string | null;
  mitigatedAt: string | null;
  resolvedAt: string | null;
  reopenedAt: string | null;
  lastSignalAt: string;
  allSignalsClearedAt: string | null;
  activeAlertsCount: number;
  totalAlertsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface IncidentDetail extends IncidentSummary {
  alerts: IncidentAlertSummary[];
  timeline: IncidentTimelineEventSummary[];
  responders: IncidentResponderSummary[];
}

export interface CreateIncidentDto {
  title: string;
  summary?: string;
  severity?: IncidentSeverity;
  primaryServiceId?: string;
  environmentId?: string;
  commanderMembershipId?: string;
  assignedTeamId?: string;
}

export interface TransitionIncidentDto {
  status: IncidentStatus;
  reason?: string;
}

export interface AcknowledgeIncidentDto {
  note?: string;
}

export interface ResolveIncidentDto {
  resolutionSummary: string;
}

export interface ReopenIncidentDto {
  reopenReason: string;
}

export interface AssignCommanderDto {
  commanderMembershipId: string;
}

export interface AddResponderDto {
  membershipId: string;
  role?: IncidentResponderRole;
}

export interface AddIncidentNoteDto {
  note: string;
}

export interface AttachAlertDto {
  alertEventId: string;
  reason?: string;
}

export interface UnlinkAlertDto {
  reason: string;
}

export interface UpdateSeverityDto {
  severity: IncidentSeverity;
  reason: string;
}

export interface IncidentFilterQuery {
  status?: IncidentStatus | IncidentStatus[];
  severity?: IncidentSeverity | IncidentSeverity[];
  serviceId?: string;
  environmentId?: string;
  commanderMembershipId?: string;
  source?: IncidentSource;
  signalsCleared?: boolean;
  limit?: number;
  offset?: number;
}
