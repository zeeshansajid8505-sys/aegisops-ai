import { OperationsService } from './operations.service';
import { IncidentStatus, IncidentSeverity, AlertSeverity } from '@aegisops/types';

describe('Operations Subsystem: OperationsService Unit Tests', () => {
  let operationsService: OperationsService;

  const mockPrisma: any = {
    service: {
      findMany: jest.fn(),
    },
    alertInstance: {
      findMany: jest.fn(),
      groupBy: jest.fn(),
    },
    incident: {
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    incidentTimelineEvent: {
      findMany: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    operationsService = new OperationsService(mockPrisma);
  });

  it('synthesizes empty metrics when organization has no resources', async () => {
    mockPrisma.service.findMany.mockResolvedValue([]);
    mockPrisma.alertInstance.findMany.mockResolvedValue([]);
    mockPrisma.incident.findMany.mockResolvedValue([]);
    mockPrisma.incident.count.mockResolvedValue(0);
    mockPrisma.alertInstance.groupBy.mockResolvedValue([]);
    mockPrisma.incident.groupBy.mockResolvedValue([]);
    mockPrisma.incidentTimelineEvent.findMany.mockResolvedValue([]);

    const result = await operationsService.getOverview('org-empty');

    expect(result.summary.servicesCount).toBe(0);
    expect(result.summary.healthyServicesCount).toBe(0);
    expect(result.summary.degradedServicesCount).toBe(0);
    expect(result.summary.downServicesCount).toBe(0);
    expect(result.summary.activeAlertsCount).toBe(0);
    expect(result.summary.activeIncidentsCount).toBe(0);
    expect(result.summary.criticalIncidentsCount).toBe(0);
    expect(result.needsAttention).toEqual([]);
    expect(result.servicesHealthSummary).toEqual([]);
    expect(result.activeAlertsPreview).toEqual([]);
    expect(result.activeIncidentsPreview).toEqual([]);
    expect(result.recentActivity).toEqual([]);
  });

  it('aggregates operational health, counts, and prioritizes attention items correctly', async () => {
    const mockServices = [
      {
        id: 'svc-1',
        name: 'Auth Service',
        slug: 'auth-service',
        tier: 'CRITICAL',
        updatedAt: new Date('2026-09-08T10:00:00Z'),
        environments: [
          {
            id: 'env-1',
            isProduction: true,
            isActive: true,
            healthProbes: [
              {
                enabled: true,
                isCritical: true,
                state: { status: 'HEALTHY' },
              },
            ],
          },
        ],
      },
      {
        id: 'svc-2',
        name: 'Payment Service',
        slug: 'payment-service',
        tier: 'CRITICAL',
        updatedAt: new Date('2026-09-08T11:00:00Z'),
        environments: [
          {
            id: 'env-2',
            isProduction: true,
            isActive: true,
            healthProbes: [
              {
                enabled: true,
                isCritical: true,
                state: { status: 'UNHEALTHY' },
              },
            ],
          },
        ],
      },
    ];

    const mockAlerts = [
      {
        id: 'alert-1',
        fingerprint: 'fp-1',
        state: 'FIRING',
        serviceId: 'svc-2',
        environmentId: 'env-2',
        lastStateChangeAt: new Date('2026-09-08T11:35:00Z'),
        firingStartedAt: new Date('2026-09-08T11:30:00Z'),
        currentValue: 5.2,
        rule: { name: 'High HTTP Error Rate', severity: 'SEV_1' as AlertSeverity, thresholdValue: 5 },
        service: { name: 'Payment Service' },
        environment: { name: 'Production' },
      },
    ];

    const mockIncidents = [
      {
        id: 'inc-1',
        incidentKey: 'INC-1001',
        title: 'Payment Gateway Degradation',
        severity: 'CRITICAL' as IncidentSeverity,
        status: 'OPEN' as IncidentStatus,
        detectedAt: new Date('2026-09-08T11:32:00Z'),
        createdAt: new Date('2026-09-08T11:32:00Z'),
        primaryServiceId: 'svc-2',
        primaryService: { name: 'Payment Service' },
        commander: {
          user: { displayName: 'Lead SRE' },
        },
        alerts: [{ id: 'alert-1' }],
      },
    ];

    mockPrisma.service.findMany.mockResolvedValue(mockServices);
    mockPrisma.alertInstance.findMany.mockResolvedValue(mockAlerts);
    mockPrisma.incident.findMany.mockResolvedValue(mockIncidents);
    mockPrisma.incident.count.mockResolvedValue(1);
    mockPrisma.alertInstance.groupBy.mockResolvedValue([
      { serviceId: 'svc-2', _count: 1 },
    ]);
    mockPrisma.incident.groupBy.mockResolvedValue([
      { primaryServiceId: 'svc-2', _count: 1 },
    ]);
    mockPrisma.incidentTimelineEvent.findMany.mockResolvedValue([
      {
        id: 'tl-1',
        incidentId: 'inc-1',
        eventType: 'SEVERITY_CHANGED',
        message: 'Escalated to CRITICAL due to checkout errors',
        occurredAt: new Date('2026-09-08T11:33:00Z'),
        incident: {
          id: 'inc-1',
          incidentKey: 'INC-1001',
          title: 'Payment Gateway Degradation',
        },
        actor: {
          user: { displayName: 'Lead SRE' },
        },
      },
    ]);

    const result = await operationsService.getOverview('org-production');

    // Verify summary counts
    expect(result.summary.servicesCount).toBe(2);
    expect(result.summary.healthyServicesCount).toBe(1);
    expect(result.summary.downServicesCount).toBe(1);
    expect(result.summary.activeAlertsCount).toBe(1);
    expect(result.summary.activeIncidentsCount).toBe(1);
    expect(result.summary.criticalIncidentsCount).toBe(1);

    // Verify Needs Attention priorities: Critical incident should be top priority
    expect(result.needsAttention.length).toBeGreaterThanOrEqual(1);
    expect(result.needsAttention[0]!.type).toBe('incident');
    expect(result.needsAttention[0]!.priority).toBe('CRITICAL');
    expect(result.needsAttention[0]!.targetUrl).toBe('/incidents/inc-1');

    // Verify services operational summary mapping
    const paymentService = result.servicesHealthSummary.find((s) => s.id === 'svc-2');
    expect(paymentService).toBeDefined();
    expect(paymentService?.healthStatus).toBe('UNHEALTHY');
    expect(paymentService?.activeAlertsCount).toBe(1);
    expect(paymentService?.activeIncidentsCount).toBe(1);

    // Verify active alerts and incidents lists
    expect(result.activeAlertsPreview[0]!.id).toBe('alert-1');
    expect(result.activeIncidentsPreview[0]!.id).toBe('inc-1');
    expect(result.recentActivity[0]!.id).toBe('tl-1');
  });
});
