import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

describe('Operations Subsystem: Multi-Tenant Isolation & Controller Tests', () => {
  let controller: OperationsController;
  let mockOperationsService: jest.Mocked<OperationsService>;

  beforeEach(() => {
    mockOperationsService = {
      getOverview: jest.fn(),
    } as any;

    controller = new OperationsController(mockOperationsService);
  });

  it('delegates to operationsService.getOverview with the scoped organizationId', async () => {
    const mockOverview: any = {
      organizationId: 'org-tenant-a',
      summary: { servicesCount: 5 },
      needsAttention: [],
    };
    mockOperationsService.getOverview.mockResolvedValue(mockOverview);

    const result = await controller.getOverview('org-tenant-a');

    expect(mockOperationsService.getOverview).toHaveBeenCalledWith('org-tenant-a');
    expect(result).toBe(mockOverview);
  });

  it('ensures requests for different tenants are isolated by organizationId param', async () => {
    const mockOverviewB: any = {
      organizationId: 'org-tenant-b',
      summary: { servicesCount: 2 },
      needsAttention: [],
    };
    mockOperationsService.getOverview.mockResolvedValue(mockOverviewB);

    const result = await controller.getOverview('org-tenant-b');

    expect(mockOperationsService.getOverview).toHaveBeenCalledWith('org-tenant-b');
    expect(result.organizationId).toBe('org-tenant-b');
  });
});

