import { AlertSeverity, IncidentSeverity } from '@prisma/client';

export const SEVERITY_RANK: Record<IncidentSeverity, number> = {
  CRITICAL: 4,
  ERROR: 3,
  WARNING: 2,
  INFO: 1,
};

export const ALERT_TO_INCIDENT_SEVERITY: Record<AlertSeverity, IncidentSeverity> = {
  SEV_1: 'CRITICAL',
  SEV_2: 'ERROR',
  SEV_3: 'WARNING',
  SEV_4: 'INFO',
};

export function alertSeverityToIncidentSeverity(alertSeverity: AlertSeverity): IncidentSeverity {
  return ALERT_TO_INCIDENT_SEVERITY[alertSeverity] ?? 'WARNING';
}

export function compareSeverity(a: IncidentSeverity, b: IncidentSeverity): number {
  return SEVERITY_RANK[a] - SEVERITY_RANK[b];
}

export interface SeverityEscalationResult {
  escalated: boolean;
  newSeverity: IncidentSeverity;
  previousSeverity: IncidentSeverity;
}

export function evaluateSeverityEscalation(
  currentSeverity: IncidentSeverity,
  incoming: IncidentSeverity | AlertSeverity,
): SeverityEscalationResult {
  const incomingSeverity: IncidentSeverity =
    incoming in SEVERITY_RANK
      ? (incoming as IncidentSeverity)
      : alertSeverityToIncidentSeverity(incoming as AlertSeverity);

  if (compareSeverity(incomingSeverity, currentSeverity) > 0) {
    return {
      escalated: true,
      newSeverity: incomingSeverity,
      previousSeverity: currentSeverity,
    };
  }

  return {
    escalated: false,
    newSeverity: currentSeverity,
    previousSeverity: currentSeverity,
  };
}

