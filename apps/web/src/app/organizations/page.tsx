'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Users,
  Mail,
  UserPlus,
  Shield,
  Trash2,
  Copy,
  Check,
  AlertCircle,
  Plus,
  Loader2,
  RefreshCw,
  Clock,
  KeyRound,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { api, MemberDetail, ApiError } from '@/lib/api';
import type { InvitationSummary, UserRole } from '@aegisops/types';

export default function OrganizationsPage() {
  const router = useRouter();
  const {
    user,
    memberships,
    activeOrganization,
    currentRole,
    hasAccess,
    switchOrganization,
    refreshAuth,
    isLoading: authLoading,
  } = useAuth();

  // State
  const [members, setMembers] = useState<MemberDetail[]>([]);
  const [invitations, setInvitations] = useState<InvitationSummary[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Create Org Modal
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);

  // Invite Member Form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('ENGINEER');
  const [isInviting, setIsInviting] = useState(false);
  const [latestInviteToken, setLatestInviteToken] = useState<string | null>(null);

  // Direct Accept Invite Token
  const [acceptTokenInput, setAcceptTokenInput] = useState('');
  const [isAcceptingToken, setIsAcceptingToken] = useState(false);

  const canManageMembers = hasAccess('members.role.update');
  const canInviteMembers = hasAccess('members.invite');

  const fetchMembersAndInvites = useCallback(async () => {
    if (!activeOrganization) return;
    setIsLoadingMembers(true);
    setActionError(null);

    try {
      const [membersData, invitesData] = await Promise.all([
        api.memberships.list(activeOrganization.id),
        api.invitations.list(activeOrganization.id),
      ]);
      setMembers(membersData);
      setInvitations(invitesData);
    } catch (err: any) {
      setActionError(err.message || 'Failed to load organization data.');
    } finally {
      setIsLoadingMembers(false);
    }
  }, [activeOrganization]);

  useEffect(() => {
    if (activeOrganization) {
      fetchMembersAndInvites();
    }
  }, [activeOrganization, fetchMembersAndInvites]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (!user) {
    router.push('/login');
    return null;
  }

  // Handlers
  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;

    setIsCreatingOrg(true);
    setActionError(null);
    try {
      const org = await api.organizations.create({ name: newOrgName });
      await refreshAuth();
      switchOrganization(org.id);
      setShowCreateOrg(false);
      setNewOrgName('');
      setActionSuccess(`Organization "${org.name}" initialized successfully!`);
    } catch (err: any) {
      setActionError(err.message || 'Failed to create organization.');
    } finally {
      setIsCreatingOrg(false);
    }
  };

  const handleRoleChange = async (memberId: string, newRole: UserRole) => {
    if (!activeOrganization) return;
    setActionError(null);
    setActionSuccess(null);

    try {
      await api.memberships.updateRole(activeOrganization.id, memberId, newRole);
      setActionSuccess('Member role updated successfully.');
      await fetchMembersAndInvites();
      await refreshAuth();
    } catch (err: any) {
      setActionError(err.message || 'Failed to update member role.');
    }
  };

  const handleRemoveMember = async (memberId: string, memberEmail: string) => {
    if (!activeOrganization) return;
    if (
      !confirm(
        `Are you sure you want to remove ${memberEmail} from this organization?`,
      )
    ) {
      return;
    }

    setActionError(null);
    setActionSuccess(null);

    try {
      await api.memberships.remove(activeOrganization.id, memberId);
      setActionSuccess(`Removed ${memberEmail} from organization.`);
      await fetchMembersAndInvites();
      await refreshAuth();
    } catch (err: any) {
      setActionError(err.message || 'Failed to remove member.');
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrganization || !inviteEmail.trim()) return;

    setIsInviting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await api.invitations.create(activeOrganization.id, {
        email: inviteEmail.trim(),
        role: inviteRole,
      });

      setInviteEmail('');
      if (res.invitationToken) {
        setLatestInviteToken(res.invitationToken);
      }
      setActionSuccess(`Invitation generated for ${res.email}`);
      await fetchMembersAndInvites();
    } catch (err: any) {
      setActionError(err.message || 'Failed to generate invitation.');
    } finally {
      setIsInviting(false);
    }
  };

  const handleRevokeInvite = async (invitationId: string) => {
    if (!activeOrganization) return;
    setActionError(null);

    try {
      await api.invitations.revoke(activeOrganization.id, invitationId);
      setActionSuccess('Invitation revoked.');
      await fetchMembersAndInvites();
    } catch (err: any) {
      setActionError(err.message || 'Failed to revoke invitation.');
    }
  };

  const handleAcceptToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acceptTokenInput.trim()) return;

    setIsAcceptingToken(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await api.invitations.accept(acceptTokenInput.trim());
      setActionSuccess('Accepted invitation successfully! Joined organization.');
      setAcceptTokenInput('');
      await refreshAuth();
      switchOrganization(res.organizationId);
    } catch (err: any) {
      setActionError(err.message || 'Invalid, expired, or mismatched invitation token.');
    } finally {
      setIsAcceptingToken(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center space-x-2">
            <Building2 className="h-5 w-5 text-purple-400" />
            <span>Organization & RBAC Management</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Manage multi-tenant boundaries, roles, team memberships, and secure invites.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={fetchMembersAndInvites}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
            title="Refresh"
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoadingMembers ? 'animate-spin' : ''}`}
            />
          </button>

          <button
            type="button"
            onClick={() => setShowCreateOrg(true)}
            className="px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow"
          >
            <Plus className="h-4 w-4" />
            <span>New Organization</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {actionError && (
        <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs flex items-center space-x-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="p-3 rounded-lg bg-emerald-950/50 border border-emerald-800/60 text-emerald-300 text-xs flex items-center space-x-2">
          <Check className="h-4 w-4 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Active Org Banner */}
      {activeOrganization && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-base font-bold text-slate-100">
                {activeOrganization.name}
              </span>
              <span className="text-xs font-mono text-slate-500 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                slug: {activeOrganization.slug}
              </span>
              <span className="text-xs font-mono text-purple-400 bg-purple-950/60 border border-purple-800/60 px-2 py-0.5 rounded">
                Your Role: {currentRole}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Tenant ID: {activeOrganization.id}
            </p>
          </div>

          {/* Org Switcher Buttons */}
          <div className="flex items-center space-x-2 overflow-x-auto">
            <span className="text-xs text-slate-400 shrink-0">Switch:</span>
            {memberships.map((m) => (
              <button
                key={m.organization.id}
                type="button"
                onClick={() => switchOrganization(m.organization.id)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  m.organization.id === activeOrganization.id
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {m.organization.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Members Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Users className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-slate-200">
              Organization Members ({members.length})
            </h2>
          </div>
          <span className="text-xs text-slate-400">
            {canManageMembers
              ? 'RBAC Management Active'
              : 'View Only (Requires membership:manage)'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 text-slate-400 font-mono uppercase text-[11px]">
              <tr>
                <th className="py-2.5 px-3">Member</th>
                <th className="py-2.5 px-3">Role</th>
                <th className="py-2.5 px-3">Joined</th>
                {canManageMembers && <th className="py-2.5 px-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {members.map((member) => {
                const isCurrentUser = member.userId === user.id;
                return (
                  <tr key={member.id} className="hover:bg-slate-800/40">
                    <td className="py-3 px-3">
                      <div className="flex items-center space-x-3">
                        <div className="h-7 w-7 rounded-full bg-slate-800 border border-slate-700 text-slate-200 flex items-center justify-center font-bold text-xs">
                          {member.user.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-200 flex items-center space-x-1.5">
                            <span>{member.user.displayName}</span>
                            {isCurrentUser && (
                              <span className="text-[10px] text-emerald-400 font-mono">
                                (you)
                              </span>
                            )}
                          </p>
                          <p className="text-slate-400 text-[11px] font-mono">
                            {member.user.email}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      {canManageMembers ? (
                        <select
                          value={member.role}
                          disabled={
                            // Non-owners cannot edit owners, and last owner cannot change self role
                            currentRole !== 'OWNER' && member.role === 'OWNER'
                          }
                          onChange={(e) =>
                            handleRoleChange(member.id, e.target.value as UserRole)
                          }
                          className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-purple-500 disabled:opacity-50"
                        >
                          <option value="OWNER">OWNER</option>
                          <option value="ADMIN">ADMIN</option>
                          <option value="SRE">SRE</option>
                          <option value="ENGINEER">ENGINEER</option>
                          <option value="MANAGER">MANAGER</option>
                          <option value="VIEWER">VIEWER</option>
                        </select>
                      ) : (
                        <span className="font-mono text-slate-300">
                          {member.role}
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">
                      {new Date(member.createdAt).toLocaleDateString()}
                    </td>

                    {canManageMembers && (
                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          disabled={
                            currentRole !== 'OWNER' && member.role === 'OWNER'
                          }
                          onClick={() =>
                            handleRemoveMember(member.id, member.user.email)
                          }
                          className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded transition-colors disabled:opacity-30"
                          title="Remove Member"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invitations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Send Invitation Form */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center space-x-2">
            <UserPlus className="h-4 w-4 text-purple-400" />
            <h3 className="text-sm font-bold text-slate-200">
              Invite Team Member
            </h3>
          </div>

          <p className="text-xs text-slate-400">
            Generate a secure, single-use cryptographic invitation token with a
            7-day TTL.
          </p>

          <form onSubmit={handleSendInvite} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Recipient Email
              </label>
              <div className="relative">
                <Mail className="h-3.5 w-3.5 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="email"
                  required
                  disabled={!canInviteMembers}
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="engineer@company.com"
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Assigned Role
              </label>
              <select
                disabled={!canInviteMembers}
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as UserRole)}
                className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-purple-500 disabled:opacity-50"
              >
                {currentRole === 'OWNER' && <option value="OWNER">OWNER</option>}
                <option value="ADMIN">ADMIN</option>
                <option value="SRE">SRE</option>
                <option value="ENGINEER">ENGINEER</option>
                <option value="MANAGER">MANAGER</option>
                <option value="VIEWER">VIEWER</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={!canInviteMembers || isInviting}
              className="w-full py-2 px-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 transition-colors"
            >
              {isInviting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <span>Generate Invitation Token</span>
              )}
            </button>
          </form>

          {/* Dev/Test Token Display */}
          {latestInviteToken && (
            <div className="mt-4 p-3 rounded-lg bg-purple-950/40 border border-purple-800/60 space-y-2">
              <span className="text-[11px] font-mono text-purple-300 font-semibold block">
                Generated Invite Token (Dev / Testing helper):
              </span>
              <div className="flex items-center justify-between bg-slate-950 p-2 rounded border border-slate-800 text-[11px] font-mono text-slate-200">
                <span className="truncate max-w-[240px]">{latestInviteToken}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(latestInviteToken);
                    setAcceptTokenInput(latestInviteToken);
                  }}
                  className="p-1 hover:text-emerald-400 text-slate-400"
                  title="Copy to Accept Input"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Accept Invite & Pending List */}
        <div className="space-y-6">
          {/* Accept Token Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-3">
            <div className="flex items-center space-x-2">
              <KeyRound className="h-4 w-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-slate-200">
                Accept Invitation Token
              </h3>
            </div>
            <p className="text-xs text-slate-400">
              Paste an invitation token to join an organization under your active
              logged-in email.
            </p>

            <form onSubmit={handleAcceptToken} className="flex gap-2">
              <input
                type="text"
                required
                value={acceptTokenInput}
                onChange={(e) => setAcceptTokenInput(e.target.value)}
                placeholder="Paste invitation token here..."
                className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={isAcceptingToken}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center space-x-1 shrink-0"
              >
                {isAcceptingToken ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <span>Accept</span>
                )}
              </button>
            </form>
          </div>

          {/* Pending Invitations List */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-3">
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4 text-amber-400" />
              <h3 className="text-sm font-bold text-slate-200">
                Pending Invitations ({invitations.length})
              </h3>
            </div>

            {invitations.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-2">
                No pending invitations for this organization.
              </p>
            ) : (
              <div className="divide-y divide-slate-800">
                {invitations.map((inv) => (
                  <div
                    key={inv.id}
                    className="py-2 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="text-slate-200 font-mono">{inv.email}</span>
                      <div className="flex items-center space-x-2 text-[10px] text-slate-400 font-mono">
                        <span>Role: {inv.role}</span>
                        <span>•</span>
                        <span>
                          Expires: {new Date(inv.expiresAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    {canManageMembers && (
                      <button
                        type="button"
                        onClick={() => handleRevokeInvite(inv.id)}
                        className="text-xs text-rose-400 hover:text-rose-300 font-mono"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Org Modal */}
      {showCreateOrg && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-slate-100">
              Create New Organization
            </h3>
            <p className="text-xs text-slate-400">
              You will automatically become the founding OWNER of the new
              organization tenant.
            </p>

            <form onSubmit={handleCreateOrg} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Organization Name
                </label>
                <input
                  type="text"
                  required
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="e.g. SRE Production Team"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateOrg(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingOrg}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white flex items-center space-x-1"
                >
                  {isCreatingOrg ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <span>Create Organization</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
