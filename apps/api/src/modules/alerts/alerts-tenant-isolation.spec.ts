import { NotFoundException } from '@nestjs/common';
import { AlertRulesService } from './alert-rules.service';
import { AlertsService } from './alerts.service';

describe('Alerts Subsystem: Multi-Tenant Isolation & Access Control', () => {
  let rulesService: AlertRulesService;
  let alertsService: AlertsService;

  const mockPrisma: any = {
    alertRule: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    alertInstance: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    alertEvent: {
      findMany: jest.fn(),
    },
    service: {
      findFirst: jest.fn(),
    },
    serviceEnvironment: {
      findFirst: jest.fn(),
    },
    metricDefinition: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn((callback) => {
      if (typeof callback === 'function') {
        return callback(mockPrisma);
      }
      return Promise.all(callback);
    }),
  };

  const mockQueueService: any = {
    scheduleRuleEvaluation: jest.fn().mockResolvedValue(undefined),
    enqueueManualEvaluation: jest.fn().mockResolvedValue('job-1'),
    removeRuleSchedule: jest.fn().mockResolvedValue(undefined),
  };

  const mockWindowEvaluator: any = {
    evaluateWindow: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    rulesService = new AlertRulesService(mockPrisma, mockQueueService, mockWindowEvaluator);
    alertsService = new AlertsService(mockPrisma);
  });

  describe('AlertRulesService: Tenant Boundaries', () => {
    it('blocks reading a rule belonging to another organization', async () => {
      mockPrisma.alertRule.findFirst.mockResolvedValue(null);

      await expect(
        rulesService.getRule('org-A', 'rule-belonging-to-org-B'),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.alertRule.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'rule-belonging-to-org-B',
            organizationId: 'org-A',
          }),
        }),
      );
    });

    it('blocks updating a rule belonging to another organization', async () => {
      mockPrisma.alertRule.findFirst.mockResolvedValue(null);

      await expect(
        rulesService.updateRule('org-A', 'rule-belonging-to-org-B', { name: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('blocks archiving a rule belonging to another organization', async () => {
      mockPrisma.alertRule.findFirst.mockResolvedValue(null);

      await expect(
        rulesService.archiveRule('org-A', 'rule-belonging-to-org-B'),
      ).rejects.toThrow(NotFoundException);
    });

    it('blocks manual evaluation of a rule belonging to another organization', async () => {
      mockPrisma.alertRule.findFirst.mockResolvedValue(null);

      await expect(
        rulesService.evaluateNow('org-A', 'rule-belonging-to-org-B'),
      ).rejects.toThrow(NotFoundException);

      expect(mockQueueService.enqueueManualEvaluation).not.toHaveBeenCalled();
    });

    it('rejects creating a rule if target service does not belong to organization', async () => {
      mockPrisma.service.findFirst.mockResolvedValue(null);

      await expect(
        rulesService.createRule('org-A', 'foreign-service', 'env-1', 'user-1', {
          metricDefinitionId: 'metric-1',
          name: 'High CPU',
          severity: 'SEV-2',
          evaluationMode: 'PER_SERIES',
          aggregation: 'AVG',
          comparisonOperator: 'GT',
          thresholdValue: 90,
          windowSeconds: 300,
          evaluationIntervalSeconds: 60,
          pendingDurationSeconds: 0,
          recoveryDurationSeconds: 0,
          noDataPolicy: 'IGNORE',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects creating a rule if target environment does not belong to service', async () => {
      mockPrisma.service.findFirst.mockResolvedValue({ id: 'svc-1', organizationId: 'org-A' });
      mockPrisma.serviceEnvironment.findFirst.mockResolvedValue(null);

      await expect(
        rulesService.createRule('org-A', 'svc-1', 'foreign-env', 'user-1', {
          metricDefinitionId: 'metric-1',
          name: 'High CPU',
          severity: 'SEV-2',
          evaluationMode: 'PER_SERIES',
          aggregation: 'AVG',
          comparisonOperator: 'GT',
          thresholdValue: 90,
          windowSeconds: 300,
          evaluationIntervalSeconds: 60,
          pendingDurationSeconds: 0,
          recoveryDurationSeconds: 0,
          noDataPolicy: 'IGNORE',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('AlertsService: Tenant Boundaries', () => {
    it('scopes listing alerts strictly to the caller organization', async () => {
      mockPrisma.alertInstance.findMany.mockResolvedValue([]);
      mockPrisma.alertInstance.count.mockResolvedValue(0);

      const result = await alertsService.listAlerts('org-A', {});

      expect(result.alerts).toEqual([]);
      expect(mockPrisma.alertInstance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-A',
          }),
        }),
      );
    });

    it('blocks getting alert details for an instance belonging to another organization', async () => {
      mockPrisma.alertInstance.findFirst.mockResolvedValue(null);

      await expect(
        alertsService.getAlert('org-A', 'instance-belonging-to-org-B'),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.alertInstance.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'instance-belonging-to-org-B',
            organizationId: 'org-A',
          }),
        }),
      );
    });

    it('blocks retrieving event history for an alert instance belonging to another organization', async () => {
      mockPrisma.alertInstance.findFirst.mockResolvedValue(null);

      await expect(
        alertsService.getAlertEvents('org-A', 'instance-belonging-to-org-B'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
