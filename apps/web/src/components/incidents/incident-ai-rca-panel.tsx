'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  ShieldCheck,
  Check,
  Play,
  Clock,
  HelpCircle,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { api } from '@/lib/api';
import type {
  IncidentAnalysis,
  IncidentHypothesis,
  Runbook,
  RunbookExecution,
} from '@aegisops/types';

interface IncidentAiRcaPanelProps {
  organizationId: string;
  incidentId: string;
  userRole?: string | null;
}

export function IncidentAiRcaPanel({
  organizationId,
  incidentId,
  userRole = 'ENGINEER',
}: IncidentAiRcaPanelProps) {
  const effectiveRole = userRole || 'ENGINEER';
  const [analysis, setAnalysis] = useState<IncidentAnalysis | null>(null);
  const [executions, setExecutions] = useState<RunbookExecution[]>([]);
  const [availableRunbooks, setAvailableRunbooks] = useState<Runbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [activeStepCompleting, setActiveStepCompleting] = useState<string | null>(null);
  const [stepNote, setStepNote] = useState<Record<string, string>>({});

  // Modals / Dialog state
  const [confirmModalHypothesis, setConfirmModalHypothesis] = useState<IncidentHypothesis | null>(null);
  const [confirmSummary, setConfirmSummary] = useState('');
  const [rejectModalHypothesis, setRejectModalHypothesis] = useState<IncidentHypothesis | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  const canRunAnalysis = ['OWNER', 'ADMIN', 'SRE', 'ENGINEER'].includes(effectiveRole);
  const canProvideFeedback = ['OWNER', 'ADMIN', 'SRE', 'ENGINEER'].includes(effectiveRole);
  const canExecuteRunbook = ['OWNER', 'ADMIN', 'SRE', 'ENGINEER'].includes(effectiveRole);

  const loadData = useCallback(async () => {
    try {
      const [latestAnalysis, execs, rbs] = await Promise.all([
        api.rca.getLatestAnalysis(organizationId, incidentId).catch(() => null),
        api.runbooks.getExecutions(organizationId, incidentId).catch(() => []),
        api.runbooks.getRunbooks(organizationId).catch(() => []),
      ]);
      setAnalysis(latestAnalysis);
      setExecutions(execs);
      setAvailableRunbooks(rbs);
    } catch {
      // Handled quietly
    } finally {
      setLoading(false);
    }
  }, [organizationId, incidentId]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleTriggerAnalysis = async (force = false) => {
    setTriggering(true);
    try {
      const result = await api.rca.triggerAnalysis(organizationId, incidentId, { force });
      setAnalysis(result);
      await loadData();
    } catch (err: any) {
      alert(`Failed to trigger analysis: ${err.message}`);
    } finally {
      setTriggering(false);
    }
  };

  const handleConfirmRootCause = async () => {
    if (!confirmModalHypothesis) return;
    setSubmittingFeedback(true);
    try {
      const updated = await api.rca.confirmRootCause(
        organizationId,
        incidentId,
        confirmModalHypothesis.id,
        confirmSummary || undefined,
      );
      setAnalysis(updated);
      setConfirmModalHypothesis(null);
      setConfirmSummary('');
      await loadData();
    } catch (err: any) {
      alert(`Failed to confirm root cause: ${err.message}`);
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const handleRejectHypothesis = async () => {
    if (!rejectModalHypothesis || !rejectionReason.trim()) return;
    setSubmittingFeedback(true);
    try {
      await api.rca.rejectHypothesis(
        organizationId,
        incidentId,
        rejectModalHypothesis.id,
        rejectionReason.trim(),
      );
      setRejectModalHypothesis(null);
      setRejectionReason('');
      await loadData();
    } catch (err: any) {
      alert(`Failed to reject hypothesis: ${err.message}`);
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const handleStartRunbook = async (runbookId: string) => {
    try {
      await api.runbooks.startExecution(organizationId, incidentId, runbookId);
      await loadData();
    } catch (err: any) {
      alert(`Failed to start runbook: ${err.message}`);
    }
  };

  const handleCompleteStep = async (executionId: string, stepId: string) => {
    setActiveStepCompleting(stepId);
    try {
      const note = stepNote[stepId];
      await api.runbooks.completeExecutionStep(
        organizationId,
        incidentId,
        executionId,
        stepId,
        note,
      );
      setStepNote((prev) => {
        const copy = { ...prev };
        delete copy[stepId];
        return copy;
      });
      await loadData();
    } catch (err: any) {
      alert(`Failed to complete step: ${err.message}`);
    } finally {
      setActiveStepCompleting(null);
    }
  };

  const handleCancelExecution = async (executionId: string) => {
    if (!confirm('Are you sure you want to cancel this active runbook?')) return;
    try {
      await api.runbooks.cancelExecution(organizationId, incidentId, executionId);
      await loadData();
    } catch (err: any) {
      alert(`Failed to cancel runbook: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/50">
        <div className="flex items-center gap-3 text-slate-400">
          <RefreshCw className="h-5 w-5 animate-spin text-indigo-400" />
          <span className="text-sm font-medium">Loading root cause intelligence...</span>
        </div>
      </div>
    );
  }

  const activeExecution = executions.find((e) => e.status === 'IN_PROGRESS');
  const pastExecutions = executions.filter((e) => e.status !== 'IN_PROGRESS');

  return (
    <div className="space-y-6">
      {/* Header & Analysis Controls */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-slate-100">
                  AI-Assisted Root Cause Analysis & Remediation
                </h3>
                {analysis && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wider ${
                      analysis.status === 'COMPLETED'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : analysis.status === 'RUNNING'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : analysis.status === 'QUEUED'
                        ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}
                  >
                    {analysis.status === 'RUNNING' && <RefreshCw className="h-3 w-3 animate-spin" />}
                    {analysis.status}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Deterministic graph topology reasoning over metric deviations, alert precedence, and service health.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {analysis && (
              <span className="text-xs text-slate-400 mr-2 font-mono">
                v{analysis.analysisVersion} ({analysis.algorithmVersion})
              </span>
            )}
            {canRunAnalysis && (
              <button
                onClick={() => handleTriggerAnalysis(Boolean(analysis))}
                disabled={triggering || analysis?.status === 'RUNNING'}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${triggering ? 'animate-spin' : ''}`} />
                {analysis ? 'Re-run Analysis' : 'Run Analysis'}
              </button>
            )}
          </div>
        </div>

        {/* Failure banner if analysis failed */}
        {analysis?.status === 'FAILED' && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-rose-800/40 bg-rose-950/20 px-3.5 py-2.5 text-xs text-rose-400">
            <XCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>Analysis failed: {analysis.failureMessage || 'Inference engine timeout'}</span>
          </div>
        )}
      </div>

      {/* Section C: Confirmed Root Cause Banner */}
      {analysis?.confirmedRootCause && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-emerald-500/20 p-1 text-emerald-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  Human-Confirmed Root Cause
                </span>
                <span className="text-xs text-emerald-300/80">
                  Confirmed by {analysis.confirmedRootCause.confirmedByName || 'Operator'} •{' '}
                  {new Date(analysis.confirmedRootCause.confirmedAt).toLocaleTimeString()}
                </span>
              </div>
              <p className="mt-1 text-sm font-medium text-slate-100">
                {analysis.confirmedRootCause.summary}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* If No Analysis Run Yet */}
      {!analysis && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center">
          <div className="rounded-full bg-indigo-500/10 p-3 text-indigo-400 mb-3">
            <Sparkles className="h-6 w-6" />
          </div>
          <h4 className="text-sm font-semibold text-slate-200">No RCA analysis run yet</h4>
          <p className="mt-1 max-w-sm text-xs text-slate-400">
            Execute deterministic root cause analysis to trace dependency propagation, alert temporal precedence, and metric anomalies.
          </p>
          {canRunAnalysis && (
            <button
              onClick={() => handleTriggerAnalysis(false)}
              disabled={triggering}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500"
            >
              <Play className="h-3.5 w-3.5" />
              Trigger Incident Analysis
            </button>
          )}
        </div>
      )}

      {/* Active Runbook Execution Runner */}
      {activeExecution && (
        <div className="rounded-xl border border-indigo-500/40 bg-slate-900/80 p-5 shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="rounded-md bg-indigo-500/20 p-1.5 text-indigo-400">
                <FileText className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-100">
                  Active Runbook: {activeExecution.runbook?.name}
                </h4>
                <p className="text-xs text-slate-400">
                  Manual human-approved remediation checklist
                </p>
              </div>
            </div>
            {canExecuteRunbook && (
              <button
                onClick={() => handleCancelExecution(activeExecution.id)}
                className="rounded px-2.5 py-1 text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition-colors"
              >
                Cancel Runbook
              </button>
            )}
          </div>

          {/* Steps List */}
          <div className="space-y-3">
            {activeExecution.steps.map((execStep, idx) => {
              const step = execStep.runbookStep || execStep.step;
              const isCompleted = execStep.status === 'COMPLETED';
              const isPending = execStep.status === 'PENDING';

              return (
                <div
                  key={execStep.id}
                  className={`rounded-lg border p-3.5 transition-colors ${
                    isCompleted
                      ? 'border-emerald-500/20 bg-emerald-950/10'
                      : 'border-slate-800 bg-slate-900/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {isCompleted ? (
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                            <Check className="h-3 w-3" />
                          </div>
                        ) : (
                          <div className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-700 text-xs text-slate-400">
                            {idx + 1}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs font-semibold ${
                              isCompleted ? 'text-slate-300 line-through' : 'text-slate-200'
                            }`}
                          >
                            {step?.title || `Step ${idx + 1}`}
                          </span>
                          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 uppercase">
                            {step?.stepType || 'CHECK'}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">{step?.instruction}</p>
                        {isCompleted && execStep.completedBy && (
                          <p className="mt-1 text-[11px] text-emerald-400/80">
                            Completed by {execStep.completedBy.user?.displayName || 'Operator'} at{' '}
                            {execStep.completedAt ? new Date(execStep.completedAt).toLocaleTimeString() : ''}
                            {execStep.note ? ` — "${execStep.note}"` : ''}
                          </p>
                        )}
                      </div>
                    </div>

                    {isPending && canExecuteRunbook && (
                      <div className="flex flex-col items-end gap-2">
                        <input
                          type="text"
                          placeholder="Optional completion note..."
                          value={stepNote[execStep.id] || ''}
                          onChange={(e) =>
                            setStepNote({ ...stepNote, [execStep.id]: e.target.value })
                          }
                          className="w-48 rounded bg-slate-800/80 px-2 py-1 text-xs text-slate-200 placeholder-slate-500 border border-slate-700 focus:outline-none focus:border-indigo-500"
                        />
                        <button
                          onClick={() => handleCompleteStep(activeExecution.id, execStep.id)}
                          disabled={activeStepCompleting === execStep.id}
                          className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500 transition-colors"
                        >
                          <Check className="h-3 w-3" />
                          Mark Completed
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Section B: AI Hypotheses (Ranked Candidates) */}
      {analysis && analysis.hypotheses.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Ranked Hypotheses ({analysis.hypotheses.length})
            </h4>
            <span className="text-xs text-slate-500">
              Ranked by multi-factor temporal, topological & metric evidence
            </span>
          </div>

          <div className="space-y-3">
            {analysis.hypotheses.map((h) => {
              const isConfirmed = h.status === 'CONFIRMED';
              const isRejected = h.status === 'REJECTED';
              const isSuperseded = h.status === 'SUPERSEDED';

              return (
                <div
                  key={h.id}
                  className={`rounded-xl border p-4 transition-all ${
                    isConfirmed
                      ? 'border-emerald-500/40 bg-emerald-950/10'
                      : isRejected
                      ? 'border-slate-800 bg-slate-900/30 opacity-60'
                      : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          h.rank === 1
                            ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        #{h.rank}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-slate-100">
                            {h.candidateServiceName || 'Infrastructure'}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                              h.confidence === 'HIGH'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : h.confidence === 'MEDIUM'
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {h.confidence} CONFIDENCE
                          </span>
                          <span className="text-xs text-slate-500 font-mono">
                            Score: {Math.round(h.score)}
                          </span>
                          {h.status !== 'PROPOSED' && (
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                                isConfirmed
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : isRejected
                                  ? 'bg-rose-500/20 text-rose-400'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {h.status}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-300 font-medium">{h.hypothesis}</p>
                      </div>
                    </div>

                    {/* Operator Feedback Buttons */}
                    {h.status === 'PROPOSED' && canProvideFeedback && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setConfirmModalHypothesis(h);
                            setConfirmSummary(h.hypothesis);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 transition-colors"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Confirm Root Cause
                        </button>
                        <button
                          onClick={() => {
                            setRejectModalHypothesis(h);
                            setRejectionReason('');
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 transition-colors"
                        >
                          <XCircle className="h-3.5 w-3.5 text-slate-400" />
                          Reject
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Reason Codes */}
                  {h.reasonCodes && h.reasonCodes.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {h.reasonCodes.map((code) => (
                        <span
                          key={code}
                          className="rounded bg-slate-800/90 px-2 py-0.5 text-[10px] font-mono text-indigo-300 border border-slate-700/50"
                        >
                          {code}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Evidence & Counter-Evidence Refs */}
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-slate-800/60 pt-3">
                    <div>
                      <span className="text-[11px] font-medium text-slate-400">Supporting Evidence:</span>
                      <ul className="mt-1 space-y-1">
                        {h.evidenceRefs && h.evidenceRefs.length > 0 ? (
                          h.evidenceRefs.map((ref, idx) => (
                            <li key={idx} className="text-xs text-slate-300 flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                              {ref}
                            </li>
                          ))
                        ) : (
                          <li className="text-xs text-slate-500 italic">No specific direct evidence refs</li>
                        )}
                      </ul>
                    </div>

                    <div>
                      <span className="text-[11px] font-medium text-slate-400">Counter-Evidence / Penalties:</span>
                      <ul className="mt-1 space-y-1">
                        {h.counterEvidenceRefs && h.counterEvidenceRefs.length > 0 ? (
                          h.counterEvidenceRefs.map((ref, idx) => (
                            <li key={idx} className="text-xs text-amber-300/90 flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                              {ref}
                            </li>
                          ))
                        ) : (
                          <li className="text-xs text-slate-500 italic">None noted</li>
                        )}
                      </ul>
                    </div>
                  </div>

                  {/* Rejection Note */}
                  {isRejected && h.rejectionReason && (
                    <div className="mt-3 rounded bg-rose-950/20 border border-rose-900/30 p-2 text-xs text-rose-300">
                      <strong>Rejection reason:</strong> {h.rejectionReason}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Section A: Observed Facts */}
      {analysis?.evidenceSnapshot?.facts && analysis.evidenceSnapshot.facts.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Observed Facts ({analysis.evidenceSnapshot.facts.length})
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium">Description</th>
                  <th className="pb-2 font-medium">Entity Reference</th>
                  <th className="pb-2 font-medium">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 text-slate-300">
                {analysis.evidenceSnapshot.facts.map((fact) => (
                  <tr key={fact.factId} className="hover:bg-slate-800/20">
                    <td className="py-2 pr-3">
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-300 uppercase">
                        {fact.type}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-slate-200">{fact.description}</td>
                    <td className="py-2 pr-3 font-mono text-[11px] text-slate-400">
                      {fact.entityRef || '—'}
                    </td>
                    <td className="py-2 text-slate-400">
                      {fact.timestamp ? new Date(fact.timestamp).toLocaleTimeString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Section D: Recommended Next Checks */}
      {analysis?.recommendedNextChecks && analysis.recommendedNextChecks.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Recommended Next Checks
          </h4>
          <ul className="space-y-1.5">
            {analysis.recommendedNextChecks.map((chk, idx) => (
              <li key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                <ChevronRight className="h-3.5 w-3.5 text-indigo-400 shrink-0 mt-0.5" />
                <span>{chk}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Section E: Recommended Remediation Runbooks */}
      {analysis?.recommendedRunbooks && analysis.recommendedRunbooks.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Recommended Runbooks ({analysis.recommendedRunbooks.length})
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {analysis.recommendedRunbooks.map((rbItem) => (
              <div
                key={rbItem.runbookId}
                className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 flex flex-col justify-between hover:border-slate-700 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-slate-100">{rbItem.title}</span>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                      Match: {Math.round(rbItem.matchScore)}%
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {rbItem.reasonCodes.map((rc) => (
                      <span
                        key={rc}
                        className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-mono text-slate-400"
                      >
                        {rc}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end">
                  {canExecuteRunbook && (
                    <button
                      onClick={() => handleStartRunbook(rbItem.runbookId)}
                      disabled={Boolean(activeExecution)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Start Runbook
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirm Root Cause Modal */}
      {confirmModalHypothesis && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-100">
              Confirm Incident Root Cause
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              As an authorized operator, you are confirming this service and hypothesis as the verified root cause.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300">
                  Target Service
                </label>
                <div className="mt-1 text-xs text-slate-200 font-semibold">
                  {confirmModalHypothesis.candidateServiceName || 'Infrastructure'}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">
                  Confirmed Summary Note
                </label>
                <textarea
                  rows={3}
                  value={confirmSummary}
                  onChange={(e) => setConfirmSummary(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 p-2.5 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
                  placeholder="Summarize root cause details for the incident timeline..."
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setConfirmModalHypothesis(null)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRootCause}
                disabled={submittingFeedback}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
              >
                {submittingFeedback ? 'Confirming...' : 'Confirm Root Cause'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Hypothesis Modal */}
      {rejectModalHypothesis && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-100">
              Reject Hypothesis #{rejectModalHypothesis.rank}
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Provide feedback on why this hypothesis is rejected to record in the audit trail.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-300">
                Rejection Reason *
              </label>
              <textarea
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 p-2.5 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
                placeholder="e.g. Failure was triggered by a bad database migration, not network timeout..."
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setRejectModalHypothesis(null)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectHypothesis}
                disabled={submittingFeedback || !rejectionReason.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-rose-500 disabled:opacity-50"
              >
                {submittingFeedback ? 'Rejecting...' : 'Reject Hypothesis'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
