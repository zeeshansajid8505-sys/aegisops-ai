import { reduceAlertState, StateMachineInput } from './state-machine';

describe('Alert State Machine & Deduplication', () => {
  const baseInput: StateMachineInput = {
    currentState: 'INACTIVE',
    evaluationResult: 'BREACH',
    currentTime: new Date('2026-09-08T12:00:00Z'),
    observedValue: 95,
    thresholdValue: 80,
    pendingDurationSeconds: 60,
    recoveryDurationSeconds: 60,
    noDataPolicy: 'IGNORE',
    timestamps: {},
  };

  describe('INACTIVE transitions', () => {
    it('remains INACTIVE when evaluationResult is OK', () => {
      const result = reduceAlertState({
        ...baseInput,
        evaluationResult: 'OK',
      });
      expect(result.newState).toBe('INACTIVE');
      expect(result.event).toBeNull();
    });

    it('transitions to PENDING when breached and pendingDurationSeconds > 0', () => {
      const result = reduceAlertState({
        ...baseInput,
        evaluationResult: 'BREACH',
        pendingDurationSeconds: 60,
      });
      expect(result.newState).toBe('PENDING');
      expect(result.event).not.toBeNull();
      expect(result.event?.eventType).toBe('PENDING_STARTED');
      expect(result.updatedTimestamps.pendingSince).toEqual(baseInput.currentTime);
      expect(result.updatedTimestamps.firstBreachedAt).toEqual(baseInput.currentTime);
    });

    it('transitions directly to FIRING when breached and pendingDurationSeconds <= 0', () => {
      const result = reduceAlertState({
        ...baseInput,
        evaluationResult: 'BREACH',
        pendingDurationSeconds: 0,
      });
      expect(result.newState).toBe('FIRING');
      expect(result.event).not.toBeNull();
      expect(result.event?.eventType).toBe('FIRING_STARTED');
      expect(result.updatedTimestamps.firingStartedAt).toEqual(baseInput.currentTime);
    });
  });

  describe('PENDING transitions', () => {
    it('remains PENDING if pending duration has not elapsed yet', () => {
      const pendingSince = new Date('2026-09-08T11:59:30Z'); // 30s ago, threshold is 60s
      const result = reduceAlertState({
        ...baseInput,
        currentState: 'PENDING',
        evaluationResult: 'BREACH',
        pendingDurationSeconds: 60,
        timestamps: { pendingSince },
      });
      expect(result.newState).toBe('PENDING');
      expect(result.event).toBeNull();
      expect(result.updatedTimestamps.pendingSince).toEqual(pendingSince);
    });

    it('transitions to FIRING once pending duration has elapsed', () => {
      const pendingSince = new Date('2026-09-08T11:58:50Z'); // 70s ago, threshold is 60s
      const result = reduceAlertState({
        ...baseInput,
        currentState: 'PENDING',
        evaluationResult: 'BREACH',
        pendingDurationSeconds: 60,
        timestamps: { pendingSince },
      });
      expect(result.newState).toBe('FIRING');
      expect(result.event).not.toBeNull();
      expect(result.event?.eventType).toBe('FIRING_STARTED');
      expect(result.updatedTimestamps.firingStartedAt).toEqual(baseInput.currentTime);
      expect(result.updatedTimestamps.pendingSince).toBeNull();
    });

    it('transitions back to INACTIVE if metric recovers during pending window', () => {
      const pendingSince = new Date('2026-09-08T11:59:30Z');
      const result = reduceAlertState({
        ...baseInput,
        currentState: 'PENDING',
        evaluationResult: 'OK',
        timestamps: { pendingSince },
      });
      expect(result.newState).toBe('INACTIVE');
      expect(result.event).not.toBeNull();
      expect(result.event?.eventType).toBe('PENDING_CLEARED');
      expect(result.updatedTimestamps.pendingSince).toBeNull();
    });
  });

  describe('FIRING transitions & Deduplication', () => {
    it('deduplicates: remains FIRING without duplicate event on consecutive breaches', () => {
      const firingStartedAt = new Date('2026-09-08T11:50:00Z');
      const result = reduceAlertState({
        ...baseInput,
        currentState: 'FIRING',
        evaluationResult: 'BREACH',
        timestamps: { firingStartedAt },
      });
      expect(result.newState).toBe('FIRING');
      expect(result.event).toBeNull(); // No duplicate event emitted!
      expect(result.updatedTimestamps.firingStartedAt).toEqual(firingStartedAt);
      expect(result.updatedTimestamps.clearCandidateAt).toBeNull();
    });

    it('sets clearCandidateAt when recoveryDurationSeconds > 0 and metric recovers to OK', () => {
      const firingStartedAt = new Date('2026-09-08T11:50:00Z');
      const result = reduceAlertState({
        ...baseInput,
        currentState: 'FIRING',
        evaluationResult: 'OK',
        recoveryDurationSeconds: 120,
        timestamps: { firingStartedAt },
      });
      expect(result.newState).toBe('FIRING'); // Hold in FIRING during recovery period
      expect(result.event).toBeNull();
      expect(result.updatedTimestamps.clearCandidateAt).toEqual(baseInput.currentTime);
    });

    it('resets clearCandidateAt if re-breached before recovery duration elapses', () => {
      const firingStartedAt = new Date('2026-09-08T11:50:00Z');
      const clearCandidateAt = new Date('2026-09-08T11:59:30Z');
      const result = reduceAlertState({
        ...baseInput,
        currentState: 'FIRING',
        evaluationResult: 'BREACH',
        recoveryDurationSeconds: 120,
        timestamps: { firingStartedAt, clearCandidateAt },
      });
      expect(result.newState).toBe('FIRING');
      expect(result.updatedTimestamps.clearCandidateAt).toBeNull(); // Reset!
      expect(result.event).toBeNull();
    });

    it('transitions to INACTIVE with RESOLVED event once recovery duration elapses', () => {
      const firingStartedAt = new Date('2026-09-08T11:50:00Z');
      const clearCandidateAt = new Date('2026-09-08T11:57:00Z'); // 180s ago, recovery is 120s
      const result = reduceAlertState({
        ...baseInput,
        currentState: 'FIRING',
        evaluationResult: 'OK',
        recoveryDurationSeconds: 120,
        timestamps: { firingStartedAt, clearCandidateAt },
      });
      expect(result.newState).toBe('INACTIVE');
      expect(result.event).not.toBeNull();
      expect(result.event?.eventType).toBe('RESOLVED');
      expect(result.updatedTimestamps.resolvedAt).toEqual(baseInput.currentTime);
      expect(result.updatedTimestamps.clearCandidateAt).toBeNull();
    });

    it('transitions immediately to INACTIVE (RESOLVED) when recoveryDurationSeconds <= 0', () => {
      const firingStartedAt = new Date('2026-09-08T11:50:00Z');
      const result = reduceAlertState({
        ...baseInput,
        currentState: 'FIRING',
        evaluationResult: 'OK',
        recoveryDurationSeconds: 0,
        timestamps: { firingStartedAt },
      });
      expect(result.newState).toBe('INACTIVE');
      expect(result.event).not.toBeNull();
      expect(result.event?.eventType).toBe('RESOLVED');
    });
  });

  describe('No Data Policy and Error handling', () => {
    it('policy IGNORE leaves current state unchanged', () => {
      const firingStartedAt = new Date('2026-09-08T11:50:00Z');
      const result = reduceAlertState({
        ...baseInput,
        currentState: 'FIRING',
        evaluationResult: 'NO_DATA',
        noDataPolicy: 'IGNORE',
        timestamps: { firingStartedAt },
      });
      expect(result.newState).toBe('FIRING');
      expect(result.event).toBeNull();
    });

    it('policy OK resolves an active alert', () => {
      const firingStartedAt = new Date('2026-09-08T11:50:00Z');
      const result = reduceAlertState({
        ...baseInput,
        currentState: 'FIRING',
        evaluationResult: 'NO_DATA',
        noDataPolicy: 'OK',
        recoveryDurationSeconds: 0,
        timestamps: { firingStartedAt },
      });
      expect(result.newState).toBe('INACTIVE');
      expect(result.event?.eventType).toBe('RESOLVED');
    });

    it('policy ALERT treats NO_DATA as breach and triggers alert', () => {
      const result = reduceAlertState({
        ...baseInput,
        currentState: 'INACTIVE',
        evaluationResult: 'NO_DATA',
        noDataPolicy: 'ALERT',
        pendingDurationSeconds: 0,
      });
      expect(result.newState).toBe('FIRING');
      expect(result.event?.eventType).toBe('FIRING_STARTED');
    });

    it('infrastructure ERROR maintains state without emitting events', () => {
      const firingStartedAt = new Date('2026-09-08T11:50:00Z');
      const result = reduceAlertState({
        ...baseInput,
        currentState: 'FIRING',
        evaluationResult: 'ERROR',
        timestamps: { firingStartedAt },
      });
      expect(result.newState).toBe('FIRING');
      expect(result.event).toBeNull();
      expect(result.updatedTimestamps.firingStartedAt).toEqual(firingStartedAt);
    });
  });
});
