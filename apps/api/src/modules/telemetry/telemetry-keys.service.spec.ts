import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'crypto';
import { TelemetryKeysService } from './telemetry-keys.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TelemetryKeysService', () => {
  let service: TelemetryKeysService;
  let mockPrisma: any;

  const mockOrgId = 'org-123';
  const mockServiceId = 'service-123';
  const mockEnvId = 'env-123';
  const mockUserId = 'user-123';

  beforeEach(async () => {
    mockPrisma = {
      serviceEnvironment: {
        findFirst: jest.fn().mockResolvedValue({
          id: mockEnvId,
          serviceId: mockServiceId,
          organizationId: mockOrgId,
        }),
      },
      telemetryIngestKey: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'key-abc',
            ...data,
            isActive: true,
            revokedAt: null,
            lastUsedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        ),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelemetryKeysService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TelemetryKeysService>(TelemetryKeysService);
  });

  it('should generate a key with aeg_ing_ prefix and store only SHA-256 hash in DB', async () => {
    const res = await service.createKey(
      mockOrgId,
      mockServiceId,
      { name: 'prod-collector', environmentId: mockEnvId },
      mockUserId,
    );

    expect(res.rawKey).toBeDefined();
    expect(res.rawKey.startsWith('aeg_ing_')).toBe(true);
    expect(res.keyPrefix.startsWith('aeg_ing_')).toBe(true);

    // Verify DB insert received the SHA-256 hash, NOT the raw secret
    expect(mockPrisma.telemetryIngestKey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'prod-collector',
          keyHash: crypto.createHash('sha256').update(res.rawKey).digest('hex'),
          organizationId: mockOrgId,
          serviceId: mockServiceId,
          environmentId: mockEnvId,
        }),
      }),
    );
  });

  it('should validate an active key by hash matching', async () => {
    const rawKey = 'aeg_ing_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    mockPrisma.telemetryIngestKey.findUnique.mockResolvedValue({
      id: 'key-123',
      organizationId: mockOrgId,
      serviceId: mockServiceId,
      environmentId: mockEnvId,
      isActive: true,
      revokedAt: null,
      expiresAt: null,
      rateLimitRpm: 120,
      rateLimitPts: 100000,
    });
    mockPrisma.telemetryIngestKey.update.mockResolvedValue({});

    const validated = await service.validateRawKey(rawKey);

    expect(validated).toBeDefined();
    expect(validated!.organizationId).toBe(mockOrgId);
    expect(validated!.serviceId).toBe(mockServiceId);
    expect(mockPrisma.telemetryIngestKey.findUnique).toHaveBeenCalledWith({
      where: { keyHash },
      select: expect.any(Object),
    });
  });

  it('should reject a revoked key', async () => {
    const rawKey = 'aeg_ing_revoked000000000000000000000000000000000000000000000000000000';

    mockPrisma.telemetryIngestKey.findUnique.mockResolvedValue({
      id: 'key-revoked',
      isActive: false,
      revokedAt: new Date(),
    });

    const validated = await service.validateRawKey(rawKey);
    expect(validated).toBeNull();
  });

  it('should reject an expired key', async () => {
    const rawKey = 'aeg_ing_expired000000000000000000000000000000000000000000000000000000';

    mockPrisma.telemetryIngestKey.findUnique.mockResolvedValue({
      id: 'key-expired',
      isActive: true,
      revokedAt: null,
      expiresAt: new Date(Date.now() - 10000), // Expired 10s ago
    });

    const validated = await service.validateRawKey(rawKey);
    expect(validated).toBeNull();
  });
});

