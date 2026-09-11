import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import { MembershipsService } from '../memberships/memberships.service';
import { InvitationsService } from '../invitations/invitations.service';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityLoggerService } from './security-logger.service';

describe('Tenant Isolation Mandatory Security Tests (Step 33)', () => {
  let memberGuard: OrganizationMemberGuard;
  let memService: MembershipsService;
  let invService: InvitationsService;

  // Multi-tenant actors as required: User A / Org A vs User B / Org B
  const UserA = { id: 'user-a-id', email: 'userA@tenantA.io', displayName: 'Tenant A Admin' };
  const OrgA = { id: 'org-a-id', name: 'Acme Operations A', slug: 'acme-ops-a' };
  const MembershipA = { id: 'mem-a-id', userId: UserA.id, organizationId: OrgA.id, role: 'OWNER' };

  const UserB = { id: 'user-b-id', email: 'userB@tenantB.io', displayName: 'Tenant B Admin' };
  const OrgB = { id: 'org-b-id', name: 'Beta Systems B', slug: 'beta-systems-b' };
  const MembershipB = { id: 'mem-b-id', userId: UserB.id, organizationId: OrgB.id, role: 'OWNER' };

  const mockPrisma: any = {
    membership: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    organizationInvitation: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn((callback: (tx: any) => Promise<any>) =>
      callback(mockPrisma),
    ),
  };

  const mockSecurityLogger = {
    logEvent: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationMemberGuard,
        MembershipsService,
        InvitationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SecurityLoggerService, useValue: mockSecurityLogger },
      ],
    }).compile();

    memberGuard = module.get<OrganizationMemberGuard>(OrganizationMemberGuard);
    memService = module.get<MembershipsService>(MembershipsService);
    invService = module.get<InvitationsService>(InvitationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function createMockExecutionContext(user: any, params: Record<string, string>, body: any = {}): ExecutionContext {
    const request = {
      user,
      params,
      body,
      headers: {},
      membership: null as any,
      organization: null as any,
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as any;
  }

  describe('Guard Level: Parameter Substitution Attack Prevention', () => {
    it('MUST block User A when substituting Org B ID in route params', async () => {
      // Membership lookup for (User A, Org B) returns null
      mockPrisma.membership.findUnique.mockResolvedValueOnce(null);

      const context = createMockExecutionContext(UserA, { organizationId: OrgB.id });

      await expect(memberGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.membership.findUnique).toHaveBeenCalledWith({
        where: {
          userId_organizationId: {
            userId: UserA.id,
            organizationId: OrgB.id,
          },
        },
        include: { organization: true },
      });
    });

    it('MUST permit User A when accessing Org A where membership exists', async () => {
      mockPrisma.membership.findUnique.mockResolvedValueOnce(MembershipA);

      const context = createMockExecutionContext(UserA, { organizationId: OrgA.id });
      const allowed = await memberGuard.canActivate(context);

      expect(allowed).toBe(true);
      const req = context.switchToHttp().getRequest();
      expect(req.membership).toBe(MembershipA);
    });
  });

  describe('Service Level Cross-Tenant Read Isolation', () => {
    it('MUST prevent User A from listing members of Org B', async () => {
      // Guard blocks before service, but if service is called, membership lookup within Org B returns only Org B records
      mockPrisma.membership.findMany.mockResolvedValueOnce([]);

      const result = await memService.listMembers(OrgB.id);
      expect(result).toHaveLength(0);
      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: OrgB.id },
        }),
      );
    });

    it('MUST prevent User A from listing invitations of Org B', async () => {
      mockPrisma.organizationInvitation.findMany.mockResolvedValueOnce([]);

      const result = await invService.listInvitations(OrgB.id);
      expect(result).toHaveLength(0);
      expect(mockPrisma.organizationInvitation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: OrgB.id }),
        }),
      );
    });
  });

  describe('Service Level Cross-Tenant Write Isolation (ID Tampering)', () => {
    it('MUST prevent User A from updating role of a member in Org B by ID substitution', async () => {
      // User A tries to modify MembershipB (which belongs to Org B) while claiming to be in Org A
      mockPrisma.membership.findUnique.mockResolvedValueOnce(MembershipB); // target org is Org B

      await expect(
        memService.updateMemberRole(
          UserA.id,
          'OWNER',
          OrgA.id, // claiming context of Org A
          MembershipB.id,
          { role: 'ENGINEER' },
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('MUST prevent User A from removing a member in Org B by ID substitution', async () => {
      mockPrisma.membership.findUnique.mockResolvedValueOnce(MembershipB); // belongs to Org B

      await expect(
        memService.removeMember(
          UserA.id,
          'OWNER',
          OrgA.id, // claiming context of Org A
          MembershipB.id,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('MUST prevent User A from revoking an invitation belonging to Org B', async () => {
      const InviteB = {
        id: 'inv-b-id',
        organizationId: OrgB.id,
        email: 'dev@tenantb.io',
        revokedAt: null,
        acceptedAt: null,
      };
      mockPrisma.organizationInvitation.findUnique.mockResolvedValueOnce(InviteB);

      await expect(
        invService.revokeInvitation(UserA.id, OrgA.id, InviteB.id),
      ).rejects.toThrow(NotFoundException);
    });
  });
});