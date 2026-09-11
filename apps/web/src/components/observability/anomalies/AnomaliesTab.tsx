'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Sparkles,
  Activity,
  ShieldAlert,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Cpu,
} from 'lucide-react';
import { api } from '@/lib/api';
import { AnomalyDetectorsList } from './AnomalyDetectorsList';
import { AnomalyFindingsList } from './AnomalyFindingsList';
import { CreateDetectorModal } from './CreateDetectorModal';
import { AnomalyBacktestModal } from './AnomalyBacktestModal';
import { AnomalyFindingDrawer } from './AnomalyFindingDrawer';
import type {
  AnomalyDetectorSummary,
  EnvironmentSummary,
} from '@aegisops/types';

interface AnomaliesTabProps {
  organizationId: string;
  serviceId: string;
  serviceName: string;
  environments: EnvironmentSummary[];
}

export const AnomaliesTab: React.FC<AnomaliesTabProps> = ({
  organizationId,
  serviceId,
  serviceName,
  environments,
}) => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedBacktestDetector, setSelectedBacktestDetector] =
    useState<AnomalyDetectorSummary | null>(null);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);

  // Load detectors and findings to compute summary metrics
  const { data: detectors, refetch: refetchDetectors } = useQuery({
    queryKey: ['anomaly-detectors', organizationId, serviceId],
    queryFn: () => api.anomalies.listDetectors(organizationId, serviceId),
    enabled: !!organizationId && !!serviceId,
  });

  const { data: findings, refetch: refetchFindings } = useQuery({
    queryKey: ['anomaly-findings', organizationId, serviceId],
    queryFn: () => api.anomalies.listFindings(organizationId, { serviceId }),
    enabled: !!organizationId && !!serviceId,
  });

  const activeDetectorsCount = (detectors ?? []).filter((d) => d.status === 'ENABLED').length;
  const readyModelsCount = (detectors ?? []).filter(
    (d) => d.currentModelStatus === 'READY',
  ).length;
  const activeFindings = (findings ?? []).filter(
    (f) => f.state === 'ANOMALOUS' || f.state === 'PENDING',
  );

  return (
    <div className="space-y-6">
      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Configured Detectors</span>
            <Sparkles className="h-4 w-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-100">
            {activeDetectorsCount}{' '}
            <span className="text-xs font-normal text-slate-500">
              active / {detectors?.length ?? 0} total
            </span>
          </div>
          <div className="text-[11px] text-slate-500">
            Unsupervised Isolation Forest
          </div>
        </div>

        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Trained Models</span>
            <Cpu className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            {readyModelsCount}{' '}
            <span className="text-xs font-normal text-slate-500">
              ready for inference
            </span>
          </div>
          <div className="text-[11px] text-slate-500">
            Clean baseline outage masking
          </div>
        </div>

        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Active Anomaly Signals</span>
            <AlertTriangle
              className={`h-4 w-4 ${
                activeFindings.length > 0 ? 'text-rose-400 animate-pulse' : 'text-slate-500'
              }`}
            />
          </div>
          <div
            className={`text-2xl font-bold font-mono ${
              activeFindings.length > 0 ? 'text-rose-400' : 'text-slate-400'
            }`}
          >
            {activeFindings.length}
          </div>
          <div className="text-[11px] text-slate-500">
            Hysteresis-validated signals
          </div>
        </div>
      </div>

      {/* Main Sections */}
      <div className="space-y-6">
        {/* Active Signals section */}
        <div className="p-5 bg-slate-900/40 border border-slate-800 rounded-xl space-y-4">
          <AnomalyFindingsList
            organizationId={organizationId}
            serviceId={serviceId}
            onSelectFinding={(id) => setSelectedFindingId(id)}
          />
        </div>

        {/* Detectors section */}
        <div className="p-5 bg-slate-900/40 border border-slate-800 rounded-xl space-y-4">
          <AnomalyDetectorsList
            organizationId={organizationId}
            serviceId={serviceId}
            onOpenCreateModal={() => setIsCreateModalOpen(true)}
            onOpenBacktestModal={(detector) => setSelectedBacktestDetector(detector)}
          />
        </div>
      </div>

      {/* Modals & Slide-over Drawer */}
      <CreateDetectorModal
        organizationId={organizationId}
        serviceId={serviceId}
        environments={environments}
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onDetectorCreated={() => {
          refetchDetectors();
          refetchFindings();
        }}
      />

      {selectedBacktestDetector && (
        <AnomalyBacktestModal
          organizationId={organizationId}
          detector={selectedBacktestDetector}
          isOpen={!!selectedBacktestDetector}
          onClose={() => setSelectedBacktestDetector(null)}
        />
      )}

      <AnomalyFindingDrawer
        organizationId={organizationId}
        findingId={selectedFindingId}
        onClose={() => setSelectedFindingId(null)}
        onFeedbackSubmitted={() => {
          refetchFindings();
        }}
      />
    </div>
  );
};

