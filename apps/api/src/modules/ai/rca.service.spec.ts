import { NotFoundException, BadRequestException } from '@nestjs/common';
import { RcaService } from './rca.service';

describe('RcaService', () => {
  let rcaService: RcaService;

  const mockPrisma: any = {
    incident: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    incidentAnalysis: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    incidentEvidenceSnapshot: {
      create: jest.fn(),
      update: jest.fn(),
    },
    incidentHypothesis: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
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

  const mockAiClient: any = {
    analyze: jest.fn(),
    getReadiness: jest.fn().mockResolvedValue({ ready: true }),
  };

  const mockEvidenceBuilder: any = {
    buildEvidence: jest.fn(),
  };

  const mockQueueService: any = {
    enqueueAnalysis: jest.fn().mockResolvedValue('job-123'),
  };

  const mockRealtimePublisher: any = {
    publish: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    rcaService = new RcaService(
      mockPrisma,
      mockAiClient,
      mockEvidenceBuilder,
      mockQueueService,
      mockRealtimePublisher,
    );
  });

  describe('triggerAnalysis', () => {
    it('throws NotFoundException if incident does not exist in organization', async () => {
      mockPrisma.incident.findFirst.mockResolvedValue(null);

      await expect(
        rcaService.triggerAnalysis('org-1', 'inc-999'),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns existing analysis if one is already QUEUED or RUNNING', async () => {
      mockPrisma.incident.findFirst.mockResolvedValue({ id: 'inc-1', organizationId: 'org-1' });
      const activeAnalysis = { id: 'analysis-1', status: 'RUNNING' };
      mockPrisma.incidentAnalysis.findFirst.mockResolvedValue(activeAnalysis);

      const result = await rcaService.triggerAnalysis('org-1', 'inc-1');
      expect(result).toEqual(activeAnalysis);
      expect(mockEvidenceBuilder.buildEvidence).not.toHaveBeenCalled();
    });

    it('creates QUEUED analysis, adds timeline event, and enqueues to BullMQ', async () => {
      mockPrisma.incident.findFirst.mockResolvedValue({ id: 'inc-1', organizationId: 'org-1' });
      mockPrisma.incidentAnalysis.findFirst
        .mockResolvedValueOnce(null) // active check
        .mockResolvedValueOnce(null); // idempotency check

      mockEvidenceBuilder.buildEvidence.mockResolvedValue({
        incident: { id: 'inc-1', primaryServiceId: 'svc-1' },
        candidateServiceIds: ['svc-1', 'svc-2'],
        windowStart: new Date(),
        windowEnd: new Date(),
        fingerprint: 'sha256-fingerprint-123',
      });

      mockPrisma.incidentAnalysis.count.mockResolvedValue(0);
      mockPrisma.incidentEvidenceSnapshot.create.mockResolvedValue({ id: 'snap-1' });
      mockPrisma.incidentAnalysis.create.mockResolvedValue({
        id: 'analysis-1',
        status: 'QUEUED',
        analysisVersion: 1,
      });

      const result = await rcaService.triggerAnalysis('org-1', 'inc-1');
      expect(result.id).toBe('analysis-1');
      expect(mockQueueService.enqueueAnalysis).toHaveBeenCalledWith('org-1', 'inc-1', 'analysis-1');
      expect(mockPrisma.incidentTimelineEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'ANALYSIS_STARTED',
            organizationId: 'org-1',
            incidentId: 'inc-1',
          }),
        }),
      );
    });
  });

  describe('executeAnalysisJob', () => {
    it('executes analysis with FastAPI inference, saves hypotheses and marks COMPLETED', async () => {
      mockPrisma.incidentAnalysis.findFirst.mockResolvedValue({
        id: 'analysis-1',
        organizationId: 'org-1',
        incidentId: 'inc-1',
        evidenceSnapshotId: 'snap-1',
      });

      mockEvidenceBuilder.buildEvidence.mockResolvedValue({
        incident: { id: 'inc-1' },
        candidateServices: [{ id: 'svc-1', name: 'payment-gateway' }],
        topology: { services: [], dependencies: [] },
        metricEvidence: [],
        alertEvidence: [],
        healthEvidence: [],
        humanNotes: [],
        availableRunbooks: [],
      });

      mockAiClient.analyze.mockResolvedValue({
        algorithmVersion: '1.0.0',
        embeddingVersion: '1.0.0',
        modelVersion: '1.0.0',
        summary: 'payment-gateway failure propagated downstream',
        observedFacts: [{ factId: 'f1', type: 'ALERT', description: 'Alert fired' }],
        rankedCandidates: [
          {
            candidateServiceId: 'svc-1',
            rank: 1,
            hypothesis: 'payment-gateway database pool exhausted',
            confidence: 'HIGH',
            score: 85,
            reasonCodes: ['EARLIEST_ALERT', 'DIRECT_UPSTREAM_DEPENDENCY'],
            evidenceRefs: ['alert:1'],
            counterEvidenceRefs: [],
          },
        ],
        recommendedNextChecks: ['Check database connection pool metrics'],
        recommendedRunbooks: [],
      });

      mockPrisma.incidentAnalysis.update.mockResolvedValue({
        id: 'analysis-1',
        status: 'COMPLETED',
        summary: 'payment-gateway failure propagated downstream',
        hypotheses: [{ id: 'hypo-1', rank: 1, candidateServiceId: 'svc-1' }],
      });

      const result = await rcaService.executeAnalysisJob('org-1', 'inc-1', 'analysis-1');
      expect(result.status).toBe('COMPLETED');
      expect(mockPrisma.incidentHypothesis.create).toHaveBeenCalled();
    });
  });

  describe('confirmRootCause', () => {
    it('confirms hypothesis and updates incident with confirmed root cause', async () => {
      mockPrisma.incidentHypothesis.findFirst.mockResolvedValue({
        id: 'hypo-1',
        analysisId: 'analysis-1',
        hypothesis: 'payment-gateway pool exhausted',
        candidateService: { name: 'payment-gateway' },
      });

      mockPrisma.incidentAnalysis.findFirst.mockResolvedValue({
        id: 'analysis-1',
        hypotheses: [{ id: 'hypo-1', status: 'CONFIRMED' }],
      });

      await rcaService.confirmRootCause(
        'org-1',
        'inc-1',
        'hypo-1',
        'member-1',
        'Confirmed database connection leak',
      );

      expect(mockPrisma.incidentHypothesis.update).toHaveBeenCalledWith({
        where: { id: 'hypo-1' },
        data: { status: 'CONFIRMED' },
      });

      expect(mockPrisma.incidentHypothesis.updateMany).toHaveBeenCalledWith({
        where: {
          analysisId: 'analysis-1',
          id: { not: 'hypo-1' },
        },
        data: { status: 'SUPERSEDED' },
      });

      expect(mockPrisma.incident.update).toHaveBeenCalledWith({
        where: { id: 'inc-1' },
        data: expect.objectContaining({
          confirmedRootCauseHypothesisId: 'hypo-1',
          rootCauseSummary: 'Confirmed database connection leak',
          rootCauseConfirmedByMembershipId: 'member-1',
        }),
      });

      expect(mockPrisma.incidentTimelineEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'ROOT_CAUSE_CONFIRMED',
            organizationId: 'org-1',
          }),
        }),
      );
    });

    it('throws NotFoundException if hypothesis is invalid or belongs to another tenant', async () => {
      mockPrisma.incidentHypothesis.findFirst.mockResolvedValue(null);

      await expect(
        rcaService.confirmRootCause('org-1', 'inc-1', 'hypo-999', 'member-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('rejectHypothesis', () => {
    it('marks hypothesis as REJECTED with rejection reason', async () => {
      mockPrisma.incidentHypothesis.findFirst.mockResolvedValue({
        id: 'hypo-1',
        candidateService: { name: 'checkout-api' },
      });

      mockPrisma.incidentHypothesis.update.mockResolvedValue({
        id: 'hypo-1',
        status: 'REJECTED',
        rejectionReason: 'Not root cause: checkout-api failed because of external dependency',
      });

      const result = await rcaService.rejectHypothesis(
        'org-1',
        'inc-1',
        'hypo-1',
        'member-1',
        'Not root cause: checkout-api failed because of external dependency',
      );

      expect(result.status).toBe('REJECTED');
      expect(mockPrisma.incidentTimelineEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'HYPOTHESIS_REJECTED',
            organizationId: 'org-1',
          }),
        }),
      );
    });

    it('throws BadRequestException if rejection reason is empty', async () => {
      await expect(
        rcaService.rejectHypothesis('org-1', 'inc-1', 'hypo-1', 'member-1', '   '),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

