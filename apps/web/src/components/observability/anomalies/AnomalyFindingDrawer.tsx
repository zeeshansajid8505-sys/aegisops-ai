'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Activity,
  Layers,
  Sparkles,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  HelpCircle,
  Shield,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { api } from '@/lib/api';
import type {
  AnomalyFeedbackClassification,
  AnomalyFindingDetail,
  AnomalyFindingSummary,
} from '@aegisops/types';

interface AnomalyFindingDrawerProps {
  organizationId: string;
  findingId: string | null;
  onClose: () => void;
  onFeedbackSubmitted?: () => void;
}

export const AnomalyFindingDrawer: React.FC<AnomalyFindingDrawerProps> = ({
  organizationId,
  findingId,
  onClose,
  onFeedbackSubmitted,
}) => {
  const [detail, setDetail] = useState<AnomalyFindingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Feedback Form State
  const [feedbackClassification, setFeedbackClassification] =
    useState<AnomalyFeedbackClassification>('USEFUL');
  const [feedbackNote, setFeedbackNote] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);

  useEffect(() => {
    if (!findingId || !organizationId) {
      setDetail(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    setFeedbackSuccess(false);

    api.anomalies
      .getFinding(organizationId, findingId)
      .then((data) => {
        setDetail(data);
      })
      .catch((err: any) => {
        setError(err?.message || 'Failed to load finding details');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [findingId, organizationId]);

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || !organizationId) return;

    setIsSubmittingFeedback(true);
    try {
      await api.anomalies.submitFeedback(organizationId, detail.id, {
        classification: feedbackClassification,
        note: feedbackNote.trim() || undefined,
      });
      setFeedbackSuccess(true);
      setFeedbackNote('');
      // Reload details to include new feedback
      const updated = await api.anomalies.getFinding(organizationId, detail.id);
      setDetail(updated);
      onFeedbackSubmitted?.();
    } catch (err: any) {
      setError(err?.message || 'Failed to submit feedback');
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  if (!findingId) return null;

  const getScoreColor = (score: number) => {
    if (score >= 75) return 'text-rose-400 bg-rose-950/80 border-rose-800';
    if (score >= 50) return 'text-amber-400 bg-amber-950/80 border-amber-800';
    return 'text-emerald-400 bg-emerald-950/80 border-emerald-800';
  };

  const getStateBadge = (state: string) => {
    switch (state) {
      case 'ANOMALOUS':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-rose-950 text-rose-300 border border-rose-800">
            ANOMALOUS
          </span>
        );
      case 'PENDING':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-amber-950 text-amber-300 border border-amber-800">
            PENDING (HYSTERESIS)
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-emerald-950 text-emerald-300 border border-emerald-800">
            RESOLVED
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
            {state}
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm animate-fade-in flex justify-end">
      <div className="relative w-full max-w-xl bg-slate-900 border-l border-slate-800 shadow-2xl h-full flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/80 flex items-start justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono text-purple-400 font-semibold uppercase">
                Proactive ML Signal
              </span>
              {detail && getStateBadge(detail.state)}
            </div>
            <h2 className="text-base font-bold text-slate-100">
              {detail?.metricName || 'Telemetry Anomaly'}
            </h2>
            <div className="flex items-center space-x-2 text-xs text-slate-400">
              <span>Service: {detail?.serviceName || 'Unknown'}</span>
              <span>•</span>
              <span>Detector: {detail?.detectorName || 'Isolation Forest'}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {isLoading && (
            <div className="p-8 text-center text-slate-400 flex items-center justify-center space-x-2">
              <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
              <span>Loading anomaly finding telemetry...</span>
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/80 rounded-xl text-rose-300 flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {detail && (
            <>
              {/* Anomaly Score Card */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
                  <div className="text-[11px] text-slate-400 font-medium">
                    Current Statistical Deviation
                  </div>
                  <div className="flex items-baseline space-x-2">
                    <span className="text-2xl font-bold font-mono text-slate-100">
                      {detail.currentScore.toFixed(1)}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">/ 100</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        detail.currentScore >= 65 ? 'bg-rose-500' : 'bg-purple-500'
                      }`}
                      style={{ width: `${Math.min(100, detail.currentScore)}%` }}
                    />
                  </div>
                </div>

                <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
                  <div className="text-[11px] text-slate-400 font-medium">
                    Peak Anomaly Score
                  </div>
                  <div className="flex items-baseline space-x-2">
                    <span className="text-2xl font-bold font-mono text-rose-400">
                      {detail.peakScore.toFixed(1)}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">/ 100</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-rose-500"
                      style={{ width: `${Math.min(100, detail.peakScore)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* RCA Correlation Banner */}
              <div className="p-3.5 bg-purple-950/20 border border-purple-900/40 rounded-xl flex items-start space-x-2.5 text-purple-200">
                <Sparkles className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <span className="font-semibold block mb-0.5">
                    Proactive RCA Evidence Integration
                  </span>
                  <span>
                    This anomaly finding is active in evidence feeds. If an incident is investigated on{' '}
                    <strong>{detail.serviceName}</strong>, the AI Root Cause Analysis engine correlates this deviation as non-invasive candidate evidence.
                  </span>
                </div>
              </div>

              {/* Lifecycle Timestamps */}
              <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                <h4 className="font-semibold text-slate-200 text-xs mb-2">
                  Timeline & Persistence
                </h4>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-slate-500 block">First Detected</span>
                    <span className="font-mono text-slate-300">
                      {detail.firstDetectedAt
                        ? new Date(detail.firstDetectedAt).toLocaleString()
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Anomalous Since</span>
                    <span className="font-mono text-slate-300">
                      {detail.anomalousSince
                        ? new Date(detail.anomalousSince).toLocaleString()
                        : 'Pending evaluation'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Last Anomalous Window</span>
                    <span className="font-mono text-slate-300">
                      {detail.lastAnomalousAt
                        ? new Date(detail.lastAnomalousAt).toLocaleTimeString()
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Resolved At</span>
                    <span className="font-mono text-slate-300">
                      {detail.resolvedAt
                        ? new Date(detail.resolvedAt).toLocaleString()
                        : 'Active (Unresolved)'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Feature Attribution (Latest Evaluation) */}
              {detail.recentEvaluations && detail.recentEvaluations.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-semibold text-slate-200 flex items-center justify-between">
                    <span>Feature Attribution (Latest Evaluation)</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      Window: {new Date(detail.recentEvaluations[0]!.windowStart).toLocaleTimeString()} - {new Date(detail.recentEvaluations[0]!.windowEnd).toLocaleTimeString()}
                    </span>
                  </h4>
                  <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden divide-y divide-slate-800/60">
                    {Object.entries(detail.recentEvaluations[0]!.featureVector || {}).map(
                      ([key, val]) => (
                        <div
                          key={key}
                          className="px-3.5 py-2 flex items-center justify-between text-[11px]"
                        >
                          <span className="font-mono text-slate-300">{key}</span>
                          <span className="font-mono font-semibold text-slate-100">
                            {typeof val === 'number' ? val.toFixed(3) : String(val)}
                          </span>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              )}

              {/* Recent Evaluation Windows */}
              {detail.recentEvaluations && detail.recentEvaluations.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-slate-200">
                    Recent Evaluation History ({detail.recentEvaluations.length})
                  </h4>
                  <div className="max-h-40 overflow-y-auto space-y-1.5 p-2 bg-slate-950 rounded-xl border border-slate-800">
                    {detail.recentEvaluations.map((ev) => (
                      <div
                        key={ev.id}
                        className="px-3 py-1.5 bg-slate-900/60 rounded flex items-center justify-between font-mono text-[11px]"
                      >
                        <span className="text-slate-400">
                          {new Date(ev.evaluatedAt).toLocaleTimeString()}
                        </span>
                        <div className="flex items-center space-x-2">
                          <span className="text-slate-300">
                            Score: {ev.normalizedScore.toFixed(1)}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${
                              ev.result === 'ANOMALOUS'
                                ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            }`}
                          >
                            {ev.result}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Operator Feedback Section */}
              <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-4">
                <div className="flex items-center space-x-2">
                  <MessageSquare className="h-4 w-4 text-purple-400" />
                  <h4 className="font-semibold text-slate-200">
                    Submit Operational Feedback
                  </h4>
                </div>
                <p className="text-[11px] text-slate-400">
                  Help tune the baseline model by labeling whether this statistical deviation represents a true operational anomaly.
                </p>

                {feedbackSuccess && (
                  <div className="p-2.5 bg-emerald-950/40 border border-emerald-800/80 rounded-lg text-emerald-300 flex items-center space-x-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    <span>Feedback recorded successfully. Thank you!</span>
                  </div>
                )}

                <form onSubmit={handleSubmitFeedback} className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'USEFUL' as AnomalyFeedbackClassification, label: 'Useful', icon: ThumbsUp },
                      { id: 'FALSE_POSITIVE' as AnomalyFeedbackClassification, label: 'False Alarm', icon: ThumbsDown },
                      { id: 'EXPECTED_BEHAVIOR' as AnomalyFeedbackClassification, label: 'Expected', icon: Activity },
                      { id: 'UNSURE' as AnomalyFeedbackClassification, label: 'Unsure', icon: HelpCircle },
                    ].map((btn) => {
                      const Icon = btn.icon;
                      return (
                        <button
                          key={btn.id}
                          type="button"
                          onClick={() => setFeedbackClassification(btn.id)}
                          className={`p-2 rounded-lg border flex items-center justify-center space-x-1.5 transition-colors text-[11px] ${
                            feedbackClassification === btn.id
                              ? 'bg-purple-600 text-white border-purple-500 font-semibold'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          <span>{btn.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <input
                    type="text"
                    value={feedbackNote}
                    onChange={(e) => setFeedbackNote(e.target.value)}
                    placeholder="Optional operator notes (e.g. correlated with load test, known migration)"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-purple-500"
                  />

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isSubmittingFeedback}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors"
                    >
                      {isSubmittingFeedback ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>Submitting...</span>
                        </>
                      ) : (
                        <span>Save Feedback</span>
                      )}
                    </button>
                  </div>
                </form>

                {/* Prior feedback items */}
                {detail.feedbacks && detail.feedbacks.length > 0 && (
                  <div className="pt-3 border-t border-slate-800/80 space-y-2">
                    <span className="text-[10px] text-slate-500 block uppercase font-medium">
                      Recorded Feedback ({detail.feedbacks.length})
                    </span>
                    {detail.feedbacks.map((fb) => (
                      <div
                        key={fb.id}
                        className="p-2.5 bg-slate-900/60 rounded-lg border border-slate-800/60 flex items-center justify-between text-[11px]"
                      >
                        <div className="space-y-0.5">
                          <span className="font-semibold text-slate-300">
                            {fb.classification.replace('_', ' ')}
                          </span>
                          {fb.note && (
                            <p className="text-slate-400 italic text-[10px]">
                              &quot;{fb.note}&quot;
                            </p>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-slate-500">
                          {new Date(fb.createdAt).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

