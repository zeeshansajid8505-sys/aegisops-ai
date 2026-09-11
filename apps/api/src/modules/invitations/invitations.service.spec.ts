import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityLoggerService } from '../security/security-logger.service';

describe('InvitationsService & Security Controls', () => {
  let service: InvitationsService;

  const mockPrisma: any = {
    membership: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    organizationInvitation: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
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
        InvitationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SecurityLoggerService, useValue: mockSecurityLogger },
      ],
    }).compile();

    service = module.get<InvitationsService>(InvitationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should prevent an ADMIN from inviting another member as OWNER', async () => {
    await expect(
      service.createInvitation(
        'user-admin',
        'ADMIN', // caller role is ADMIN
        'org-1',
        { email: 'new@aegisops.io', role: 'OWNER' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should reject invitation if user is already an active member', async () => {
    mockPrisma.membership.findFirst.mockResolvedValueOnce({ id: 'existing-mem' });

    await expect(
      service.createInvitation(
        'user-owner',
        'OWNER',
        'org-1',
        { email: 'alice@aegisops.io', role: 'ENGINEER' },
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('should create invitation and store only hashed token', async () => {
    mockPrisma.membership.findFirst.mockResolvedValueOnce(null);
    mockPrisma.organizationInvitation.updateMany.mockResolvedValueOnce({ count: 0 });
    mockPrisma.organizationInvitation.create.mockResolvedValueOnce({
      id: 'inv-1',
      organizationId: 'org-1',
      email: 'newuser@aegisops.io',
      role: 'ENGINEER',
      invitedByUserId: 'user-owner',
      expiresAt: new Date(Date.now() + 100000),
      createdAt: new Date(),
    });

    const result = await service.createInvitation(
      'user-owner',
      'OWNER',
      'org-1',
      { email: 'newuser@aegisops.io', role: 'ENGINEER' },
    );

    expect(result.id).toBe('inv-1');
    expect(mockPrisma.organizationInvitation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tokenHash: expect.any(String),
          normalizedEmail: 'newuser@aegisops.io',
        }),
      }),
    );
  });

  it('should reject accepting an expired invitation', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValueOnce({
      id: 'inv-expired',
      organizationId: 'org-1',
      normalizedEmail: 'bob@test.com',
      expiresAt: new Date(Date.now() - 10000), // expired
      revokedAt: null,
      acceptedAt: null,
    });

    await expect(
      service.acceptInvitation('user-bob', 'bob@test.com', 'raw-token'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject accepting a revoked invitation', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValueOnce({
      id: 'inv-revoked',
      organizationId: 'org-1',
      normalizedEmail: 'bob@test.com',
      expiresAt: new Date(Date.now() + 10000),
      revokedAt: new Date(), // revoked
      acceptedAt: null,
    });

    await expect(
      service.acceptInvitation('user-bob', 'bob@test.com', 'raw-token'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject reusing an already accepted invitation', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValueOnce({
      id: 'inv-accepted',
      organizationId: 'org-1',
      normalizedEmail: 'bob@test.com',
      expiresAt: new Date(Date.now() + 10000),
      revokedAt: null,
      acceptedAt: new Date(), // already accepted
    });

    await expect(
      service.acceptInvitation('user-bob', 'bob@test.com', 'raw-token'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject acceptance if current user email does not match invitation recipient', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValueOnce({
      id: 'inv-1',
      organizationId: 'org-1',
      email: 'intended@test.com',
      normalizedEmail: 'intended@test.com',
      expiresAt: new Date(Date.now() + 10000),
      revokedAt: null,
      acceptedAt: null,
    });

    await expect(
      service.acceptInvitation('user-attacker', 'attacker@test.com', 'raw-token'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should successfully accept valid invitation and create membership', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValueOnce({
      id: 'inv-valid',
      organizationId: 'org-1',
      email: 'bob@test.com',
      normalizedEmail: 'bob@test.com',
      role: 'SRE',
      expiresAt: new Date(Date.now() + 10000),
      revokedAt: null,
      acceptedAt: null,
    });
    mockPrisma.membership.findUnique.mockResolvedValueOnce(null);
    mockPrisma.membership.create.mockResolvedValueOnce({ id: 'mem-new' });
    mockPrisma.organizationInvitation.update.mockResolvedValueOnce({});

    const result = await service.acceptInvitation('user-bob', 'bob@test.com', 'raw-token');
    expect(result.organizationId).toBe('org-1');
    expect(mockPrisma.membership.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-bob',
          organizationId: 'org-1',
          role: 'SRE',
        }),
      }),
    );
  });
});