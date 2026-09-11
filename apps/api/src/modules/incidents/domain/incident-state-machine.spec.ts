import {
  isValidIncidentTransition,
  transitionIncidentStatus,
  InvalidIncidentTransitionException,
} from './incident-state-machine';

describe('Incident State Machine', () => {
  describe('isValidIncidentTransition', () => {
    it('allows valid normal lifecycle flow', () => {
      expect(isValidIncidentTransition('OPEN', 'ACKNOWLEDGED')).toBe(true);
      expect(isValidIncidentTransition('OPEN', 'INVESTIGATING')).toBe(true);
      expect(isValidIncidentTransition('ACKNOWLEDGED', 'INVESTIGATING')).toBe(true);
      expect(isValidIncidentTransition('ACKNOWLEDGED', 'MITIGATED')).toBe(true);
      expect(isValidIncidentTransition('INVESTIGATING', 'MITIGATED')).toBe(true);
      expect(isValidIncidentTransition('INVESTIGATING', 'RESOLVED')).toBe(true);
      expect(isValidIncidentTransition('MITIGATED', 'RESOLVED')).toBe(true);
    });

    it('allows mitigation regression and explicit reopening', () => {
      expect(isValidIncidentTransition('MITIGATED', 'INVESTIGATING')).toBe(true);
      expect(isValidIncidentTransition('RESOLVED', 'INVESTIGATING')).toBe(true);
    });

    it('disallows invalid transitions', () => {
      expect(isValidIncidentTransition('OPEN', 'RESOLVED')).toBe(false);
      expect(isValidIncidentTransition('OPEN', 'MITIGATED')).toBe(false);
      expect(isValidIncidentTransition('RESOLVED', 'OPEN')).toBe(false);
      expect(isValidIncidentTransition('RESOLVED', 'ACKNOWLEDGED')).toBe(false);
      expect(isValidIncidentTransition('RESOLVED', 'MITIGATED')).toBe(false);
      expect(isValidIncidentTransition('OPEN', 'OPEN')).toBe(false);
    });
  });

  describe('transitionIncidentStatus', () => {
    const fixedNow = new Date('2026-09-08T12:00:00.000Z');

    it('transitions OPEN to ACKNOWLEDGED with timestamp', () => {
      const result = transitionIncidentStatus('OPEN', 'ACKNOWLEDGED', {}, { currentTime: fixedNow });
      expect(result.previousStatus).toBe('OPEN');
      expect(result.newStatus).toBe('ACKNOWLEDGED');
      expect(result.isNoop).toBe(false);
      expect(result.timestampsToUpdate.acknowledgedAt).toEqual(fixedNow);
      expect(result.timelineEventType).toBe('ACKNOWLEDGED');
    });

    it('is idempotent for ACKNOWLEDGED on already acknowledged or advanced incidents', () => {
      const ackDate = new Date('2026-09-08T11:00:00.000Z');
      const result = transitionIncidentStatus(
        'INVESTIGATING',
        'ACKNOWLEDGED',
        { acknowledgedAt: ackDate },
        { currentTime: fixedNow },
      );
      expect(result.previousStatus).toBe('INVESTIGATING');
      expect(result.newStatus).toBe('INVESTIGATING');
      expect(result.isNoop).toBe(true);
      expect(result.timestampsToUpdate.acknowledgedAt).toBeUndefined();
    });

    it('sets reopenedAt and clears resolvedAt when reopening from RESOLVED to INVESTIGATING', () => {
      const result = transitionIncidentStatus(
        'RESOLVED',
        'INVESTIGATING',
        { resolvedAt: new Date('2026-09-08T10:00:00.000Z') },
        { currentTime: fixedNow, reason: 'New error spike observed' },
      );
      expect(result.newStatus).toBe('INVESTIGATING');
      expect(result.timestampsToUpdate.reopenedAt).toEqual(fixedNow);
      expect(result.timestampsToUpdate.resolvedAt).toBeNull();
      expect(result.timelineEventType).toBe('REOPENED');
    });

    it('throws InvalidIncidentTransitionException for forbidden transition', () => {
      expect(() =>
        transitionIncidentStatus('OPEN', 'RESOLVED', {}, { currentTime: fixedNow }),
      ).toThrow(InvalidIncidentTransitionException);
    });
  });
});

