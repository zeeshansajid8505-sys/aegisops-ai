import {
  scoreIncidentCandidate,
  selectBestIncidentCandidate,
  calculateTimeProximityScore,
  IncidentCandidate,
  AlertCorrelationInput,
} from './correlation-scorer';

describe('Correlation Scorer Engine', () => {
  const baseTime = new Date('2026-09-08T12:00:00.000Z');

  describe('calculateTimeProximityScore', () => {
    it('awards +30 for delta <= 120s', () => {
      expect(calculateTimeProximityScore(0).score).toBe(30);
      expect(calculateTimeProximityScore(120).score).toBe(30);
    });

    it('awards +20 for 120s < delta <= 300s', () => {
      expect(calculateTimeProximityScore(121).score).toBe(20);
      expect(calculateTimeProximityScore(300).score).toBe(20);
    });

    it('awards +10 for 300s < delta <= 600s', () => {
      expect(calculateTimeProximityScore(301).score).toBe(10);
      expect(calculateTimeProximityScore(600).score).toBe(10);
    });

    it('awards 0 for delta > 600s', () => {
      expect(calculateTimeProximityScore(601).score).toBe(0);
    });
  });

  describe('scoreIncidentCandidate', () => {
    const alert: AlertCorrelationInput = {
      alertEventId: 'alert-evt-1',
      serviceId: 'service-checkout',
      environmentId: 'env-prod',
      occurredAt: baseTime,
      ownerTeamId: 'team-payments',
      connectedServiceIds: ['service-payment-gateway', 'service-inventory'],
    };

    it('returns +100 for same service plus time bonus', () => {
      const candidate: IncidentCandidate = {
        id: 'inc-1',
        incidentKey: 'INC-001',
        organizationId: 'org-1',
        environmentId: 'env-prod',
        primaryServiceId: 'service-checkout',
        status: 'INVESTIGATING',
        severity: 'WARNING',
        assignedTeamId: 'team-payments',
        lastSignalAt: new Date('2026-09-08T11:59:00.000Z'), // 60s ago -> +30
        linkedServiceIds: ['service-checkout'],
      };

      const result = scoreIncidentCandidate(alert, candidate);
      expect(result).not.toBeNull();
      expect(result!.totalScore).toBe(100 + 20 + 30); // 100 same service + 20 same team + 30 time = 150
      expect(result!.eligible).toBe(true);
      expect(result!.reasons.map((r) => r.code)).toContain('SAME_SERVICE');
      expect(result!.reasons.map((r) => r.code)).toContain('SAME_OWNER_TEAM');
      expect(result!.reasons.map((r) => r.code)).toContain('TIME_PROXIMITY');
    });

    it('returns +70 for direct 1-hop dependency plus time bonus', () => {
      const candidate: IncidentCandidate = {
        id: 'inc-2',
        incidentKey: 'INC-002',
        organizationId: 'org-1',
        environmentId: 'env-prod',
        primaryServiceId: 'service-payment-gateway', // connected to alert.serviceId
        status: 'OPEN',
        severity: 'WARNING',
        assignedTeamId: 'team-other',
        lastSignalAt: new Date('2026-09-08T11:58:00.000Z'), // 120s ago -> +30
        linkedServiceIds: ['service-payment-gateway'],
      };

      const result = scoreIncidentCandidate(alert, candidate);
      expect(result).not.toBeNull();
      expect(result!.totalScore).toBe(70 + 30); // 70 dependency + 30 time = 100
      expect(result!.eligible).toBe(true);
      expect(result!.reasons.map((r) => r.code)).toContain('DIRECT_DEPENDENCY');
    });

    it('excludes candidate if delta > 600s', () => {
      const candidate: IncidentCandidate = {
        id: 'inc-3',
        incidentKey: 'INC-003',
        organizationId: 'org-1',
        environmentId: 'env-prod',
        primaryServiceId: 'service-checkout',
        status: 'OPEN',
        severity: 'WARNING',
        assignedTeamId: 'team-payments',
        lastSignalAt: new Date('2026-09-08T11:49:00.000Z'), // 11 mins ago (> 600s)
        linkedServiceIds: ['service-checkout'],
      };

      const result = scoreIncidentCandidate(alert, candidate);
      expect(result).toBeNull();
    });

    it('excludes resolved incidents', () => {
      const candidate: IncidentCandidate = {
        id: 'inc-4',
        incidentKey: 'INC-004',
        organizationId: 'org-1',
        environmentId: 'env-prod',
        primaryServiceId: 'service-checkout',
        status: 'RESOLVED',
        severity: 'WARNING',
        assignedTeamId: 'team-payments',
        lastSignalAt: baseTime,
        linkedServiceIds: ['service-checkout'],
      };

      const result = scoreIncidentCandidate(alert, candidate);
      expect(result).toBeNull();
    });

    it('excludes candidate from different environment', () => {
      const candidate: IncidentCandidate = {
        id: 'inc-5',
        incidentKey: 'INC-005',
        organizationId: 'org-1',
        environmentId: 'env-staging',
        primaryServiceId: 'service-checkout',
        status: 'OPEN',
        severity: 'WARNING',
        assignedTeamId: 'team-payments',
        lastSignalAt: baseTime,
        linkedServiceIds: ['service-checkout'],
      };

      const result = scoreIncidentCandidate(alert, candidate);
      expect(result).toBeNull();
    });
  });

  describe('selectBestIncidentCandidate', () => {
    it('picks highest score, tie-breaking by lastSignalAt, severity, then ID', () => {
      const alert: AlertCorrelationInput = {
        alertEventId: 'alert-1',
        serviceId: 'service-a',
        environmentId: 'env-1',
        occurredAt: baseTime,
        connectedServiceIds: ['service-b'],
      };

      const cand1: IncidentCandidate = {
        id: 'inc-1',
        incidentKey: 'INC-1',
        organizationId: 'org-1',
        environmentId: 'env-1',
        primaryServiceId: 'service-b', // +70 dependency + 20 time = 90
        status: 'OPEN',
        severity: 'WARNING',
        assignedTeamId: null,
        lastSignalAt: new Date('2026-09-08T11:57:00.000Z'), // 180s ago (+20)
        linkedServiceIds: ['service-b'],
      };

      const cand2: IncidentCandidate = {
        id: 'inc-2',
        incidentKey: 'INC-2',
        organizationId: 'org-1',
        environmentId: 'env-1',
        primaryServiceId: 'service-a', // +100 same service + 30 time = 130
        status: 'OPEN',
        severity: 'WARNING',
        assignedTeamId: null,
        lastSignalAt: new Date('2026-09-08T11:59:30.000Z'), // 30s ago (+30)
        linkedServiceIds: ['service-a'],
      };

      const best = selectBestIncidentCandidate(alert, [cand1, cand2]);
      expect(best).not.toBeNull();
      expect(best!.candidate.id).toBe('inc-2');
    });
  });
});

