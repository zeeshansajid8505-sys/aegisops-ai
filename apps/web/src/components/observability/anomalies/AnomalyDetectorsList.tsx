'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles,
  Sliders,
  Play,
  RotateCw,
  BarChart3,
  Pause,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Activity,
  Layers,
  Loader2,
  Plus,
} from 'lucide-react';
import { api } from '@/lib/api';
import type {
  AnomalyDetectorSummary,
  AnomalyModelStatus,
} from '@aegisops/types';

interface AnomalyDetectorsListProps {
  organizationId: string;
  serviceId: string;
  onOpenCreateModal: () => void;
  onOpenBacktestModal: (detector: AnomalyDetectorSummary) => void;
}

export const AnomalyDetectorsList: React.FC<AnomalyDetectorsListProps> = ({
  organizationId,
  serviceId,
  onOpenCreateModal,
  onOpenBacktestModal,
}) => {
  const queryClient = useQueryClient();
  const [trainingDetectorId, setTrainingDetectorId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const {
    data: detectors,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['anomaly-detectors', organizationId, serviceId],
    queryFn: () => api.anomalies.listDetectors(organizationId, serviceId),
    enabled: !!organizationId && !!serviceId,
    refetchInterval: 15000,
  });

  const triggerTrainingMutation = useMutation({
    mutationFn: async (detectorId: string) => {
      setTrainingDetectorId(detectorId);
      return api.anomalies.triggerTraining(organizationId, detectorId);
    },
    onSuccess: () => {
      setActionFeedback('Training queued successfully! Model will update in background.');
      queryClient.invalidateQueries({ queryKey: ['anomaly-detectors', organizationId, serviceId] });
      setTimeout(() => setActionFeedback(null), 4000);
    },
    onError: (err: any) => {
      setActionFeedback(`Training failed to queue: ${err?.message || 'Unknown error'}`);
    },
    onSettled: () => {
      setTrainingDetectorId(null);
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'ENABLED' | 'DISABLED' }) => {
      return api.anomalies.updateDetector(organizationId, id, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['anomaly-detectors', organizationId, serviceId] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.anomalies.archiveDetector(organizationId, id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['anomaly-detectors', organizationId, serviceId] });
    },
  });

  const getModelStatusBadge = (status?: AnomalyModelStatus | null) => {
    switch (status) {
      case 'READY':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center space-x-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>MODEL READY</span>
          </span>
        );
      case 'TRAINING':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-cyan-950 text-cyan-300 border border-cyan-800 flex items-center space-x-1">
            <Loader2 className="h-2.5 w-2.5 animate-spin text-cyan-400" />
            <span>TRAINING</span>
          </span>
        );
      case 'QUEUED':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-950 text-amber-300 border border-amber-800">
            TRAINING QUEUED
          </span>
        );
      case 'FAILED':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-rose-950 text-rose-300 border border-rose-800">
            MODEL FAILED
          </span>
        );
      case 'INSUFFICIENT_DATA':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-800 text-slate-400 border border-slate-700">
            INSUFFICIENT DATA
          </span>
        );
      default:
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-800 text-slate-400 border border-slate-700">
            NO MODEL
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {actionFeedback && (
        <div className="p-3 bg-purple-950/40 border border-purple-800/80 rounded-xl text-purple-300 text-xs flex items-center justify-between">
          <span>{actionFeedback}</span>
          <button
            onClick={() => setActionFeedback(null)}
            className="text-purple-400 hover:text-purple-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
            Anomaly Detectors ({detectors?.length ?? 0})
          </h3>
          <p className="text-xs text-slate-400">
            Isolation Forest models trained on cleaned operational telemetry
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenCreateModal}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New Detector</span>
        </button>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-slate-400 text-xs bg-slate-900/40 rounded-xl border border-slate-800">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-purple-400" />
          Loading anomaly detectors...
        </div>
      ) : !detectors || detectors.length === 0 ? (
        <div className="p-8 text-center bg-slate-900/30 rounded-xl border border-dashed border-slate-800 text-slate-500 text-xs space-y-3">
          <Sparkles className="h-6 w-6 mx-auto text-purple-400/80" />
          <p className="font-medium text-slate-300">
            No anomaly detectors configured for this service yet.
          </p>
          <p className="text-[11px] text-slate-400 max-w-md mx-auto">
            Configure an unsupervised Isolation Forest detector to automatically baseline healthy telemetry and detect statistical degradation before hard alert thresholds fire.
          </p>
          <button
            type="button"
            onClick={onOpenCreateModal}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Create First Detector</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {detectors.map((detector) => (
            <div
              key={detector.id}
              className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            >
              <div className="space-y-1.5 max-w-xl">
                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                  <span className="font-bold text-sm text-slate-100">
                    {detector.name}
                  </span>
                  <span className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-slate-800 text-purple-300 border border-purple-900/60">
                    {detector.metricName || 'Metric'}
                  </span>
                  {detector.environmentName && (
                    <span className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-slate-800 text-slate-300 border border-slate-700">
                      {detector.environmentName}
                    </span>
                  )}
                  {getModelStatusBadge(detector.currentModelStatus)}
                  {(detector.activeFindingsCount ?? 0) > 0 && (
                    <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold rounded bg-rose-950 text-rose-300 border border-rose-800 animate-pulse">
                      {detector.activeFindingsCount} ACTIVE ANOMALY
                    </span>
                  )}
                </div>

                {detector.description && (
                  <p className="text-xs text-slate-400">{detector.description}</p>
                )}

                <div className="flex items-center space-x-4 text-[11px] text-slate-500 flex-wrap gap-y-1 font-mono">
                  <span>Window: {detector.windowSeconds}s</span>
                  <span>Interval: {detector.evaluationIntervalSeconds}s</span>
                  <span>Lookback: {detector.trainingLookbackHours}h</span>
                  <span>Contamination: {(detector.contamination * 100).toFixed(0)}%</span>
                  {detector.currentModelVersion && (
                    <span className="text-slate-400">
                      Version: v{detector.currentModelVersion}
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2 self-end lg:self-center">
                <button
                  type="button"
                  disabled={
                    triggerTrainingMutation.isPending &&
                    trainingDetectorId === detector.id
                  }
                  onClick={() => triggerTrainingMutation.mutate(detector.id)}
                  className="px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 hover:border-purple-400 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors"
                  title="Queue Model Retraining"
                >
                  {triggerTrainingMutation.isPending &&
                  trainingDetectorId === detector.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RotateCw className="h-3 w-3" />
                  )}
                  <span>Retrain</span>
                </button>

                <button
                  type="button"
                  onClick={() => onOpenBacktestModal(detector)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors"
                  title="Backtest historical performance"
                >
                  <BarChart3 className="h-3 w-3" />
                  <span>Backtest</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    toggleStatusMutation.mutate({
                      id: detector.id,
                      status: detector.status === 'ENABLED' ? 'DISABLED' : 'ENABLED',
                    })
                  }
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 rounded-lg transition-colors"
                  title={detector.status === 'ENABLED' ? 'Disable Detector' : 'Enable Detector'}
                >
                  {detector.status === 'ENABLED' ? (
                    <Pause className="h-3.5 w-3.5" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Archive anomaly detector "${detector.name}"?`)) {
                      archiveMutation.mutate(detector.id);
                    }
                  }}
                  className="p-1.5 bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-slate-700 rounded-lg transition-colors"
                  title="Archive Detector"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

