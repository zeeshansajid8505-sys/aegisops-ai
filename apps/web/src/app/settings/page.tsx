'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2,
  Users,
  User,
  Shield,
  Plus,
  Mail,
  Trash2,
  Check,
  Copy,
  RefreshCw,
  LogOut,
  Lock,
  Layers,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  FileText,
  Globe,
  Bell,
  History,
  SlidersHorizontal,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { api, MemberDetail, ApiError } from '@/lib/api';
import type { InvitationSummary, UserRole, TeamSummary, Runbook, RunbookStepType } from '@aegisops/types';
import {
  pageTransitionVariants,
  staggerContainerVariants,
  staggerItemVariants,
} from '@/lib/motion';
import { IntegrationsTab } from '@/components/settings/IntegrationsTab';
import { NotificationPoliciesTab } from '@/components/settings/NotificationPoliciesTab';
import { DeliveryHistoryTab } from '@/components/settings/DeliveryHistoryTab';
import { NotificationPreferencesTab } from '@/components/settings/NotificationPreferencesTab';

type SettingsTab =
  | 'organization'
  | 'members'
  | 'teams'
  | 'runbooks'
  | 'integrations'
  | 'policies'
  | 'deliveries'
  | 'preferences'
  | 'profile'
  | 'security';

function SettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as SettingsTab) || 'organization';

  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  const {
    user,
    memberships,
    activeOrganization,
    currentRole,
    hasAccess,
    switchOrganization,
    refreshAuth,
    logout,
    logoutAll,
    isLoading: authLoading,
  } = useAuth();

  // Organization & Members State
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

  // Teams State
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [isLoadingTeams, setIsLoadingTeams] = useState(false);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDescription, setNewTeamDescription] = useState('');
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);

  // Runbooks State
  const [runbooks, setRunbooks] = useState<Runbook[]>([]);
  const [isLoadingRunbooks, setIsLoadingRunbooks] = useState(false);
  const [showCreateRunbook, setShowCreateRunbook] = useState(false);
  const [servicesList, setServicesList] = useState<{ id: string; name: string }[]>([]);
  const [newRunbookName, setNewRunbookName] = useState('');
  const [newRunbookDesc, setNewRunbookDesc] = useState('');
  const [newRunbookServiceId, setNewRunbookServiceId] = useState('');
  const [newRunbookSeverity, setNewRunbookSeverity] = useState('');
  const [newRunbookSteps, setNewRunbookSteps] = useState<
    { title: string; instruction: string; stepType: RunbookStepType }[]
  >([{ title: '', instruction: '', stepType: 'CHECK' }]);
  const [isCreatingRunbook, setIsCreatingRunbook] = useState(false);

  // Security State
  const [revokingAll, setRevokingAll] = useState(false);

  const canManageMembers = hasAccess('members.role.update');

  const fetchMembersAndInvites = async () => {
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
      setActionError(err?.message || 'Failed to load organization members');
    } finally {
      setIsLoadingMembers(false);
    }
  };

  const fetchTeams = async () => {
    if (!activeOrganization) return;
    setIsLoadingTeams(true);
    try {
      const data = await api.teams.list(activeOrganization.id);
      setTeams(data);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to load teams');
    } finally {
      setIsLoadingTeams(false);
    }
  };

  const fetchRunbooks = async () => {
    if (!activeOrganization) return;
    setIsLoadingRunbooks(true);
    try {
      const [rbs, svcsRes] = await Promise.all([
        api.runbooks.getRunbooks(activeOrganization.id),
        api.services.list(activeOrganization.id, { pageSize: 100 } as any).catch(() => ({ items: [] })),
      ]);
      setRunbooks(rbs);
      setServicesList(svcsRes.items || []);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to load runbooks');
    } finally {
      setIsLoadingRunbooks(false);
    }
  };

  useEffect(() => {
    if (activeOrganization) {
      fetchMembersAndInvites();
      fetchTeams();
      if (activeTab === 'organization' || activeTab === 'members') {
        fetchMembersAndInvites();
      } else if (activeTab === 'teams') {
        fetchTeams();
      } else if (activeTab === 'runbooks') {
        fetchRunbooks();
      }
    }
  }, [activeOrganization?.id, activeTab]);

  const handleTabChange = (tab: SettingsTab) => {
    setActiveTab(tab);
    router.replace(`/settings?tab=${tab}`);
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setIsCreatingOrg(true);
    setActionError(null);
    try {
      const newOrg = await api.organizations.create({ name: newOrgName.trim() });
      await refreshAuth();
      switchOrganization(newOrg.id);
      setShowCreateOrg(false);
      setNewOrgName('');
      setActionSuccess(`Created organization "${newOrg.name}" successfully.`);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to create organization');
    } finally {
      setIsCreatingOrg(false);
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !activeOrganization) return;
    setIsInviting(true);
    setActionError(null);
    try {
      const result = await api.invitations.create(activeOrganization.id, {
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      if (result.invitationToken) {
        setLatestInviteToken(result.invitationToken);
      }
      setInviteEmail('');
      setActionSuccess(`Invitation sent to ${result.email}`);
      fetchMembersAndInvites();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to invite member');
    } finally {
      setIsInviting(false);
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim() || !activeOrganization) return;
    setIsCreatingTeam(true);
    setActionError(null);
    try {
      await api.teams.create(activeOrganization.id, {
        name: newTeamName.trim(),
        description: newTeamDescription.trim() || undefined,
      });
      setShowCreateTeam(false);
      setNewTeamName('');
      setNewTeamDescription('');
      setActionSuccess('Team created successfully');
      fetchTeams();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to create team');
    } finally {
      setIsCreatingTeam(false);
    }
  };

  const handleLogoutAll = async () => {
    if (!confirm('Invalidate all active sessions across all devices?')) return;
    setRevokingAll(true);
    try {
      await logoutAll();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to revoke sessions');
    } finally {
      setRevokingAll(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex items-center space-x-3 text-slate-400">
          <RefreshCw className="h-5 w-5 animate-spin text-emerald-400" />
          <span className="text-sm">Loading settings...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <Lock className="h-10 w-10 text-slate-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-100">Authentication Required</h2>
        <p className="text-xs text-slate-400 mt-1 mb-4">
          Please log in to access organization and security settings.
        </p>
        <button
          onClick={() => router.push('/login')}
          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-lg"
        >
          Sign In
        </button>
      </div>
    );
  }

  const handleAddStep = () => {
    setNewRunbookSteps([
      ...newRunbookSteps,
      { title: '', instruction: '', stepType: 'CHECK' },
    ]);
  };

  const handleStepChange = (
    index: number,
    field: 'title' | 'instruction' | 'stepType',
    value: string,
  ) => {
    const updated = [...newRunbookSteps];
    updated[index] = { ...updated[index], [field]: value };
    setNewRunbookSteps(updated);
  };

  const handleRemoveStep = (index: number) => {
    if (newRunbookSteps.length <= 1) return;
    setNewRunbookSteps(newRunbookSteps.filter((_, i) => i !== index));
  };

  const handleCreateRunbook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRunbookName.trim() || !activeOrganization) return;
    setIsCreatingRunbook(true);
    setActionError(null);
    try {
      await api.runbooks.createRunbook(activeOrganization.id, {
        name: newRunbookName.trim(),
        description: newRunbookDesc.trim() || undefined,
        serviceId: newRunbookServiceId || undefined,
        severity: newRunbookSeverity || undefined,
        steps: newRunbookSteps.map((s, idx) => ({
          order: idx + 1,
          title: s.title.trim() || `Step ${idx + 1}`,
          instruction: s.instruction.trim() || 'Execute step validation',
          stepType: s.stepType,
        })),
      });
      setShowCreateRunbook(false);
      setNewRunbookName('');
      setNewRunbookDesc('');
      setNewRunbookServiceId('');
      setNewRunbookSeverity('');
      setNewRunbookSteps([{ title: '', instruction: '', stepType: 'CHECK' }]);
      setActionSuccess('Runbook template created successfully');
      fetchRunbooks();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to create runbook');
    } finally {
      setIsCreatingRunbook(false);
    }
  };

  const handleDeleteRunbook = async (runbookId: string) => {
    if (!confirm('Are you sure you want to delete this runbook?')) return;
    if (!activeOrganization) return;
    try {
      await api.runbooks.deleteRunbook(activeOrganization.id, runbookId);
      setActionSuccess('Runbook template deleted');
      fetchRunbooks();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to delete runbook');
    }
  };

  const tabs = [
    { id: 'organization', label: 'Organization', icon: Building2 },
    { id: 'members', label: 'Members & Access', icon: Users },
    { id: 'teams', label: 'Teams', icon: Layers },
    { id: 'runbooks', label: 'Runbooks', icon: FileText },
    { id: 'integrations', label: 'Integrations', icon: Globe },
    { id: 'policies', label: 'Notification Policies', icon: Bell },
    { id: 'deliveries', label: 'Delivery History', icon: History },
    { id: 'preferences', label: 'Notification Preferences', icon: SlidersHorizontal },
    { id: 'profile', label: 'User Profile', icon: User },
    { id: 'security', label: 'Security & Sessions', icon: Shield },
  ];

  return (
    <motion.div
      variants={pageTransitionVariants}
      initial="initial"
      animate="animate"
      className="space-y-6"
    >
      {/* Header */}
      <div className="border-b border-slate-800 pb-4">
        <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Settings</h1>
        <p className="text-xs text-slate-400 mt-1">
          Manage organization workspace, team memberships, role-based access, and account security.
        </p>
      </div>

      {/* Notifications */}
      {actionSuccess && (
        <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-slate-400 hover:text-slate-200">
            ×
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-4 w-4 text-rose-400" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-slate-400 hover:text-slate-200">
            ×
          </button>
        </div>
      )}

      {/* Settings Navigation Tabs */}
      <div className="flex items-center space-x-1 border-b border-slate-800 pb-1 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id as SettingsTab)}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-slate-800 text-emerald-400 border border-slate-700/80 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content Panes */}
      <div className="pt-2">
        {/* Tab 1: Organization */}
        {activeTab === 'organization' && (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-slate-200">Current Organization Details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
                <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                  <span className="text-[10px] text-slate-500 uppercase block">Name</span>
                  <span className="text-slate-200 font-semibold">{activeOrganization?.name}</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                  <span className="text-[10px] text-slate-500 uppercase block">Slug</span>
                  <span className="text-slate-200">/{activeOrganization?.slug}</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                  <span className="text-[10px] text-slate-500 uppercase block">Your Role</span>
                  <span className="text-emerald-400 font-semibold">{currentRole}</span>
                </div>
              </div>
            </div>

            {/* Organizations Switcher Table */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-200">Accessible Workspaces</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Switch between multi-tenant environments or create a new organization.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateOrg(true)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>New Organization</span>
                </button>
              </div>

              <div className="rounded-lg border border-slate-800 divide-y divide-slate-800/60 overflow-hidden">
                {memberships.map((m) => {
                  const isCurrent = m.organization.id === activeOrganization?.id;
                  return (
                    <div
                      key={m.id}
                      className="p-3 hover:bg-slate-800/30 transition-colors flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-semibold text-slate-200">{m.organization.name}</span>
                        <span className="text-[10px] text-slate-500 font-mono ml-2">
                          /{m.organization.slug}
                        </span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          {m.role}
                        </span>
                        {isCurrent ? (
                          <span className="text-emerald-400 font-medium text-[11px] flex items-center space-x-1">
                            <Check className="h-3 w-3" />
                            <span>Active</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => switchOrganization(m.organization.id)}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] border border-slate-700"
                          >
                            Switch
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Create Org Modal */}
            {showCreateOrg && (
              <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
                  <h3 className="text-sm font-semibold text-slate-100">Create New Organization</h3>
                  <form onSubmit={handleCreateOrg} className="space-y-4">
                    <div>
                      <label className="text-[11px] font-medium text-slate-400 block mb-1">
                        Organization Name
                      </label>
                      <input
                        type="text"
                        required
                        value={newOrgName}
                        onChange={(e) => setNewOrgName(e.target.value)}
                        placeholder="e.g., Acme Cloud Platform"
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-xs focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex justify-end space-x-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowCreateOrg(false)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isCreatingOrg}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs disabled:opacity-50"
                      >
                        {isCreatingOrg ? 'Creating...' : 'Create'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Members & Access */}
        {activeTab === 'members' && (
          <div className="space-y-6">
            {/* Invite Member Section */}
            {canManageMembers && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
                <h2 className="text-sm font-semibold text-slate-200">Invite Team Member</h2>
                <form onSubmit={handleInviteMember} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <input
                      type="email"
                      required
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="colleague@company.com"
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-xs focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex space-x-2">
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as UserRole)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-xs focus:border-emerald-500 focus:outline-none flex-1"
                    >
                      <option value="SRE">SRE</option>
                      <option value="ENGINEER">ENGINEER</option>
                      <option value="ADMIN">ADMIN</option>
                      <option value="MANAGER">MANAGER</option>
                      <option value="VIEWER">VIEWER</option>
                    </select>
                    <button
                      type="submit"
                      disabled={isInviting}
                      className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs disabled:opacity-50 flex-shrink-0"
                    >
                      {isInviting ? 'Inviting...' : 'Invite'}
                    </button>
                  </div>
                </form>

                {latestInviteToken && (
                  <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700 text-xs flex items-center justify-between">
                    <span className="font-mono text-slate-300 truncate mr-2">Token: {latestInviteToken}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(latestInviteToken);
                        setActionSuccess('Invite token copied to clipboard');
                      }}
                      className="text-emerald-400 hover:text-emerald-300 flex items-center space-x-1 flex-shrink-0"
                    >
                      <Copy className="h-3 w-3" />
                      <span>Copy</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Members List */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-slate-200">Organization Members ({members.length})</h2>
              <div className="rounded-lg border border-slate-800 divide-y divide-slate-800/60 overflow-hidden">
                {isLoadingMembers ? (
                  <div className="p-6 text-center text-xs text-slate-500">Loading members...</div>
                ) : (
                  members.map((m) => (
                    <div
                      key={m.id}
                      className="p-3 hover:bg-slate-800/30 transition-colors flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-medium text-slate-200">{m.user.displayName}</span>
                        <span className="text-[11px] text-slate-400 ml-2">{m.user.email}</span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        {m.role}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Teams */}
        {activeTab === 'teams' && (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-200">Functional SRE & Engineering Teams</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Teams own services, receive incident routing, and coordinate response.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateTeam(true)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Create Team</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {isLoadingTeams ? (
                  <div className="col-span-full p-6 text-center text-xs text-slate-500">Loading teams...</div>
                ) : teams.length === 0 ? (
                  <div className="col-span-full p-6 text-center text-xs text-slate-500">No teams created yet.</div>
                ) : (
                  teams.map((team) => (
                    <div
                      key={team.id}
                      className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-2 flex flex-col justify-between"
                    >
                      <div>
                        <span className="font-semibold text-slate-200 text-xs">{team.name}</span>
                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                          {team.description || 'No description provided.'}
                        </p>
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-2 border-t border-slate-700/40">
                        <span>{team.memberCount} member{team.memberCount === 1 ? '' : 's'}</span>
                        <span>{team.ownedServiceCount ?? 0} service{team.ownedServiceCount === 1 ? '' : 's'}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Create Team Modal */}
            {showCreateTeam && (
              <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
                  <h3 className="text-sm font-semibold text-slate-100">Create New Team</h3>
                  <form onSubmit={handleCreateTeam} className="space-y-4">
                    <div>
                      <label className="text-[11px] font-medium text-slate-400 block mb-1">
                        Team Name
                      </label>
                      <input
                        type="text"
                        required
                        value={newTeamName}
                        onChange={(e) => setNewTeamName(e.target.value)}
                        placeholder="e.g., Core Infrastructure SRE"
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-xs focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-slate-400 block mb-1">
                        Description (Optional)
                      </label>
                      <textarea
                        rows={2}
                        value={newTeamDescription}
                        onChange={(e) => setNewTeamDescription(e.target.value)}
                        placeholder="Team charter and on-call scope..."
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-xs focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex justify-end space-x-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowCreateTeam(false)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isCreatingTeam}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs disabled:opacity-50"
                      >
                        {isCreatingTeam ? 'Creating...' : 'Create'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 4: User Profile */}
        {activeTab === 'profile' && (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-slate-200">Account Information</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
                <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                  <span className="text-[10px] text-slate-500 uppercase block">Display Name</span>
                  <span className="text-slate-200 font-semibold">{user.displayName}</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                  <span className="text-[10px] text-slate-500 uppercase block">Email Address</span>
                  <span className="text-slate-200">{user.email}</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                  <span className="text-[10px] text-slate-500 uppercase block">User Identifier</span>
                  <span className="text-slate-400 text-[10px]">{user.id}</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                  <span className="text-[10px] text-slate-500 uppercase block">Account Status</span>
                  <span className="text-emerald-400 font-semibold">Active</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Runbooks */}
        {activeTab === 'runbooks' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-200">
                  Operational Remediation Runbooks ({runbooks.length})
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Pre-approved step-by-step checklists for human operators during incident triage and resolution.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateRunbook(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create Runbook</span>
              </button>
            </div>

            {isLoadingRunbooks ? (
              <div className="flex items-center justify-center py-12 text-slate-500 text-xs">
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                Loading runbook templates...
              </div>
            ) : runbooks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center">
                <FileText className="h-8 w-8 text-slate-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-slate-300">No Runbooks Created Yet</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  Create structured operational playbooks that the AI RCA engine can recommend and engineers can execute step-by-step.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {runbooks.map((rb) => (
                  <div
                    key={rb.id}
                    className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-100">{rb.name}</h3>
                        {rb.description && (
                          <p className="text-xs text-slate-400 mt-0.5">{rb.description}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteRunbook(rb.id)}
                        className="text-slate-500 hover:text-rose-400 p-1"
                        title="Delete Runbook"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      {rb.serviceName && (
                        <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-indigo-300">
                          {rb.serviceName}
                        </span>
                      )}
                      <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-300">
                        {rb.steps?.length || 0} Steps
                      </span>
                      {rb.severity && (
                        <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-amber-300">
                          {rb.severity}
                        </span>
                      )}
                    </div>

                    <div className="border-t border-slate-800/80 pt-2 space-y-1.5">
                      <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
                        Steps Overview
                      </span>
                      {rb.steps?.slice(0, 3).map((step, idx) => (
                        <div key={step.id || idx} className="flex items-center gap-2 text-xs text-slate-300">
                          <span className="text-slate-500 font-mono text-[10px]">{idx + 1}.</span>
                          <span className="truncate">{step.title}</span>
                          <span className="rounded bg-slate-800/80 px-1 py-0.2 text-[9px] font-mono text-slate-400 uppercase">
                            {step.stepType}
                          </span>
                        </div>
                      ))}
                      {(rb.steps?.length || 0) > 3 && (
                        <span className="text-[11px] text-slate-500 italic">
                          + {(rb.steps?.length || 0) - 3} more steps
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Create Runbook Modal */}
            {showCreateRunbook && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
                <div className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
                  <h3 className="text-base font-semibold text-slate-100">
                    Create Remediation Runbook
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Define an approved operational procedure with structured verification steps.
                  </p>

                  <form onSubmit={handleCreateRunbook} className="mt-4 space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Runbook Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={newRunbookName}
                        onChange={(e) => setNewRunbookName(e.target.value)}
                        placeholder="e.g. Restart Payment Gateway Pool & Flush Cache"
                        className="w-full rounded-lg border border-slate-700 bg-slate-800 p-2.5 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Description
                      </label>
                      <input
                        type="text"
                        value={newRunbookDesc}
                        onChange={(e) => setNewRunbookDesc(e.target.value)}
                        placeholder="Describe incident conditions where this runbook applies..."
                        className="w-full rounded-lg border border-slate-700 bg-slate-800 p-2.5 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          Target Service (Optional)
                        </label>
                        <select
                          value={newRunbookServiceId}
                          onChange={(e) => setNewRunbookServiceId(e.target.value)}
                          className="w-full rounded-lg border border-slate-700 bg-slate-800 p-2 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
                        >
                          <option value="">All Services (Generic)</option>
                          {servicesList.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          Applicable Severity
                        </label>
                        <select
                          value={newRunbookSeverity}
                          onChange={(e) => setNewRunbookSeverity(e.target.value)}
                          className="w-full rounded-lg border border-slate-700 bg-slate-800 p-2 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
                        >
                          <option value="">Any Severity</option>
                          <option value="CRITICAL">CRITICAL</option>
                          <option value="ERROR">ERROR</option>
                          <option value="WARNING">WARNING</option>
                          <option value="INFO">INFO</option>
                        </select>
                      </div>
                    </div>

                    {/* Step Builder */}
                    <div className="space-y-2 border-t border-slate-800 pt-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-300">
                          Checklist Steps ({newRunbookSteps.length})
                        </label>
                        <button
                          type="button"
                          onClick={handleAddStep}
                          className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"
                        >
                          <Plus className="h-3 w-3" />
                          Add Step
                        </button>
                      </div>

                      <div className="space-y-3">
                        {newRunbookSteps.map((step, idx) => (
                          <div
                            key={idx}
                            className="rounded-lg border border-slate-800 bg-slate-800/40 p-3 space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-mono text-slate-400">
                                #{idx + 1}
                              </span>
                              <input
                                type="text"
                                required
                                placeholder="Step Title..."
                                value={step.title}
                                onChange={(e) =>
                                  handleStepChange(idx, 'title', e.target.value)
                                }
                                className="flex-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                              />
                              <select
                                value={step.stepType}
                                onChange={(e) =>
                                  handleStepChange(idx, 'stepType', e.target.value)
                                }
                                className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 focus:outline-none"
                              >
                                <option value="CHECK">CHECK</option>
                                <option value="MANUAL_ACTION">MANUAL_ACTION</option>
                                <option value="VALIDATION">VALIDATION</option>
                                <option value="REFERENCE">REFERENCE</option>
                              </select>
                              {newRunbookSteps.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveStep(idx)}
                                  className="text-slate-500 hover:text-rose-400 p-1"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                            <textarea
                              rows={2}
                              required
                              placeholder="Detailed instruction for the human operator..."
                              value={step.instruction}
                              onChange={(e) =>
                                handleStepChange(idx, 'instruction', e.target.value)
                              }
                              className="w-full rounded border border-slate-700 bg-slate-800 p-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => setShowCreateRunbook(false)}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isCreatingRunbook}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                      >
                        {isCreatingRunbook ? 'Creating...' : 'Save Runbook'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Integrations */}
        {activeTab === 'integrations' && (
          <IntegrationsTab
            organizationId={activeOrganization?.id || ''}
            canManage={hasAccess('integrations.manage')}
          />
        )}

        {/* Tab: Notification Policies */}
        {activeTab === 'policies' && (
          <NotificationPoliciesTab
            organizationId={activeOrganization?.id || ''}
            canManage={hasAccess('notifications.policies.manage')}
          />
        )}

        {/* Tab: Delivery History */}
        {activeTab === 'deliveries' && (
          <DeliveryHistoryTab organizationId={activeOrganization?.id || ''} />
        )}

        {/* Tab: Notification Preferences */}
        {activeTab === 'preferences' && (
          <NotificationPreferencesTab organizationId={activeOrganization?.id || ''} />
        )}

        {/* Tab: Security & Sessions */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-200">Active Authentication Sessions</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Sessions are backed by SHA-256 hashed HTTP-only cookies with 7-day sliding TTL.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleLogoutAll}
                  disabled={revokingAll}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-800/60 text-rose-300 text-xs font-medium disabled:opacity-50"
                >
                  <LogOut className="h-3.5 w-3.5 text-rose-400" />
                  <span>{revokingAll ? 'Revoking...' : 'Revoke All Sessions'}</span>
                </button>
              </div>

              <div className="p-4 rounded-lg bg-slate-800/40 border border-slate-700/60 text-xs flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Shield className="h-5 w-5 text-emerald-400" />
                  <div>
                    <span className="font-semibold text-slate-200">Current Active Session</span>
                    <p className="text-[11px] text-slate-400">Authenticated as {user.email}</p>
                  </div>
                </div>
                <span className="text-emerald-400 font-mono text-[10px] bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
                  CURRENT DEVICE
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[50vh]">
          <RefreshCw className="h-5 w-5 animate-spin text-slate-500" />
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
