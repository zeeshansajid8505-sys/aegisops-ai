import { NotFoundException, BadRequestException } from '@nestjs/common';
import { RunbooksService } from './runbooks.service';

describe('RunbooksService', () => {
  let service: RunbooksService;

  const mockPrisma: any = {
    incident: {
      findFirst: jest.fn(),
    },
    runbook: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    runbookStep: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    runbookExecution: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    runbookExecutionStep: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    incidentTimelineEvent: {
      create: jest.fn(),
    },
    $transaction: jest.fn((callback) => {
      if (typeof callback === 'function') {
        return callback(mockPrisma);
      }
      return Promise.all(callback);
    }),
  };

  const mockRealtimePublisher: any = {
    publish: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RunbooksService(mockPrisma, mockRealtimePublisher);
  });

  describe('createRunbook', () => {
    it('creates a runbook with checklist steps', async () => {
      mockPrisma.runbook.create.mockResolvedValue({
        id: 'rb-1',
        name: 'Database Failover',
        steps: [
          { id: 'step-1', order: 1, title: 'Verify Replica Lag', stepType: 'CHECK' },
          { id: 'step-2', order: 2, title: 'Promote Read Replica', stepType: 'MANUAL_ACTION' },
        ],
      });

      const result = await service.createRunbook('org-1', 'member-1', {
        name: 'Database Failover',
        description: 'Procedure to promote read replica',
        steps: [
          { order: 1, title: 'Verify Replica Lag', instruction: 'Check replica lag < 5s', stepType: 'CHECK' },
          { order: 2, title: 'Promote Read Replica', instruction: 'Execute replica promotion', stepType: 'MANUAL_ACTION' },
        ],
      });

      expect(result.id).toBe('rb-1');
      expect(mockPrisma.runbook.create).toHaveBeenCalled();
    });

    it('throws BadRequestException if name is missing or steps are empty', async () => {
      await expect(
        service.createRunbook('org-1', 'member-1', { name: '', steps: [] }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.createRunbook('org-1', 'member-1', { name: 'Valid', steps: [] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('startExecution', () => {
    it('starts an execution for an incident with PENDING steps', async () => {
      mockPrisma.incident.findFirst.mockResolvedValue({ id: 'inc-1', organizationId: 'org-1' });
      mockPrisma.runbook.findFirst.mockResolvedValue({
        id: 'rb-1',
        name: 'Flush Redis Cache',
        steps: [
          { id: 's1', order: 1, title: 'Step 1' },
          { id: 's2', order: 2, title: 'Step 2' },
        ],
      });

      mockPrisma.runbookExecution.create.mockResolvedValue({
        id: 'exec-1',
        incidentId: 'inc-1',
        runbookId: 'rb-1',
        status: 'IN_PROGRESS',
        steps: [
          { id: 'es-1', runbookStepId: 's1', status: 'PENDING' },
          { id: 'es-2', runbookStepId: 's2', status: 'PENDING' },
        ],
      });

      const result = await service.startExecution('org-1', 'inc-1', 'rb-1', 'mem-1');
      expect(result.id).toBe('exec-1');
      expect(mockPrisma.incidentTimelineEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'RUNBOOK_STARTED',
            organizationId: 'org-1',
            incidentId: 'inc-1',
          }),
        }),
      );
    });

    it('throws NotFoundException if runbook or incident does not exist', async () => {
      mockPrisma.incident.findFirst.mockResolvedValue(null);

      await expect(
        service.startExecution('org-1', 'inc-999', 'rb-1', 'mem-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('completeExecutionStep', () => {
    it('completes individual step and marks execution COMPLETED if all steps done', async () => {
      mockPrisma.runbookExecution.findFirst.mockResolvedValue({
        id: 'exec-1',
        incidentId: 'inc-1',
        organizationId: 'org-1',
        runbook: { name: 'Flush Redis Cache' },
        steps: [{ id: 'es-1', runbookStep: { title: 'Step 1' } }],
      });

      mockPrisma.runbookExecutionStep.update.mockResolvedValue({
        id: 'es-1',
        status: 'COMPLETED',
      });

      // All steps completed check
      mockPrisma.runbookExecutionStep.findMany.mockResolvedValue([
        { id: 'es-1', status: 'COMPLETED' },
      ]);

      await service.completeExecutionStep('org-1', 'inc-1', 'exec-1', 'es-1', 'mem-1', 'Verified healthy');

      expect(mockPrisma.runbookExecutionStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'es-1' },
          data: expect.objectContaining({
            status: 'COMPLETED',
            completedByMembershipId: 'mem-1',
            note: 'Verified healthy',
          }),
        }),
      );

      expect(mockPrisma.runbookExecution.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'exec-1' },
          data: expect.objectContaining({
            status: 'COMPLETED',
          }),
        }),
      );

      expect(mockPrisma.incidentTimelineEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'RUNBOOK_COMPLETED',
            organizationId: 'org-1',
          }),
        }),
      );
    });
  });

  describe('cancelExecution', () => {
    it('marks execution CANCELLED and records timeline event', async () => {
      mockPrisma.runbookExecution.findFirst.mockResolvedValue({
        id: 'exec-1',
        incidentId: 'inc-1',
        organizationId: 'org-1',
      });

      mockPrisma.runbookExecution.update.mockResolvedValue({
        id: 'exec-1',
        status: 'CANCELLED',
      });

      const result = await service.cancelExecution('org-1', 'inc-1', 'exec-1', 'mem-1');
      expect(result.status).toBe('CANCELLED');
      expect(mockPrisma.incidentTimelineEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'NOTE_ADDED',
            message: 'Operational Runbook cancelled.',
          }),
        }),
      );
    });
  });
});

