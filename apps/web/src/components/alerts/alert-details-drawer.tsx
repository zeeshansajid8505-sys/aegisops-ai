'use client';

import React, { useEffect, useState } from 'react';
import {
  X,
  Clock,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Bell,
  Layers,
  History,
  Info,
  Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { AlertInstanceDetail, SeverityLevel } from '@aegisops/types';

interface AlertDetailsDrawerProps {
  organizationId: string;
  alertInstanceId: string | null;
  onClose: () => void;
}

export const AlertDetailsDrawer: React.FC<AlertDetailsDrawerProps> = ({
  organizationId,
  alertInstanceId,
  onClose,
}) => {
  const [alert, setAlert] = useState<AlertInstanceDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!alertInstanceId || !organizationId) {
      setAlert(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    api.alerts
      .getAlert(organizationId, alertInstanceId)
      .then((data) => setAlert(data))
      .catch((err) => setError(err.message || 'Failed to load alert details'))
      .finally(() => setIsLoading(false));
  }, [alertInstanceId, organizationId]);

  if (!alertInstanceId) return null;

  const getSeverityBadge = (sev: SeverityLevel) => {
    switch (sev) {
      case 'SEV-1':
        return 'bg-red-950 text-red-400 border-red-800';
      case 'SEV-2':
        return 'bg-orange-950 text-orange-400 border-orange-800';
      case 'SEV-3':
        return 'bg-amber-950 text-amber-400 border-amber-800';
      case 'SEV-4':
        return 'bg-blue-950 text-blue-400 border-blue-800';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  const getStateBadge = (state: string) => {
    switch (state) {
      case 'FIRING':
        return 'bg-red-500/10 text-red-400 border-red-500/30 animate-pulse';
      case 'PENDING':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'INACTIVE':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-2xl bg-slate-900 border-l border-slate-800 text-slate-100 flex flex-col shadow-2xl">
          {/* Header */}
          <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${
                      alert ? getSeverityBadge(alert.severity) : ''
                    }`}
                  >
                    {alert?.severity ?? 'SEV'}
                  </span>
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${
                      alert ? getStateBadge(alert.state) : ''
                    }`}
                  >
                    {alert?.state ?? 'LOADING'}
                  </span>
                </div>
                <h2 className="text-base font-semibold text-slate-100 mt-1">
                  {alert?.ruleName ?? 'Alert Details'}
                </h2>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {isLoading && (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-950/60 border border-red-800 rounded-lg text-xs text-red-200">
                {error}
              </div>
            )}

            {alert && (
              <>
                {/* Meta Overview */}
                <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-slate-950/60 border border-slate-800 text-xs">
                  <div>
                    <span className="text-slate-400">Service</span>
                    <p className="font-semibold text-slate-200">{alert.serviceName}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Environment</span>
                    <p className="font-semibold text-slate-200">{alert.environmentName}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Current Observed Value</span>
                    <p className="font-mono font-bold text-slate-100 text-sm">
                      {alert.currentValue !== null && alert.currentValue !== undefined
                        ? alert.currentValue.toFixed(2)
                        : 'No Data'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Threshold Condition</span>
                    <p className="font-mono text-slate-300">
                      {alert.comparisonOperator} {alert.thresholdValue}
                    </p>
                  </div>
                </div>

                {/* Timing details */}
                <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2 text-xs">
                  <h3 className="font-semibold text-slate-300 flex items-center space-x-1.5">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    <span>Lifecycle Timing</span>
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                    <div>
                      <span className="text-slate-500">First Breached: </span>
                      <span className="text-slate-300">
                        {alert.firstBreachedAt
                          ? new Date(alert.firstBreachedAt).toLocaleTimeString()
                          : 'None'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Pending Since: </span>
                      <span className="text-slate-300">
                        {alert.pendingSince
                          ? new Date(alert.pendingSince).toLocaleTimeString()
                          : 'None'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Firing Started: </span>
                      <span className="text-slate-300">
                        {alert.firingStartedAt
                          ? new Date(alert.firingStartedAt).toLocaleTimeString()
                          : 'None'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Recovery Candidate: </span>
                      <span className="text-slate-300">
                        {alert.clearCandidateAt
                          ? new Date(alert.clearCandidateAt).toLocaleTimeString()
                          : 'None'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Resolved At: </span>
                      <span className="text-slate-300">
                        {alert.resolvedAt
                          ? new Date(alert.resolvedAt).toLocaleTimeString()
                          : 'None'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Last Evaluated: </span>
                      <span className="text-slate-300">
                        {new Date(alert.lastEvaluatedAt).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Series Attributes */}
                {alert.seriesAttributes && Object.keys(alert.seriesAttributes).length > 0 && (
                  <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2">
                    <h3 className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                      <Layers className="h-3.5 w-3.5 text-slate-400" />
                      <span>Metric Series Labels</span>
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(alert.seriesAttributes).map(([k, v]) => (
                        <span
                          key={k}
                          className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[11px] font-mono text-slate-300"
                        >
                          <strong className="text-slate-400">{k}:</strong> {v}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* State Transition History Events */}
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5 uppercase tracking-wider">
                    <History className="h-3.5 w-3.5 text-emerald-400" />
                    <span>State Transition Timeline</span>
                  </h3>

                  {!alert.recentEvents || alert.recentEvents.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No transition events recorded.</p>
                  ) : (
                    <div className="space-y-2">
                      {alert.recentEvents.map((evt) => (
                        <div
                          key={evt.id}
                          className="p-3 rounded-lg bg-slate-950/40 border border-slate-800 text-xs flex items-start justify-between space-x-3"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                                  evt.eventType === 'FIRING_STARTED'
                                    ? 'bg-red-950 text-red-400 border border-red-800'
                                    : evt.eventType === 'PENDING_STARTED'
                                    ? 'bg-amber-950 text-amber-400 border border-amber-800'
                                    : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                }`}
                              >
                                {evt.eventType}
                              </span>
                              {evt.fromState && evt.toState && (
                                <span className="text-slate-400 text-[11px] font-mono">
                                  {evt.fromState} &rarr; {evt.toState}
                                </span>
                              )}
                            </div>
                            <p className="text-slate-300 text-xs">{evt.message}</p>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap">
                            {new Date(evt.occurredAt).toLocaleTimeString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent Evaluations */}
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5 uppercase tracking-wider">
                    <Activity className="h-3.5 w-3.5 text-cyan-400" />
                    <span>Recent Evaluations ({alert.recentEvaluations?.length ?? 0})</span>
                  </h3>

                  {!alert.recentEvaluations || alert.recentEvaluations.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No evaluations recorded yet.</p>
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/40">
                      <table className="w-full text-left text-[11px] font-mono">
                        <thead className="bg-slate-950/80 text-slate-400 uppercase">
                          <tr>
                            <th className="px-3 py-1.5">Evaluated At</th>
                            <th className="px-3 py-1.5">Result</th>
                            <th className="px-3 py-1.5">Observed</th>
                            <th className="px-3 py-1.5">Samples</th>
                            <th className="px-3 py-1.5">Latency</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {alert.recentEvaluations.map((evalRecord) => (
                            <tr key={evalRecord.id} className="hover:bg-slate-800/30">
                              <td className="px-3 py-1.5 text-slate-400">
                                {new Date(evalRecord.evaluatedAt).toLocaleTimeString()}
                              </td>
                              <td className="px-3 py-1.5">
                                <span
                                  className={
                                    evalRecord.result === 'BREACH'
                                      ? 'text-red-400 font-bold'
                                      : evalRecord.result === 'NO_DATA'
                                      ? 'text-amber-400'
                                      : evalRecord.result === 'ERROR'
                                      ? 'text-purple-400 font-bold'
                                      : 'text-emerald-400'
                                  }
                                >
                                  {evalRecord.result}
                                </span>
                              </td>
                              <td className="px-3 py-1.5 text-slate-200">
                                {evalRecord.observedValue !== null && evalRecord.observedValue !== undefined
                                  ? Number(evalRecord.observedValue).toFixed(2)
                                  : '-'}
                              </td>
                              <td className="px-3 py-1.5 text-slate-400">
                                {evalRecord.sampleCount}
                              </td>
                              <td className="px-3 py-1.5 text-slate-500">
                                {evalRecord.durationMs}ms
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
