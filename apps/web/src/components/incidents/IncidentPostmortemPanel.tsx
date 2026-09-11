'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldCheck,
  History,
  Plus,
  Trash2,
  Edit3,
  Send,
  Check,
  X,
  AlertTriangle,
  Users,
  ChevronDown,
  Layers,
} from 'lucide-react';
import { api } from '@/lib/api';
import type {
  IncidentPostmortemDetail,
  PostmortemActionItemSummary,
  ActionItemPriority,
  ActionItemStatus,
  UpdatePostmortemDto,
  UserRole,
} from '@aegisops/types';

interface IncidentPostmortemPanelProps {
  organizationId: string;
  incidentId: string;
  userRole?: UserRole | null;
  orgMembers?: any[];
}

export function IncidentPostmortemPanel({
  organizationId,
  incidentId,
  userRole,
  orgMembers = [],
}: IncidentPostmortemPanelProps) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [isRevisionModalOpen, setIsRevisionModalOpen] = useState(false);
  const [isAddActionItemModalOpen, setIsAddActionItemModalOpen] = useState(false);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [approvalNote, setApprovalNote] = useState('');
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Edit form state
  const [editForm, setEditForm] = useState<UpdatePostmortemDto>({});

  // New Action Item Form State
  const [newActionTitle, setNewActionTitle] = useState('');
  const [newActionDescription, setNewActionDescription] = useState('');
  const [newActionPriority, setNewActionPriority] = useState<ActionItemPriority>('MEDIUM');
  const [newActionOwnerId, setNewActionOwnerId] = useState('');
  const [newActionDueAt, setNewActionDueAt] = useState('');

  const { data: postmortem, isLoading, refetch } = useQuery({
    queryKey: ['incident-postmortem', organizationId, incidentId],
    queryFn: () => api.postmortems.get(organizationId, incidentId),
    enabled: !!organizationId && !!incidentId,
  });

  const generateMutation = useMutation({
    mutationFn: () => api.postmortems.generate(organizationId, incidentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident-postmortem', organizationId, incidentId] });
      setFeedback({ text: 'Evidence-grounded postmortem generated successfully', type: 'success' });
    },
    onError: (err: any) => {
      setFeedback({ text: err.message || 'Failed to generate postmortem', type: 'error' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (dto: UpdatePostmortemDto) =>
      api.postmortems.update(organizationId, incidentId, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident-postmortem', organizationId, incidentId] });
      setIsEditing(false);
      setFeedback({ text: 'Postmortem updated successfully', type: 'success' });
    },
    onError: (err: any) => {
      setFeedback({ text: err.message || 'Failed to update postmortem', type: 'error' });
    },
  });

  const submitReviewMutation = useMutation({
    mutationFn: () => api.postmortems.submitReview(organizationId, incidentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident-postmortem', organizationId, incidentId] });
      setFeedback({ text: 'Postmortem submitted for peer review', type: 'success' });
    },
    onError: (err: any) => {
      setFeedback({ text: err.message || 'Failed to submit for review', type: 'error' });
    },
  });

  const approveMutation = useMutation({
    mutationFn: () => api.postmortems.approve(organizationId, incidentId, { approvalNote }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident-postmortem', organizationId, incidentId] });
      setIsApproveModalOpen(false);
      setApprovalNote('');
      setFeedback({ text: 'Postmortem approved successfully', type: 'success' });
    },
    onError: (err: any) => {
      setFeedback({ text: err.message || 'Failed to approve postmortem', type: 'error' });
    },
  });

  const createActionItemMutation = useMutation({
    mutationFn: (dto: any) => api.postmortems.createActionItem(organizationId, incidentId, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident-postmortem', organizationId, incidentId] });
      setIsAddActionItemModalOpen(false);
      setNewActionTitle('');
      setNewActionDescription('');
      setNewActionOwnerId('');
      setNewActionDueAt('');
      setFeedback({ text: 'Action item created successfully', type: 'success' });
    },
    onError: (err: any) => {
      setFeedback({ text: err.message || 'Failed to create action item', type: 'error' });
    },
  });

  const updateActionItemMutation = useMutation({
    mutationFn: ({ actionItemId, dto }: { actionItemId: string; dto: any }) =>
      api.postmortems.updateActionItem(organizationId, incidentId, actionItemId, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident-postmortem', organizationId, incidentId] });
    },
  });

  const deleteActionItemMutation = useMutation({
    mutationFn: (actionItemId: string) =>
      api.postmortems.deleteActionItem(organizationId, incidentId, actionItemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident-postmortem', organizationId, incidentId] });
      setFeedback({ text: 'Action item deleted', type: 'success' });
    },
  });

  const canApprove = userRole === 'OWNER' || userRole === 'ADMIN' || userRole === 'SRE';

  const startEditing = () => {
    if (!postmortem) return;
    setEditForm({
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
    });
    setIsEditing(true);
  };

  if (isLoading) {
    return (
      <div className="p-8 rounded-xl bg-slate-900 border border-slate-800 text-center text-xs text-slate-500 animate-pulse">
        Loading postmortem & reliability action items...
      </div>
    );
  }

  // EMPTY STATE: No Postmortem Generated Yet
  if (!postmortem) {
    return (
      <div className="p-8 rounded-xl bg-slate-900/80 border border-slate-800 text-center space-y-4 shadow-sm">
        <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto">
          <FileText className="h-6 w-6" />
        </div>
        <div className="max-w-md mx-auto space-y-1.5">
          <h3 className="text-base font-bold text-slate-100">Evidence-Grounded Incident Postmortem</h3>
          <p className="text-xs text-slate-400">
            Generate an authoritative, fact-grounded postmortem draft directly from linked alerts, timeline milestones, anomalies, and remediation runbooks.
          </p>
        </div>
        <button
          type="button"
          disabled={generateMutation.isPending}
          onClick={() => generateMutation.mutate()}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow transition-colors"
        >
          <Sparkles className="h-4 w-4" />
          <span>{generateMutation.isPending ? 'Assembling Evidence...' : 'Generate Postmortem Draft'}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-6 shadow-sm">
      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center justify-between border ${
            feedback.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-300'
              : 'bg-rose-950/60 border-rose-800/60 text-rose-300'
          }`}
        >
          <span>{feedback.text}</span>
          <button type="button" onClick={() => setFeedback(null)} className="font-bold text-sm">
            &times;
          </button>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
                postmortem.status === 'APPROVED'
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                  : postmortem.status === 'IN_REVIEW'
                  ? 'bg-blue-950 text-blue-300 border-blue-800'
                  : 'bg-amber-950 text-amber-300 border-amber-800'
              }`}
            >
              {postmortem.status}
            </span>
            <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
              v{postmortem.version}
            </span>
            <span
              className="text-[10px] font-mono text-slate-500 bg-slate-950 px-2 py-0.5 rounded border border-slate-800"
              title={`Fingerprint: ${postmortem.evidenceFingerprint}`}
            >
              SHA: {postmortem.evidenceFingerprint.substring(0, 10)}...
            </span>
          </div>

          <h3 className="text-base font-bold text-slate-100">{postmortem.title}</h3>

          <div className="text-xs text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Created by {postmortem.createdByName || 'Operator'}</span>
            {postmortem.approvedAt && (
              <span className="text-emerald-400 flex items-center space-x-1">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>
                  Approved by {postmortem.approvedByName} on{' '}
                  {new Date(postmortem.approvedAt).toLocaleDateString()}
                </span>
              </span>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {postmortem.revisions && postmortem.revisions.length > 0 && (
            <button
              type="button"
              onClick={() => setIsRevisionModalOpen(true)}
              className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center space-x-1.5 transition-colors border border-slate-700"
            >
              <History className="h-3.5 w-3.5" />
              <span>Revisions ({postmortem.revisions.length})</span>
            </button>
          )}

          {!isEditing ? (
            <>
              <button
                type="button"
                onClick={startEditing}
                className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center space-x-1.5 transition-colors border border-slate-700 font-medium"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>Edit Postmortem</span>
              </button>

              {postmortem.status === 'DRAFT' && (
                <button
                  type="button"
                  disabled={submitReviewMutation.isPending}
                  onClick={() => submitReviewMutation.mutate()}
                  className="px-3.5 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg flex items-center space-x-1.5 font-semibold transition-colors shadow"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Submit for Review</span>
                </button>
              )}

              {postmortem.status !== 'APPROVED' && canApprove && (
                <button
                  type="button"
                  onClick={() => setIsApproveModalOpen(true)}
                  className="px-3.5 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center space-x-1.5 font-semibold transition-colors shadow"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Approve Postmortem</span>
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={updateMutation.isPending}
                onClick={() => updateMutation.mutate(editForm)}
                className="px-4 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-semibold shadow transition-colors"
              >
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Root Cause Authority Banner */}
      <div
        className={`p-4 rounded-xl border flex items-start space-x-3 text-xs ${
          postmortem.isHumanConfirmedRootCause
            ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200'
            : 'bg-amber-950/40 border-amber-800/60 text-amber-200'
        }`}
      >
        {postmortem.isHumanConfirmedRootCause ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
        )}
        <div className="space-y-1">
          <div className="font-bold uppercase tracking-wider text-[11px]">
            {postmortem.isHumanConfirmedRootCause
              ? 'Human-Confirmed Root Cause'
              : 'Root Cause Not Yet Confirmed'}
          </div>
          <p className="text-slate-300">
            {postmortem.isHumanConfirmedRootCause
              ? postmortem.confirmedRootCauseSummary
              : 'Root cause has not been verified by an incident commander. AI hypotheses shown below are strictly investigative context.'}
          </p>
        </div>
      </div>

      {/* Editing Warning Banner (if approved) */}
      {isEditing && postmortem.status === 'APPROVED' && (
        <div className="p-3 rounded-lg bg-amber-950/50 border border-amber-800 text-xs text-amber-300 flex items-center space-x-2">
          <AlertCircle className="h-4 w-4 text-amber-400 flex-shrink-0" />
          <span>
            <strong>Notice:</strong> Modifying an approved postmortem will automatically increment the version to v{postmortem.version + 1}, archive the current version in revision history, and reset the status to In Review.
          </span>
        </div>
      )}

      {/* Structured Sections */}
      {isEditing ? (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Title</label>
            <input
              type="text"
              value={editForm.title || ''}
              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Summary</label>
            <textarea
              rows={4}
              value={editForm.summary || ''}
              onChange={(e) => setEditForm({ ...editForm, summary: e.target.value })}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Impact</label>
            <textarea
              rows={3}
              value={editForm.impact || ''}
              onChange={(e) => setEditForm({ ...editForm, impact: e.target.value })}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Root Cause</label>
            <textarea
              rows={4}
              value={editForm.rootCause || ''}
              onChange={(e) => setEditForm({ ...editForm, rootCause: e.target.value })}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Contributing Factors</label>
            <textarea
              rows={3}
              value={editForm.contributingFactors || ''}
              onChange={(e) => setEditForm({ ...editForm, contributingFactors: e.target.value })}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Lessons Learned</label>
            <textarea
              rows={4}
              value={editForm.lessonsLearned || ''}
              onChange={(e) => setEditForm({ ...editForm, lessonsLearned: e.target.value })}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Executive Summary */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Executive Summary</h4>
            <div className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
              {postmortem.summary}
            </div>
          </div>

          {/* Impact Analysis */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Customer & Operational Impact</h4>
            <div className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
              {postmortem.impact}
            </div>
          </div>

          {/* Root Cause & Contributing Factors */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Root Cause Analysis</h4>
              <div className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                {postmortem.rootCause}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Contributing Factors</h4>
              <div className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                {postmortem.contributingFactors}
              </div>
            </div>
          </div>

          {/* Timeline & Response */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Detection & Initial Signal</h4>
              <div className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                {postmortem.detection}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Response & Remediation</h4>
              <div className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                {postmortem.response}
              </div>
            </div>
          </div>

          {/* Lessons Learned */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Lessons Learned & Action Items</h4>
            <div className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
              {postmortem.lessonsLearned}
            </div>
          </div>
        </div>
      )}

      {/* Action Items Section */}
      <div className="p-5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="h-4 w-4 text-indigo-400" />
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              Follow-Up Action Items ({postmortem.actionItems?.length ?? 0})
            </h4>
          </div>

          <button
            type="button"
            onClick={() => setIsAddActionItemModalOpen(true)}
            className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg flex items-center space-x-1.5 font-medium transition-colors shadow"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Action Item</span>
          </button>
        </div>

        {postmortem.actionItems && postmortem.actionItems.length > 0 ? (
          <div className="divide-y divide-slate-800">
            {postmortem.actionItems.map((item) => (
              <div key={item.id} className="py-3 flex items-start justify-between gap-4">
                <div className="flex items-start space-x-3">
                  <button
                    type="button"
                    onClick={() =>
                      updateActionItemMutation.mutate({
                        actionItemId: item.id,
                        dto: { status: item.status === 'COMPLETED' ? 'OPEN' : 'COMPLETED' },
                      })
                    }
                    className={`mt-0.5 p-1 rounded transition-colors ${
                      item.status === 'COMPLETED'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
                    }`}
                  >
                    <Check className="h-3 w-3" />
                  </button>

                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`text-xs font-semibold ${
                          item.status === 'COMPLETED' ? 'line-through text-slate-500' : 'text-slate-200'
                        }`}
                      >
                        {item.title}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                          item.priority === 'HIGH'
                            ? 'bg-rose-950 text-rose-300 border-rose-800'
                            : item.priority === 'MEDIUM'
                            ? 'bg-amber-950 text-amber-300 border-amber-800'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {item.priority}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">[{item.status}]</span>
                    </div>

                    {item.description && (
                      <p className="text-[11px] text-slate-400">{item.description}</p>
                    )}

                    <div className="text-[10px] text-slate-500 flex items-center space-x-3">
                      {item.ownerName && <span>Owner: {item.ownerName}</span>}
                      {item.dueAt && <span>Due: {new Date(item.dueAt).toLocaleDateString()}</span>}
                      {item.completedAt && (
                        <span className="text-emerald-400">
                          Completed: {new Date(item.completedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => deleteActionItemMutation.mutate(item.id)}
                  className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                  title="Delete action item"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-slate-500">
            No follow-up action items created yet. Add remediation tasks with ownership and due dates.
          </div>
        )}
      </div>

      {/* MODAL: Add Action Item */}
      {isAddActionItemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100">Add Follow-Up Action Item</h3>
              <button
                type="button"
                onClick={() => setIsAddActionItemModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-bold"
              >
                &times;
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createActionItemMutation.mutate({
                  title: newActionTitle.trim(),
                  description: newActionDescription.trim() || undefined,
                  priority: newActionPriority,
                  ownerMembershipId: newActionOwnerId || undefined,
                  dueAt: newActionDueAt || undefined,
                });
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Title</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Add rate-limiter circuit breaker to payment gateway"
                  value={newActionTitle}
                  onChange={(e) => setNewActionTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Description (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Additional context or PR reference..."
                  value={newActionDescription}
                  onChange={(e) => setNewActionDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Priority</label>
                  <select
                    value={newActionPriority}
                    onChange={(e) => setNewActionPriority(e.target.value as ActionItemPriority)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="HIGH">HIGH</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">LOW</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Owner</label>
                  <select
                    value={newActionOwnerId}
                    onChange={(e) => setNewActionOwnerId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Unassigned</option>
                    {orgMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.user?.displayName || m.user?.email}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Due Date (Optional)</label>
                <input
                  type="date"
                  value={newActionDueAt}
                  onChange={(e) => setNewActionDueAt(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddActionItemModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createActionItemMutation.isPending || !newActionTitle.trim()}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow disabled:opacity-50"
                >
                  Create Action Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Approve Postmortem */}
      {isApproveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-emerald-400 font-bold text-sm">
                <CheckCircle2 className="h-4 w-4" />
                <span>Approve Incident Postmortem</span>
              </div>
              <button
                type="button"
                onClick={() => setIsApproveModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-bold"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Approving seals this postmortem into an immutable revision snapshot. Any subsequent edits will require incrementing the version and re-initiating review.
            </p>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Approval Sign-off Note (Optional)
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Reviewed and verified with backend engineering team."
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsApproveModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={approveMutation.isPending}
                onClick={() => approveMutation.mutate()}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow disabled:opacity-50"
              >
                {approveMutation.isPending ? 'Approving...' : 'Confirm Approval'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Revisions History */}
      {isRevisionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-6 space-y-4 shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-indigo-400 font-bold text-sm">
                <History className="h-4 w-4" />
                <span>Revision History</span>
              </div>
              <button
                type="button"
                onClick={() => setIsRevisionModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-bold"
              >
                &times;
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-800 pr-1">
              {postmortem.revisions && postmortem.revisions.length > 0 ? (
                postmortem.revisions.map((rev) => (
                  <div key={rev.id} className="py-3 space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-indigo-400">Version {rev.version}</span>
                      <span className="text-slate-500 font-mono">
                        {new Date(rev.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-slate-300">
                      Author: {rev.changedByName || 'Authorized Member'}
                    </div>
                    <div className="text-slate-400 italic">
                      {rev.changeReason || 'No change reason provided'}
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-xs text-slate-500">
                  No historical revisions found.
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsRevisionModalOpen(false)}
                className="px-4 py-1.5 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
