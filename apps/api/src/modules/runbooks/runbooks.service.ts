import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventPublisher } from '../realtime/realtime-event.publisher';
import { RealtimeRooms } from '@aegisops/types';
import { CreateRunbookDto, UpdateRunbookDto } from '@aegisops/types';

@Injectable()
export class RunbooksService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly realtimePublisher?: RealtimeEventPublisher,
  ) {}

  private publishRealtime(
    type: any,
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

  async getRunbooks(organizationId: string, serviceId?: string): Promise<any[]> {
    const where: any = { organizationId };
    if (serviceId) {
      where.OR = [{ serviceId }, { serviceId: null }];
    }

    const runbooks = await this.prisma.runbook.findMany({
      where,
      include: {
        steps: {
          orderBy: { order: 'asc' },
        },
        service: {
          select: { id: true, name: true, slug: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return runbooks.map((rb) => ({
      ...rb,
      serviceName: rb.service?.name || null,
    }));
  }

  async getRunbookById(organizationId: string, runbookId: string): Promise<any> {
    const runbook = await this.prisma.runbook.findFirst({
      where: { id: runbookId, organizationId },
      include: {
        steps: {
          orderBy: { order: 'asc' },
        },
        service: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    if (!runbook) {
      throw new NotFoundException(`Runbook ${runbookId} not found`);
    }

    return {
      ...runbook,
      serviceName: runbook.service?.name || null,
    };
  }

  async createRunbook(
    organizationId: string,
    membershipId: string,
    dto: CreateRunbookDto,
  ): Promise<any> {
    if (!dto.name || !dto.name.trim()) {
      throw new BadRequestException('Runbook name is required');
    }

    if (!dto.steps || dto.steps.length === 0) {
      throw new BadRequestException('Runbook must have at least one step');
    }

    const runbook = await this.prisma.runbook.create({
      data: {
        organizationId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        serviceId: dto.serviceId || null,
        severity: (dto.severity as any) || null,
        tags: (dto.tags || []) as any,
        createdByMembershipId: membershipId,
        steps: {
          create: dto.steps.map((s, idx) => ({
            order: s.order ?? idx + 1,
            title: s.title.trim(),
            instruction: s.instruction.trim(),
            stepType: (s.stepType as any) || 'CHECK',
            requiresConfirmation: Boolean(s.requiresConfirmation),
          })),
        },
      },
      include: {
        steps: {
          orderBy: { order: 'asc' },
        },
      },
    });

    return runbook;
  }

  async updateRunbook(
    organizationId: string,
    runbookId: string,
    dto: UpdateRunbookDto,
  ): Promise<any> {
    const existing = await this.prisma.runbook.findFirst({
      where: { id: runbookId, organizationId },
    });

    if (!existing) {
      throw new NotFoundException(`Runbook ${runbookId} not found`);
    }

    return await this.prisma.$transaction(async (tx) => {
      if (dto.steps && dto.steps.length > 0) {
        // Replace steps with updated set
        await tx.runbookStep.deleteMany({
          where: { runbookId },
        });

        await tx.runbookStep.createMany({
          data: dto.steps.map((s, idx) => ({
            runbookId,
            order: s.order ?? idx + 1,
            title: s.title.trim(),
            instruction: s.instruction.trim(),
            stepType: (s.stepType as any) || 'CHECK',
            requiresConfirmation: Boolean(s.requiresConfirmation),
          })),
        });
      }

      const updated = await tx.runbook.update({
        where: { id: runbookId },
        data: {
          name: dto.name !== undefined ? dto.name.trim() : undefined,
          description: dto.description !== undefined ? dto.description?.trim() || null : undefined,
          serviceId: dto.serviceId !== undefined ? dto.serviceId || null : undefined,
          severity: dto.severity !== undefined ? (dto.severity as any) || null : undefined,
          tags: dto.tags !== undefined ? (dto.tags as any) : undefined,
          isActive: dto.isActive !== undefined ? dto.isActive : undefined,
        },
        include: {
          steps: {
            orderBy: { order: 'asc' },
          },
        },
      });

      return updated;
    });
  }

  async deleteRunbook(organizationId: string, runbookId: string): Promise<void> {
    const existing = await this.prisma.runbook.findFirst({
      where: { id: runbookId, organizationId },
    });

    if (!existing) {
      throw new NotFoundException(`Runbook ${runbookId} not found`);
    }

    await this.prisma.runbook.delete({
      where: { id: runbookId },
    });
  }

  async startExecution(
    organizationId: string,
    incidentId: string,
    runbookId: string,
    membershipId: string,
  ): Promise<any> {
    const incident = await this.prisma.incident.findFirst({
      where: { id: incidentId, organizationId },
    });
    if (!incident) {
      throw new NotFoundException(`Incident ${incidentId} not found`);
    }

    const runbook = await this.prisma.runbook.findFirst({
      where: { id: runbookId, organizationId },
      include: {
        steps: { orderBy: { order: 'asc' } },
      },
    });
    if (!runbook) {
      throw new NotFoundException(`Runbook ${runbookId} not found`);
    }

    const execution = await this.prisma.runbookExecution.create({
      data: {
        organizationId,
        incidentId,
        runbookId,
        status: 'IN_PROGRESS',
        startedByMembershipId: membershipId,
        steps: {
          create: runbook.steps.map((s) => ({
            runbookStepId: s.id,
            status: 'PENDING',
          })),
        },
      },
      include: {
        runbook: true,
        steps: {
          include: {
            runbookStep: true,
            completedBy: {
              include: { user: { select: { displayName: true, email: true } } },
            },
          },
        },
      },
    });

    // Timeline event
    await this.prisma.incidentTimelineEvent.create({
      data: {
        incidentId,
        organizationId,
        eventType: 'RUNBOOK_STARTED',
        actorMembershipId: membershipId,
        message: `Operational Runbook started: "${runbook.name}" (${runbook.steps.length} steps).`,
      },
    });

    this.publishRealtime('incident.runbook.started', organizationId, incidentId, {
      executionId: execution.id,
      runbookId: runbook.id,
      runbookName: runbook.name,
      status: execution.status,
    });

    return execution;
  }

  async getExecutionsForIncident(
    organizationId: string,
    incidentId: string,
  ): Promise<any[]> {
    return await this.prisma.runbookExecution.findMany({
      where: { organizationId, incidentId },
      orderBy: { createdAt: 'desc' },
      include: {
        runbook: {
          include: {
            steps: { orderBy: { order: 'asc' } },
          },
        },
        startedBy: {
          include: { user: { select: { displayName: true, email: true } } },
        },
        steps: {
          include: {
            runbookStep: true,
            completedBy: {
              include: { user: { select: { displayName: true, email: true } } },
            },
          },
          orderBy: { runbookStep: { order: 'asc' } },
        },
      },
    });
  }

  async completeExecutionStep(
    organizationId: string,
    incidentId: string,
    executionId: string,
    stepId: string,
    membershipId: string,
    note?: string,
  ): Promise<any> {
    const execution = await this.prisma.runbookExecution.findFirst({
      where: { id: executionId, incidentId, organizationId },
      include: {
        runbook: true,
        steps: {
          include: { runbookStep: true },
        },
      },
    });

    if (!execution) {
      throw new NotFoundException(`Runbook execution ${executionId} not found`);
    }

    const execStep = execution.steps.find((s) => s.id === stepId);
    if (!execStep) {
      throw new NotFoundException(`Execution step ${stepId} not found`);
    }

    const now = new Date();

    const updatedStep = await this.prisma.runbookExecutionStep.update({
      where: { id: stepId },
      data: {
        status: 'COMPLETED',
        completedByMembershipId: membershipId,
        completedAt: now,
        note: note || undefined,
      },
      include: {
        runbookStep: true,
        completedBy: {
          include: { user: { select: { displayName: true, email: true } } },
        },
      },
    });

    // Check if all steps in this execution are now completed
    const allSteps = await this.prisma.runbookExecutionStep.findMany({
      where: { executionId },
    });
    const allCompleted = allSteps.every((s) => s.status === 'COMPLETED' || s.status === 'SKIPPED');

    if (allCompleted) {
      await this.prisma.runbookExecution.update({
        where: { id: executionId },
        data: {
          status: 'COMPLETED',
          completedAt: now,
        },
      });

      await this.prisma.incidentTimelineEvent.create({
        data: {
          incidentId,
          organizationId,
          eventType: 'RUNBOOK_COMPLETED',
          actorMembershipId: membershipId,
          message: `Operational Runbook completed: "${execution.runbook?.name}". All ${allSteps.length} steps verified.`,
        },
      });
    }

    this.publishRealtime('incident.runbook.updated', organizationId, incidentId, {
      executionId,
      stepId,
      status: updatedStep.status,
      allCompleted,
    });

    return updatedStep;
  }

  async cancelExecution(
    organizationId: string,
    incidentId: string,
    executionId: string,
    membershipId: string,
  ): Promise<any> {
    const execution = await this.prisma.runbookExecution.findFirst({
      where: { id: executionId, incidentId, organizationId },
    });

    if (!execution) {
      throw new NotFoundException(`Runbook execution ${executionId} not found`);
    }

    const cancelled = await this.prisma.runbookExecution.update({
      where: { id: executionId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
    });

    await this.prisma.incidentTimelineEvent.create({
      data: {
        incidentId,
        organizationId,
        eventType: 'NOTE_ADDED',
        actorMembershipId: membershipId,
        message: `Operational Runbook cancelled.`,
      },
    });

    this.publishRealtime('incident.runbook.updated', organizationId, incidentId, {
      executionId,
      status: 'CANCELLED',
    });

    return cancelled;
  }
}
