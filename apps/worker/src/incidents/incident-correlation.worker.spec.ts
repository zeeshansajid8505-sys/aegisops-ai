import { IncidentCorrelationWorker } from './incident-correlation.worker';
import { WorkerConfig } from '../config';

describe('IncidentCorrelationWorker', () => {
  let mockPrisma: any;
  let config: WorkerConfig;
  let worker: IncidentCorrelationWorker;

  beforeEach(() => {
    config = {
      redisHost: 'localhost',
      redisPort: 6379,
      concurrency: 1,
      environment: 'test',
    };

    mockPrisma = {
      alertEvent: {
        findUnique: jest.fn(),
      },
      incidentAlert: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      incident: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      serviceDependency: {
        findMany: jest.fn(),
      },
      incidentTimelineEvent: {
        create: jest.fn(),
      },
      incidentCorrelationTrigger: {
        update: jest.fn(),
      },
      $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) => cb(mockPrisma)),
    };

    worker = new IncidentCorrelationWorker(mockPrisma, config);
    // Mock acquireLock and releaseLock to bypass actual Redis for pure business logic unit testing
    (worker as any).acquireLock = jest.fn().mockResolvedValue(true);
    (worker as any).releaseLock = jest.fn().mockResolvedValue(undefined);
  });

  it('skips processing if triggerAlertEventId is already linked (deduplication)', async () => {
    mockPrisma.alertEvent.findUnique.mockResolvedValue({
      id: 'event-1',
      organizationId: 'org-1',
      alertInstanceId: 'inst-1',
      alertInstance: {
        serviceId: 'service-1',
        environmentId: 'env-1',
        service: { ownerTeamId: 'team-1', name: 'Order Service' },
      },
      rule: { id: 'rule-1', name: 'High Latency', severity: 'SEV_2' },
      occurredAt: new Date(),
    });

    mockPrisma.incidentAlert.findUnique.mockResolvedValue({ id: 'inc-alert-existing' });

    await worker.processJob({
      triggerId: 'trigger-1',
      organizationId: 'org-1',
      alertEventId: 'event-1',
      eventType: 'FIRING_STARTED',
    });

    expect(mockPrisma.incident.create).not.toHaveBeenCalled();
    expect(mockPrisma.incidentAlert.create).not.toHaveBeenCalled();
    expect(mockPrisma.incidentCorrelationTrigger.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'trigger-1' },
        data: expect.objectContaining({ status: 'PROCESSED' }),
      }),
    );
  });

  it('creates new AUTOMATED incident when no candidate exists', async () => {
    const alertTime = new Date('2026-09-08T12:00:00Z');
    mockPrisma.alertEvent.findUnique.mockResolvedValue({
      id: 'event-2',
      organizationId: 'org-1',
      alertInstanceId: 'inst-2',
      alertInstance: {
        serviceId: 'service-1',
        environmentId: 'env-1',
        service: { ownerTeamId: 'team-1', name: 'Order Service' },
      },
      rule: { id: 'rule-1', name: 'High Latency', severity: 'SEV_3' }, // WARNING
      occurredAt: alertTime,
    });

    mockPrisma.incidentAlert.findUnique.mockResolvedValue(null);
    mockPrisma.serviceDependency.findMany.mockResolvedValue([]);
    mockPrisma.incident.findMany.mockResolvedValue([]);

    mockPrisma.incident.create.mockResolvedValue({
      id: 'inc-new-1',
      incidentKey: 'INC-TEST',
      severity: 'WARNING',
    });

    await worker.processJob({
      triggerId: 'trigger-2',
      organizationId: 'org-1',
      alertEventId: 'event-2',
      eventType: 'FIRING_STARTED',
    });

    expect(mockPrisma.incident.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          source: 'AUTOMATED',
          status: 'OPEN',
          severity: 'WARNING',
          primaryServiceId: 'service-1',
        }),
      }),
    );
    expect(mockPrisma.incidentAlert.create).toHaveBeenCalled();
  });

  it('correlates and escalates severity when candidate incident matches and alert is more severe', async () => {
    const alertTime = new Date('2026-09-08T12:02:00Z');
    mockPrisma.alertEvent.findUnique.mockResolvedValue({
      id: 'event-3',
      organizationId: 'org-1',
      alertInstanceId: 'inst-3',
      alertInstance: {
        serviceId: 'service-1',
        environmentId: 'env-1',
        service: { ownerTeamId: 'team-1', name: 'Order Service' },
      },
      rule: { id: 'rule-critical', name: 'Error Rate Spike', severity: 'SEV_1' }, // CRITICAL
      occurredAt: alertTime,
    });

    mockPrisma.incidentAlert.findUnique.mockResolvedValue(null);
    mockPrisma.serviceDependency.findMany.mockResolvedValue([]);

    // Existing active incident in same service
    mockPrisma.incident.findMany.mockResolvedValue([
      {
        id: 'inc-active-1',
        incidentKey: 'INC-ACTIVE',
        organizationId: 'org-1',
        environmentId: 'env-1',
        primaryServiceId: 'service-1',
        status: 'INVESTIGATING',
        severity: 'WARNING',
        assignedTeamId: 'team-1',
        lastSignalAt: new Date('2026-09-08T12:01:00Z'), // 60s ago
        alerts: [{ serviceId: 'service-1' }],
        primaryService: { id: 'service-1', ownerTeamId: 'team-1' },
      },
    ]);

    await worker.processJob({
      triggerId: 'trigger-3',
      organizationId: 'org-1',
      alertEventId: 'event-3',
      eventType: 'FIRING_STARTED',
    });

    expect(mockPrisma.incident.create).not.toHaveBeenCalled();
    expect(mockPrisma.incidentAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          incidentId: 'inc-active-1',
          alertSeverity: 'SEV_1',
        }),
      }),
    );
    // Escalates severity to CRITICAL
    expect(mockPrisma.incident.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inc-active-1' },
        data: expect.objectContaining({
          severity: 'CRITICAL',
        }),
      }),
    );
  });

  it('marks allSignalsClearedAt when last alert episode resolves, without auto-resolving incident', async () => {
    const resolveTime = new Date('2026-09-08T12:10:00Z');
    mockPrisma.alertEvent.findUnique.mockResolvedValue({
      id: 'event-resolve',
      organizationId: 'org-1',
      alertInstanceId: 'inst-3',
      alertInstance: { environmentId: 'env-1' },
      occurredAt: resolveTime,
    });

    mockPrisma.incidentAlert.findMany.mockResolvedValue([
      {
        id: 'alert-link-1',
        incidentId: 'inc-active-1',
        organizationId: 'org-1',
        alertRule: { name: 'Error Rate Spike' },
      },
    ]);

    // Zero active unresolved alerts remaining
    mockPrisma.incidentAlert.count.mockResolvedValue(0);

    await worker.processJob({
      triggerId: 'trigger-resolve',
      organizationId: 'org-1',
      alertEventId: 'event-resolve',
      eventType: 'RESOLVED',
    });

    expect(mockPrisma.incidentAlert.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'alert-link-1' },
        data: { resolvedAt: resolveTime },
      }),
    );

    // Incident allSignalsClearedAt is updated
    expect(mockPrisma.incident.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inc-active-1' },
        data: { allSignalsClearedAt: resolveTime },
      }),
    );

    // Verify status was NOT modified to RESOLVED!
    expect(mockPrisma.incident.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'RESOLVED' }),
      }),
    );
  });
});

