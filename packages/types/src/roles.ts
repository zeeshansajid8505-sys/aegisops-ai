export type UserRole = 'OWNER' | 'ADMIN' | 'SRE' | 'ENGINEER' | 'MANAGER' | 'VIEWER';

export type Permission =
  // Phase 1: Organizations & Memberships
  | 'organization.read'
  | 'organization.update'
  | 'organization.delete'
  | 'members.read'
  | 'members.invite'
  | 'members.role.update'
  | 'members.remove'
  | 'profile.read'
  | 'profile.update'
  // Phase 2: Teams
  | 'teams.read'
  | 'teams.create'
  | 'teams.update'
  | 'teams.delete'
  | 'teams.members.manage'
  // Phase 2: Services
  | 'services.read'
  | 'services.create'
  | 'services.update'
  | 'services.lifecycle.update'
  | 'services.delete'
  // Phase 2: Environments
  | 'environments.read'
  | 'environments.create'
  | 'environments.update'
  | 'environments.delete'
  // Phase 2: Dependencies
  | 'dependencies.read'
  | 'dependencies.manage'
  // Phase 2: Health Probes
  | 'health.read'
  | 'health.probes.manage'
  | 'health.probes.execute'
  // Phase 3: Telemetry & Metrics
  | 'telemetry.read'
  | 'telemetry.query'
  | 'telemetry.keys.read'
  | 'telemetry.keys.manage'
  // Phase 4: Alerts & Rules
  | 'alerts.read'
  | 'alerts.rules.read'
  | 'alerts.rules.manage'
  | 'alerts.rules.evaluate'
  // Phase 5: Incidents & Correlation
  | 'incidents.read'
  | 'incidents.create'
  | 'incidents.update'
  | 'incidents.acknowledge'
  | 'incidents.assign'
  | 'incidents.respond'
  | 'incidents.resolve'
  | 'incidents.severity.manage'
  | 'incidents.alerts.manage'
  | 'incidents.notes.create'
  // Phase 7: AI RCA & Remediation Runbooks
  | 'ai.analysis.read'
  | 'ai.analysis.run'
  | 'ai.analysis.feedback'
  | 'runbooks.read'
  | 'runbooks.manage'
  | 'runbooks.execute'
  // Phase 8: ML Anomaly Detection
  | 'anomalies.read'
  | 'anomalies.detectors.manage'
  | 'anomalies.models.train'
  | 'anomalies.feedback'
  // Phase 9: Notifications & Integrations
  | 'notifications.read'
  | 'notifications.preferences.manage'
  | 'notifications.policies.manage'
  | 'integrations.read'
  | 'integrations.manage'
  | 'integrations.test'
  // Phase 10: Reliability Analytics & Postmortems
  | 'reliability.read'
  | 'postmortems.read'
  | 'postmortems.create'
  | 'postmortems.edit'
  | 'postmortems.approve'
  | 'postmortems.action-items.manage';

const ALL_PERMISSIONS: readonly Permission[] = [
  'organization.read',
  'organization.update',
  'organization.delete',
  'members.read',
  'members.invite',
  'members.role.update',
  'members.remove',
  'profile.read',
  'profile.update',
  'teams.read',
  'teams.create',
  'teams.update',
  'teams.delete',
  'teams.members.manage',
  'services.read',
  'services.create',
  'services.update',
  'services.lifecycle.update',
  'services.delete',
  'environments.read',
  'environments.create',
  'environments.update',
  'environments.delete',
  'dependencies.read',
  'dependencies.manage',
  'health.read',
  'health.probes.manage',
  'health.probes.execute',
  'telemetry.read',
  'telemetry.query',
  'telemetry.keys.read',
  'telemetry.keys.manage',
  'alerts.read',
  'alerts.rules.read',
  'alerts.rules.manage',
  'alerts.rules.evaluate',
  'incidents.read',
  'incidents.create',
  'incidents.update',
  'incidents.acknowledge',
  'incidents.assign',
  'incidents.respond',
  'incidents.resolve',
  'incidents.severity.manage',
  'incidents.alerts.manage',
  'incidents.notes.create',
  'ai.analysis.read',
  'ai.analysis.run',
  'ai.analysis.feedback',
  'runbooks.read',
  'runbooks.manage',
  'runbooks.execute',
  'anomalies.read',
  'anomalies.detectors.manage',
  'anomalies.models.train',
  'anomalies.feedback',
  'notifications.read',
  'notifications.preferences.manage',
  'notifications.policies.manage',
  'integrations.read',
  'integrations.manage',
  'integrations.test',
  // Phase 10: Reliability Analytics & Postmortems
  'reliability.read',
  'postmortems.read',
  'postmortems.create',
  'postmortems.edit',
  'postmortems.approve',
  'postmortems.action-items.manage',
];

const READ_ONLY_PERMISSIONS: readonly Permission[] = [
  'teams.read',
  'services.read',
  'environments.read',
  'dependencies.read',
  'health.read',
  'telemetry.read',
  'telemetry.query',
  'alerts.read',
  'alerts.rules.read',
  'incidents.read',
  'ai.analysis.read',
  'runbooks.read',
  'anomalies.read',
  'notifications.read',
  'integrations.read',
  'reliability.read',
  'postmortems.read',
];

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  OWNER: ALL_PERMISSIONS,
  ADMIN: ALL_PERMISSIONS,
  SRE: [
    'organization.read',
    'members.read',
    'profile.read',
    'profile.update',
    'teams.read',
    'services.read',
    'services.create',
    'services.update',
    'services.lifecycle.update',
    'services.delete',
    'environments.read',
    'environments.create',
    'environments.update',
    'environments.delete',
    'dependencies.read',
    'dependencies.manage',
    'health.read',
    'health.probes.manage',
    'health.probes.execute',
    'telemetry.read',
    'telemetry.query',
    'telemetry.keys.read',
    'telemetry.keys.manage',
    'alerts.read',
    'alerts.rules.read',
    'alerts.rules.manage',
    'alerts.rules.evaluate',
    'incidents.read',
    'incidents.create',
    'incidents.update',
    'incidents.acknowledge',
    'incidents.assign',
    'incidents.respond',
    'incidents.resolve',
    'incidents.severity.manage',
    'incidents.alerts.manage',
    'incidents.notes.create',
    'ai.analysis.read',
    'ai.analysis.run',
    'ai.analysis.feedback',
    'runbooks.read',
    'runbooks.manage',
    'runbooks.execute',
    'anomalies.read',
    'anomalies.detectors.manage',
    'anomalies.models.train',
    'anomalies.feedback',
    'notifications.read',
    'notifications.preferences.manage',
    'notifications.policies.manage',
    'integrations.read',
    'integrations.test',
    'reliability.read',
    'postmortems.read',
    'postmortems.create',
    'postmortems.edit',
    'postmortems.approve',
    'postmortems.action-items.manage',
  ],
  ENGINEER: [
    'organization.read',
    'members.read',
    'profile.read',
    'profile.update',
    ...READ_ONLY_PERMISSIONS,
    'incidents.create',
    'incidents.acknowledge',
    'incidents.respond',
    'incidents.notes.create',
    'ai.analysis.run',
    'ai.analysis.feedback',
    'runbooks.execute',
    'anomalies.feedback',
    'notifications.preferences.manage',
    'postmortems.create',
    'postmortems.edit',
    'postmortems.action-items.manage',
  ],
  MANAGER: [
    'organization.read',
    'members.read',
    'profile.read',
    'profile.update',
    ...READ_ONLY_PERMISSIONS,
    'incidents.notes.create',
    'notifications.preferences.manage',
  ],
  VIEWER: [
    'organization.read',
    'members.read',
    'profile.read',
    'profile.update',
    ...READ_ONLY_PERMISSIONS,
    'notifications.preferences.manage',
  ],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}