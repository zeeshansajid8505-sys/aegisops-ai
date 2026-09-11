import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityLoggerService } from '../security/security-logger.service';

describe('AuthService & Session Security', () => {
  jest.setTimeout(20000);
  let authService: AuthService;
  let passwordService: PasswordService;
  let sessionService: SessionService;

  const mockPrisma: any = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    organization: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    membership: {
      create: jest.fn(),
    },
    session: {
      create: jest.fn(),
      findUnique: jest.fn(),
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
        AuthService,
        PasswordService,
        SessionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SecurityLoggerService, useValue: mockSecurityLogger },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    passwordService = module.get<PasswordService>(PasswordService);
    sessionService = module.get<SessionService>(SessionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should hash password with Argon2id and create user + organization + OWNER membership on registration', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    mockPrisma.user.create.mockResolvedValueOnce({
      id: 'user-1',
      displayName: 'Alice SRE',
      email: 'alice@aegisops.io',
      normalizedEmail: 'alice@aegisops.io',
      passwordHash: 'hashed_password',
      isActive: true,
      createdAt: new Date(),
      lastLoginAt: null,
    });
    mockPrisma.organization.create.mockResolvedValueOnce({
      id: 'org-1',
      name: 'Primary SRE Org',
      slug: 'primary-sre-org-123456',
      createdByUserId: 'user-1',
      createdAt: new Date(),
    });
    mockPrisma.membership.create.mockResolvedValueOnce({
      id: 'mem-1',
      userId: 'user-1',
      organizationId: 'org-1',
      role: 'OWNER',
    });
    mockPrisma.session.create.mockResolvedValueOnce({
      id: 'sess-1',
      tokenHash: 'hashed_token',
    });

    const result = await authService.register({
      displayName: 'Alice SRE',
      email: 'ALICE@AEGISOPS.IO',
      password: 'SecurePassword123!',
      organizationName: 'Primary SRE Org',
    });

    expect(result.user.email).toBe('alice@aegisops.io');
    expect(result.rawToken).toBeDefined();
    expect(result.initialOrganizationId).toBe('org-1');
    expect(mockPrisma.membership.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: 'OWNER' }),
      }),
    );
  });

  it('should reject registration if normalized email already exists', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'existing-user' });

    await expect(
      authService.register({
        displayName: 'Bob',
        email: 'alice@aegisops.io',
        password: 'Password123!',
        organizationName: 'Org Two',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should authenticate user and set session on valid login credentials', async () => {
    const plainPassword = 'CorrectPassword123!';
    const passwordHash = await passwordService.hash(plainPassword);

    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      email: 'alice@aegisops.io',
      normalizedEmail: 'alice@aegisops.io',
      displayName: 'Alice SRE',
      passwordHash,
      isActive: true,
      createdAt: new Date(),
    });
    mockPrisma.session.create.mockResolvedValueOnce({
      id: 'sess-1',
      tokenHash: 'hash',
    });
    mockPrisma.user.update.mockResolvedValueOnce({});

    const result = await authService.login({
      email: 'alice@aegisops.io',
      password: plainPassword,
    });

    expect(result.user.id).toBe('user-1');
    expect(result.rawToken).toBeDefined();
  });

  it('should reject login on invalid password with safe error', async () => {
    const passwordHash = await passwordService.hash('CorrectPassword123!');

    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      email: 'alice@aegisops.io',
      normalizedEmail: 'alice@aegisops.io',
      passwordHash,
      isActive: true,
    });

    await expect(
      authService.login({
        email: 'alice@aegisops.io',
        password: 'WrongPassword!',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should reject login if user account is deactivated', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: 'user-inactive',
      email: 'disabled@aegisops.io',
      passwordHash: 'hash',
      isActive: false,
    });

    await expect(
      authService.login({
        email: 'disabled@aegisops.io',
        password: 'AnyPassword',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should validate active session and reject revoked or expired sessions', async () => {
    const rawToken = 'test-opaque-session-token-xyz';
    const tokenHash = sessionService.hashToken(rawToken);

    // 1. Valid session
    mockPrisma.session.findUnique.mockResolvedValueOnce({
      id: 'sess-active',
      tokenHash,
      expiresAt: new Date(Date.now() + 100000),
      revokedAt: null,
      lastUsedAt: new Date(),
      user: { id: 'u1', email: 'u1@test.com', isActive: true },
    });

    const activeSession = await sessionService.validateSession(rawToken);
    expect(activeSession).toBeDefined();
    expect(activeSession.user.id).toBe('u1');

    // 2. Revoked session
    mockPrisma.session.findUnique.mockResolvedValueOnce({
      id: 'sess-revoked',
      tokenHash,
      expiresAt: new Date(Date.now() + 100000),
      revokedAt: new Date(),
      lastUsedAt: new Date(),
      user: { id: 'u1', email: 'u1@test.com', isActive: true },
    });
    const revokedResult = await sessionService.validateSession(rawToken);
    expect(revokedResult).toBeNull();

    // 3. Expired session
    mockPrisma.session.findUnique.mockResolvedValueOnce({
      id: 'sess-expired',
      tokenHash,
      expiresAt: new Date(Date.now() - 10000),
      revokedAt: null,
      lastUsedAt: new Date(),
      user: { id: 'u1', email: 'u1@test.com', isActive: true },
    });
    const expiredResult = await sessionService.validateSession(rawToken);
    expect(expiredResult).toBeNull();
  });

  it('should revoke single session on logout', async () => {
    mockPrisma.session.updateMany.mockResolvedValueOnce({ count: 1 });
    await authService.logout('raw-token', 'user-1');
    expect(mockPrisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ revokedAt: null }),
      }),
    );
  });

  it('should revoke all active user sessions on logoutAll', async () => {
    mockPrisma.session.updateMany.mockResolvedValueOnce({ count: 3 });
    await authService.logoutAll('user-1');
    expect(mockPrisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1', revokedAt: null }),
      }),
    );
  });
});