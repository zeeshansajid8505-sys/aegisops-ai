import { Test, TestingModule } from '@nestjs/testing';
import { CardinalityGuardService, MAX_SERIES_PER_ENVIRONMENT } from './cardinality-guard.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

describe('CardinalityGuardService', () => {
  let service: CardinalityGuardService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      metricSeries: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(100),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CardinalityGuardService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: { getClient: () => null } },
      ],
    }).compile();

    service = module.get<CardinalityGuardService>(CardinalityGuardService);
  });

  it('should accept a new series when count is below the cap', async () => {
    const res = await service.canAcceptSeries('env-test', 'hash-new-1');
    expect(res.allowed).toBe(true);
    expect(res.isNew).toBe(true);
  });

  it('should reject a new series when the 5,000 series cap is reached', async () => {
    mockPrisma.metricSeries.count.mockResolvedValue(MAX_SERIES_PER_ENVIRONMENT);

    const res = await service.canAcceptSeries('env-test-full', 'hash-overflow');
    expect(res.allowed).toBe(false);
    expect(res.isNew).toBe(true);
  });
});

