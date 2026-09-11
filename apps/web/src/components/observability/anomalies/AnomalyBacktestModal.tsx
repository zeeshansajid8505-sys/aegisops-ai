'use client';

import React, { useState } from 'react';
import {
  X,
  Play,
  Loader2,
  BarChart3,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { api } from '@/lib/api';
import type {
  AnomalyBacktestResult,
  AnomalyDetectorSummary,
} from '@aegisops/types';

interface AnomalyBacktestModalProps {
  organizationId: string;
  detector: AnomalyDetectorSummary;
  isOpen: boolean;
  onClose: () => void;
}

export const AnomalyBacktestModal: React.FC<AnomalyBacktestModalProps> = ({
  organizationId,
  detector,
  isOpen,
  onClose,
}) => {
  const [hours, setHours] = useState<number>(24);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<AnomalyBacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRunBacktest = async () => {
    setIsRunning(true);
    setError(null);
    try {
      const data = await api.anomalies.backtest(organizationId, detector.id, hours);
      setResult(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to run historical backtest');
    } finally {
      setIsRunning(false);
    }
  };

  const anomalyRate = result && result.windowsEvaluated > 0
    ? ((result.windowsFlagged / result.windowsEvaluated) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400 border border-purple-500/20">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">
                Backtest Model: {detector.name}
              </h2>
              <p className="text-xs text-slate-400">
                Simulate anomaly scoring over historical telemetry without persisting findings
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

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {/* Controls */}
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <label className="block font-medium text-slate-300 mb-1">
                Historical Simulation Window
              </label>
              <div className="flex items-center space-x-2">
                {[12, 24, 72, 168].map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHours(h)}
                    className={`px-3 py-1.5 rounded-lg font-mono text-xs transition-colors ${
                      hours === h
                        ? 'bg-purple-600 text-white font-semibold'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    {h < 24 ? `${h}h` : `${h / 24}d`}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              disabled={isRunning}
              onClick={handleRunBacktest}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg font-semibold flex items-center justify-center space-x-2 transition-colors shadow-sm self-end sm:self-center"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Evaluating Windows...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-current" />
                  <span>Run Backtest</span>
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/80 rounded-xl text-rose-300 flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Backtest Results */}
          {result && (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                  <div className="text-[11px] text-slate-400 mb-1">Windows Evaluated</div>
                  <div className="text-xl font-bold font-mono text-slate-100">
                    {result.windowsEvaluated}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {result.sampleCount} raw metric points
                  </div>
                </div>

                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                  <div className="text-[11px] text-slate-400 mb-1">Flagged Windows</div>
                  <div className={`text-xl font-bold font-mono ${result.windowsFlagged > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {result.windowsFlagged}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Score &gt; Contamination
                  </div>
                </div>

                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                  <div className="text-[11px] text-slate-400 mb-1">Anomaly Rate</div>
                  <div className="text-xl font-bold font-mono text-purple-400">
                    {anomalyRate}%
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Expected: ~{(detector.contamination * 100).toFixed(0)}%
                  </div>
                </div>

                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                  <div className="text-[11px] text-slate-400 mb-1">Max Deviation Score</div>
                  <div className="text-xl font-bold font-mono text-rose-400">
                    {result.scoreDistribution?.max?.toFixed(1) ?? '—'}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Scale: 0 (Normal) - 100 (Outlier)
                  </div>
                </div>
              </div>

              {/* Statistical Distribution */}
              {result.scoreDistribution && (
                <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
                  <h4 className="font-semibold text-slate-200">
                    Statistical Score Distribution
                  </h4>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
                    <div className="p-2 bg-slate-900 rounded-lg border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Min</span>
                      <span className="font-mono text-slate-200 font-semibold">
                        {result.scoreDistribution.min?.toFixed(1)}
                      </span>
                    </div>
                    <div className="p-2 bg-slate-900 rounded-lg border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Mean</span>
                      <span className="font-mono text-slate-200 font-semibold">
                        {result.scoreDistribution.mean?.toFixed(1)}
                      </span>
                    </div>
                    <div className="p-2 bg-slate-900 rounded-lg border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">P50 (Median)</span>
                      <span className="font-mono text-slate-200 font-semibold">
                        {result.scoreDistribution.p50?.toFixed(1)}
                      </span>
                    </div>
                    <div className="p-2 bg-slate-900 rounded-lg border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">P90</span>
                      <span className="font-mono text-amber-300 font-semibold">
                        {result.scoreDistribution.p90?.toFixed(1)}
                      </span>
                    </div>
                    <div className="p-2 bg-slate-900 rounded-lg border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">P99</span>
                      <span className="font-mono text-rose-400 font-semibold">
                        {result.scoreDistribution.p99?.toFixed(1)}
                      </span>
                    </div>
                    <div className="p-2 bg-slate-900 rounded-lg border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Max</span>
                      <span className="font-mono text-rose-500 font-semibold">
                        {result.scoreDistribution.max?.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Flagged Timestamps */}
              {result.flaggedTimestamps && result.flaggedTimestamps.length > 0 ? (
                <div className="space-y-2">
                  <h4 className="font-semibold text-slate-200">
                    Flagged Anomalous Windows ({result.flaggedTimestamps.length})
                  </h4>
                  <div className="max-h-40 overflow-y-auto space-y-1 p-2 bg-slate-950 rounded-xl border border-slate-800">
                    {result.flaggedTimestamps.map((ts, idx) => (
                      <div
                        key={idx}
                        className="px-3 py-1.5 bg-slate-900/60 rounded flex items-center justify-between font-mono text-[11px] text-slate-300"
                      >
                        <span>{new Date(ts).toLocaleString()}</span>
                        <span className="text-[10px] text-rose-400 bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-800/60">
                          Flagged Outlier
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-emerald-950/20 border border-emerald-900/40 rounded-xl flex items-center space-x-2 text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  <span>No anomalous windows flagged across the evaluated {hours}-hour window.</span>
                </div>
              )}
            </div>
          )}

          {!result && !isRunning && !error && (
            <div className="p-8 text-center bg-slate-950/40 rounded-xl border border-dashed border-slate-800 text-slate-500">
              <Info className="h-6 w-6 mx-auto mb-2 text-slate-600" />
              <p className="font-medium text-slate-400">No simulation run yet</p>
              <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                Select a historical window above and click &quot;Run Backtest&quot; to test model sensitivity against your historical telemetry.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex justify-end">
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

