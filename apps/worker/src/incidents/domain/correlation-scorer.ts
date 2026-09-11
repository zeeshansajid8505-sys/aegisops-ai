import { IncidentSeverity, IncidentStatus } from '@prisma/client';
import { IncidentCorrelationReason } from '@aegisops/types';
import { compareSeverity } from './severity-escalation';

export const INCIDENT_CORRELATION_SAME_SERVICE_SCORE = 100;
export const INCIDENT_CORRELATION_DEPENDENCY_SCORE = 70;
export const INCIDENT_CORRELATION_SAME_TEAM_SCORE = 20;
export const INCIDENT_CORRELATION_MIN_SCORE = 70;
export const INCIDENT_CORRELATION_WINDOW_SECONDS = 600; // 10 minutes

export interface AlertCorrelationInput {
  alertEventId: string;
  serviceId: string;
  environmentId: string;
  environmentKey?: string | null;
  occurredAt: Date;
  ownerTeamId?: string | null;
  connectedServiceIds: Set<string> | string[];
}

export interface IncidentCandidate {
  id: string;
  incidentKey: string;
  organizationId: string;
  environmentId: string | null;
  environmentKey?: string | null;
  primaryServiceId: string | null;
  status: IncidentStatus;
  severity: IncidentSeverity;
  assignedTeamId: string | null;
  primaryServiceOwnerTeamId?: string | null;
  lastSignalAt: Date;
  linkedServiceIds: Set<string> | string[];
}

export interface CandidateScoreResult {
  candidate: IncidentCandidate;
  totalScore: number;
  reasons: IncidentCorrelationReason[];
  eligible: boolean;
  deltaSeconds: number;
}

export function calculateTimeProximityScore(deltaSeconds: number): {
  score: number;
  description: string;
} {
  const absDelta = Math.abs(deltaSeconds);
  if (absDelta <= 120) {
    return { score: 30, description: `Alert fired within 2 minutes of last signal (${absDelta}s)` };
  }
  if (absDelta <= 300) {
    return { score: 20, description: `Alert fired within 5 minutes of last signal (${absDelta}s)` };
  }
  if (absDelta <= INCIDENT_CORRELATION_WINDOW_SECONDS) {
    return {
      score: 10,
      description: `Alert fired within 10 minutes of last signal (${absDelta}s)`,
    };
  }
  return { score: 0, description: 'Outside temporal correlation window' };
}

export function scoreIncidentCandidate(
  alert: AlertCorrelationInput,
  candidate: IncidentCandidate,
): CandidateScoreResult | null {
  if (candidate.status === 'RESOLVED') {
    return null;
  }

  // Must match environment (by key if both present, else by environmentId)
  if (candidate.environmentKey && alert.environmentKey) {
    if (candidate.environmentKey !== alert.environmentKey) {
      return null;
    }
  } else if (candidate.environmentId && candidate.environmentId !== alert.environmentId) {
    return null;
  }

  const alertTime = alert.occurredAt.getTime();
  const lastSignalTime = candidate.lastSignalAt.getTime();
  const deltaSeconds = Math.round(Math.abs(alertTime - lastSignalTime) / 1000);

  if (deltaSeconds > INCIDENT_CORRELATION_WINDOW_SECONDS) {
    return null;
  }

  const reasons: IncidentCorrelationReason[] = [];
  let topologyScore = 0;

  const candidateServices = new Set(
    Array.isArray(candidate.linkedServiceIds)
      ? candidate.linkedServiceIds
      : Array.from(candidate.linkedServiceIds),
  );
  if (candidate.primaryServiceId) {
    candidateServices.add(candidate.primaryServiceId);
  }

  const connectedServices = new Set(
    Array.isArray(alert.connectedServiceIds)
      ? alert.connectedServiceIds
      : Array.from(alert.connectedServiceIds),
  );

  // 1. Same Service Check (+100)
  if (candidateServices.has(alert.serviceId)) {
    topologyScore += INCIDENT_CORRELATION_SAME_SERVICE_SCORE;
    reasons.push({
      code: 'SAME_SERVICE',
      score: INCIDENT_CORRELATION_SAME_SERVICE_SCORE,
      description: `Alert belongs to service already involved in incident (${alert.serviceId})`,
      metadata: { serviceId: alert.serviceId },
    });
  } else {
    // 2. Direct 1-hop Dependency Check (+70)
    let matchedDepServiceId: string | null = null;
    for (const serviceId of candidateServices) {
      if (connectedServices.has(serviceId)) {
        matchedDepServiceId = serviceId;
        break;
      }
    }

    if (matchedDepServiceId) {
      topologyScore += INCIDENT_CORRELATION_DEPENDENCY_SCORE;
      reasons.push({
        code: 'DIRECT_DEPENDENCY',
        score: INCIDENT_CORRELATION_DEPENDENCY_SCORE,
        description: `Alert service has direct 1-hop dependency topology relationship with service in incident (${matchedDepServiceId})`,
        metadata: {
          alertServiceId: alert.serviceId,
          incidentServiceId: matchedDepServiceId,
        },
      });
    }
  }

  // 3. Same Owner Team Check (+20)
  if (alert.ownerTeamId) {
    const candidateTeamId = candidate.assignedTeamId || candidate.primaryServiceOwnerTeamId;
    if (candidateTeamId && candidateTeamId === alert.ownerTeamId) {
      topologyScore += INCIDENT_CORRELATION_SAME_TEAM_SCORE;
      reasons.push({
        code: 'SAME_OWNER_TEAM',
        score: INCIDENT_CORRELATION_SAME_TEAM_SCORE,
        description: `Alert service shares owner team with incident (${alert.ownerTeamId})`,
        metadata: { teamId: alert.ownerTeamId },
      });
    }
  }

  if (topologyScore === 0) {
    return null;
  }

  // 4. Time Proximity Bonus (+10 to +30)
  const timeBonus = calculateTimeProximityScore(deltaSeconds);
  if (timeBonus.score > 0) {
    reasons.push({
      code: 'TIME_PROXIMITY',
      score: timeBonus.score,
      description: timeBonus.description,
      metadata: { deltaSeconds },
    });
  }

  const totalScore = topologyScore + timeBonus.score;
  const eligible = totalScore >= INCIDENT_CORRELATION_MIN_SCORE;

  return {
    candidate,
    totalScore,
    reasons,
    eligible,
    deltaSeconds,
  };
}

export function selectBestIncidentCandidate(
  alert: AlertCorrelationInput,
  candidates: IncidentCandidate[],
): CandidateScoreResult | null {
  const scoredCandidates: CandidateScoreResult[] = [];

  for (const candidate of candidates) {
    const result = scoreIncidentCandidate(alert, candidate);
    if (result && result.eligible) {
      scoredCandidates.push(result);
    }
  }

  if (scoredCandidates.length === 0) {
    return null;
  }

  scoredCandidates.sort((a, b) => {
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }

    const timeDiff = b.candidate.lastSignalAt.getTime() - a.candidate.lastSignalAt.getTime();
    if (timeDiff !== 0) {
      return timeDiff;
    }

    const severityDiff = compareSeverity(b.candidate.severity, a.candidate.severity);
    if (severityDiff !== 0) {
      return severityDiff;
    }

    return a.candidate.id.localeCompare(b.candidate.id);
  });

  return scoredCandidates[0] ?? null;
}
