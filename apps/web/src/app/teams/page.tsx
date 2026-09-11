'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Plus,
  Trash2,
  UserPlus,
  Shield,
  Server,
  UserCheck,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import type { TeamSummary, TeamRole } from '@aegisops/types';

export default function TeamsPage() {
  const queryClient = useQueryClient();
  const { activeOrganization } = useAuth();
  const orgId = activeOrganization?.id;

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // New Team State
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamSlug, setNewTeamSlug] = useState('');
  const [newTeamDesc, setNewTeamDesc] = useState('');

  // Add Member State
  const [selectedMembershipId, setSelectedMembershipId] = useState('');
  const [selectedTeamRole, setSelectedTeamRole] = useState<TeamRole>('MEMBER');

  // Queries
  const { data: teams, isLoading, error, refetch: refetchTeams } = useQuery({
    queryKey: ['teams', orgId],
    queryFn: () => api.teams.list(orgId!),
    enabled: !!orgId,
  });

  const activeTeamId = selectedTeamId || (teams && teams.length > 0 ? teams[0]!.id : null);

  const { data: activeTeamDetails, refetch: refetchActiveTeam } = useQuery({
    queryKey: ['team-detail', orgId, activeTeamId],
    queryFn: () => api.teams.get(orgId!, activeTeamId!),
    enabled: !!orgId && !!activeTeamId,
  });

  const { data: orgMembers } = useQuery({
    queryKey: ['org-members', orgId],
    queryFn: () => api.memberships.list(orgId!),
    enabled: !!orgId,
  });

  // Mutations
  const createTeamMutation = useMutation({
    mutationFn: () =>
      api.teams.create(orgId!, {
        name: newTeamName.trim(),
        slug: newTeamSlug.trim() || newTeamName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        description: newTeamDesc.trim() || undefined,
      }),
    onSuccess: (created) => {
      setShowCreateModal(false);
      setNewTeamName('');
      setNewTeamSlug('');
      setNewTeamDesc('');
      setSelectedTeamId(created.id);
      refetchTeams();
    },
    onError: (err: any) => {
      setErrorMessage(err?.message || 'Failed to create team');
    },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: (teamId: string) => api.teams.delete(orgId!, teamId),
    onSuccess: () => {
      setSelectedTeamId(null);
      refetchTeams();
    },
    onError: (err: any) => {
      setErrorMessage(err?.message || 'Failed to delete team');
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: () =>
      api.teams.addMember(orgId!, activeTeamId!, {
        membershipId: selectedMembershipId,
        role: selectedTeamRole,
      }),
    onSuccess: () => {
      setShowAddMemberModal(false);
      setSelectedMembershipId('');
      refetchActiveTeam();
      refetchTeams();
    },
    onError: (err: any) => {
      setErrorMessage(err?.message || 'Failed to add team member');
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (membershipId: string) =>
      api.teams.removeMember(orgId!, activeTeamId!, membershipId),
    onSuccess: () => {
      refetchActiveTeam();
      refetchTeams();
    },
    onError: (err: any) => {
      setErrorMessage(err?.message || 'Failed to remove team member');
    },
  });

  if (!orgId) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-center text-slate-400">
        Please select an organization to manage teams.
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center space-x-3">
            <Users className="h-7 w-7 text-indigo-400" />
            <span>Engineering Teams</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Organize engineers and SREs into cross-functional teams with service ownership responsibilities.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" />
          <span>Create Team</span>
        </button>
      </div>

      {errorMessage && (
        <div className="p-3 bg-rose-950/40 border border-rose-800 rounded-lg text-rose-300 text-xs flex items-center justify-between">
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-rose-400 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="h-40 bg-slate-900/60 rounded-xl border border-slate-800 animate-pulse" />
      ) : !teams || teams.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/40 rounded-xl border border-dashed border-slate-800 space-y-4">
          <Users className="h-12 w-12 text-slate-600 mx-auto" />
          <div>
            <h3 className="text-base font-semibold text-slate-300">No Teams Established</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              Create teams to distribute service ownership, on-call accountability, and alert routing.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Create First Team</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Teams List (Left Col) */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
              Teams in Organization ({teams.length})
            </h3>
            <div className="space-y-2">
              {teams.map((t) => {
                const isSelected = t.id === activeTeamId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTeamId(t.id)}
                    className={`w-full text-left p-4 rounded-xl border transition-all flex items-center justify-between group ${
                      isSelected
                        ? 'bg-slate-800/90 border-indigo-500/60 text-slate-100 shadow-md'
                        : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800/40 text-slate-300'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-sm group-hover:text-indigo-300 transition-colors">
                        {t.name}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        {t.slug}
                      </div>
                      <div className="flex items-center space-x-3 text-[11px] text-slate-400 mt-2">
                        <span className="flex items-center space-x-1">
                          <Users className="h-3 w-3 text-slate-500" />
                          <span>{t.memberCount} members</span>
                        </span>
                        <span className="flex items-center space-x-1">
                          <Server className="h-3 w-3 text-slate-500" />
                          <span>{t.ownedServiceCount ?? 0} services</span>
                        </span>
                      </div>
                    </div>
                    <ChevronRight
                      className={`h-4 w-4 transition-colors ${
                        isSelected ? 'text-indigo-400' : 'text-slate-600'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Team Detail (Right 2 Cols) */}
          <div className="lg:col-span-2 space-y-6">
            {activeTeamDetails ? (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-6">
                <div className="flex items-start justify-between border-b border-slate-800 pb-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-100">
                      {activeTeamDetails.name}
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      {activeTeamDetails.description || 'No description provided.'}
                    </p>
                    <div className="flex items-center space-x-4 text-[11px] text-slate-500 mt-2 font-mono">
                      <span>Slug: {activeTeamDetails.slug}</span>
                      <span>•</span>
                      <span>Created {new Date(activeTeamDetails.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setShowAddMemberModal(true)}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors shadow-sm"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      <span>Add Member</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (
                          confirm(
                            `Delete team "${activeTeamDetails.name}"? This cannot be undone.`,
                          )
                        ) {
                          deleteTeamMutation.mutate(activeTeamDetails.id);
                        }
                      }}
                      className="p-1.5 bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-slate-700 rounded-lg transition-colors"
                      title="Delete team"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Team Members List */}
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Team Members ({activeTeamDetails.members?.length ?? 0})
                  </h3>

                  {!activeTeamDetails.members || activeTeamDetails.members.length === 0 ? (
                    <p className="text-xs text-slate-500 italic py-4 text-center">
                      No members assigned to this team yet.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-800/60">
                      {activeTeamDetails.members.map((member) => (
                        <div
                          key={member.id}
                          className="py-3 flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center space-x-3">
                            <div className="h-7 w-7 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs">
                              {member.user.displayName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-semibold text-slate-200">
                                {member.user.displayName}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {member.user.email}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center space-x-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                                member.role === 'LEAD'
                                  ? 'bg-purple-950/80 text-purple-300 border border-purple-800'
                                  : 'bg-slate-800 text-slate-300 border border-slate-700'
                              }`}
                            >
                              {member.role}
                            </span>

                            <button
                              type="button"
                              onClick={() => removeMemberMutation.mutate(member.membershipId)}
                              className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                              title="Remove from team"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 text-xs bg-slate-900/40 rounded-xl border border-slate-800">
                Select a team from the left to view details and members.
              </div>
            )}
          </div>
        </div>
      )}

      {/* CREATE TEAM MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-slate-100">Create New Team</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Team Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Core Infrastructure"
                  value={newTeamName}
                  onChange={(e) => {
                    setNewTeamName(e.target.value);
                    setNewTeamSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
                  }}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Slug
                </label>
                <input
                  type="text"
                  placeholder="core-infrastructure"
                  value={newTeamSlug}
                  onChange={(e) => setNewTeamSlug(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Responsibilities, mission, and scope of this team..."
                  value={newTeamDesc}
                  onChange={(e) => setNewTeamDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-lg text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newTeamName.trim() || createTeamMutation.isPending}
                onClick={() => createTeamMutation.mutate()}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium"
              >
                Create Team
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD TEAM MEMBER MODAL */}
      {showAddMemberModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-slate-100">Add Team Member</h3>
            <p className="text-xs text-slate-400">
              Assign an existing organization member to {activeTeamDetails?.name}.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Member <span className="text-rose-400">*</span>
                </label>
                <select
                  value={selectedMembershipId}
                  onChange={(e) => setSelectedMembershipId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">-- Select Member --</option>
                  {orgMembers?.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.user.displayName} ({m.user.email}) - Org Role: {m.role}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Team Role
                </label>
                <select
                  value={selectedTeamRole}
                  onChange={(e) => setSelectedTeamRole(e.target.value as TeamRole)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="MEMBER">Member (Standard team participant)</option>
                  <option value="LEAD">Lead (Team owner / Tech lead)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowAddMemberModal(false)}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-lg text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedMembershipId || addMemberMutation.isPending}
                onClick={() => addMemberMutation.mutate()}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium"
              >
                Assign Member
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

