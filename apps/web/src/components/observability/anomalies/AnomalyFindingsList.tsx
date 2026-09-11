'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles,
  ChevronRight,
  Filter,
  RefreshCw,
  Eye,
  Info,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { AnomalyFindingState, AnomalyFindingSummary } from '@aegisops/types';

interface AnomalyFindingsListProps {
  organizationId: string;
  serviceId: string;
  onSelectFinding: (findingId: string) => void;
}

export const AnomalyFindingsList: React.FC<AnomalyFindingsListProps> = ({
  organizationId,
  serviceId,
  onSelectFinding,
}) => {
  const [filterState, setFilterState] = useState<'ALL' | 'ACTIVE' | 'RESOLVED'>('ACTIVE');

  const {
    data: findings,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['anomaly-findings', organizationId, serviceId],
    queryFn: () => api.anomalies.listFindings(organizationId, { serviceId, limit: 50 }),
    enabled: !!organizationId && !!serviceId,
    refetchInterval: 15000,
  });

  const filteredFindings = (findings ?? []).filter((f) => {
    if (filterState === 'ACTIVE') return f.state === 'ANOMALOUS' || f.state === 'PENDING';
    if (filterState === 'RESOLVED') return f.state === 'RESOLVED';
    return true;
  });

  const getScoreColor = (score: number) => {
    if (score >= 75) return 'text-rose-400 bg-rose-950/80 border-rose-800/80';
    if (score >= 50) return 'text-amber-400 bg-amber-950/80 border-amber-800/80';
    return 'text-emerald-400 bg-emerald-950/80 border-emerald-800/80';
  };

  const getStateBadge = (state: AnomalyFindingState) => {
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
            PENDING
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
    <div className="space-y-4">
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
            Anomaly Findings
          </span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
            {filteredFindings.length}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1 p-0.5 bg-slate-950/80 border border-slate-800 rounded-lg text-xs">
            {(['ACTIVE', 'RESOLVED', 'ALL'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFilterState(mode)}
                className={`px-2.5 py-1 rounded text-xs transition-colors ${
                  filterState === mode
                    ? 'bg-purple-600 text-white font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {mode === 'ACTIVE' ? 'Active Signals' : mode === 'RESOLVED' ? 'Resolved' : 'All'}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 rounded-lg transition-colors"
            title="Refresh Findings"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin text-purple-400' : ''}`} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-slate-400 text-xs bg-slate-900/40 rounded-xl border border-slate-800">
          <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-2 text-purple-400" />
          Loading anomaly findings...
        </div>
      ) : filteredFindings.length === 0 ? (
        <div className="p-8 text-center bg-slate-900/30 rounded-xl border border-dashed border-slate-800 text-slate-500 text-xs">
          <CheckCircle2 className="h-5 w-5 mx-auto mb-2 text-slate-600" />
          <p className="font-medium text-slate-400">No anomaly findings in this view</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {filterState === 'ACTIVE'
              ? 'Telemetry matches unsupervised Isolation Forest baselines. No statistical drift detected.'
              : 'No resolved anomalies found for this service.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredFindings.map((finding) => (
            <div
              key={finding.id}
              onClick={() => onSelectFinding(finding.id)}
              className="group p-4 bg-slate-900/60 hover:bg-slate-900/90 border border-slate-800 hover:border-purple-500/50 rounded-xl transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
            >
              <div className="space-y-1.5 max-w-xl">
                <div className="flex items-center space-x-2">
                  {getStateBadge(finding.state)}
                  <span className="font-mono font-semibold text-xs text-slate-200 group-hover:text-purple-300 transition-colors">
                    {finding.metricName || 'Telemetry Metric'}
                  </span>
                  {finding.environmentName && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      {finding.environmentName}
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-3 text-[11px] text-slate-400">
                  <span>Detector: {finding.detectorName || 'Isolation Forest'}</span>
                  <span>•</span>
                  <span>
                    Started:{' '}
                    {finding.firstDetectedAt
                      ? new Date(finding.firstDetectedAt).toLocaleTimeString()
                      : '—'}
                  </span>
                  {finding.feedbacksCount ? (
                    <>
                      <span>•</span>
                      <span className="text-purple-400">
                        {finding.feedbacksCount} feedback recorded
                      </span>
                    </>
                  ) : null}
                </div>
              </div>

              {/* Score indicators & Action */}
              <div className="flex items-center space-x-4 self-end sm:self-center">
                <div className="text-right">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider">
                    Deviation Score
                  </div>
                  <div className="flex items-baseline space-x-1 justify-end">
                    <span
                      className={`font-mono font-bold text-base ${
                        finding.currentScore >= 65 ? 'text-rose-400' : 'text-purple-400'
                      }`}
                    >
                      {finding.currentScore.toFixed(1)}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      (Peak {finding.peakScore.toFixed(1)})
                    </span>
                  </div>
                </div>

                <div className="p-1 text-slate-500 group-hover:text-slate-200 transition-colors">
                  <ChevronRight className="h-5 w-5" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

