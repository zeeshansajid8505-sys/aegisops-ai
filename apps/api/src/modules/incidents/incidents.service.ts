import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  IncidentSummary,
  IncidentDetail,
  IncidentAlertSummary,
  IncidentTimelineEventSummary,
  IncidentResponderSummary,
  IncidentCorrelationReason,
  RealtimeRooms,
  RealtimeEventType,
} from '@aegisops/types';
import { RealtimeEventPublisher } from '../realtime/realtime-event.publisher';
import { NotificationRouterService } from '../notifications/notification-router.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import {
  TransitionIncidentDto,
  AcknowledgeIncidentDto,
  ResolveIncidentDto,
  ReopenIncidentDto,
  AssignCommanderDto,
  AddResponderDto,
  AddIncidentNoteDto,
  AttachAlertDto,
  UnlinkAlertDto,
  UpdateSeverityDto,
} from './dto/incident-actions.dto';
import { QueryIncidentsDto } from './dto/query-incidents.dto';
import {
  transitionIncidentStatus,
  InvalidIncidentTransitionException,
} from './domain/incident-state-machine';
import {
  evaluateSeverityEscalation,
} from './domain/severity-escalation';

@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly realtimePublisher?: RealtimeEventPublisher,
    @Optional() private readonly notificationRouter?: NotificationRouterService,
  ) {}

  private publishRealtime(
    type: RealtimeEventType,
    organizationId: string,
    incidentId: string,
    payload: any,
  ): void {
    if (!this.realtimePublisher) return;
    this.realtimePublisher
      .publish({
        id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type,
        organizationId,
        targetRoom: RealtimeRooms.incident(organizationId, incidentId),
        timestamp: new Date().toISOString(),
        payload,
      })
      .catch(() => {});
  }

  private generateIncidentKey(): string {
    const randomPart = Math.floor(1000 + Math.random() * 9000);
    const timePart = Date.now().toString(36).toUpperCase();
    return `INC-${timePart}-${randomPart}`;
  }

  async createIncident(
    organizationId: string,
    membershipId: string,
    dto: CreateIncidentDto,
  ): Promise<IncidentSummary> {
    if (dto.primaryServiceId) {
      const service = await this.prisma.service.findFirst({
        where: { id: dto.primaryServiceId, organizationId },
      });
      if (!service) {
        throw new NotFoundException(`Service ${dto.primaryServiceId} not found in this organization`);
      }
    }

    if (dto.environmentId) {
      const env = await this.prisma.serviceEnvironment.findFirst({
        where: { id: dto.environmentId, organizationId },
      });
      if (!env) {
        throw new NotFoundException(`Environment ${dto.environmentId} not found in this organization`);
      }
    }

    if (dto.commanderMembershipId) {
      const member = await this.prisma.membership.findFirst({
        where: { id: dto.commanderMembershipId, organizationId },
      });
      if (!member) {
        throw new NotFoundException(`Commander membership ${dto.commanderMembershipId} not found`);
      }
    }

    const incidentKey = this.generateIncidentKey();
    const now = new Date();

    const incident = await this.prisma.$transaction(async (tx) => {
      const created = await tx.incident.create({
        data: {
          organizationId,
          incidentKey,
          title: dto.title,
          summary: dto.summary,
          source: 'MANUAL',
          status: 'OPEN',
          severity: dto.severity ?? 'WARNING',
          primaryServiceId: dto.primaryServiceId,
          environmentId: dto.environmentId,
          commanderMembershipId: dto.commanderMembershipId,
          assignedTeamId: dto.assignedTeamId,
          createdByMembershipId: membershipId,
          detectedAt: now,
          lastSignalAt: now,
        },
        include: {
          primaryService: true,
          environment: true,
          commander: { include: { user: true } },
          assignedTeam: true,
          alerts: { where: { unlinkedAt: null } },
        },
      });

      await tx.incidentTimelineEvent.create({
        data: {
          organizationId,
          incidentId: created.id,
          eventType: 'INCIDENT_CREATED',
          actorMembershipId: membershipId,
          occurredAt: now,
          message: `Manual incident created: ${dto.title}`,
        },
      });

      if (dto.commanderMembershipId) {
        await tx.incidentResponder.create({
          data: {
            organizationId,
            incidentId: created.id,
            membershipId: dto.commanderMembershipId,
            role: 'COMMANDER',
            joinedAt: now,
          },
        });

        await tx.incidentTimelineEvent.create({
          data: {
            organizationId,
            incidentId: created.id,
            eventType: 'COMMANDER_ASSIGNED',
            actorMembershipId: membershipId,
            occurredAt: now,
            message: 'Incident commander assigned on creation',
          },
        });
      }

      return created;
    });

    const summary = this.mapToSummary(incident);
    this.publishRealtime('incident.created', organizationId, summary.id, summary);

    if (this.notificationRouter) {
      this.notificationRouter.routeEvent({
        organizationId,
        eventType: 'incident.created',
        sourceModule: 'incidents',
        severity: summary.severity as any,
        serviceId: summary.primaryServiceId ?? undefined,
        environmentId: summary.environmentId ?? undefined,
        title: `Incident ${summary.incidentKey}: ${summary.title}`,
        message: summary.summary || summary.title,
        payload: {
          incidentId: summary.id,
          incidentKey: summary.incidentKey,
          severity: summary.severity,
          status: summary.status,
        },
        deepLink: `/incidents/${summary.id}`,
      }).catch(() => {});
    }

    return summary;
  }


  async listIncidents(
    organizationId: string,
    query: QueryIncidentsDto,
  ): Promise<{ incidents: IncidentSummary[]; total: number }> {
    const where: any = { organizationId };

    if (query.status) {
      where.status = query.status;
    }
    if (query.severity) {
      where.severity = query.severity;
    }
    if (query.serviceId) {
      where.primaryServiceId = query.serviceId;
    }
    if (query.environmentId) {
      where.environmentId = query.environmentId;
    }
    if (query.commanderMembershipId) {
      where.commanderMembershipId = query.commanderMembershipId;
    }
    if (query.source) {
      where.source = query.source;
    }
    if (query.signalsCleared !== undefined) {
      if (query.signalsCleared) {
        where.allSignalsClearedAt = { not: null };
      } else {
        where.allSignalsClearedAt = null;
      }
    }
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { incidentKey: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [total, records] = await Promise.all([
      this.prisma.incident.count({ where }),
      this.prisma.incident.findMany({
        where,
        include: {
          primaryService: true,
          environment: true,
          commander: { include: { user: true } },
          assignedTeam: true,
          alerts: { where: { unlinkedAt: null } },
        },
        orderBy: [{ status: 'asc' }, { lastSignalAt: 'desc' }],
        take: query.limit,
        skip: query.offset,
      }),
    ]);

    return {
      incidents: records.map((r) => this.mapToSummary(r)),
      total,
    };
  }

  async getIncident(organizationId: string, incidentId: string): Promise<IncidentDetail> {
    const incident = await this.prisma.incident.findFirst({
      where: { id: incidentId, organizationId },
      include: {
        primaryService: true,
        environment: true,
        commander: { include: { user: true } },
        assignedTeam: true,
        alerts: {
          include: {
            alertRule: true,
            service: true,
            environment: true,
          },
          orderBy: { linkedAt: 'desc' },
        },
        timelineEvents: {
          include: {
            actor: { include: { user: true } },
          },
          orderBy: { occurredAt: 'asc' },
        },
        responders: {
          where: { removedAt: null },
          include: {
            membership: { include: { user: true } },
          },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });

    if (!incident) {
      throw new NotFoundException(`Incident ${incidentId} not found in this organization`);
    }

    const summary = this.mapToSummary(incident);

    const alerts: IncidentAlertSummary[] = incident.alerts.map((a) => ({
      id: a.id,
      incidentId: a.incidentId,
      alertInstanceId: a.alertInstanceId,
      triggerAlertEventId: a.triggerAlertEventId,
      alertRuleId: a.alertRuleId,
      alertRuleName: a.alertRule?.name,
      serviceId: a.serviceId,
      serviceName: a.service?.name,
      environmentId: a.environmentId,
      environmentName: a.environment?.name,
      alertSeverity: a.alertSeverity,
      correlationScore: a.correlationScore,
      correlationReasons: (a.correlationReasons as unknown as IncidentCorrelationReason[]) ?? [],
      linkedAt: a.linkedAt.toISOString(),
      resolvedAt: a.resolvedAt ? a.resolvedAt.toISOString() : null,
      unlinkedAt: a.unlinkedAt ? a.unlinkedAt.toISOString() : null,
      unlinkedByMembershipId: a.unlinkedByMembershipId,
      unlinkReason: a.unlinkReason,
    }));

    const timeline: IncidentTimelineEventSummary[] = incident.timelineEvents.map((t) => ({
      id: t.id,
      incidentId: t.incidentId,
      eventType: t.eventType,
      actorMembershipId: t.actorMembershipId,
      actorName: t.actor?.user.displayName ?? null,
      actorEmail: t.actor?.user.email ?? null,
      occurredAt: t.occurredAt.toISOString(),
      message: t.message,
      metadata: (t.metadata as Record<string, unknown>) ?? null,
    }));

    const responders: IncidentResponderSummary[] = incident.responders.map((r) => ({
      id: r.id,
      incidentId: r.incidentId,
      membershipId: r.membershipId,
      userName: r.membership.user.displayName,
      userEmail: r.membership.user.email,
      role: r.role,
      joinedAt: r.joinedAt.toISOString(),
      removedAt: r.removedAt ? r.removedAt.toISOString() : null,
    }));

    return {
      ...summary,
      alerts,
      timeline,
      responders,
    };
  }

  async acknowledgeIncident(
    organizationId: string,
    incidentId: string,
    membershipId: string,
    dto: AcknowledgeIncidentDto,
  ): Promise<IncidentSummary> {
    const incident = await this.prisma.incident.findFirst({
      where: { id: incidentId, organizationId },
    });
    if (!incident) {
      throw new NotFoundException(`Incident ${incidentId} not found in this organization`);
    }

    const now = new Date();
    const transition = transitionIncidentStatus(
      incident.status,
      'ACKNOWLEDGED',
      { acknowledgedAt: incident.acknowledgedAt },
      { currentTime: now, reason: dto.note },
    );

    if (transition.isNoop) {
      // Idempotent: already acknowledged or past
      return this.getIncidentSummaryById(incidentId, organizationId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.incident.update({
        where: { id: incidentId },
        data: {
          status: 'ACKNOWLEDGED',
          acknowledgedAt: transition.timestampsToUpdate.acknowledgedAt ?? now,
        },
      });

      await tx.incidentTimelineEvent.create({
        data: {
          organizationId,
          incidentId,
          eventType: 'ACKNOWLEDGED',
          actorMembershipId: membershipId,
          occurredAt: now,
          message: transition.timelineMessage ?? 'Incident acknowledged by responder',
          metadata: dto.note ? { note: dto.note } : undefined,
        },
      });
    });

    return this.getIncidentSummaryById(incidentId, organizationId);
  }

  async transitionStatus(
    organizationId: string,
    incidentId: string,
    membershipId: string,
    dto: TransitionIncidentDto,
  ): Promise<IncidentSummary> {
    if (dto.status === 'RESOLVED') {
      throw new BadRequestException(
        "Use 'POST /resolve' endpoint with a mandatory resolution summary to resolve an incident.",
      );
    }

    const incident = await this.prisma.incident.findFirst({
      where: { id: incidentId, organizationId },
    });
    if (!incident) {
      throw new NotFoundException(`Incident ${incidentId} not found in this organization`);
    }

    const now = new Date();
    let transition;
    try {
      transition = transitionIncidentStatus(
        incident.status,
        dto.status,
        {
          acknowledgedAt: incident.acknowledgedAt,
          investigationStartedAt: incident.investigationStartedAt,
          mitigatedAt: incident.mitigatedAt,
          resolvedAt: incident.resolvedAt,
          reopenedAt: incident.reopenedAt,
        },
        { currentTime: now, reason: dto.reason },
      );
    } catch (err) {
      if (err instanceof InvalidIncidentTransitionException) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }

    if (transition.isNoop) {
      return this.getIncidentSummaryById(incidentId, organizationId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.incident.update({
        where: { id: incidentId },
        data: {
          status: transition.newStatus,
          ...transition.timestampsToUpdate,
        },
      });

      if (transition.timelineEventType) {
        await tx.incidentTimelineEvent.create({
          data: {
            organizationId,
            incidentId,
            eventType: transition.timelineEventType,
            actorMembershipId: membershipId,
            occurredAt: now,
            message: transition.timelineMessage ?? `Status transitioned to ${dto.status}`,
            metadata: dto.reason ? { reason: dto.reason } : undefined,
          },
        });
      }
    });

    const summary = await this.getIncidentSummaryById(incidentId, organizationId);
    this.publishRealtime(
      transition.newStatus === 'RESOLVED' ? 'incident.resolved' : 'incident.updated',
      organizationId,
      incidentId,
      summary,
    );
    return summary;
  }

  async resolveIncident(
    organizationId: string,
    incidentId: string,
    membershipId: string,
    dto: ResolveIncidentDto,
  ): Promise<IncidentSummary> {
    if (!dto.resolutionSummary || dto.resolutionSummary.trim().length === 0) {
      throw new BadRequestException('A resolution summary is required to resolve an incident.');
    }

    const incident = await this.prisma.incident.findFirst({
      where: { id: incidentId, organizationId },
    });
    if (!incident) {
      throw new NotFoundException(`Incident ${incidentId} not found in this organization`);
    }

    const now = new Date();
    try {
      transitionIncidentStatus(
        incident.status,
        'RESOLVED',
        {
          resolvedAt: incident.resolvedAt,
        },
        { currentTime: now, reason: dto.resolutionSummary },
      );
    } catch (err) {
      if (err instanceof InvalidIncidentTransitionException) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.incident.update({
        where: { id: incidentId },
        data: {
          status: 'RESOLVED',
          resolvedAt: now,
          summary: dto.resolutionSummary,
        },
      });

      await tx.incidentTimelineEvent.create({
        data: {
          organizationId,
          incidentId,
          eventType: 'RESOLVED',
          actorMembershipId: membershipId,
          occurredAt: now,
          message: `Incident resolved: ${dto.resolutionSummary}`,
          metadata: { resolutionSummary: dto.resolutionSummary },
        },
      });
    });

    const summary = await this.getIncidentSummaryById(incidentId, organizationId);
    this.publishRealtime('incident.resolved', organizationId, incidentId, summary);

    if (this.notificationRouter) {
      this.notificationRouter.routeEvent({
        organizationId,
        eventType: 'incident.resolved',
        sourceModule: 'incidents',
        severity: summary.severity as any,
        serviceId: summary.primaryServiceId ?? undefined,
        environmentId: summary.environmentId ?? undefined,
        title: `Incident Resolved: ${summary.incidentKey} - ${summary.title}`,
        message: dto.resolutionSummary,
        payload: {
          incidentId: summary.id,
          incidentKey: summary.incidentKey,
          resolvedAt: summary.resolvedAt,
          resolutionSummary: dto.resolutionSummary,
        },
        deepLink: `/incidents/${summary.id}`,
      }).catch(() => {});
    }

    return summary;
  }

  async reopenIncident(
    organizationId: string,
    incidentId: string,
    membershipId: string,
    dto: ReopenIncidentDto,
  ): Promise<IncidentSummary> {
    if (!dto.reopenReason || dto.reopenReason.trim().length === 0) {
      throw new BadRequestException('A reason is required to reopen a resolved incident.');
    }

    const incident = await this.prisma.incident.findFirst({
      where: { id: incidentId, organizationId },
    });
    if (!incident) {
      throw new NotFoundException(`Incident ${incidentId} not found in this organization`);
    }

    if (incident.status !== 'RESOLVED') {
      throw new BadRequestException(`Cannot reopen incident with status '${incident.status}'. Only RESOLVED incidents can be reopened.`);
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.incident.update({
        where: { id: incidentId },
        data: {
          status: 'INVESTIGATING',
          reopenedAt: now,
          resolvedAt: null,
        },
      });

      await tx.incidentTimelineEvent.create({
        data: {
          organizationId,
          incidentId,
          eventType: 'REOPENED',
          actorMembershipId: membershipId,
          occurredAt: now,
          message: `Incident reopened: ${dto.reopenReason}`,
          metadata: { reopenReason: dto.reopenReason },
        },
      });
    });

    return this.getIncidentSummaryById(incidentId, organizationId);
  }

  async assignCommander(
    organizationId: string,
    incidentId: string,
    membershipId: string,
    dto: AssignCommanderDto,
  ): Promise<IncidentSummary> {
    const targetMember = await this.prisma.membership.findFirst({
      where: { id: dto.commanderMembershipId, organizationId },
      include: { user: true },
    });
    if (!targetMember) {
      throw new NotFoundException(`Target membership ${dto.commanderMembershipId} not found in organization`);
    }

    const incident = await this.prisma.incident.findFirst({
      where: { id: incidentId, organizationId },
    });
    if (!incident) {
      throw new NotFoundException(`Incident ${incidentId} not found in this organization`);
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.incident.update({
        where: { id: incidentId },
        data: {
          commanderMembershipId: dto.commanderMembershipId,
        },
      });

      // Upsert responder roster
      await tx.incidentResponder.upsert({
        where: {
          incidentId_membershipId: {
            incidentId,
            membershipId: dto.commanderMembershipId,
          },
        },
        create: {
          organizationId,
          incidentId,
          membershipId: dto.commanderMembershipId,
          role: 'COMMANDER',
          joinedAt: now,
        },
        update: {
          role: 'COMMANDER',
          removedAt: null,
        },
      });

      const eventType = incident.commanderMembershipId ? 'COMMANDER_CHANGED' : 'COMMANDER_ASSIGNED';
      await tx.incidentTimelineEvent.create({
        data: {
          organizationId,
          incidentId,
          eventType,
          actorMembershipId: membershipId,
          occurredAt: now,
          message: `Commander assigned: ${targetMember.user.displayName}`,
          metadata: { commanderMembershipId: dto.commanderMembershipId },
        },
      });
    });

    return this.getIncidentSummaryById(incidentId, organizationId);
  }

  async addResponder(
    organizationId: string,
    incidentId: string,
    actorMembershipId: string,
    dto: AddResponderDto,
  ): Promise<IncidentResponderSummary> {
    const targetMember = await this.prisma.membership.findFirst({
      where: { id: dto.membershipId, organizationId },
      include: { user: true },
    });
    if (!targetMember) {
      throw new NotFoundException(`Membership ${dto.membershipId} not found in this organization`);
    }

    const incident = await this.prisma.incident.findFirst({
      where: { id: incidentId, organizationId },
    });
    if (!incident) {
      throw new NotFoundException(`Incident ${incidentId} not found in this organization`);
    }

    const role = dto.role ?? 'RESPONDER';
    const now = new Date();

    const responder = await this.prisma.$transaction(async (tx) => {
      const record = await tx.incidentResponder.upsert({
        where: {
          incidentId_membershipId: {
            incidentId,
            membershipId: dto.membershipId,
          },
        },
        create: {
          organizationId,
          incidentId,
          membershipId: dto.membershipId,
          role,
          joinedAt: now,
        },
        update: {
          role,
          removedAt: null,
        },
        include: {
          membership: { include: { user: true } },
        },
      });

      await tx.incidentTimelineEvent.create({
        data: {
          organizationId,
          incidentId,
          eventType: 'RESPONDER_ADDED',
          actorMembershipId,
          occurredAt: now,
          message: `Responder added: ${targetMember.user.displayName} (${role})`,
          metadata: { responderMembershipId: dto.membershipId, role },
        },
      });

      return record;
    });

    return {
      id: responder.id,
      incidentId: responder.incidentId,
      membershipId: responder.membershipId,
      userName: responder.membership.user.displayName,
      userEmail: responder.membership.user.email,
      role: responder.role,
      joinedAt: responder.joinedAt.toISOString(),
      removedAt: responder.removedAt ? responder.removedAt.toISOString() : null,
    };
  }

  async removeResponder(
    organizationId: string,
    incidentId: string,
    actorMembershipId: string,
    targetMembershipId: string,
  ): Promise<void> {
    const responder = await this.prisma.incidentResponder.findFirst({
      where: { incidentId, membershipId: targetMembershipId, organizationId, removedAt: null },
      include: { membership: { include: { user: true } } },
    });
    if (!responder) {
      throw new NotFoundException(`Active responder ${targetMembershipId} not found on this incident`);
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.incidentResponder.update({
        where: { id: responder.id },
        data: { removedAt: now },
      });

      await tx.incidentTimelineEvent.create({
        data: {
          organizationId,
          incidentId,
          eventType: 'RESPONDER_REMOVED',
          actorMembershipId,
          occurredAt: now,
          message: `Responder removed: ${responder.membership.user.displayName}`,
          metadata: { responderMembershipId: targetMembershipId },
        },
      });
    });
  }

  async addNote(
    organizationId: string,
    incidentId: string,
    membershipId: string,
    dto: AddIncidentNoteDto,
  ): Promise<IncidentTimelineEventSummary> {
    const incident = await this.prisma.incident.findFirst({
      where: { id: incidentId, organizationId },
    });
    if (!incident) {
      throw new NotFoundException(`Incident ${incidentId} not found in this organization`);
    }

    const now = new Date();
    const event = await this.prisma.incidentTimelineEvent.create({
      data: {
        organizationId,
        incidentId,
        eventType: 'NOTE_ADDED',
        actorMembershipId: membershipId,
        occurredAt: now,
        message: dto.note,
      },
      include: {
        actor: { include: { user: true } },
      },
    });

    const result: IncidentTimelineEventSummary = {
      id: event.id,
      incidentId: event.incidentId,
      eventType: event.eventType,
      actorMembershipId: event.actorMembershipId,
      actorName: event.actor?.user.displayName ?? null,
      actorEmail: event.actor?.user.email ?? null,
      occurredAt: event.occurredAt.toISOString(),
      message: event.message,
      metadata: (event.metadata as Record<string, unknown>) ?? null,
    };
    this.publishRealtime('incident.timeline.updated', organizationId, incidentId, result);
    return result;
  }


  async getTimeline(
    organizationId: string,
    incidentId: string,
    limit = 100,
    offset = 0,
  ): Promise<{ events: IncidentTimelineEventSummary[]; total: number }> {
    const incident = await this.prisma.incident.findFirst({
      where: { id: incidentId, organizationId },
    });
    if (!incident) {
      throw new NotFoundException(`Incident ${incidentId} not found in this organization`);
    }

    const [total, records] = await Promise.all([
      this.prisma.incidentTimelineEvent.count({
        where: { incidentId, organizationId },
      }),
      this.prisma.incidentTimelineEvent.findMany({
        where: { incidentId, organizationId },
        include: {
          actor: { include: { user: true } },
        },
        orderBy: { occurredAt: 'asc' },
        take: limit,
        skip: offset,
      }),
    ]);

    return {
      events: records.map((t) => ({
        id: t.id,
        incidentId: t.incidentId,
        eventType: t.eventType,
        actorMembershipId: t.actorMembershipId,
        actorName: t.actor?.user.displayName ?? null,
        actorEmail: t.actor?.user.email ?? null,
        occurredAt: t.occurredAt.toISOString(),
        message: t.message,
        metadata: (t.metadata as Record<string, unknown>) ?? null,
      })),
      total,
    };
  }

  async getAlerts(organizationId: string, incidentId: string): Promise<IncidentAlertSummary[]> {
    const incident = await this.prisma.incident.findFirst({
      where: { id: incidentId, organizationId },
    });
    if (!incident) {
      throw new NotFoundException(`Incident ${incidentId} not found in this organization`);
    }

    const records = await this.prisma.incidentAlert.findMany({
      where: { incidentId, organizationId },
      include: {
        alertRule: true,
        service: true,
        environment: true,
      },
      orderBy: { linkedAt: 'desc' },
    });

    return records.map((a) => ({
      id: a.id,
      incidentId: a.incidentId,
      alertInstanceId: a.alertInstanceId,
      triggerAlertEventId: a.triggerAlertEventId,
      alertRuleId: a.alertRuleId,
      alertRuleName: a.alertRule?.name,
      serviceId: a.serviceId,
      serviceName: a.service?.name,
      environmentId: a.environmentId,
      environmentName: a.environment?.name,
      alertSeverity: a.alertSeverity,
      correlationScore: a.correlationScore,
      correlationReasons: (a.correlationReasons as unknown as IncidentCorrelationReason[]) ?? [],
      linkedAt: a.linkedAt.toISOString(),
      resolvedAt: a.resolvedAt ? a.resolvedAt.toISOString() : null,
      unlinkedAt: a.unlinkedAt ? a.unlinkedAt.toISOString() : null,
      unlinkedByMembershipId: a.unlinkedByMembershipId,
      unlinkReason: a.unlinkReason,
    }));
  }

  async attachAlert(
    organizationId: string,
    incidentId: string,
    membershipId: string,
    dto: AttachAlertDto,
  ): Promise<IncidentAlertSummary> {
    const incident = await this.prisma.incident.findFirst({
      where: { id: incidentId, organizationId },
    });
    if (!incident) {
      throw new NotFoundException(`Incident ${incidentId} not found in this organization`);
    }

    const alertEvent = await this.prisma.alertEvent.findFirst({
      where: { id: dto.alertEventId, organizationId },
      include: {
        alertInstance: true,
        rule: true,
      },
    });
    if (!alertEvent) {
      throw new NotFoundException(`AlertEvent ${dto.alertEventId} not found in this organization`);
    }

    // Check if this episode is already attached anywhere
    const existing = await this.prisma.incidentAlert.findUnique({
      where: { triggerAlertEventId: alertEvent.id },
    });
    if (existing) {
      throw new BadRequestException(`This alert event episode is already attached to incident ${existing.incidentId}`);
    }

    const now = new Date();
    const escalation = evaluateSeverityEscalation(incident.severity, alertEvent.rule.severity);

    const alertLink = await this.prisma.$transaction(async (tx) => {
      const created = await tx.incidentAlert.create({
        data: {
          organizationId,
          incidentId,
          alertInstanceId: alertEvent.alertInstanceId,
          triggerAlertEventId: alertEvent.id,
          alertRuleId: alertEvent.ruleId,
          serviceId: alertEvent.alertInstance.serviceId,
          environmentId: alertEvent.alertInstance.environmentId,
          alertSeverity: alertEvent.rule.severity,
          correlationScore: 100,
          correlationReasons: [
            {
              code: 'SAME_SERVICE',
              score: 100,
              description: dto.reason || 'Manually attached by responder',
            },
          ] as any,
          linkedAt: now,
        },
        include: {
          alertRule: true,
          service: true,
          environment: true,
        },
      });

      await tx.incident.update({
        where: { id: incidentId },
        data: {
          lastSignalAt: now,
          allSignalsClearedAt: null,
          ...(escalation.escalated ? { severity: escalation.newSeverity } : {}),
        },
      });

      await tx.incidentTimelineEvent.create({
        data: {
          organizationId,
          incidentId,
          eventType: 'MANUAL_ALERT_ATTACHED',
          actorMembershipId: membershipId,
          occurredAt: now,
          message: `Alert '${alertEvent.rule.name}' manually attached by responder`,
          metadata: {
            alertRuleId: alertEvent.ruleId,
            alertEventId: alertEvent.id,
            reason: dto.reason,
          },
        },
      });

      if (escalation.escalated) {
        await tx.incidentTimelineEvent.create({
          data: {
            organizationId,
            incidentId,
            eventType: 'SEVERITY_ESCALATED',
            actorMembershipId: membershipId,
            occurredAt: now,
            message: `Severity escalated from ${incident.severity} to ${escalation.newSeverity} by manual alert attachment`,
            metadata: {
              previousSeverity: incident.severity,
              newSeverity: escalation.newSeverity,
            },
          },
        });
      }

      return created;
    });

    return {
      id: alertLink.id,
      incidentId: alertLink.incidentId,
      alertInstanceId: alertLink.alertInstanceId,
      triggerAlertEventId: alertLink.triggerAlertEventId,
      alertRuleId: alertLink.alertRuleId,
      alertRuleName: alertLink.alertRule?.name,
      serviceId: alertLink.serviceId,
      serviceName: alertLink.service?.name,
      environmentId: alertLink.environmentId,
      environmentName: alertLink.environment?.name,
      alertSeverity: alertLink.alertSeverity,
      correlationScore: alertLink.correlationScore,
      correlationReasons: (alertLink.correlationReasons as unknown as IncidentCorrelationReason[]) ?? [],
      linkedAt: alertLink.linkedAt.toISOString(),
      resolvedAt: alertLink.resolvedAt ? alertLink.resolvedAt.toISOString() : null,
      unlinkedAt: null,
      unlinkedByMembershipId: null,
      unlinkReason: null,
    };
  }

  async unlinkAlert(
    organizationId: string,
    incidentId: string,
    incidentAlertId: string,
    membershipId: string,
    dto: UnlinkAlertDto,
  ): Promise<void> {
    const alertLink = await this.prisma.incidentAlert.findFirst({
      where: { id: incidentAlertId, incidentId, organizationId, unlinkedAt: null },
      include: { alertRule: true },
    });
    if (!alertLink) {
      throw new NotFoundException(`Active linked alert ${incidentAlertId} not found on this incident`);
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.incidentAlert.update({
        where: { id: incidentAlertId },
        data: {
          unlinkedAt: now,
          unlinkedByMembershipId: membershipId,
          unlinkReason: dto.reason,
        },
      });

      await tx.incidentTimelineEvent.create({
        data: {
          organizationId,
          incidentId,
          eventType: 'ALERT_UNLINKED',
          actorMembershipId: membershipId,
          occurredAt: now,
          message: `Alert '${alertLink.alertRule?.name}' unlinked: ${dto.reason}`,
          metadata: {
            alertRuleId: alertLink.alertRuleId,
            reason: dto.reason,
          },
        },
      });

      // Re-evaluate if all active alerts are cleared
      const remainingActiveAlerts = await tx.incidentAlert.count({
        where: {
          incidentId,
          unlinkedAt: null,
          resolvedAt: null,
        },
      });

      if (remainingActiveAlerts === 0) {
        await tx.incident.update({
          where: { id: incidentId },
          data: { allSignalsClearedAt: now },
        });

        await tx.incidentTimelineEvent.create({
          data: {
            organizationId,
            incidentId,
            eventType: 'ALL_LINKED_SIGNALS_CLEARED',
            occurredAt: now,
            message: 'All remaining linked signals have cleared following alert unlink',
          },
        });
      }
    });
  }

  async updateSeverity(
    organizationId: string,
    incidentId: string,
    membershipId: string,
    dto: UpdateSeverityDto,
  ): Promise<IncidentSummary> {
    const incident = await this.prisma.incident.findFirst({
      where: { id: incidentId, organizationId },
    });
    if (!incident) {
      throw new NotFoundException(`Incident ${incidentId} not found in this organization`);
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.incident.update({
        where: { id: incidentId },
        data: { severity: dto.severity },
      });

      await tx.incidentTimelineEvent.create({
        data: {
          organizationId,
          incidentId,
          eventType: 'SEVERITY_CHANGED',
          actorMembershipId: membershipId,
          occurredAt: now,
          message: `Severity manually changed from ${incident.severity} to ${dto.severity}: ${dto.reason}`,
          metadata: {
            previousSeverity: incident.severity,
            newSeverity: dto.severity,
            reason: dto.reason,
          },
        },
      });
    });

    const summary = await this.getIncidentSummaryById(incidentId, organizationId);
    this.publishRealtime('incident.severity.updated', organizationId, incidentId, summary);

    if (this.notificationRouter) {
      this.notificationRouter.routeEvent({
        organizationId,
        eventType: 'incident.severity.updated',
        sourceModule: 'incidents',
        severity: summary.severity as any,
        serviceId: summary.primaryServiceId ?? undefined,
        environmentId: summary.environmentId ?? undefined,
        title: `Incident Severity Updated: ${summary.incidentKey} (${summary.severity})`,
        message: `Severity was updated to ${dto.severity}: ${dto.reason}`,
        payload: {
          incidentId: summary.id,
          incidentKey: summary.incidentKey,
          previousSeverity: incident.severity,
          newSeverity: dto.severity,
          reason: dto.reason,
        },
        deepLink: `/incidents/${summary.id}`,
      }).catch(() => {});
    }

    return summary;
  }


  private async getIncidentSummaryById(incidentId: string, organizationId: string): Promise<IncidentSummary> {
    const incident = await this.prisma.incident.findFirst({
      where: { id: incidentId, organizationId },
      include: {
        primaryService: true,
        environment: true,
        commander: { include: { user: true } },
        assignedTeam: true,
        alerts: { where: { unlinkedAt: null } },
      },
    });
    if (!incident) {
      throw new NotFoundException(`Incident ${incidentId} not found in this organization`);
    }
    return this.mapToSummary(incident);
  }

  private mapToSummary(incident: any): IncidentSummary {
    const alerts = incident.alerts ?? [];
    const activeAlertsCount = alerts.filter((a: any) => !a.resolvedAt && !a.unlinkedAt).length;

    return {
      id: incident.id,
      organizationId: incident.organizationId,
      incidentKey: incident.incidentKey,
      title: incident.title,
      summary: incident.summary,
      source: incident.source,
      status: incident.status,
      severity: incident.severity,
      primaryServiceId: incident.primaryServiceId,
      primaryServiceName: incident.primaryService?.name ?? null,
      environmentId: incident.environmentId,
      environmentName: incident.environment?.name ?? null,
      commanderMembershipId: incident.commanderMembershipId,
      commanderName: incident.commander?.user.displayName ?? null,
      commanderEmail: incident.commander?.user.email ?? null,
      assignedTeamId: incident.assignedTeamId,
      assignedTeamName: incident.assignedTeam?.name ?? null,
      createdByMembershipId: incident.createdByMembershipId,
      detectedAt: incident.detectedAt.toISOString(),
      acknowledgedAt: incident.acknowledgedAt ? incident.acknowledgedAt.toISOString() : null,
      investigationStartedAt: incident.investigationStartedAt
        ? incident.investigationStartedAt.toISOString()
        : null,
      mitigatedAt: incident.mitigatedAt ? incident.mitigatedAt.toISOString() : null,
      resolvedAt: incident.resolvedAt ? incident.resolvedAt.toISOString() : null,
      reopenedAt: incident.reopenedAt ? incident.reopenedAt.toISOString() : null,
      lastSignalAt: incident.lastSignalAt.toISOString(),
      allSignalsClearedAt: incident.allSignalsClearedAt
        ? incident.allSignalsClearedAt.toISOString()
        : null,
      activeAlertsCount,
      totalAlertsCount: alerts.length,
      createdAt: incident.createdAt.toISOString(),
      updatedAt: incident.updatedAt.toISOString(),
    };
  }
}
