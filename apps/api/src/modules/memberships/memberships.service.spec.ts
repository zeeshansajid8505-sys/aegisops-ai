import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MembershipsService } from './memberships.service';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityLoggerService } from '../security/security-logger.service';

describe('MembershipsService & RBAC Ownership Safety', () => {
  let service: MembershipsService;

  const mockPrisma = {
    membership: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockSecurityLogger = {
    logEvent: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembershipsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SecurityLoggerService, useValue: mockSecurityLogger },
      ],
    }).compile();

    service = module.get<MembershipsService>(MembershipsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should prevent an ADMIN from promoting themselves or anyone else to OWNER', async () => {
    mockPrisma.membership.findUnique.mockResolvedValueOnce({
      id: 'mem-2',
      userId: 'user-admin',
      organizationId: 'org-1',
      role: 'ADMIN',
      createdAt: new Date(),
    });

    await expect(
      service.updateMemberRole(
        'user-admin',
        'ADMIN', // caller role is ADMIN
        'org-1',
        'mem-2',
        { role: 'OWNER' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should prevent an ADMIN from demoting or modifying an OWNER', async () => {
    mockPrisma.membership.findUnique.mockResolvedValueOnce({
      id: 'mem-1',
      userId: 'user-owner',
      organizationId: 'org-1',
      role: 'OWNER',
      createdAt: new Date(),
    });

    await expect(
      service.updateMemberRole(
        'user-admin',
        'ADMIN', // caller role is ADMIN
        'org-1',
        'mem-1',
        { role: 'ENGINEER' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should prevent demoting the last remaining OWNER of an organization', async () => {
    mockPrisma.membership.findUnique.mockResolvedValueOnce({
      id: 'mem-1',
      userId: 'user-owner',
      organizationId: 'org-1',
      role: 'OWNER',
      createdAt: new Date(),
    });
    // Only 1 owner exists in org-1
    mockPrisma.membership.count.mockResolvedValueOnce(1);

    await expect(
      service.updateMemberRole(
        'user-owner',
        'OWNER', // caller is OWNER
        'org-1',
        'mem-1',
        { role: 'ENGINEER' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should allow demoting an OWNER if multiple owners exist', async () => {
    mockPrisma.membership.findUnique.mockResolvedValueOnce({
      id: 'mem-1',
      userId: 'user-owner-1',
      organizationId: 'org-1',
      role: 'OWNER',
      createdAt: new Date(),
    });
    // 2 owners exist
    mockPrisma.membership.count.mockResolvedValueOnce(2);
    mockPrisma.membership.update.mockResolvedValueOnce({
      id: 'mem-1',
      userId: 'user-owner-1',
      organizationId: 'org-1',
      role: 'ENGINEER',
      createdAt: new Date(),
      user: { id: 'u1', email: 'o1@test.com', displayName: 'Owner 1' },
    });

    const result = await service.updateMemberRole(
      'user-owner-2',
      'OWNER',
      'org-1',
      'mem-1',
      { role: 'ENGINEER' },
    );

    expect(result.role).toBe('ENGINEER');
  });

  it('should prevent removing the last remaining OWNER of an organization', async () => {
    mockPrisma.membership.findUnique.mockResolvedValueOnce({
      id: 'mem-1',
      userId: 'user-owner',
      organizationId: 'org-1',
      role: 'OWNER',
      createdAt: new Date(),
    });
    mockPrisma.membership.count.mockResolvedValueOnce(1);

    await expect(
      service.removeMember('user-owner', 'OWNER', 'org-1', 'mem-1'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should allow an OWNER to remove an ENGINEER', async () => {
    mockPrisma.membership.findUnique.mockResolvedValueOnce({
      id: 'mem-3',
      userId: 'user-engineer',
      organizationId: 'org-1',
      role: 'ENGINEER',
      createdAt: new Date(),
    });
    mockPrisma.membership.delete.mockResolvedValueOnce({});

    const result = await service.removeMember('user-owner', 'OWNER', 'org-1', 'mem-3');
    expect(result.message).toContain('successfully removed');
    expect(mockPrisma.membership.delete).toHaveBeenCalledWith({ where: { id: 'mem-3' } });
  });

  it('should block cross-tenant membership lookup when membership belongs to another org', async () => {
    mockPrisma.membership.findUnique.mockResolvedValueOnce({
      id: 'mem-other',
      userId: 'user-other',
      organizationId: 'org-DIFFERENT',
      role: 'VIEWER',
      createdAt: new Date(),
    });

    await expect(
      service.removeMember('user-owner', 'OWNER', 'org-1', 'mem-other'),
    ).rejects.toThrow(NotFoundException);
  });
});