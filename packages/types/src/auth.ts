import type { UserRole } from './roles';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string | null;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  createdByUserId?: string;
}

export interface MembershipSummary {
  id: string;
  userId: string;
  organizationId: string;
  role: UserRole;
  createdAt: string;
  user?: {
    id: string;
    email: string;
    displayName: string;
  };
  organization?: OrganizationSummary;
}

export interface UserOrganizationMembership {
  id: string;
  role: UserRole;
  organization: OrganizationSummary;
}

export interface AuthMeResponse {
  user: AuthUser;
  memberships: UserOrganizationMembership[];
}

export interface InvitationSummary {
  id: string;
  organizationId: string;
  email: string;
  role: UserRole;
  invitedByUserId: string;
  expiresAt: string;
  createdAt: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  inviteUrl?: string;
}