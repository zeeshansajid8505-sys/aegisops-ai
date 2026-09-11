'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertOctagon,
  Sparkles,
  Layers,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface ReliabilitySnapshotProps {
  organizationId?: string;
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

export function ReliabilitySnapshot({ organizationId }: ReliabilitySnapshotProps) {
  const { data: reliability, isLoading } = useQuery({
    queryKey: ['reliability-summary', organizationId, '30d'],
    queryFn: () => api.reliability.getSummary(organizationId!, '30d'),
    enabled: !!organizationId,
    staleTime: 30000,
  });

  if (!organizationId || isLoading) {
    return (
      <div className="p-3.5 rounded-xl bg-slate-900/40 border border-slate-800/80 animate-pulse flex items-center justify-between">
        <div className="h-4 w-32 bg-slate-800 rounded" />
        <div className="h-4 w-48 bg-slate-800 rounded" />
      </div>
    );
  }

  const metrics = reliability?.metrics;
  const aiAgreement = reliability?.aiAgreement;
  const sampleCount = metrics?.sampleCount ?? 0;

  return (
    <div className="p-4 rounded-xl bg-gradient-to-r from-slate-900/90 via-slate-900/60 to-slate-950 border border-slate-800/90 shadow-sm transition-all">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800/60">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-slate-200 tracking-wide uppercase">
                30-Day Reliability & Response Trends
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/60">
                Live Blended
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Mean times to acknowledge, mitigate, and resolve based on authoritative incident lifecycle telemetry.
            </p>
          </div>
        </div>

        {reliability?.potentialRecurrences && reliability.potentialRecurrences.length > 0 && (
          <div className="flex items-center space-x-1.5 text-[11px] px-2.5 py-1 rounded-md bg-amber-950/60 border border-amber-800/50 text-amber-300">
            <Layers className="h-3.5 w-3.5 text-amber-400" />
            <span>
              {reliability.potentialRecurrences.length} Potential Recurrence Pattern
              {reliability.potentialRecurrences.length > 1 ? 's' : ''} Detected
            </span>
          </div>
        )}
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 pt-3.5">
        {/* MTTA */}
        <div className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800/60">
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-0.5">
            <span className="flex items-center space-x-1">
              <Clock className="h-3 w-3 text-cyan-400" />
              <span>Mean Time to Ack</span>
            </span>
          </div>
          <div className="text-lg font-bold font-mono text-slate-100">
            {formatDuration(metrics?.mttaSeconds ?? null)}
          </div>
          <div className="text-[10px] text-slate-400">
            {metrics?.acknowledgedCount ?? 0} acknowledged
          </div>
        </div>

        {/* MTTM */}
        <div className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800/60">
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-0.5">
            <span className="flex items-center space-x-1">
              <Clock className="h-3 w-3 text-indigo-400" />
              <span>Mean Time to Mitigate</span>
            </span>
          </div>
          <div className="text-lg font-bold font-mono text-slate-100">
            {formatDuration(metrics?.mttmSeconds ?? null)}
          </div>
          <div className="text-[10px] text-slate-400">Signal mitigation</div>
        </div>

        {/* MTTR */}
        <div className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800/60">
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-0.5">
            <span className="flex items-center space-x-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              <span>Mean Time to Resolve</span>
            </span>
          </div>
          <div className="text-lg font-bold font-mono text-slate-100">
            {formatDuration(metrics?.mttrSeconds ?? null)}
          </div>
          <div className="text-[10px] text-slate-400">
            {metrics?.resolvedCount ?? 0} resolved
          </div>
        </div>

        {/* Total Incidents */}
        <div className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800/60">
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-0.5">
            <span className="flex items-center space-x-1">
              <AlertOctagon className="h-3 w-3 text-rose-400" />
              <span>Incidents (30d)</span>
            </span>
          </div>
          <div className="text-lg font-bold font-mono text-slate-100 flex items-baseline space-x-1.5">
            <span>{sampleCount}</span>
            {reliability?.severityDistribution?.SEV_1 ? (
              <span className="text-[10px] text-rose-400 font-mono">
                ({reliability.severityDistribution.SEV_1} P1)
              </span>
            ) : null}
          </div>
          <div className="text-[10px] text-slate-400">Total volume</div>
        </div>

        {/* AI Top-1 Agreement */}
        <div className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800/60 col-span-2 sm:col-span-4 lg:col-span-1">
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-0.5">
            <span className="flex items-center space-x-1">
              <Sparkles className="h-3 w-3 text-amber-400" />
              <span>AI Top-1 Agreement</span>
            </span>
          </div>
          <div className="text-lg font-bold font-mono text-slate-100">
            {aiAgreement?.agreementPercentage !== null && aiAgreement?.agreementPercentage !== undefined
              ? `${aiAgreement.agreementPercentage}%`
              : 'N/A'}
          </div>
          <div className="text-[10px] text-slate-400">
            {aiAgreement?.humanConfirmedIncidentsCount ?? 0} human confirmed
          </div>
        </div>
      </div>
    </div>
  );
}

