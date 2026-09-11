'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertOctagon,
  AlertTriangle,
  Layers,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { ReliabilityTimeRange } from '@aegisops/types';

interface ServiceReliabilitySectionProps {
  organizationId: string;
  serviceId: string;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return 'N/A';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  if (mins < 60) return `${mins}m ${remSec > 0 ? remSec + 's' : ''}`.trim();
  const hrs = Math.floor(mins / 60);
  const remMin = mins % 60;
  return `${hrs}h ${remMin > 0 ? remMin + 'm' : ''}`.trim();
}

export function ServiceReliabilitySection({
  organizationId,
  serviceId,
}: ServiceReliabilitySectionProps) {
  const [timeRange, setTimeRange] = useState<ReliabilityTimeRange>('30d');

  const { data: reliability, isLoading, refetch } = useQuery({
    queryKey: ['service-reliability', organizationId, serviceId, timeRange],
    queryFn: () => api.reliability.getServiceSummary(organizationId, serviceId, timeRange),
    enabled: !!organizationId && !!serviceId,
  });

  const metrics = reliability?.metrics;
  const recentIncidents = reliability?.recentIncidents ?? [];
  const recurrences = reliability?.potentialRecurrences ?? [];

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100">
              Service Reliability & Incident Response Metrics
            </h3>
            <p className="text-xs text-slate-400">
              Authoritative MTTA, MTTM, and MTTR telemetry bounded by incident lifecycle endpoints.
            </p>
          </div>
        </div>

        {/* Time Range Selector */}
        <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800 self-start sm:self-auto">
          {(['7d', '30d', '90d'] as ReliabilityTimeRange[]).map((tr) => (
            <button
              key={tr}
              type="button"
              onClick={() => setTimeRange(tr)}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                timeRange === tr
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tr.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-xs text-slate-500 animate-pulse">
          Loading service reliability metrics...
        </div>
      ) : (
        <>
          {/* Potential Recurrences Banner (if detected) */}
          {recurrences.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-800/60 space-y-2">
              <div className="flex items-center space-x-2 text-xs font-bold text-amber-300">
                <Layers className="h-4 w-4 text-amber-400" />
                <span>Potential Recurrence Pattern Detected</span>
              </div>
              <p className="text-xs text-slate-300">
                Multiple incidents ({recurrences.map((r) => `${r.incidentCount} incidents on rule '${r.alertRuleName || 'General'}'`).join(', ')}) have repeated on this service during the selected {timeRange} window.
              </p>
            </div>
          )}

          {/* Primary Response Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* MTTA */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>Mean Time to Ack</span>
                <Clock className="h-3.5 w-3.5 text-cyan-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-slate-100">
                {formatDuration(metrics?.mttaSeconds ?? null)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {metrics?.acknowledgedCount ?? 0} qualifying sample(s)
              </div>
            </div>

            {/* MTTM */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>Mean Time to Mitigate</span>
                <Clock className="h-3.5 w-3.5 text-indigo-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-slate-100">
                {formatDuration(metrics?.mttmSeconds ?? null)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">First signal clear</div>
            </div>

            {/* MTTR */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>Mean Time to Resolve</span>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-slate-100">
                {formatDuration(metrics?.mttrSeconds ?? null)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {metrics?.resolvedCount ?? 0} resolved incident(s)
              </div>
            </div>

            {/* Incident Volume */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>Total Incidents</span>
                <AlertOctagon className="h-3.5 w-3.5 text-rose-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-slate-100">
                {metrics?.sampleCount ?? 0}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {reliability?.severityDistribution?.SEV_1 ?? 0} Critical (P1)
              </div>
            </div>
          </div>

          {/* Percentile Precision Strip */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1">
              <div className="text-xs text-slate-400">P50 MTTR (Median Resolution Time)</div>
              <div className="text-xl font-bold font-mono text-slate-200">
                {metrics?.p50MttrSeconds !== null && metrics?.p50MttrSeconds !== undefined
                  ? formatDuration(metrics.p50MttrSeconds)
                  : 'Insufficient Data (requires ≥ 5 samples)'}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1">
              <div className="text-xs text-slate-400">P90 MTTR (Tail Latency)</div>
              <div className="text-xl font-bold font-mono text-slate-200">
                {metrics?.p90MttrSeconds !== null && metrics?.p90MttrSeconds !== undefined
                  ? formatDuration(metrics.p90MttrSeconds)
                  : 'Insufficient Data (requires ≥ 5 samples)'}
              </div>
            </div>
          </div>

          {/* Recent Service Incidents */}
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                Recent Incidents for this Service ({recentIncidents.length})
              </h4>
              <Link
                href="/incidents"
                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center space-x-1"
              >
                <span>Command Console</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {recentIncidents.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No incidents recorded for this service within the last {timeRange}.
              </div>
            ) : (
              <div className="divide-y divide-slate-800">
                {recentIncidents.map((inc) => (
                  <div
                    key={inc.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <Link
                          href={`/incidents/${inc.id}`}
                          className="font-mono text-xs font-bold text-rose-400 hover:underline"
                        >
                          {inc.incidentKey}
                        </Link>
                        <span className="text-xs font-semibold text-slate-200">{inc.title}</span>
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                            inc.severity === 'SEV_1'
                              ? 'bg-rose-950 text-rose-300 border-rose-800'
                              : inc.severity === 'SEV_2'
                              ? 'bg-orange-950 text-orange-300 border-orange-800'
                              : 'bg-amber-950 text-amber-300 border-amber-800'
                          }`}
                        >
                          {inc.severity}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Detected at {new Date(inc.detectedAt).toLocaleString()} &bull; Status: {inc.status}
                      </div>
                    </div>

                    <div className="text-right font-mono text-xs text-slate-400">
                      MTTR: {formatDuration(inc.mttrSeconds)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

