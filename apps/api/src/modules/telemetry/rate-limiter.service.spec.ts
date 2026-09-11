import { Test, TestingModule } from '@nestjs/testing';
import { RateLimiterService } from './rate-limiter.service';
import { RedisService } from '../redis/redis.service';

describe('RateLimiterService', () => {
  let service: RateLimiterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimiterService,
        {
          provide: RedisService,
          useValue: {
            getClient: jest.fn().mockReturnValue(null), // Test in-memory fallback
          },
        },
      ],
    }).compile();

    service = module.get<RateLimiterService>(RateLimiterService);
  });

  it('should allow requests within RPM and PTS limits', async () => {
    const res = await service.checkRateLimit('key-test-1', 50, 10, 1000);
    expect(res.allowed).toBe(true);
    expect(res.current).toBe(1);
  });

  it('should reject requests exceeding RPM limit', async () => {
    const keyId = 'key-test-rpm-overflow';
    const rpmLimit = 3;

    // Send 3 requests (allowed)
    for (let i = 0; i < rpmLimit; i++) {
      const res = await service.checkRateLimit(keyId, 10, rpmLimit, 1000);
      expect(res.allowed).toBe(true);
    }

    // 4th request exceeds limit
    const overflowRes = await service.checkRateLimit(keyId, 10, rpmLimit, 1000);
    expect(overflowRes.allowed).toBe(false);
    expect(overflowRes.limitType).toBe('rpm');
    expect(overflowRes.limit).toBe(rpmLimit);
  });

  it('should reject requests exceeding PTS limit', async () => {
    const keyId = 'key-test-pts-overflow';
    const ptsLimit = 100;

    // Send 90 points (allowed)
    const res1 = await service.checkRateLimit(keyId, 90, 100, ptsLimit);
    expect(res1.allowed).toBe(true);

    // Send 20 points (totals 110 -> exceeds 100)
    const res2 = await service.checkRateLimit(keyId, 20, 100, ptsLimit);
    expect(res2.allowed).toBe(false);
    expect(res2.limitType).toBe('pts');
    expect(res2.limit).toBe(ptsLimit);
  });
});

