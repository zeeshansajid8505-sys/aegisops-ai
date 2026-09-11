import { NotFoundException } from '@nestjs/common';
import { RcaEvidenceBuilder } from './rca-evidence.builder';

describe('RcaEvidenceBuilder', () => {
  let builder: RcaEvidenceBuilder;

  const mockPrisma: any = {
    incident: {
      findFirst: jest.fn(),
    },
    serviceDependency: {
      findMany: jest.fn(),
    },
    service: {
      findMany: jest.fn(),
    },
    alertEvent: {
      findMany: jest.fn(),
    },
    metricRollupMinute: {
      findMany: jest.fn(),
    },
    healthProbeState: {
      findMany: jest.fn(),
    },
    runbook: {
      findMany: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    builder = new RcaEvidenceBuilder(mockPrisma);
  });

  it('throws NotFoundException if incident not found in tenant organization', async () => {
    mockPrisma.incident.findFirst.mockResolvedValue(null);

    await expect(
      builder.buildEvidence('org-1', 'inc-missing'),
    ).rejects.toThrow(NotFoundException);
  });

  it('builds structured evidence with bounded window, candidate services, metric deviations, and SHA-256 fingerprint', async () => {
    const detectedAt = new Date('2026-09-08T12:00:00.000Z');

    mockPrisma.incident.findFirst.mockResolvedValue({
      id: 'inc-1',
      incidentKey: 'INC-2026-001',
      title: 'Checkout Failure Spike',
      severity: 'CRITICAL',
      status: 'OPEN',
      primaryServiceId: 'svc-checkout',
      detectedAt,
      alerts: [
        {
          id: 'ia-1',
          serviceId: 'svc-checkout',
          alertInstance: { state: 'FIRING', rule: { name: 'High Error Rate', severity: 'CRITICAL' } },
          triggerAlertEvent: { id: 'ev-1' },
        },
      ],
      timelineEvents: [
        {
          id: 'te-1',
          eventType: 'NOTE_ADDED',
          message: 'Customers experiencing 504 Gateway Timeout',
          actorMembershipId: 'mem-1',
          occurredAt: new Date('2026-09-08T12:05:00.000Z'),
        },
      ],
    });

    mockPrisma.serviceDependency.findMany
      .mockResolvedValueOnce([
        {
          id: 'dep-1',
          sourceServiceId: 'svc-checkout',
          targetServiceId: 'svc-payment',
          dependencyType: 'SYNCHRONOUS',
          isCritical: true,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'dep-1',
          sourceServiceId: 'svc-checkout',
          targetServiceId: 'svc-payment',
          dependencyType: 'SYNCHRONOUS',
          isCritical: true,
        },
      ]);

    mockPrisma.alertEvent.findMany.mockResolvedValue([
      {
        id: 'ev-payment',
        occurredAt: new Date('2026-09-08T11:58:00.000Z'),
        rule: { name: 'Database Connection Pool Exhausted', severity: 'CRITICAL' },
        alertInstance: { serviceId: 'svc-payment', state: 'FIRING' },
      },
    ]);

    mockPrisma.service.findMany.mockResolvedValue([
      { id: 'svc-checkout', name: 'checkout-api', slug: 'checkout-api', tier: 'TIER_1', lifecycleStatus: 'ACTIVE' },
      { id: 'svc-payment', name: 'payment-gateway', slug: 'payment-gateway', tier: 'TIER_1', lifecycleStatus: 'ACTIVE' },
    ]);

    mockPrisma.metricRollupMinute.findMany
      .mockResolvedValueOnce([
        { serviceId: 'svc-checkout', definitionId: 'def-err', avg: 45, definition: { name: 'http_requests_error_rate' } },
      ])
      .mockResolvedValueOnce([
        { serviceId: 'svc-checkout', definitionId: 'def-err', avg: 1, definition: { name: 'http_requests_error_rate' } },
      ]);

    mockPrisma.healthProbeState.findMany.mockResolvedValue([
      {
        id: 'ps-1',
        status: 'UNHEALTHY',
        consecutiveFailures: 5,
        lastFailureCode: 'CONNECTION_TIMEOUT',
        probe: { serviceId: 'svc-payment' },
      },
    ]);

    mockPrisma.runbook.findMany.mockResolvedValue([
      {
        id: 'rb-1',
        name: 'Restart Payment DB Pool',
        description: 'Flush and restart payment database connections',
        serviceId: 'svc-payment',
        severity: 'CRITICAL',
        tags: ['payment', 'database'],
        steps: [{ id: 'st-1', order: 1, title: 'Check Pool', instruction: 'Inspect pool size', stepType: 'CHECK' }],
      },
    ]);

    const result = await builder.buildEvidence('org-1', 'inc-1');

    expect(result.incident.id).toBe('inc-1');
    expect(result.candidateServices.map((s: any) => s.id)).toContain('svc-checkout');
    expect(result.candidateServices.map((s: any) => s.id)).toContain('svc-payment');
    expect(result.alertEvidence.length).toBeGreaterThan(0);
    expect(result.healthEvidence.length).toBe(1);
    expect(result.humanNotes.length).toBe(1);
    expect(result.availableRunbooks.length).toBe(1);
    expect(typeof result.fingerprint).toBe('string');
    expect(result.fingerprint.length).toBe(64); // SHA-256 hex length
  });
});

