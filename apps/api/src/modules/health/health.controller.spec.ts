import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

describe('HealthController', () => {
  let controller: HealthController;
  let service: HealthService;

  const mockPrismaService = {
    ping: jest.fn().mockResolvedValue(true),
  };

  const mockRedisService = {
    ping: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    service = module.get<HealthService>(HealthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(service).toBeDefined();
  });

  it('should return healthy status when dependencies are up', async () => {
    mockPrismaService.ping.mockResolvedValueOnce(true);
    mockRedisService.ping.mockResolvedValueOnce(true);

    const result = await controller.getHealth();
    expect(result.status).toBe('healthy');
    expect(result.service).toBe('@aegisops/api');
    expect(result.components['database']?.status).toBe('healthy');
    expect(result.components['redis']?.status).toBe('healthy');
  });

  it('should return degraded status when database is down', async () => {
    mockPrismaService.ping.mockResolvedValueOnce(false);
    mockRedisService.ping.mockResolvedValueOnce(true);

    const result = await controller.getHealth();
    expect(result.status).toBe('degraded');
    expect(result.components['database']?.status).toBe('degraded');
  });

  it('should return liveness ok', () => {
    const liveness = controller.getLiveness();
    expect(liveness.status).toBe('ok');
    expect(liveness.timestamp).toBeDefined();
  });

  it('should return readiness true', async () => {
    const readiness = await controller.getReadiness();
    expect(readiness.ready).toBe(true);
  });
});
