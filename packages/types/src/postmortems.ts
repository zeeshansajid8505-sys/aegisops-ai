export type PostmortemStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'ARCHIVED';
export type ActionItemPriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type ActionItemStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface PostmortemActionItemSummary {
  id: string;
  organizationId: string;
  postmortemId: string;
  title: string;
  description: string | null;
  priority: ActionItemPriority;
  status: ActionItemStatus;
  ownerMembershipId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  dueAt: string | null;
  completedAt: string | null;
  createdByMembershipId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PostmortemRevisionSummary {
  id: string;
  organizationId: string;
  postmortemId: string;
  version: number;
  contentSnapshot: {
    title: string;
    summary: string;
    impact: string;
    rootCause: string;
    contributingFactors: string;
    detection: string;
    response: string;
    resolution: string;
    lessonsLearned: string;
    whatWentWell: string;
    whatWentPoorly: string;
    evidenceFingerprint: string;
  };
  changedByMembershipId: string | null;
  changedByName: string | null;
  changeReason: string | null;
  createdAt: string;
}

export interface IncidentPostmortemDetail {
  id: string;
  organizationId: string;
  incidentId: string;
  status: PostmortemStatus;
  version: number;
  title: string;
  summary: string;
  impact: string;
  rootCause: string;
  contributingFactors: string;
  detection: string;
  response: string;
  resolution: string;
  lessonsLearned: string;
  whatWentWell: string;
  whatWentPoorly: string;
  evidenceFingerprint: string;
  generatedBy: string;
  isHumanConfirmedRootCause: boolean;
  confirmedRootCauseSummary: string | null;
  createdByMembershipId: string | null;
  createdByName: string | null;
  approvedByMembershipId: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  actionItems: PostmortemActionItemSummary[];
  revisions?: PostmortemRevisionSummary[];
}

export interface UpdatePostmortemDto {
  title?: string;
  summary?: string;
  impact?: string;
  rootCause?: string;
  contributingFactors?: string;
  detection?: string;
  response?: string;
  resolution?: string;
  lessonsLearned?: string;
  whatWentWell?: string;
  whatWentPoorly?: string;
  changeReason?: string;
}

export interface ApprovePostmortemDto {
  approvalNote?: string;
}

export interface CreatePostmortemActionItemDto {
  title: string;
  description?: string;
  priority?: ActionItemPriority;
  ownerMembershipId?: string;
  dueAt?: string;
}

export interface UpdatePostmortemActionItemDto {
  title?: string;
  description?: string;
  priority?: ActionItemPriority;
  status?: ActionItemStatus;
  ownerMembershipId?: string | null;
  dueAt?: string | null;
}

