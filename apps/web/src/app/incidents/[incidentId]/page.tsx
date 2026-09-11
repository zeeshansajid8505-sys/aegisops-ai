'use client';

import React, { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import {
  AlertOctagon,
  ArrowLeft,
  Flame,
  AlertTriangle,
  AlertCircle,
  Radio,
  Clock,
  CheckCircle2,
  User,
  Users,
  ShieldAlert,
  ShieldCheck,
  Send,
  MessageSquare,
  Activity,
  Plus,
  RefreshCw,
  Trash2,
  Unlink,
  Check,
  ChevronRight,
  Server,
  Layers,
  RotateCcw,
  Edit3,
  Bell,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { IncidentAiRcaPanel } from '@/components/incidents/incident-ai-rca-panel';
import { IncidentPostmortemPanel } from '@/components/incidents/IncidentPostmortemPanel';
import type {
  IncidentDetail,
  IncidentSeverity,
  IncidentStatus,
  IncidentResponderRole,
} from '@aegisops/types';

interface PageProps {
  params: Promise<{
    incidentId: string;
  }>;
}

export default function IncidentCommandConsolePage({ params }: PageProps) {
  const resolvedParams = use(params);
  const incidentId = resolvedParams.incidentId;

  const { activeOrganization, currentRole } = useAuth();
  const organizationId = activeOrganization?.id ?? '';

  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Notes state
  const [newNote, setNewNote] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);

  // Modals state
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [resolutionSummary, setResolutionSummary] = useState('');

  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  const [isSeverityModalOpen, setIsSeverityModalOpen] = useState(false);
  const [targetSeverity, setTargetSeverity] = useState<IncidentSeverity>('CRITICAL');
  const [severityReason, setSeverityReason] = useState('');

  const [isUnlinkModalOpen, setIsUnlinkModalOpen] = useState(false);
  const [targetAlertToUnlink, setTargetAlertToUnlink] = useState<string | null>(null);
  const [unlinkReason, setUnlinkReason] = useState('');

  const [isCommanderModalOpen, setIsCommanderModalOpen] = useState(false);
  const [targetCommanderId, setTargetCommanderId] = useState('');

  const [isAddResponderModalOpen, setIsAddResponderModalOpen] = useState(false);
  const [targetResponderId, setTargetResponderId] = useState('');
  const [targetResponderRole, setTargetResponderRole] = useState<IncidentResponderRole>('RESPONDER');

  const [orgMembers, setOrgMembers] = useState<any[]>([]);

  const fetchIncidentDetail = useCallback(async () => {
    if (!organizationId || !incidentId) return;
    try {
      const data = await api.incidents.get(organizationId, incidentId);
      setIncident(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load incident details');
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, incidentId]);

  useEffect(() => {
    fetchIncidentDetail();
    const interval = setInterval(fetchIncidentDetail, 10000); // 10s auto-refresh
    return () => clearInterval(interval);
  }, [fetchIncidentDetail]);

  useEffect(() => {
    if (!organizationId) return;
    api.memberships.list(organizationId).then((members) => {
      setOrgMembers(members || []);
    }).catch(() => {});
  }, [organizationId]);

  // Actions
  const handleAcknowledge = async () => {
    try {
      await api.incidents.acknowledge(organizationId, incidentId, {
        note: 'Acknowledged from Command Console',
      });
      setFeedback({ text: 'Incident acknowledged successfully', type: 'success' });
      fetchIncidentDetail();
    } catch (err: any) {
      setFeedback({ text: err.message || 'Failed to acknowledge', type: 'error' });
    }
  };

  const handleTransition = async (status: IncidentStatus) => {
    try {
      await api.incidents.transition(organizationId, incidentId, {
        status,
        reason: `Status updated to ${status} via Command Console`,
      });
      setFeedback({ text: `Status updated to ${status}`, type: 'success' });
      fetchIncidentDetail();
    } catch (err: any) {
      setFeedback({ text: err.message || 'Transition failed', type: 'error' });
    }
  };

  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolutionSummary.trim()) return;

    try {
      await api.incidents.resolve(organizationId, incidentId, {
        resolutionSummary: resolutionSummary.trim(),
      });
      setIsResolveModalOpen(false);
      setResolutionSummary('');
      setFeedback({ text: 'Incident successfully resolved', type: 'success' });
      fetchIncidentDetail();
    } catch (err: any) {
      setFeedback({ text: err.message || 'Failed to resolve', type: 'error' });
    }
  };

  const handleReopenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenReason.trim()) return;

    try {
      await api.incidents.reopen(organizationId, incidentId, {
        reopenReason: reopenReason.trim(),
      });
      setIsReopenModalOpen(false);
      setReopenReason('');
      setFeedback({ text: 'Incident reopened for active investigation', type: 'success' });
      fetchIncidentDetail();
    } catch (err: any) {
      setFeedback({ text: err.message || 'Failed to reopen', type: 'error' });
    }
  };

  const handleSeveritySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!severityReason.trim()) return;

    try {
      await api.incidents.updateSeverity(organizationId, incidentId, {
        severity: targetSeverity,
        reason: severityReason.trim(),
      });
      setIsSeverityModalOpen(false);
      setSeverityReason('');
      setFeedback({ text: `Severity changed to ${targetSeverity}`, type: 'success' });
      fetchIncidentDetail();
    } catch (err: any) {
      setFeedback({ text: err.message || 'Failed to change severity', type: 'error' });
    }
  };

  const handleUnlinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetAlertToUnlink || !unlinkReason.trim()) return;

    try {
      await api.incidents.unlinkAlert(organizationId, incidentId, targetAlertToUnlink, {
        reason: unlinkReason.trim(),
      });
      setIsUnlinkModalOpen(false);
      setTargetAlertToUnlink(null);
      setUnlinkReason('');
      setFeedback({ text: 'Alert unlinked from incident', type: 'success' });
      fetchIncidentDetail();
    } catch (err: any) {
      setFeedback({ text: err.message || 'Failed to unlink alert', type: 'error' });
    }
  };

  const handleCommanderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetCommanderId) return;

    try {
      await api.incidents.assignCommander(organizationId, incidentId, {
        commanderMembershipId: targetCommanderId,
      });
      setIsCommanderModalOpen(false);
      setTargetCommanderId('');
      setFeedback({ text: 'Commander assigned', type: 'success' });
      fetchIncidentDetail();
    } catch (err: any) {
      setFeedback({ text: err.message || 'Failed to assign commander', type: 'error' });
    }
  };

  const handleAddResponderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetResponderId) return;

    try {
      await api.incidents.addResponder(organizationId, incidentId, {
        membershipId: targetResponderId,
        role: targetResponderRole,
      });
      setIsAddResponderModalOpen(false);
      setTargetResponderId('');
      setFeedback({ text: 'Responder added to roster', type: 'success' });
      fetchIncidentDetail();
    } catch (err: any) {
      setFeedback({ text: err.message || 'Failed to add responder', type: 'error' });
    }
  };

  const handleRemoveResponder = async (membershipId: string) => {
    try {
      await api.incidents.removeResponder(organizationId, incidentId, membershipId);
      setFeedback({ text: 'Responder removed', type: 'success' });
      fetchIncidentDetail();
    } catch (err: any) {
      setFeedback({ text: err.message || 'Failed to remove responder', type: 'error' });
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;

    setIsSubmittingNote(true);
    try {
      await api.incidents.addNote(organizationId, incidentId, { note: newNote.trim() });
      setNewNote('');
      fetchIncidentDetail();
    } catch (err: any) {
      setFeedback({ text: err.message || 'Failed to add note', type: 'error' });
    } finally {
      setIsSubmittingNote(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-24 text-center text-xs text-slate-500 flex items-center justify-center space-x-2">
        <RefreshCw className="h-4 w-4 animate-spin text-rose-500" />
        <span>Loading Incident Command Console...</span>
      </div>
    );
  }

  if (error || !incident) {
    return (
      <div className="py-20 text-center space-y-3">
        <AlertOctagon className="h-10 w-10 text-rose-500/50 mx-auto" />
        <div className="text-base font-semibold text-slate-200">Incident Not Found</div>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">{error || 'This incident does not exist or has been deleted.'}</p>
        <Link
          href="/incidents"
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Return to Incidents</span>
        </Link>
      </div>
    );
  }

  const activeAlerts = incident.alerts.filter((a) => !a.unlinkedAt && !a.resolvedAt);
  const resolvedAlerts = incident.alerts.filter((a) => !a.unlinkedAt && a.resolvedAt);

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Top Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2 text-xs text-slate-400">
          <Link href="/incidents" className="hover:text-slate-200 flex items-center space-x-1">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Incidents</span>
          </Link>
          <span>/</span>
          <span className="font-mono font-bold text-rose-400">{incident.incidentKey}</span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={fetchIncidentDetail}
            className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 rounded-lg flex items-center space-x-1"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Feedback Alert Banner */}
      {feedback && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center justify-between border ${
            feedback.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-300'
              : 'bg-rose-950/60 border-rose-800/60 text-rose-300'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-200 text-sm font-bold"
          >
            &times;
          </button>
        </div>
      )}

      {/* Main Command Header */}
      <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30">
                {incident.incidentKey}
              </span>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                {incident.source}
              </span>
              {/* Severity Button */}
              <button
                type="button"
                onClick={() => {
                  setTargetSeverity(incident.severity);
                  setIsSeverityModalOpen(true);
                }}
                className={`text-xs font-bold px-2.5 py-0.5 rounded border flex items-center space-x-1 cursor-pointer transition-opacity hover:opacity-80 ${
                  incident.severity === 'CRITICAL'
                    ? 'bg-rose-950/80 text-rose-300 border-rose-800'
                    : incident.severity === 'ERROR'
                    ? 'bg-orange-950/80 text-orange-300 border-orange-800'
                    : incident.severity === 'WARNING'
                    ? 'bg-amber-950/70 text-amber-300 border-amber-800'
                    : 'bg-sky-950/70 text-sky-300 border-sky-800'
                }`}
              >
                <span>{incident.severity}</span>
                <Edit3 className="h-2.5 w-2.5 opacity-60" />
              </button>
              {/* Status Badge */}
              <span
                className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${
                  incident.status === 'OPEN'
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    : incident.status === 'ACKNOWLEDGED'
                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                    : incident.status === 'INVESTIGATING'
                    ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                    : incident.status === 'MITIGATED'
                    ? 'bg-teal-500/10 text-teal-400 border-teal-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {incident.status}
              </span>
            </div>

            <h1 className="text-xl font-bold text-slate-100">{incident.title}</h1>
            {incident.summary && (
              <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">{incident.summary}</p>
            )}
          </div>

          {/* Action Lifecycle Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {incident.status === 'OPEN' && (
              <button
                type="button"
                onClick={handleAcknowledge}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow transition-colors"
              >
                Acknowledge
              </button>
            )}

            {(incident.status === 'OPEN' || incident.status === 'ACKNOWLEDGED' || incident.status === 'MITIGATED') && (
              <button
                type="button"
                onClick={() => handleTransition('INVESTIGATING')}
                className="px-3.5 py-1.5 text-xs font-semibold text-purple-200 bg-purple-950 hover:bg-purple-900 border border-purple-800 rounded-lg transition-colors"
              >
                Start Investigation
              </button>
            )}

            {incident.status === 'INVESTIGATING' && (
              <button
                type="button"
                onClick={() => handleTransition('MITIGATED')}
                className="px-3.5 py-1.5 text-xs font-semibold text-teal-200 bg-teal-950 hover:bg-teal-900 border border-teal-800 rounded-lg transition-colors"
              >
                Mark Mitigated
              </button>
            )}

            {incident.status !== 'RESOLVED' ? (
              <button
                type="button"
                onClick={() => setIsResolveModalOpen(true)}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow transition-colors"
              >
                Resolve Incident
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsReopenModalOpen(true)}
                className="px-3.5 py-1.5 text-xs font-semibold text-amber-200 bg-amber-950 hover:bg-amber-900 border border-amber-800 rounded-lg transition-colors flex items-center space-x-1"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reopen Incident</span>
              </button>
            )}
          </div>
        </div>

        {/* Timestamps Row */}
        <div className="pt-3 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs text-slate-400">
          <div>
            <span className="text-[10px] text-slate-500 block uppercase font-mono">Detected At</span>
            <span className="font-mono text-slate-200">{new Date(incident.detectedAt).toLocaleString()}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block uppercase font-mono">Last Signal</span>
            <span className="font-mono text-slate-200">{new Date(incident.lastSignalAt).toLocaleString()}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block uppercase font-mono">Acknowledged</span>
            <span className="font-mono text-slate-200">
              {incident.acknowledgedAt ? new Date(incident.acknowledgedAt).toLocaleTimeString() : 'Pending'}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block uppercase font-mono">Mitigated / Resolved</span>
            <span className="font-mono text-slate-200">
              {incident.resolvedAt
                ? `Resolved: ${new Date(incident.resolvedAt).toLocaleTimeString()}`
                : incident.mitigatedAt
                ? `Mitigated: ${new Date(incident.mitigatedAt).toLocaleTimeString()}`
                : 'In Progress'}
            </span>
          </div>
        </div>
      </div>

      {/* Signal Status Banner */}
      {incident.allSignalsClearedAt ? (
        <div className="p-4 rounded-xl bg-teal-950/40 border border-teal-800/60 flex items-center space-x-3 text-teal-300 text-xs">
          <CheckCircle2 className="h-5 w-5 text-teal-400 flex-shrink-0" />
          <div className="space-y-0.5">
            <span className="font-semibold text-teal-200">All Linked Signals Cleared</span>
            <p className="text-[11px] text-teal-400/80">
              All linked alerts have recovered and threshold breaches have cleared at{' '}
              {new Date(incident.allSignalsClearedAt).toLocaleTimeString()}. The incident remains in active state for human review and root cause remediation.
            </p>
          </div>
        </div>
      ) : activeAlerts.length > 0 ? (
        <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-800/50 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-3 text-rose-300">
            <Activity className="h-5 w-5 text-rose-400 flex-shrink-0 animate-pulse" />
            <div>
              <span className="font-semibold text-rose-200">
                {activeAlerts.length} Active Alert Signal{activeAlerts.length > 1 ? 's' : ''} Firing
              </span>
              <p className="text-[11px] text-slate-400">
                Incoming alerts are actively matched and deduplicated via multi-alert correlation engine.
              </p>
            </div>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 bg-rose-900/60 text-rose-300 rounded border border-rose-800">
            {resolvedAlerts.length} cleared / {incident.alerts.length} total
          </span>
        </div>
      ) : null}

      {/* AI-Assisted Root Cause Analysis & Remediation Console */}
      <IncidentAiRcaPanel
        organizationId={organizationId}
        incidentId={incidentId}
        userRole={currentRole}
      />

      {/* Main Grid: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Linked Alerts & Timeline */}
        <div className="lg:col-span-2 space-y-6">
          {/* Linked Alert Episodes & Correlation Explainability */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 overflow-hidden space-y-3 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Bell className="h-4 w-4 text-amber-400" />
                <h2 className="text-sm font-bold text-slate-200">
                  Linked Alert Episodes & Correlation Explainability ({incident.alerts.length})
                </h2>
              </div>
            </div>

            {incident.alerts.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No alerts currently linked to this incident.
              </div>
            ) : (
              <div className="space-y-3">
                {incident.alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-3.5 rounded-lg border text-xs space-y-2.5 transition-colors ${
                      alert.unlinkedAt
                        ? 'bg-slate-950/40 border-slate-800/40 opacity-60'
                        : alert.resolvedAt
                        ? 'bg-slate-950/60 border-slate-800'
                        : 'bg-slate-950 border-slate-800 shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-slate-100">
                            {alert.alertRuleName || 'Alert Rule'}
                          </span>
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                              alert.alertSeverity === 'SEV_1'
                                ? 'bg-rose-950 text-rose-300 border-rose-800'
                                : alert.alertSeverity === 'SEV_2'
                                ? 'bg-orange-950 text-orange-300 border-orange-800'
                                : 'bg-amber-950 text-amber-300 border-amber-800'
                            }`}
                          >
                            {alert.alertSeverity}
                          </span>
                          {alert.resolvedAt ? (
                            <span className="text-[10px] text-teal-400 flex items-center space-x-1 font-mono">
                              <Check className="h-3 w-3" />
                              <span>Resolved at {new Date(alert.resolvedAt).toLocaleTimeString()}</span>
                            </span>
                          ) : alert.unlinkedAt ? (
                            <span className="text-[10px] text-slate-500 italic">
                              Unlinked: {alert.unlinkReason}
                            </span>
                          ) : (
                            <span className="text-[10px] text-rose-400 font-mono animate-pulse">
                              FIRING
                            </span>
                          )}
                        </div>

                        <div className="flex items-center space-x-3 text-[11px] text-slate-400">
                          <span>Service: {alert.serviceName || alert.serviceId}</span>
                          {alert.environmentName && <span>Env: {alert.environmentName}</span>}
                          <span>Triggered: {new Date(alert.linkedAt).toLocaleTimeString()}</span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-mono font-bold px-2 py-0.5 bg-slate-800 text-slate-200 rounded border border-slate-700">
                          Score: {alert.correlationScore}
                        </span>
                        {!alert.unlinkedAt && (
                          <button
                            type="button"
                            onClick={() => {
                              setTargetAlertToUnlink(alert.id);
                              setIsUnlinkModalOpen(true);
                            }}
                            className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                            title="Unlink alert episode"
                          >
                            <Unlink className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Explainability Badges */}
                    {alert.correlationReasons && alert.correlationReasons.length > 0 && (
                      <div className="pt-2 border-t border-slate-800/60 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] uppercase font-mono text-slate-500 mr-1">
                          Why Correlated:
                        </span>
                        {alert.correlationReasons.map((reason, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center space-x-1 text-[10px] px-2 py-0.5 rounded bg-slate-800/90 text-slate-300 border border-slate-700/80"
                            title={reason.description}
                          >
                            <span className="font-semibold text-emerald-400">+{reason.score}</span>
                            <span>{reason.code.replace(/_/g, ' ')}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Investigation Notes & Activity Log */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
            <div className="flex items-center space-x-2">
              <MessageSquare className="h-4 w-4 text-cyan-400" />
              <h2 className="text-sm font-bold text-slate-200">Investigation Timeline & Audit Feed</h2>
            </div>

            {/* Note Composer */}
            <form onSubmit={handleAddNote} className="space-y-2">
              <textarea
                rows={2}
                placeholder="Add investigation note, mitigation update, or responder command..."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmittingNote || !newNote.trim()}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 flex items-center space-x-1.5 disabled:opacity-50 transition-colors"
                >
                  <Send className="h-3 w-3" />
                  <span>Post Note</span>
                </button>
              </div>
            </form>

            {/* Timeline Stream */}
            <div className="space-y-3 pt-2">
              {incident.timeline.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">No events recorded.</div>
              ) : (
                incident.timeline.map((event) => (
                  <div key={event.id} className="flex items-start space-x-3 text-xs">
                    <div className="h-6 w-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] text-slate-400 flex-shrink-0 mt-0.5">
                      {event.eventType === 'INCIDENT_CREATED' ? '💥' :
                       event.eventType === 'SEVERITY_ESCALATED' ? '🔥' :
                       event.eventType === 'ALERT_ATTACHED' ? '🔔' :
                       event.eventType === 'ALERT_RESOLVED' ? '✅' :
                       event.eventType === 'ALL_LINKED_SIGNALS_CLEARED' ? '🟢' :
                       event.eventType === 'RESOLVED' ? '🏁' :
                       event.eventType === 'REOPENED' ? '🔄' :
                       event.eventType === 'NOTE_ADDED' ? '💬' : '📌'}
                    </div>

                    <div className="flex-1 p-3 rounded-lg bg-slate-950 border border-slate-800/80 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-slate-200">
                            {event.actorName || 'AegisOps Automation'}
                          </span>
                          <span className="font-mono text-[9px] px-1 rounded bg-slate-800 text-slate-400">
                            {event.eventType}
                          </span>
                        </div>
                        <span className="text-slate-500 font-mono">
                          {new Date(event.occurredAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-slate-300 text-xs leading-relaxed">{event.message}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column (1 Col): Command Roster & Context */}
        <div className="space-y-6">
          {/* Incident Commander Panel */}
          <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/70 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <User className="h-4 w-4 text-amber-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Incident Commander
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCommanderModalOpen(true)}
                className="text-[11px] text-rose-400 hover:text-rose-300 font-medium"
              >
                {incident.commanderName ? 'Change' : 'Assign'}
              </button>
            </div>

            {incident.commanderName ? (
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center space-x-3">
                <div className="h-9 w-9 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-sm font-bold text-rose-400">
                  {incident.commanderName.charAt(0)}
                </div>
                <div className="overflow-hidden">
                  <div className="text-xs font-semibold text-slate-100 truncate">{incident.commanderName}</div>
                  <div className="text-[10px] text-slate-400 truncate">{incident.commanderEmail}</div>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-800/40 text-xs text-amber-300/80">
                No commander currently assigned. Assign an SRE or team lead to direct remediation.
              </div>
            )}
          </div>

          {/* Responders Roster */}
          <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/70 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Users className="h-4 w-4 text-indigo-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Responder Roster ({incident.responders.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddResponderModalOpen(true)}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium flex items-center space-x-1"
              >
                <Plus className="h-3 w-3" />
                <span>Add</span>
              </button>
            </div>

            {incident.responders.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-500">
                No additional responders mobilized.
              </div>
            ) : (
              <div className="space-y-2">
                {incident.responders.map((responder) => (
                  <div
                    key={responder.id}
                    className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center space-x-2.5 overflow-hidden">
                      <div className="h-6 w-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] text-slate-300 flex-shrink-0">
                        {responder.userName?.charAt(0) || 'R'}
                      </div>
                      <div className="overflow-hidden">
                        <div className="font-medium text-slate-200 truncate">{responder.userName}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{responder.role}</div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveResponder(responder.membershipId)}
                      className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                      title="Remove responder"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Service & Environment Context */}
          <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/70 space-y-3 text-xs">
            <div className="flex items-center space-x-2">
              <Server className="h-4 w-4 text-cyan-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Operational Context
              </h3>
            </div>

            <div className="space-y-2 divide-y divide-slate-800/80">
              <div className="pt-2 flex justify-between">
                <span className="text-slate-400">Primary Service:</span>
                <span className="font-semibold text-slate-200">
                  {incident.primaryServiceName || 'Cross-Service'}
                </span>
              </div>
              <div className="pt-2 flex justify-between">
                <span className="text-slate-400">Environment:</span>
                <span className="font-mono text-slate-200">{incident.environmentName || 'N/A'}</span>
              </div>
              <div className="pt-2 flex justify-between">
                <span className="text-slate-400">Assigned Team:</span>
                <span className="text-slate-200">{incident.assignedTeamName || 'Unassigned'}</span>
              </div>
              <div className="pt-2 flex justify-between">
                <span className="text-slate-400">Source:</span>
                <span className="font-mono text-slate-200">{incident.source}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Evidence-Grounded Postmortem & Action Items Workflow */}
      <IncidentPostmortemPanel
        organizationId={organizationId}
        incidentId={incidentId}
        userRole={currentRole}
        orgMembers={orgMembers}
      />

      {/* MODAL: Resolve Incident */}
      {isResolveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-emerald-400 font-bold text-sm">
                <CheckCircle2 className="h-4 w-4" />
                <span>Resolve Incident {incident.incidentKey}</span>
              </div>
              <button
                type="button"
                onClick={() => setIsResolveModalOpen(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleResolveSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Resolution & Remediation Summary *
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Explain the root cause fix, rollout, or configuration change that mitigated the incident..."
                  value={resolutionSummary}
                  onChange={(e) => setResolutionSummary(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsResolveModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!resolutionSummary.trim()}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow disabled:opacity-50"
                >
                  Confirm Resolution
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Reopen Incident */}
      {isReopenModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm">
                <RotateCcw className="h-4 w-4" />
                <span>Reopen Incident {incident.incidentKey}</span>
              </div>
              <button
                type="button"
                onClick={() => setIsReopenModalOpen(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleReopenSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Reason for Reopening *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Explain why this incident is being reopened (e.g. regression observed, recurrent latency spike)..."
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsReopenModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!reopenReason.trim()}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 rounded-lg shadow disabled:opacity-50"
                >
                  Reopen Incident
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Adjust Severity */}
      {isSeverityModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-slate-100 font-bold text-sm">
                <Flame className="h-4 w-4 text-rose-400" />
                <span>Adjust Incident Severity</span>
              </div>
              <button
                type="button"
                onClick={() => setIsSeverityModalOpen(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSeveritySubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Target Severity Level
                </label>
                <select
                  value={targetSeverity}
                  onChange={(e) => setTargetSeverity(e.target.value as IncidentSeverity)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-rose-500"
                >
                  <option value="CRITICAL">CRITICAL</option>
                  <option value="ERROR">ERROR</option>
                  <option value="WARNING">WARNING</option>
                  <option value="INFO">INFO</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Reason for Adjustment *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Cascading blast radius verified on checkout database"
                  value={severityReason}
                  onChange={(e) => setSeverityReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsSeverityModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!severityReason.trim()}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-lg shadow disabled:opacity-50"
                >
                  Apply Severity
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Unlink Alert */}
      {isUnlinkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-rose-400 font-bold text-sm">
                <Unlink className="h-4 w-4" />
                <span>Unlink Alert from Incident</span>
              </div>
              <button
                type="button"
                onClick={() => setIsUnlinkModalOpen(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleUnlinkSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Reason for Unlinking *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Unrelated background batch job alert"
                  value={unlinkReason}
                  onChange={(e) => setUnlinkReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsUnlinkModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!unlinkReason.trim()}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-lg shadow disabled:opacity-50"
                >
                  Confirm Unlink
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Assign Commander */}
      {isCommanderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm">
                <User className="h-4 w-4" />
                <span>Assign Incident Commander</span>
              </div>
              <button
                type="button"
                onClick={() => setIsCommanderModalOpen(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCommanderSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Select Team Member
                </label>
                <select
                  required
                  value={targetCommanderId}
                  onChange={(e) => setTargetCommanderId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="">Select Commander...</option>
                  {orgMembers.map((m: any) => (
                    <option key={m.id} value={m.id}>
                      {m.user?.displayName || m.user?.email} ({m.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCommanderModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!targetCommanderId}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 rounded-lg shadow disabled:opacity-50"
                >
                  Assign Commander
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Add Responder */}
      {isAddResponderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-indigo-400 font-bold text-sm">
                <Users className="h-4 w-4" />
                <span>Add Responder to Roster</span>
              </div>
              <button
                type="button"
                onClick={() => setIsAddResponderModalOpen(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleAddResponderSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Select Member
                </label>
                <select
                  required
                  value={targetResponderId}
                  onChange={(e) => setTargetResponderId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Select Responder...</option>
                  {orgMembers.map((m: any) => (
                    <option key={m.id} value={m.id}>
                      {m.user?.displayName || m.user?.email} ({m.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Role
                </label>
                <select
                  value={targetResponderRole}
                  onChange={(e) => setTargetResponderRole(e.target.value as IncidentResponderRole)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="RESPONDER">RESPONDER</option>
                  <option value="COMMANDER">COMMANDER</option>
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddResponderModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!targetResponderId}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow disabled:opacity-50"
                >
                  Add Responder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
