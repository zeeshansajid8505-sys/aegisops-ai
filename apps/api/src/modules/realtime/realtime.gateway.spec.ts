import { RealtimeGateway } from './realtime.gateway';
import { RealtimeEventEnvelope } from '@aegisops/types';

describe('Realtime Subsystem: RealtimeGateway Unit Tests', () => {
  let gateway: RealtimeGateway;

  const mockSessionService: any = {
    validateSession: jest.fn(),
  };

  const mockPrisma: any = {
    membership: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    service: {
      findFirst: jest.fn(),
    },
    incident: {
      findFirst: jest.fn(),
    },
  };

  const mockPublisher: any = {
    registerLocalEmitter: jest.fn(),
  };

  const mockServer: any = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    gateway = new RealtimeGateway(mockSessionService, mockPrisma, mockPublisher);
    gateway.afterInit(mockServer);
  });

  afterEach(async () => {
    await gateway.onModuleDestroy();
  });

  describe('Connection Authentication via HTTP-Only Session Cookie', () => {
    it('disconnects client when no cookie header is present', async () => {
      const mockSocket: any = {
        id: 'sock-1',
        handshake: { headers: {} },
        disconnect: jest.fn(),
        emit: jest.fn(),
        data: {},
      };

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
      expect(mockSocket.emit).toHaveBeenCalledWith('auth:error', { message: 'Authentication required' });
      expect(mockSocket.data.user).toBeUndefined();
    });

    it('disconnects client when aegisops_session cookie is invalid', async () => {
      const mockSocket: any = {
        id: 'sock-2',
        handshake: {
          headers: {
            cookie: 'other_cookie=123; aegisops_session=invalid-token',
          },
        },
        disconnect: jest.fn(),
        emit: jest.fn(),
        data: {},
      };

      mockSessionService.validateSession.mockResolvedValue(null);

      await gateway.handleConnection(mockSocket);

      expect(mockSessionService.validateSession).toHaveBeenCalledWith('invalid-token');
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
      expect(mockSocket.emit).toHaveBeenCalledWith('auth:error', { message: 'Invalid or expired session' });
    });

    it('authenticates client and registers user data when session cookie is valid', async () => {
      const mockSocket: any = {
        id: 'sock-3',
        handshake: {
          headers: {
            cookie: 'aegisops_session=valid-token-xyz',
          },
        },
        join: jest.fn(),
        disconnect: jest.fn(),
        emit: jest.fn(),
        data: {},
      };

      mockSessionService.validateSession.mockResolvedValue({
        id: 'sess-1',
        userId: 'usr-42',
        user: { id: 'usr-42', email: 'sre@example.com', displayName: 'Lead SRE', isActive: true },
      });

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.disconnect).not.toHaveBeenCalled();
      expect(mockSocket.data.user).toEqual({
        id: 'usr-42',
        email: 'sre@example.com',
        displayName: 'Lead SRE',
        isActive: true,
      });
      expect(mockSocket.data.userId).toBe('usr-42');
      expect(mockSocket.emit).toHaveBeenCalledWith('auth:success', {
        userId: 'usr-42',
        email: 'sre@example.com',
        displayName: 'Lead SRE',
      });
    });
  });

  describe('Room Authorization & Multi-Tenant Boundaries', () => {
    const authenticatedSocket: any = {
      id: 'sock-auth',
      data: {
        userId: 'usr-42',
        user: { id: 'usr-42', email: 'sre@example.com', isActive: true },
      },
      join: jest.fn().mockResolvedValue(undefined),
      leave: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
      emit: jest.fn(),
    };

    it('allows joining organization room if user is an active member', async () => {
      mockPrisma.membership.findUnique.mockResolvedValue({
        id: 'mem-1',
        userId: 'usr-42',
        organizationId: 'org-prod',
      });

      const response = await gateway.handleSubscribeOrganization(
        authenticatedSocket,
        { organizationId: 'org-prod' },
      );

      expect(response).toEqual({ success: true, room: 'organization:org-prod' });
      expect(authenticatedSocket.join).toHaveBeenCalledWith('organization:org-prod');
    });

    it('rejects joining organization room if user is not a member', async () => {
      mockPrisma.membership.findUnique.mockResolvedValue(null);

      const response = await gateway.handleSubscribeOrganization(
        authenticatedSocket,
        { organizationId: 'org-other' },
      );

      expect(response).toEqual({
        success: false,
        error: 'Access denied: not a member of organization',
      });
      expect(authenticatedSocket.join).not.toHaveBeenCalled();
    });

    it('allows joining service room if user is member of organization owning the service', async () => {
      mockPrisma.membership.findUnique.mockResolvedValue({
        id: 'mem-1',
        userId: 'usr-42',
        organizationId: 'org-prod',
      });
      mockPrisma.service.findFirst.mockResolvedValue({
        id: 'svc-1',
        organizationId: 'org-prod',
      });

      const response = await gateway.handleSubscribeService(
        authenticatedSocket,
        { organizationId: 'org-prod', serviceId: 'svc-1' },
      );

      expect(response).toEqual({
        success: true,
        room: 'service:org-prod:svc-1',
      });
      expect(authenticatedSocket.join).toHaveBeenCalledWith('service:org-prod:svc-1');
    });

    it('rejects joining service room if service does not belong to organization', async () => {
      mockPrisma.membership.findUnique.mockResolvedValue({
        id: 'mem-1',
        userId: 'usr-42',
        organizationId: 'org-prod',
      });
      mockPrisma.service.findFirst.mockResolvedValue(null);

      const response = await gateway.handleSubscribeService(
        authenticatedSocket,
        { organizationId: 'org-prod', serviceId: 'svc-foreign' },
      );

      expect(response).toEqual({
        success: false,
        error: 'Service not found in organization',
      });
      expect(authenticatedSocket.join).not.toHaveBeenCalled();
    });

    it('allows joining incident room if user is member of organization owning the incident', async () => {
      mockPrisma.membership.findUnique.mockResolvedValue({
        id: 'mem-1',
        userId: 'usr-42',
        organizationId: 'org-prod',
      });
      mockPrisma.incident.findFirst.mockResolvedValue({
        id: 'inc-1',
        organizationId: 'org-prod',
      });

      const response = await gateway.handleSubscribeIncident(
        authenticatedSocket,
        { organizationId: 'org-prod', incidentId: 'inc-1' },
      );

      expect(response).toEqual({
        success: true,
        room: 'incident:org-prod:inc-1',
      });
      expect(authenticatedSocket.join).toHaveBeenCalledWith('incident:org-prod:inc-1');
    });
  });

  describe('Event Broadcasting', () => {
    it('dispatches event envelope to targeted rooms via server.to()', () => {
      const envelope: RealtimeEventEnvelope = {
        id: 'evt-1',
        type: 'incident.created',
        organizationId: 'org-prod',
        timestamp: '2026-09-08T12:00:00.000Z',
        targetRoom: 'service:org-prod:svc-1',
        payload: { id: 'inc-1', title: 'Latency Degraded' },
      };

      gateway.broadcastEnvelope(envelope);

      expect(mockServer.to).toHaveBeenCalledWith('service:org-prod:svc-1');
      expect(mockServer.to).toHaveBeenCalledWith('organization:org-prod');
      expect(mockServer.emit).toHaveBeenCalledWith('incident.created', envelope);
      expect(mockServer.emit).toHaveBeenCalledWith('realtime:event', envelope);
    });
  });
});

