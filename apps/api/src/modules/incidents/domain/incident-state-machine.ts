import { IncidentStatus, IncidentTimelineEventType } from '@prisma/client';

export class InvalidIncidentTransitionException extends Error {
  constructor(
    public readonly currentStatus: IncidentStatus,
    public readonly targetStatus: IncidentStatus,
    message?: string,
  ) {
    super(
      message ||
        `Invalid incident status transition from '${currentStatus}' to '${targetStatus}'.`,
    );
    this.name = 'InvalidIncidentTransitionException';
  }
}

export interface TransitionContext {
  currentTime?: Date;
  reason?: string;
}

export interface StateTransitionResult {
  previousStatus: IncidentStatus;
  newStatus: IncidentStatus;
  isNoop: boolean;
  timestampsToUpdate: {
    acknowledgedAt?: Date;
    investigationStartedAt?: Date;
    mitigatedAt?: Date;
    resolvedAt?: Date | null;
    reopenedAt?: Date;
  };
  timelineEventType?: IncidentTimelineEventType;
  timelineMessage?: string;
}

// Map of allowed transitions from each source status
const ALLOWED_TRANSITIONS: Record<IncidentStatus, readonly IncidentStatus[]> = {
  OPEN: ['ACKNOWLEDGED', 'INVESTIGATING'],
  ACKNOWLEDGED: ['INVESTIGATING', 'MITIGATED'],
  INVESTIGATING: ['MITIGATED', 'RESOLVED'],
  MITIGATED: ['INVESTIGATING', 'RESOLVED'],
  RESOLVED: ['INVESTIGATING'], // Explicit reopen
};

/**
 * Validates whether a direct transition between two incident statuses is allowed.
 */
export function isValidIncidentTransition(
  currentStatus: IncidentStatus,
  targetStatus: IncidentStatus,
): boolean {
  if (currentStatus === targetStatus) {
    return false;
  }
  const allowed = ALLOWED_TRANSITIONS[currentStatus];
  return allowed ? allowed.includes(targetStatus) : false;
}

/**
 * Calculates state machine transitions and side-effects.
 * Supports idempotent acknowledgement and explicit reopening.
 */
export function transitionIncidentStatus(
  currentStatus: IncidentStatus,
  targetStatus: IncidentStatus,
  currentTimestamps: {
    acknowledgedAt?: Date | null;
    investigationStartedAt?: Date | null;
    mitigatedAt?: Date | null;
    resolvedAt?: Date | null;
    reopenedAt?: Date | null;
  } = {},
  context: TransitionContext = {},
): StateTransitionResult {
  const now = context.currentTime ?? new Date();

  // Handle same status (noop)
  if (currentStatus === targetStatus) {
    return {
      previousStatus: currentStatus,
      newStatus: currentStatus,
      isNoop: true,
      timestampsToUpdate: {},
    };
  }

  // Idempotent acknowledgement:
  // If requesting ACKNOWLEDGED when already past OPEN (e.g. INVESTIGATING, MITIGATED, RESOLVED),
  // return isNoop: true without error.
  if (targetStatus === 'ACKNOWLEDGED') {
    if (currentStatus !== 'OPEN') {
      return {
        previousStatus: currentStatus,
        newStatus: currentStatus,
        isNoop: true,
        timestampsToUpdate: currentTimestamps.acknowledgedAt ? {} : { acknowledgedAt: now },
      };
    }
  }

  if (!isValidIncidentTransition(currentStatus, targetStatus)) {
    throw new InvalidIncidentTransitionException(currentStatus, targetStatus);
  }

  const timestampsToUpdate: StateTransitionResult['timestampsToUpdate'] = {};
  let timelineEventType: IncidentTimelineEventType = 'STATUS_CHANGED';
  let timelineMessage = `Incident status changed from ${currentStatus} to ${targetStatus}`;

  if (targetStatus === 'ACKNOWLEDGED') {
    timelineEventType = 'ACKNOWLEDGED';
    timelineMessage = context.reason
      ? `Incident acknowledged: ${context.reason}`
      : 'Incident acknowledged by responder';
    if (!currentTimestamps.acknowledgedAt) {
      timestampsToUpdate.acknowledgedAt = now;
    }
  } else if (targetStatus === 'INVESTIGATING') {
    if (currentStatus === 'RESOLVED') {
      timelineEventType = 'REOPENED';
      timelineMessage = context.reason
        ? `Incident reopened: ${context.reason}`
        : 'Incident reopened for investigation';
      timestampsToUpdate.reopenedAt = now;
      timestampsToUpdate.resolvedAt = null;
    } else {
      timelineMessage = context.reason
        ? `Investigation started: ${context.reason}`
        : 'Investigation started';
      if (!currentTimestamps.investigationStartedAt) {
        timestampsToUpdate.investigationStartedAt = now;
      }
    }
  } else if (targetStatus === 'MITIGATED') {
    timelineMessage = context.reason
      ? `Incident mitigated: ${context.reason}`
      : 'Incident marked as mitigated';
    timestampsToUpdate.mitigatedAt = now;
  } else if (targetStatus === 'RESOLVED') {
    timelineEventType = 'RESOLVED';
    timelineMessage = context.reason
      ? `Incident resolved: ${context.reason}`
      : 'Incident resolved';
    timestampsToUpdate.resolvedAt = now;
  }

  return {
    previousStatus: currentStatus,
    newStatus: targetStatus,
    isNoop: false,
    timestampsToUpdate,
    timelineEventType,
    timelineMessage,
  };
}

