import { NotFoundException, BadRequestException } from '@nestjs/common';
import { IncidentsService } from './incidents.service';

describe('Incidents Subsystem: Multi-Tenant Isolation & Access Boundaries', () => {
  let incidentsService: IncidentsService;

  const mockPrisma: any = {
    incident: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    incidentAlert: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    incidentTimelineEvent: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    incidentResponder: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    service: {
      findFirst: jest.fn(),
    },
    serviceEnvironment: {
      findFirst: jest.fn(),
    },
    membership: {
      findFirst: jest.fn(),
    },
    alertEvent: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn((callback) => {
      if (typeof callback === 'function') {
        return callback(mockPrisma);
      }
      return Promise.all(callback);
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    incidentsService = new IncidentsService(mockPrisma);
  });

  describe('Tenant Boundary Enforcement on Read & Detail', () => {
    it('blocks reading an incident belonging to another organization', async () => {
      mockPrisma.incident.findFirst.mockResolvedValue(null);

      await expect(
        incidentsService.getIncident('org-A', 'incident-belonging-to-org-B'),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.incident.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'incident-belonging-to-org-B',
            organizationId: 'org-A',
          }),
        }),
      );
    });

    it('scopes listIncidents query strictly to the calling organization', async () => {
      mockPrisma.incident.count.mockResolvedValue(1);
      mockPrisma.incident.findMany.mockResolvedValue([
        {
          id: 'inc-1',
          organizationId: 'org-A',
          incidentKey: 'INC-1',
          title: 'Latency Spike',
          summary: null,
          source: 'AUTOMATED',
          status: 'OPEN',
          severity: 'WARNING',
          detectedAt: new Date(),
          lastSignalAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          alerts: [],
        },
      ]);

      const result = await incidentsService.listIncidents('org-A', { limit: 10, offset: 0 });
      expect(result.total).toBe(1);
      expect(mockPrisma.incident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-A',
          }),
        }),
      );
    });
  });

  describe('Tenant Boundary Enforcement on Operations', () => {
    it('blocks acknowledging an incident of another organization', async () => {
      mockPrisma.incident.findFirst.mockResolvedValue(null);

      await expect(
        incidentsService.acknowledgeIncident('org-A', 'inc-org-B', 'member-1', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('blocks status transition for an incident of another organization', async () => {
      mockPrisma.incident.findFirst.mockResolvedValue(null);

      await expect(
        incidentsService.transitionStatus('org-A', 'inc-org-B', 'member-1', {
          status: 'INVESTIGATING',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('blocks assigning a commander from another organization', async () => {
      // Commander membership not found in org-A
      mockPrisma.membership.findFirst.mockResolvedValue(null);

      await expect(
        incidentsService.assignCommander('org-A', 'inc-1', 'member-1', {
          commanderMembershipId: 'member-of-org-B',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('blocks adding a responder from another organization', async () => {
      mockPrisma.membership.findFirst.mockResolvedValue(null);

      await expect(
        incidentsService.addResponder('org-A', 'inc-1', 'member-1', {
          membershipId: 'member-of-org-B',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('blocks attaching an alert event belonging to another organization', async () => {
      mockPrisma.incident.findFirst.mockResolvedValue({
        id: 'inc-1',
        organizationId: 'org-A',
        severity: 'WARNING',
      });
      // Alert event from another org
      mockPrisma.alertEvent.findFirst.mockResolvedValue(null);

      await expect(
        incidentsService.attachAlert('org-A', 'inc-1', 'member-1', {
          alertEventId: 'event-org-B',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('blocks unlinking an alert belonging to another organization', async () => {
      mockPrisma.incidentAlert.findFirst.mockResolvedValue(null);

      await expect(
        incidentsService.unlinkAlert('org-A', 'inc-1', 'alert-link-B', 'member-1', {
          reason: 'Irrelevant',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects direct transition to RESOLVED via transitionStatus endpoint', async () => {
      await expect(
        incidentsService.transitionStatus('org-A', 'inc-1', 'member-1', {
          status: 'RESOLVED',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

