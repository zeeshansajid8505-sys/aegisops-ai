import {
  AlertInstanceState,
  AlertEvaluationResult,
  AlertEventType,
  AlertNoDataPolicy,
} from '@aegisops/types';

export interface StateMachineInput {
  currentState: AlertInstanceState;
  evaluationResult: AlertEvaluationResult;
  currentTime: Date;
  observedValue: number | null;
  thresholdValue: number;
  pendingDurationSeconds: number;
  recoveryDurationSeconds: number;
  noDataPolicy: AlertNoDataPolicy;
  timestamps: {
    firstBreachedAt?: Date | null;
    pendingSince?: Date | null;
    firingStartedAt?: Date | null;
    lastBreachedAt?: Date | null;
    clearCandidateAt?: Date | null;
    resolvedAt?: Date | null;
  };
}

export interface StateMachineOutput {
  newState: AlertInstanceState;
  event: {
    eventType: AlertEventType;
    message: string;
  } | null;
  updatedTimestamps: {
    firstBreachedAt: Date | null;
    pendingSince: Date | null;
    firingStartedAt: Date | null;
    lastBreachedAt: Date | null;
    clearCandidateAt: Date | null;
    resolvedAt: Date | null;
  };
}

/**
 * Pure, deterministic alert state machine reducer.
 *
 * Implements transitions:
 * - INACTIVE -> PENDING -> FIRING
 * - FIRING -> recovery hold (clearCandidateAt) -> INACTIVE (RESOLVED)
 * - PENDING -> INACTIVE (PENDING_CLEARED)
 * - Deduplicates consecutive FIRING breaches (no duplicate FIRING_STARTED events)
 * - Explicit no-data policies (IGNORE, OK, ALERT)
 * - Separates evaluation ERROR from metric NO_DATA
 */
export function reduceAlertState(input: StateMachineInput): StateMachineOutput {
  const {
    currentState,
    evaluationResult,
    currentTime,
    observedValue,
    thresholdValue,
    pendingDurationSeconds,
    recoveryDurationSeconds,
    noDataPolicy,
    timestamps,
  } = input;

  // Initialize output timestamps with existing values
  const outTimestamps = {
    firstBreachedAt: timestamps.firstBreachedAt ?? null,
    pendingSince: timestamps.pendingSince ?? null,
    firingStartedAt: timestamps.firingStartedAt ?? null,
    lastBreachedAt: timestamps.lastBreachedAt ?? null,
    clearCandidateAt: timestamps.clearCandidateAt ?? null,
    resolvedAt: timestamps.resolvedAt ?? null,
  };

  // 1. Evaluation Infrastructure ERROR
  if (evaluationResult === 'ERROR') {
    // Under internal infrastructure failure, maintain current state safely without emitting false events
    return {
      newState: currentState,
      event: null,
      updatedTimestamps: outTimestamps,
    };
  }

  // 2. Map NO_DATA to logical result based on policy
  let effectiveResult: 'OK' | 'BREACH' | 'NO_OP';
  if (evaluationResult === 'NO_DATA') {
    switch (noDataPolicy) {
      case 'OK':
        effectiveResult = 'OK';
        break;
      case 'ALERT':
        effectiveResult = 'BREACH';
        break;
      case 'IGNORE':
      default:
        effectiveResult = 'NO_OP';
        break;
    }
  } else {
    effectiveResult = evaluationResult === 'BREACH' ? 'BREACH' : 'OK';
  }

  if (effectiveResult === 'NO_OP') {
    return {
      newState: currentState,
      event: null,
      updatedTimestamps: outTimestamps,
    };
  }

  // 3. State Transitions
  switch (currentState) {
    case 'INACTIVE': {
      if (effectiveResult === 'BREACH') {
        outTimestamps.firstBreachedAt = currentTime;
        outTimestamps.lastBreachedAt = currentTime;
        outTimestamps.resolvedAt = null;

        if (pendingDurationSeconds <= 0) {
          // Transition directly to FIRING
          outTimestamps.firingStartedAt = currentTime;
          outTimestamps.pendingSince = null;
          outTimestamps.clearCandidateAt = null;

          return {
            newState: 'FIRING',
            event: {
              eventType: 'FIRING_STARTED',
              message: `Alert breached threshold (${observedValue ?? 'no-data'} vs ${thresholdValue}) and entered FIRING immediately.`,
            },
            updatedTimestamps: outTimestamps,
          };
        } else {
          // Enter PENDING state
          outTimestamps.pendingSince = currentTime;
          outTimestamps.firingStartedAt = null;
          outTimestamps.clearCandidateAt = null;

          return {
            newState: 'PENDING',
            event: {
              eventType: 'PENDING_STARTED',
              message: `Alert breached threshold (${observedValue ?? 'no-data'} vs ${thresholdValue}) and is PENDING for ${pendingDurationSeconds}s.`,
            },
            updatedTimestamps: outTimestamps,
          };
        }
      }

      // INACTIVE + OK -> stay INACTIVE
      return {
        newState: 'INACTIVE',
        event: null,
        updatedTimestamps: outTimestamps,
      };
    }

    case 'PENDING': {
      if (effectiveResult === 'BREACH') {
        outTimestamps.lastBreachedAt = currentTime;
        const pendingStartTime = outTimestamps.pendingSince ?? currentTime;
        const pendingElapsedSeconds =
          (currentTime.getTime() - pendingStartTime.getTime()) / 1000;

        if (pendingElapsedSeconds >= pendingDurationSeconds) {
          // Pending duration satisfied -> FIRING
          outTimestamps.firingStartedAt = currentTime;
          outTimestamps.pendingSince = null;
          outTimestamps.clearCandidateAt = null;

          return {
            newState: 'FIRING',
            event: {
              eventType: 'FIRING_STARTED',
              message: `Alert condition persisted for ${Math.round(
                pendingElapsedSeconds,
              )}s (>= ${pendingDurationSeconds}s). Alert transitioned to FIRING.`,
            },
            updatedTimestamps: outTimestamps,
          };
        }

        // Still pending
        return {
          newState: 'PENDING',
          event: null,
          updatedTimestamps: outTimestamps,
        };
      }

      // PENDING + OK -> violation cleared before firing
      outTimestamps.pendingSince = null;
      outTimestamps.firstBreachedAt = null;
      outTimestamps.clearCandidateAt = null;

      return {
        newState: 'INACTIVE',
        event: {
          eventType: 'PENDING_CLEARED',
          message: `Metric recovered to normal value (${observedValue ?? 'ok'}) while PENDING. Alert returned to INACTIVE.`,
        },
        updatedTimestamps: outTimestamps,
      };
    }

    case 'FIRING': {
      if (effectiveResult === 'BREACH') {
        // Condition is still firing -> cancel any recovery candidate, remain FIRING
        outTimestamps.lastBreachedAt = currentTime;
        outTimestamps.clearCandidateAt = null;

        // CRITICAL: Deduplication - do NOT emit another FIRING_STARTED event
        return {
          newState: 'FIRING',
          event: null,
          updatedTimestamps: outTimestamps,
        };
      }

      // FIRING + OK -> evaluate recovery hold
      if (recoveryDurationSeconds <= 0) {
        // Immediate recovery
        outTimestamps.resolvedAt = currentTime;
        outTimestamps.clearCandidateAt = null;
        outTimestamps.pendingSince = null;
        outTimestamps.firstBreachedAt = null;

        return {
          newState: 'INACTIVE',
          event: {
            eventType: 'RESOLVED',
            message: `Metric recovered to normal value (${observedValue ?? 'ok'}). Alert RESOLVED immediately.`,
          },
          updatedTimestamps: outTimestamps,
        };
      }

      // Hold in FIRING until clear candidate has persisted for recoveryDurationSeconds
      if (!outTimestamps.clearCandidateAt) {
        outTimestamps.clearCandidateAt = currentTime;
        return {
          newState: 'FIRING',
          event: null,
          updatedTimestamps: outTimestamps,
        };
      }

      const recoveryElapsedSeconds =
        (currentTime.getTime() - outTimestamps.clearCandidateAt.getTime()) / 1000;

      if (recoveryElapsedSeconds >= recoveryDurationSeconds) {
        // Recovery duration satisfied -> transition to INACTIVE / RESOLVED
        outTimestamps.resolvedAt = currentTime;
        outTimestamps.clearCandidateAt = null;
        outTimestamps.pendingSince = null;
        outTimestamps.firstBreachedAt = null;

        return {
          newState: 'INACTIVE',
          event: {
            eventType: 'RESOLVED',
            message: `Metric remained healthy for ${Math.round(
              recoveryElapsedSeconds,
            )}s (>= ${recoveryDurationSeconds}s). Alert RESOLVED.`,
          },
          updatedTimestamps: outTimestamps,
        };
      }

      // Still in recovery hold
      return {
        newState: 'FIRING',
        event: null,
        updatedTimestamps: outTimestamps,
      };
    }

    default:
      return {
        newState: 'INACTIVE',
        event: null,
        updatedTimestamps: outTimestamps,
      };
  }
}

