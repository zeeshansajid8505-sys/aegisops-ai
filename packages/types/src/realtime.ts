export type RealtimeEventType =
  | 'service.health.updated'
  | 'alert.fired'
  | 'alert.state.updated'
  | 'alert.resolved'
  | 'incident.created'
  | 'incident.updated'
  | 'incident.severity.updated'
  | 'incident.timeline.updated'
  | 'incident.resolved'
  | 'incident.analysis.started'
  | 'incident.analysis.completed'
  | 'incident.analysis.failed'
  | 'incident.root-cause.confirmed'
  | 'incident.runbook.started'
  | 'incident.runbook.updated'
  // Phase 8: ML Anomaly Detection Events
  | 'anomaly.detected'
  | 'anomaly.updated'
  | 'anomaly.resolved'
  | 'anomaly.model.ready'
  | 'anomaly.model.failed'
  // Phase 9: Notification Events
  | 'notification.created'
  | 'notification.read'
  // Phase 10: Postmortem Events
  | 'postmortem.created'
  | 'postmortem.updated'
  | 'postmortem.approved'
  | 'postmortem.action-item.updated';

export interface RealtimeEventEnvelope<T = any> {
  id: string;
  type: RealtimeEventType;
  organizationId: string;
  targetRoom: string;
  timestamp: string;
  payload: T;
}

export type RealtimeConnectionState =
  | 'connected'
  | 'connecting'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export const REALTIME_REDIS_CHANNEL = 'aegisops:realtime:events';

export const RealtimeRooms = {
  organization: (orgId: string) => `organization:${orgId}`,
  service: (orgId: string, serviceId: string) => `service:${orgId}:${serviceId}`,
  incident: (orgId: string, incidentId: string) => `incident:${orgId}:${incidentId}`,
  user: (userId: string) => `user:${userId}`,
};

