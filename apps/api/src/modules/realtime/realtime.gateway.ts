import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import Redis from 'ioredis';
import {
  RealtimeEventEnvelope,
  REALTIME_REDIS_CHANNEL,
  RealtimeRooms,
} from '@aegisops/types';
import { SessionService } from '../auth/session.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventPublisher } from './realtime-event.publisher';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
  namespace: '/',
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private subscriberClient: Redis | null = null;

  constructor(
    private readonly sessionService: SessionService,
    private readonly prisma: PrismaService,
    private readonly publisher: RealtimeEventPublisher,
  ) {}

  afterInit(server: Server): void {
    this.server = server;

    // Connect publisher's in-process emitter to this gateway
    this.publisher.registerLocalEmitter((envelope) => {
      this.broadcastEnvelope(envelope);
    });

    // Initialize Redis Pub/Sub subscriber client
    this.initRedisSubscriber();

    this.logger.log('Realtime WebSocket Gateway initialized on namespace /');
  }

  private initRedisSubscriber(): void {
    const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    try {
      this.subscriberClient = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryStrategy: () => 5000,
      });

      this.subscriberClient.on('error', (err) => {
        this.logger.debug(`Realtime Redis Subscriber event: ${err.message}`);
      });

      this.subscriberClient.connect().then(() => {
        this.subscriberClient?.subscribe(REALTIME_REDIS_CHANNEL, (err) => {
          if (err) {
            this.logger.warn(`Failed to subscribe to ${REALTIME_REDIS_CHANNEL}: ${err.message}`);
          } else {
            this.logger.log(`Subscribed to Redis channel: ${REALTIME_REDIS_CHANNEL}`);
          }
        });

        this.subscriberClient?.on('message', (channel, message) => {
          if (channel === REALTIME_REDIS_CHANNEL) {
            try {
              const envelope = JSON.parse(message) as RealtimeEventEnvelope;
              this.broadcastEnvelope(envelope);
            } catch (err) {
              this.logger.debug(`Failed to parse Redis realtime message: ${(err as Error).message}`);
            }
          }
        });
      }).catch((err) => {
        this.logger.debug(`Redis subscriber connection deferred: ${(err as Error).message}`);
      });
    } catch (err) {
      this.logger.warn(`Could not initialize Redis subscriber: ${(err as Error).message}`);
    }
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const rawToken = this.extractSessionToken(client);
      if (!rawToken) {
        this.logger.debug(`Rejecting unauthenticated socket ${client.id}: No session token`);
        client.emit('auth:error', { message: 'Authentication required' });
        client.disconnect(true);
        return;
      }

      const session = await this.sessionService.validateSession(rawToken);
      if (!session || !session.user || !session.user.isActive) {
        this.logger.debug(`Rejecting socket ${client.id}: Invalid or expired session`);
        client.emit('auth:error', { message: 'Invalid or expired session' });
        client.disconnect(true);
        return;
      }

      // Store authenticated user context on socket
      client.data.user = session.user;
      client.data.userId = session.user.id;
      client.emit('auth:success', {
        userId: session.user.id,
        email: session.user.email,
        displayName: session.user.displayName,
      });

      this.logger.debug(`Socket ${client.id} authenticated as user ${session.user.email}`);
    } catch (error) {
      this.logger.warn(`Error authenticating socket ${client.id}: ${(error as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Socket disconnected: ${client.id}`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.subscriberClient) {
      await this.subscriberClient.quit().catch(() => {});
      this.subscriberClient = null;
    }
  }

  /**
   * Broadcast an envelope to the target room and to the tenant's organization room.
   */
  broadcastEnvelope(envelope: RealtimeEventEnvelope): void {
    if (!this.server) return;

    // Emit to specific target room
    if (envelope.targetRoom) {
      this.server.to(envelope.targetRoom).emit(envelope.type, envelope);
      this.server.to(envelope.targetRoom).emit('realtime:event', envelope);
    }

    // Also emit to organization room if target room was more specific
    const orgRoom = RealtimeRooms.organization(envelope.organizationId);
    if (envelope.targetRoom !== orgRoom) {
      this.server.to(orgRoom).emit(envelope.type, envelope);
      this.server.to(orgRoom).emit('realtime:event', envelope);
    }
  }

  @SubscribeMessage('subscribe:organization')
  async handleSubscribeOrganization(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { organizationId: string },
  ): Promise<{ success: boolean; room?: string; error?: string }> {
    const userId = client.data.userId;
    if (!userId || !data?.organizationId) {
      return { success: false, error: 'Invalid parameters' };
    }

    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId: data.organizationId,
        },
      },
    });

    if (!membership) {
      return { success: false, error: 'Access denied: not a member of organization' };
    }

    const room = RealtimeRooms.organization(data.organizationId);
    await client.join(room);
    this.logger.debug(`Socket ${client.id} joined room ${room}`);
    return { success: true, room };
  }

  @SubscribeMessage('unsubscribe:organization')
  async handleUnsubscribeOrganization(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { organizationId: string },
  ): Promise<{ success: boolean }> {
    if (data?.organizationId) {
      const room = RealtimeRooms.organization(data.organizationId);
      await client.leave(room);
    }
    return { success: true };
  }

  @SubscribeMessage('subscribe:service')
  async handleSubscribeService(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { organizationId: string; serviceId: string },
  ): Promise<{ success: boolean; room?: string; error?: string }> {
    const userId = client.data.userId;
    if (!userId || !data?.organizationId || !data?.serviceId) {
      return { success: false, error: 'Invalid parameters' };
    }

    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId: data.organizationId,
        },
      },
    });

    if (!membership) {
      return { success: false, error: 'Access denied: not a member of organization' };
    }

    const service = await this.prisma.service.findFirst({
      where: {
        id: data.serviceId,
        organizationId: data.organizationId,
      },
    });

    if (!service) {
      return { success: false, error: 'Service not found in organization' };
    }

    const room = RealtimeRooms.service(data.organizationId, data.serviceId);
    await client.join(room);
    this.logger.debug(`Socket ${client.id} joined room ${room}`);
    return { success: true, room };
  }

  @SubscribeMessage('unsubscribe:service')
  async handleUnsubscribeService(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { organizationId: string; serviceId: string },
  ): Promise<{ success: boolean }> {
    if (data?.organizationId && data?.serviceId) {
      const room = RealtimeRooms.service(data.organizationId, data.serviceId);
      await client.leave(room);
    }
    return { success: true };
  }

  @SubscribeMessage('subscribe:incident')
  async handleSubscribeIncident(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { organizationId: string; incidentId: string },
  ): Promise<{ success: boolean; room?: string; error?: string }> {
    const userId = client.data.userId;
    if (!userId || !data?.organizationId || !data?.incidentId) {
      return { success: false, error: 'Invalid parameters' };
    }

    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId: data.organizationId,
        },
      },
    });

    if (!membership) {
      return { success: false, error: 'Access denied: not a member of organization' };
    }

    const incident = await this.prisma.incident.findFirst({
      where: {
        id: data.incidentId,
        organizationId: data.organizationId,
      },
    });

    if (!incident) {
      return { success: false, error: 'Incident not found in organization' };
    }

    const room = RealtimeRooms.incident(data.organizationId, data.incidentId);
    await client.join(room);
    this.logger.debug(`Socket ${client.id} joined room ${room}`);
    return { success: true, room };
  }

  @SubscribeMessage('unsubscribe:incident')
  async handleUnsubscribeIncident(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { organizationId: string; incidentId: string },
  ): Promise<{ success: boolean }> {
    if (data?.organizationId && data?.incidentId) {
      const room = RealtimeRooms.incident(data.organizationId, data.incidentId);
      await client.leave(room);
    }
    return { success: true };
  }

  private extractSessionToken(client: Socket): string | null {
    // 1. Auth payload from Socket.IO client (recommended for Next.js browser clients)
    if (client.handshake.auth?.token && typeof client.handshake.auth.token === 'string') {
      return client.handshake.auth.token;
    }

    // 2. Cookie header from HTTP handshake
    const cookieHeader = client.handshake.headers.cookie;
    if (!cookieHeader) return null;

    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SessionService.COOKIE_NAME}=([^;]+)`));
    const token = match?.[1];
    return token ? decodeURIComponent(token) : null;
  }
}

