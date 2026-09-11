import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EvidenceBuilderService } from './evidence-builder.service';
import { RealtimeEventPublisher } from '../realtime/realtime-event.publisher';
import { RealtimeRooms } from '@aegisops/types';
import type {
  IncidentPostmortemDetail,
  PostmortemActionItemSummary,
  PostmortemRevisionSummary,
  UpdatePostmortemDto,
  ApprovePostmortemDto,
  CreatePostmortemActionItemDto,
  UpdatePostmortemActionItemDto,
  RealtimeEventType,
} from '@aegisops/types';

@Injectable()
export class PostmortemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evidenceBuilder: EvidenceBuilderService,
    private readonly realtimePublisher: RealtimeEventPublisher,
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
        targetRoom: RealtimeRooms.organization(organizationId),
        timestamp: new Date().toISOString(),
        payload: { incidentId, ...payload },
      })
      .catch(() => {});
  }

  /**
   * Retrieves postmortem detail by incidentId.
   */
  async getPostmortem(
    organizationId: string,
    incidentId: string,
  ): Promise<IncidentPostmortemDetail | null> {
    const postmortem: any = await this.prisma.incidentPostmortem.findFirst({
      where: { incidentId, organizationId },
      include: {
        createdBy: { include: { user: true } },
        approvedBy: { include: { user: true } },
        actionItems: {
          include: { owner: { include: { user: true } } },
          orderBy: { createdAt: 'asc' },
        },
        revisions: {
          include: { changedBy: { include: { user: true } } },
          orderBy: { version: 'desc' },
        },
        incident: {
          select: {
            rootCauseSummary: true,
            rootCauseConfirmedAt: true,
            confirmedRootCauseHypothesisId: true,
            confirmedRootCauseHypothesis: { select: { hypothesis: true } },
          },
        },
      },
    });

    if (!postmortem) return null;

    const isHumanConfirmed = Boolean(
      postmortem.incident?.rootCauseConfirmedAt ||
        postmortem.incident?.confirmedRootCauseHypothesisId ||
        postmortem.incident?.rootCauseSummary,
    );

    const confirmedRootCauseSummary =
      postmortem.incident?.rootCauseSummary ||
      postmortem.incident?.confirmedRootCauseHypothesis?.hypothesis ||
      null;

    return {
      id: postmortem.id,
      organizationId: postmortem.organizationId,
      incidentId: postmortem.incidentId,
      status: postmortem.status as any,
      version: postmortem.version,
      title: postmortem.title,
      summary: postmortem.summary,
      impact: postmortem.impact,
      rootCause: postmortem.rootCause,
      contributingFactors: postmortem.contributingFactors,
      detection: postmortem.detection,
      response: postmortem.response,
      resolution: postmortem.resolution,
      lessonsLearned: postmortem.lessonsLearned,
      whatWentWell: postmortem.whatWentWell,
      whatWentPoorly: postmortem.whatWentPoorly,
      evidenceFingerprint: postmortem.evidenceFingerprint,
      generatedBy: postmortem.generatedBy,
      isHumanConfirmedRootCause: isHumanConfirmed,
      confirmedRootCauseSummary,
      createdByMembershipId: postmortem.createdByMembershipId,
      createdByName: postmortem.createdBy?.user?.displayName || null,
      approvedByMembershipId: postmortem.approvedByMembershipId,
      approvedByName: postmortem.approvedBy?.user?.displayName || null,
      approvedAt: postmortem.approvedAt ? postmortem.approvedAt.toISOString() : null,
      createdAt: postmortem.createdAt.toISOString(),
      updatedAt: postmortem.updatedAt.toISOString(),
      actionItems: (postmortem.actionItems || []).map((item: any) => ({
        id: item.id,
        organizationId: item.organizationId,
        postmortemId: item.postmortemId,
        title: item.title,
        description: item.description,
        priority: item.priority as any,
        status: item.status as any,
        ownerMembershipId: item.ownerMembershipId,
        ownerName: item.owner?.user?.displayName || null,
        ownerEmail: item.owner?.user?.email || null,
        dueAt: item.dueAt ? item.dueAt.toISOString() : null,
        completedAt: item.completedAt ? item.completedAt.toISOString() : null,
        createdByMembershipId: item.createdByMembershipId,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      revisions: (postmortem.revisions || []).map((rev: any) => ({
        id: rev.id,
        organizationId: rev.organizationId,
        postmortemId: rev.postmortemId,
        version: rev.version,
        contentSnapshot: rev.contentSnapshot as any,
        changedByMembershipId: rev.changedByMembershipId,
        changedByName: rev.changedBy?.user?.displayName || null,
        changeReason: rev.changeReason,
        createdAt: rev.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Generates a deterministic evidence-grounded postmortem draft.
   */
  async generateDraft(
    organizationId: string,
    incidentId: string,
    membershipId: string,
  ): Promise<IncidentPostmortemDetail> {
    const existing = await this.prisma.incidentPostmortem.findFirst({
      where: { incidentId, organizationId },
    });

    if (existing && existing.status === 'APPROVED') {
      throw new BadRequestException(
        'Cannot regenerate draft for an approved postmortem. Edit it directly to create a new revision.',
      );
    }

    const draft = await this.evidenceBuilder.buildDraftFromIncident(organizationId, incidentId);

    const postmortem = await this.prisma.incidentPostmortem.upsert({
      where: { incidentId },
      create: {
        organizationId,
        incidentId,
        status: 'DRAFT',
        version: 1,
        title: draft.title,
        summary: draft.summary,
        impact: draft.impact,
        rootCause: draft.rootCause,
        contributingFactors: draft.contributingFactors,
        detection: draft.detection,
        response: draft.response,
        resolution: draft.resolution,
        lessonsLearned: draft.lessonsLearned,
        whatWentWell: draft.whatWentWell,
        whatWentPoorly: draft.whatWentPoorly,
        evidenceFingerprint: draft.evidenceFingerprint,
        generatedBy: 'DETERMINISTIC',
        createdByMembershipId: membershipId,
      },
      update: {
        title: draft.title,
        summary: draft.summary,
        impact: draft.impact,
        rootCause: draft.rootCause,
        contributingFactors: draft.contributingFactors,
        detection: draft.detection,
        response: draft.response,
        resolution: draft.resolution,
        lessonsLearned: draft.lessonsLearned,
        whatWentWell: draft.whatWentWell,
        whatWentPoorly: draft.whatWentPoorly,
        evidenceFingerprint: draft.evidenceFingerprint,
        updatedAt: new Date(),
      },
    });

    this.publishRealtime('postmortem.created', organizationId, incidentId, {
      postmortemId: postmortem.id,
    });

    return (await this.getPostmortem(organizationId, incidentId))!;
  }

  /**
   * Updates postmortem content.
   * If postmortem is APPROVED, archives previous version in PostmortemRevision,
   * increments version, and resets status to IN_REVIEW.
   */
  async updatePostmortem(
    organizationId: string,
    incidentId: string,
    membershipId: string,
    dto: UpdatePostmortemDto,
  ): Promise<IncidentPostmortemDetail> {
    const existing = await this.prisma.incidentPostmortem.findFirst({
      where: { incidentId, organizationId },
    });

    if (!existing) {
      throw new NotFoundException(`Postmortem for incident ${incidentId} not found`);
    }

    let nextVersion = existing.version;
    let nextStatus = existing.status;
    let approvedByMembershipId = existing.approvedByMembershipId;
    let approvedAt = existing.approvedAt;

    // Mutation safety: If previously approved, archive revision snapshot & bump version
    if (existing.status === 'APPROVED') {
      await this.prisma.postmortemRevision.create({
        data: {
          organizationId,
          postmortemId: existing.id,
          version: existing.version,
          contentSnapshot: {
            title: existing.title,
            summary: existing.summary,
            impact: existing.impact,
            rootCause: existing.rootCause,
            contributingFactors: existing.contributingFactors,
            detection: existing.detection,
            response: existing.response,
            resolution: existing.resolution,
            lessonsLearned: existing.lessonsLearned,
            whatWentWell: existing.whatWentWell,
            whatWentPoorly: existing.whatWentPoorly,
            evidenceFingerprint: existing.evidenceFingerprint,
          },
          changedByMembershipId: membershipId,
          changeReason: dto.changeReason || 'Revision bumped due to post-approval modification',
        },
      });

      nextVersion = existing.version + 1;
      nextStatus = 'IN_REVIEW';
      approvedByMembershipId = null;
      approvedAt = null;
    }

    await this.prisma.incidentPostmortem.update({
      where: { id: existing.id },
      data: {
        version: nextVersion,
        status: nextStatus,
        approvedByMembershipId,
        approvedAt,
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.summary !== undefined ? { summary: dto.summary } : {}),
        ...(dto.impact !== undefined ? { impact: dto.impact } : {}),
        ...(dto.rootCause !== undefined ? { rootCause: dto.rootCause } : {}),
        ...(dto.contributingFactors !== undefined ? { contributingFactors: dto.contributingFactors } : {}),
        ...(dto.detection !== undefined ? { detection: dto.detection } : {}),
        ...(dto.response !== undefined ? { response: dto.response } : {}),
        ...(dto.resolution !== undefined ? { resolution: dto.resolution } : {}),
        ...(dto.lessonsLearned !== undefined ? { lessonsLearned: dto.lessonsLearned } : {}),
        ...(dto.whatWentWell !== undefined ? { whatWentWell: dto.whatWentWell } : {}),
        ...(dto.whatWentPoorly !== undefined ? { whatWentPoorly: dto.whatWentPoorly } : {}),
        updatedAt: new Date(),
      },
    });

    this.publishRealtime('postmortem.updated', organizationId, incidentId, {
      postmortemId: existing.id,
      version: nextVersion,
      status: nextStatus,
    });

    return (await this.getPostmortem(organizationId, incidentId))!;
  }

  /**
   * Submits postmortem for peer review (DRAFT -> IN_REVIEW).
   */
  async submitForReview(
    organizationId: string,
    incidentId: string,
    _membershipId: string,
  ): Promise<IncidentPostmortemDetail> {
    const existing = await this.prisma.incidentPostmortem.findFirst({
      where: { incidentId, organizationId },
    });

    if (!existing) {
      throw new NotFoundException(`Postmortem for incident ${incidentId} not found`);
    }

    if (existing.status === 'APPROVED') {
      throw new BadRequestException('Postmortem is already approved');
    }

    await this.prisma.incidentPostmortem.update({
      where: { id: existing.id },
      data: {
        status: 'IN_REVIEW',
        updatedAt: new Date(),
      },
    });

    this.publishRealtime('postmortem.updated', organizationId, incidentId, {
      postmortemId: existing.id,
      status: 'IN_REVIEW',
    });

    return (await this.getPostmortem(organizationId, incidentId))!;
  }

  /**
   * Approves postmortem. Human-only workflow restricted to SRE/Admin/Owner roles.
   * Creates an immutable revision record and marks status APPROVED.
   */
  async approvePostmortem(
    organizationId: string,
    incidentId: string,
    membershipId: string,
    dto: ApprovePostmortemDto,
  ): Promise<IncidentPostmortemDetail> {
    const existing = await this.prisma.incidentPostmortem.findFirst({
      where: { incidentId, organizationId },
    });

    if (!existing) {
      throw new NotFoundException(`Postmortem for incident ${incidentId} not found`);
    }

    // Seal revision snapshot upon approval
    await this.prisma.postmortemRevision.create({
      data: {
        organizationId,
        postmortemId: existing.id,
        version: existing.version,
        contentSnapshot: {
          title: existing.title,
          summary: existing.summary,
          impact: existing.impact,
          rootCause: existing.rootCause,
          contributingFactors: existing.contributingFactors,
          detection: existing.detection,
          response: existing.response,
          resolution: existing.resolution,
          lessonsLearned: existing.lessonsLearned,
          whatWentWell: existing.whatWentWell,
          whatWentPoorly: existing.whatWentPoorly,
          evidenceFingerprint: existing.evidenceFingerprint,
        },
        changedByMembershipId: membershipId,
        changeReason: dto.approvalNote || 'Approved by authorized operator',
      },
    });

    await this.prisma.incidentPostmortem.update({
      where: { id: existing.id },
      data: {
        status: 'APPROVED',
        approvedByMembershipId: membershipId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    this.publishRealtime('postmortem.approved', organizationId, incidentId, {
      postmortemId: existing.id,
      approvedByMembershipId: membershipId,
    });

    return (await this.getPostmortem(organizationId, incidentId))!;
  }

  /**
   * Lists historical revisions for a postmortem.
   */
  async getRevisions(
    organizationId: string,
    incidentId: string,
  ): Promise<PostmortemRevisionSummary[]> {
    const postmortem = await this.prisma.incidentPostmortem.findFirst({
      where: { incidentId, organizationId },
      select: { id: true },
    });

    if (!postmortem) {
      throw new NotFoundException(`Postmortem for incident ${incidentId} not found`);
    }

    const revisions = await this.prisma.postmortemRevision.findMany({
      where: { postmortemId: postmortem.id, organizationId },
      include: { changedBy: { include: { user: true } } },
      orderBy: { version: 'desc' },
    });

    return revisions.map((rev) => ({
      id: rev.id,
      organizationId: rev.organizationId,
      postmortemId: rev.postmortemId,
      version: rev.version,
      contentSnapshot: rev.contentSnapshot as any,
      changedByMembershipId: rev.changedByMembershipId,
      changedByName: rev.changedBy?.user?.displayName || null,
      changeReason: rev.changeReason,
      createdAt: rev.createdAt.toISOString(),
    }));
  }

  // ==========================================
  // Action Items CRUD
  // ==========================================

  async createActionItem(
    organizationId: string,
    incidentId: string,
    membershipId: string,
    dto: CreatePostmortemActionItemDto,
  ): Promise<PostmortemActionItemSummary> {
    const postmortem = await this.prisma.incidentPostmortem.findFirst({
      where: { incidentId, organizationId },
      select: { id: true },
    });

    if (!postmortem) {
      throw new NotFoundException(`Postmortem for incident ${incidentId} not found`);
    }

    const actionItem = await this.prisma.postmortemActionItem.create({
      data: {
        organizationId,
        postmortemId: postmortem.id,
        title: dto.title,
        description: dto.description || null,
        priority: dto.priority || 'MEDIUM',
        status: 'OPEN',
        ownerMembershipId: dto.ownerMembershipId || null,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        createdByMembershipId: membershipId,
      },
      include: {
        owner: { include: { user: true } },
      },
    });

    this.publishRealtime('postmortem.action-item.updated', organizationId, incidentId, {
      actionItemId: actionItem.id,
      action: 'created',
    });

    return {
      id: actionItem.id,
      organizationId: actionItem.organizationId,
      postmortemId: actionItem.postmortemId,
      title: actionItem.title,
      description: actionItem.description,
      priority: actionItem.priority as any,
      status: actionItem.status as any,
      ownerMembershipId: actionItem.ownerMembershipId,
      ownerName: actionItem.owner?.user?.displayName || null,
      ownerEmail: actionItem.owner?.user?.email || null,
      dueAt: actionItem.dueAt ? actionItem.dueAt.toISOString() : null,
      completedAt: null,
      createdByMembershipId: actionItem.createdByMembershipId,
      createdAt: actionItem.createdAt.toISOString(),
      updatedAt: actionItem.updatedAt.toISOString(),
    };
  }

  async updateActionItem(
    organizationId: string,
    incidentId: string,
    actionItemId: string,
    dto: UpdatePostmortemActionItemDto,
  ): Promise<PostmortemActionItemSummary> {
    const item = await this.prisma.postmortemActionItem.findFirst({
      where: { id: actionItemId, organizationId },
    });

    if (!item) {
      throw new NotFoundException(`Action item ${actionItemId} not found`);
    }

    let completedAt = item.completedAt;
    if (dto.status === 'COMPLETED' && item.status !== 'COMPLETED') {
      completedAt = new Date();
    } else if (dto.status && dto.status !== 'COMPLETED') {
      completedAt = null;
    }

    const updated = await this.prisma.postmortemActionItem.update({
      where: { id: actionItemId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.status !== undefined ? { status: dto.status, completedAt } : {}),
        ...(dto.ownerMembershipId !== undefined ? { ownerMembershipId: dto.ownerMembershipId } : {}),
        ...(dto.dueAt !== undefined ? { dueAt: dto.dueAt ? new Date(dto.dueAt) : null } : {}),
        updatedAt: new Date(),
      },
      include: {
        owner: { include: { user: true } },
      },
    });

    this.publishRealtime('postmortem.action-item.updated', organizationId, incidentId, {
      actionItemId: updated.id,
      action: 'updated',
    });

    return {
      id: updated.id,
      organizationId: updated.organizationId,
      postmortemId: updated.postmortemId,
      title: updated.title,
      description: updated.description,
      priority: updated.priority as any,
      status: updated.status as any,
      ownerMembershipId: updated.ownerMembershipId,
      ownerName: updated.owner?.user?.displayName || null,
      ownerEmail: updated.owner?.user?.email || null,
      dueAt: updated.dueAt ? updated.dueAt.toISOString() : null,
      completedAt: updated.completedAt ? updated.completedAt.toISOString() : null,
      createdByMembershipId: updated.createdByMembershipId,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async deleteActionItem(
    organizationId: string,
    incidentId: string,
    actionItemId: string,
  ): Promise<void> {
    const item = await this.prisma.postmortemActionItem.findFirst({
      where: { id: actionItemId, organizationId },
    });

    if (!item) {
      throw new NotFoundException(`Action item ${actionItemId} not found`);
    }

    await this.prisma.postmortemActionItem.delete({
      where: { id: actionItemId },
    });

    this.publishRealtime('postmortem.action-item.updated', organizationId, incidentId, {
      actionItemId,
      action: 'deleted',
    });
  }
}

