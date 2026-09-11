'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Sliders,
  ShieldAlert,
  Loader2,
  CheckCircle2,
  Info,
  Clock,
  Activity,
} from 'lucide-react';
import { api } from '@/lib/api';
import type {
  AnomalySensitivity,
  CreateAnomalyDetectorDto,
  EnvironmentSummary,
  MetricDefinitionSummary,
} from '@aegisops/types';

interface CreateDetectorModalProps {
  organizationId: string;
  serviceId: string;
  environments: EnvironmentSummary[];
  isOpen: boolean;
  onClose: () => void;
  onDetectorCreated: () => void;
}

export const CreateDetectorModal: React.FC<CreateDetectorModalProps> = ({
  organizationId,
  serviceId,
  environments,
  isOpen,
  onClose,
  onDetectorCreated,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<string>(
    environments[0]?.id || '',
  );
  const [definitions, setDefinitions] = useState<MetricDefinitionSummary[]>([]);
  const [selectedDefinitionId, setSelectedDefinitionId] = useState<string>('');
  const [sensitivity, setSensitivity] = useState<AnomalySensitivity>('BALANCED');
  const [windowSeconds, setWindowSeconds] = useState(300);
  const [evaluationIntervalSeconds, setEvaluationIntervalSeconds] = useState(60);
  const [trainingLookbackHours, setTrainingLookbackHours] = useState(72);
  const [retrainIntervalHours, setRetrainIntervalHours] = useState(24);
  const [autoTrain, setAutoTrain] = useState(true);

  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update selectedEnvironmentId if environments change
  useEffect(() => {
    if (environments.length > 0 && !selectedEnvironmentId) {
      setSelectedEnvironmentId(environments[0]!.id);
    }
  }, [environments, selectedEnvironmentId]);

  // Load Metric Definitions
  useEffect(() => {
    if (!isOpen || !organizationId || !serviceId) return;
    setIsLoadingMetrics(true);
    api.telemetry
      .getDefinitions(organizationId, serviceId, {
        environmentId: selectedEnvironmentId || undefined,
      })
      .then((defs) => {
        setDefinitions(defs);
        if (defs.length > 0) {
          setSelectedDefinitionId(defs[0]!.id);
          if (!name) {
            setName(`${defs[0]!.name} Anomaly Detector`);
          }
        } else {
          setSelectedDefinitionId('');
        }
      })
      .catch((err) => {
        setError(`Failed to load metric definitions: ${err?.message || 'Unknown error'}`);
      })
      .finally(() => {
        setIsLoadingMetrics(false);
      });
  }, [isOpen, organizationId, serviceId, selectedEnvironmentId]);

  // Auto-update default detector name when metric changes
  const handleMetricChange = (metricId: string) => {
    setSelectedDefinitionId(metricId);
    const chosen = definitions.find((d) => d.id === metricId);
    if (chosen && (!name || name.endsWith('Anomaly Detector'))) {
      setName(`${chosen.name} Anomaly Detector`);
    }
  };

  const selectedMetric = definitions.find((d) => d.id === selectedDefinitionId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a name for the detector.');
      return;
    }
    if (!selectedDefinitionId) {
      setError('Please select a metric definition to monitor.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const payload: CreateAnomalyDetectorDto = {
        name: name.trim(),
        description: description.trim() || undefined,
        metricDefinitionId: selectedDefinitionId,
        windowSeconds,
        evaluationIntervalSeconds,
        trainingLookbackHours,
        sensitivity,
        retrainIntervalHours,
      };

      const created = await api.anomalies.createDetector(organizationId, payload);

      if (autoTrain && created.id) {
        try {
          await api.anomalies.triggerTraining(organizationId, created.id);
        } catch {
          // Training queued in background, non-blocking for modal
        }
      }

      onDetectorCreated();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to create anomaly detector');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400 border border-purple-500/20">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">
                New Unsupervised Anomaly Detector
              </h2>
              <p className="text-xs text-slate-400">
                Isolation Forest ML model with clean baseline outage masking
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {error && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/80 rounded-xl text-rose-300 flex items-center space-x-2">
              <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Metric Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-slate-300 mb-1.5">
                Target Environment
              </label>
              <select
                value={selectedEnvironmentId}
                onChange={(e) => setSelectedEnvironmentId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-purple-500"
              >
                {environments.map((env) => (
                  <option key={env.id} value={env.id}>
                    {env.name} ({env.kind})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-300 mb-1.5">
                Telemetry Metric
              </label>
              {isLoadingMetrics ? (
                <div className="flex items-center space-x-2 text-slate-400 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading metric series...</span>
                </div>
              ) : definitions.length === 0 ? (
                <div className="text-slate-500 py-2 italic">
                  No telemetry metrics ingested for this environment yet.
                </div>
              ) : (
                <select
                  value={selectedDefinitionId}
                  onChange={(e) => handleMetricChange(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-purple-500 font-mono text-[11px]"
                >
                  {definitions.map((def) => (
                    <option key={def.id} value={def.id}>
                      {def.name} ({def.instrumentType})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {selectedMetric && (
            <div className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-xl flex items-center justify-between text-slate-400">
              <div className="flex items-center space-x-2">
                <Activity className="h-4 w-4 text-purple-400" />
                <span className="font-mono text-slate-200">{selectedMetric.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {selectedMetric.instrumentType}
                </span>
                {selectedMetric.unit && (
                  <span className="text-[10px] text-slate-500 font-mono">
                    Unit: {selectedMetric.unit}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-500">
                Statistical features extracted automatically
              </span>
            </div>
          )}

          {/* Detector Name & Description */}
          <div>
            <label className="block font-medium text-slate-300 mb-1.5">
              Detector Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., HTTP Latency Anomaly Detector"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-purple-500"
              required
            />
          </div>

          <div>
            <label className="block font-medium text-slate-300 mb-1.5">
              Description (Optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Monitors multi-feature latency drift and unexpected spikes"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* Sensitivity Preset */}
          <div>
            <label className="block font-medium text-slate-300 mb-2 flex items-center justify-between">
              <span>Sensitivity Preset</span>
              <span className="text-slate-500 font-normal text-[11px]">
                Controls Isolation Forest contamination and hysteresis persistence
              </span>
            </label>
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  id: 'CONSERVATIVE' as AnomalySensitivity,
                  title: 'Conservative',
                  desc: 'Contamination 1%, 3-eval hysteresis. Fewer false alarms, triggers only on clear statistical outliers.',
                  score: 'Score ≥ 75',
                },
                {
                  id: 'BALANCED' as AnomalySensitivity,
                  title: 'Balanced',
                  desc: 'Contamination 2%, 2-eval hysteresis. Standard operational baseline for production services.',
                  score: 'Score ≥ 65',
                },
                {
                  id: 'SENSITIVE' as AnomalySensitivity,
                  title: 'Sensitive',
                  desc: 'Contamination 5%, 1-eval hysteresis. Early warning for critical SLIs with fast anomaly alerting.',
                  score: 'Score ≥ 55',
                },
              ].map((preset) => (
                <div
                  key={preset.id}
                  onClick={() => setSensitivity(preset.id)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    sensitivity === preset.id
                      ? 'bg-purple-950/30 border-purple-500/80 text-slate-200'
                      : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-xs text-slate-100">
                      {preset.title}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-purple-300">
                      {preset.score}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-tight">
                    {preset.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Training & Evaluation Parameters */}
          <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
            <h4 className="font-semibold text-slate-200 flex items-center space-x-1.5">
              <Sliders className="h-3.5 w-3.5 text-purple-400" />
              <span>Model Windows & Cadence</span>
            </h4>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-slate-400 text-[11px] mb-1">
                  Feature Window
                </label>
                <select
                  value={windowSeconds}
                  onChange={(e) => setWindowSeconds(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded px-2 py-1.5 text-slate-200 font-mono text-xs"
                >
                  <option value={60}>1 minute (60s)</option>
                  <option value={300}>5 minutes (300s)</option>
                  <option value={600}>10 minutes (600s)</option>
                  <option value={900}>15 minutes (900s)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] mb-1">
                  Eval Interval
                </label>
                <select
                  value={evaluationIntervalSeconds}
                  onChange={(e) => setEvaluationIntervalSeconds(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded px-2 py-1.5 text-slate-200 font-mono text-xs"
                >
                  <option value={30}>Every 30s</option>
                  <option value={60}>Every 1m (60s)</option>
                  <option value={120}>Every 2m (120s)</option>
                  <option value={300}>Every 5m (300s)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] mb-1">
                  Baseline Lookback
                </label>
                <select
                  value={trainingLookbackHours}
                  onChange={(e) => setTrainingLookbackHours(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded px-2 py-1.5 text-slate-200 font-mono text-xs"
                >
                  <option value={24}>Last 24 Hours</option>
                  <option value={72}>Last 3 Days (72h)</option>
                  <option value={168}>Last 7 Days (168h)</option>
                  <option value={336}>Last 14 Days (336h)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] mb-1">
                  Retrain Interval
                </label>
                <select
                  value={retrainIntervalHours}
                  onChange={(e) => setRetrainIntervalHours(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded px-2 py-1.5 text-slate-200 font-mono text-xs"
                >
                  <option value={12}>Every 12 Hours</option>
                  <option value={24}>Every 24 Hours</option>
                  <option value={48}>Every 48 Hours</option>
                  <option value={168}>Weekly (168h)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Clean Baseline Callout */}
          <div className="p-3 bg-purple-950/20 border border-purple-900/40 rounded-xl flex items-start space-x-2 text-[11px] text-purple-300">
            <Info className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-purple-200 block mb-0.5">
                Automated Clean Baseline Filtering
              </span>
              <span>
                Historical telemetry during firing alerts or active incident windows is automatically masked from training data, ensuring contaminated outage periods do not skew the healthy operational baseline.
              </span>
            </div>
          </div>

          {/* Auto-train checkbox */}
          <label className="flex items-center space-x-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={autoTrain}
              onChange={(e) => setAutoTrain(e.target.checked)}
              className="rounded bg-slate-950 border-slate-800 text-purple-600 focus:ring-purple-500 h-4 w-4"
            />
            <span className="text-slate-300 text-xs">
              Queue initial model training immediately upon creation
            </span>
          </label>

          {/* Footer actions */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedDefinitionId}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-sm"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Creating Detector...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Create Detector</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

