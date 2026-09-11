import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TeamsService } from '../teams/teams.service';
import { ServicesService } from './services.service';
import { DependenciesService } from '../dependencies/dependencies.service';
import { SSRFValidatorService } from '../security/ssrf-validator.service';

describe('Phase 2: Multi-Tenant Isolation & Security Guards', () => {
  let teamsService: TeamsService;
  let servicesService: ServicesService;
  let dependenciesService: DependenciesService;
  let ssrfValidator: SSRFValidatorService;

  const mockPrisma: any = {
    team: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    teamMember: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    service: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    membership: {
      findFirst: jest.fn(),
    },
    serviceDependency: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn((callback) => {
      if (typeof callback === 'function') {
        return callback(mockPrisma);
      }
      return Promise.all(callback);
    }),
  };

  const mockSecurityLogger: any = {
    logEvent: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env['PROBE_ALLOW_PRIVATE_TARGETS'];
    delete process.env['WEBHOOK_ALLOW_PRIVATE_TARGETS'];
    ssrfValidator = new SSRFValidatorService();
    teamsService = new TeamsService(mockPrisma, mockSecurityLogger);
    servicesService = new ServicesService(mockPrisma, mockSecurityLogger);
    dependenciesService = new DependenciesService(mockPrisma, mockSecurityLogger);
  });

  describe('Tenant Boundary: Services', () => {
    it('rejects access to a service belonging to another organization', async () => {
      // Org A tries to get service from Org B
      mockPrisma.service.findFirst.mockResolvedValue(null);

      await expect(
        servicesService.getService('org-A', 'svc-belonging-to-org-B'),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.service.findFirst).toHaveBeenCalledWith({
        where: { id: 'svc-belonging-to-org-B', organizationId: 'org-A' },
        include: expect.any(Object),
      });
    });

    it('rejects assigning an owner team from a different organization', async () => {
      // When looking for owner team in Org A, team belongs to Org B (returns null)
      mockPrisma.team.findFirst.mockResolvedValue(null);

      await expect(
        servicesService.createService('org-A', 'user-1', {
          name: 'Payment Gateway',
          serviceType: 'API',
          tier: 'TIER_1',
          ownerTeamId: 'team-belonging-to-org-B',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Tenant Boundary: Teams', () => {
    it('rejects adding a team member whose membership is not in the organization', async () => {
      mockPrisma.team.findFirst.mockResolvedValue({
        id: 'team-A',
        organizationId: 'org-A',
        name: 'Platform Core',
      });
      // Membership lookup with organizationId: org-A returns null
      mockPrisma.membership.findFirst.mockResolvedValue(null);

      await expect(
        teamsService.addTeamMember('org-A', 'team-A', {
          membershipId: 'membership-from-org-B',
          role: 'MEMBER',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('prevents deleting a team that still owns active services', async () => {
      mockPrisma.team.findFirst.mockResolvedValue({
        id: 'team-A',
        organizationId: 'org-A',
        name: 'Platform Core',
        _count: { ownedServices: 3 },
      });

      await expect(teamsService.deleteTeam('org-A', 'team-A')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('Tenant Boundary & Safety: Dependencies (DAG)', () => {
    it('strictly prohibits cross-tenant service dependencies', async () => {
      // Source service in Org A exists
      mockPrisma.service.findFirst
        .mockResolvedValueOnce({
          id: 'svc-A',
          organizationId: 'org-A',
          name: 'Service A',
        })
        // Target service lookup in Org A returns null (target is in Org B)
        .mockResolvedValueOnce(null);

      await expect(
        dependenciesService.createDependency('org-A', {
          sourceServiceId: 'svc-A',
          targetServiceId: 'svc-B-in-org-B',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects self-dependencies (A -> A)', async () => {
      await expect(
        dependenciesService.createDependency('org-A', {
          sourceServiceId: 'svc-A',
          targetServiceId: 'svc-A',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('detects and blocks circular dependencies (A -> B -> C -> A)', async () => {
      // Source and Target both exist in Org A
      mockPrisma.service.findFirst
        .mockResolvedValueOnce({ id: 'svc-C', organizationId: 'org-A', name: 'Service C' })
        .mockResolvedValueOnce({ id: 'svc-A', organizationId: 'org-A', name: 'Service A' });

      mockPrisma.serviceDependency.findUnique.mockResolvedValue(null);

      // Existing edges: A -> B, B -> C
      mockPrisma.serviceDependency.findMany.mockResolvedValue([
        { sourceServiceId: 'svc-A', targetServiceId: 'svc-B' },
        { sourceServiceId: 'svc-B', targetServiceId: 'svc-C' },
      ]);

      // Attempting to add edge C -> A should be rejected with cycle detection
      await expect(
        dependenciesService.createDependency('org-A', {
          sourceServiceId: 'svc-C',
          targetServiceId: 'svc-A',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('SSRF Protection Boundary', () => {
    it('always blocks cloud metadata IP 169.254.169.254', async () => {
      const result = await ssrfValidator.validateTargetUrl(
        'http://169.254.169.254/latest/meta-data',
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cloud metadata');
    });

    it('blocks internal RFC1918 addresses in production mode', async () => {
      const result10 = await ssrfValidator.validateTargetUrl('http://10.0.0.1/health');
      expect(result10.valid).toBe(false);

      const result192 = await ssrfValidator.validateTargetUrl('http://192.168.1.1/health');
      expect(result192.valid).toBe(false);
    });
  });
});

