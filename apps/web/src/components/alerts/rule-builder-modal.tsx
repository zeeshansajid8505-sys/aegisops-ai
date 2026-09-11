'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  Play,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sliders,
  ShieldAlert,
  Loader2,
  Layers,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import type {
  AlertAggregation,
  AlertComparisonOperator,
  AlertEvaluationMode,
  AlertNoDataPolicy,
  AlertPreviewResponse,
  AlertSeriesReduction,
  MetricDefinitionSummary,
  MetricSeriesFilter,
  EnvironmentSummary,
  ServiceSummary,
  SeverityLevel,
} from '@aegisops/types';

interface RuleBuilderModalProps {
  organizationId: string;
  isOpen: boolean;
  onClose: () => void;
  onRuleCreated: () => void;
  initialServiceId?: string;
}

export const RuleBuilderModal: React.FC<RuleBuilderModalProps> = ({
  organizationId,
  isOpen,
  onClose,
  onRuleCreated,
  initialServiceId,
}) => {
  const [services, setServices] = useState<ServiceSummary[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string>(initialServiceId ?? '');
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<string>('');
  const [definitions, setDefinitions] = useState<MetricDefinitionSummary[]>([]);
  const [selectedDefinitionId, setSelectedDefinitionId] = useState<string>('');

  // Rule Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<SeverityLevel>('SEV-3');
  const [evaluationMode, setEvaluationMode] = useState<AlertEvaluationMode>('PER_SERIES');
  const [aggregation, setAggregation] = useState<AlertAggregation>('AVG');
  const [seriesReduction, setSeriesReduction] = useState<AlertSeriesReduction>('AVG');
  const [comparisonOperator, setComparisonOperator] = useState<AlertComparisonOperator>('GT');
  const [thresholdValue, setThresholdValue] = useState<number>(80);
  const [windowSeconds, setWindowSeconds] = useState<number>(300);
  const [evaluationIntervalSeconds, setEvaluationIntervalSeconds] = useState<number>(60);
  const [pendingDurationSeconds, setPendingDurationSeconds] = useState<number>(0);
  const [recoveryDurationSeconds, setRecoveryDurationSeconds] = useState<number>(0);
  const [noDataPolicy, setNoDataPolicy] = useState<AlertNoDataPolicy>('IGNORE');
  const [seriesFilters, setSeriesFilters] = useState<MetricSeriesFilter[]>([]);

  // Preview State
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewResult, setPreviewResult] = useState<AlertPreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Load Services
  useEffect(() => {
    if (!isOpen || !organizationId) return;
    api.services
      .list(organizationId, { limit: 100 })
      .then((res) => {
        setServices(res.items);
        if (!selectedServiceId && res.items.length > 0) {
          setSelectedServiceId(res.items[0]!.id);
        }
      })
      .catch((err: any) => setFormError(`Failed to load services: ${err?.message || 'Unknown error'}`));
  }, [isOpen, organizationId]);

  // Load Environments for Selected Service
  useEffect(() => {
    if (!organizationId || !selectedServiceId) return;
    api.services
      .get(organizationId, selectedServiceId)
      .then((serviceDetail) => {
        setEnvironments(serviceDetail.environments || []);
        if (serviceDetail.environments && serviceDetail.environments.length > 0) {
          setSelectedEnvironmentId(serviceDetail.environments[0]!.id);
        } else {
          setSelectedEnvironmentId('');
        }
      })
      .catch((err: any) => setFormError(`Failed to load environments: ${err?.message || 'Unknown error'}`));
  }, [organizationId, selectedServiceId]);

  // Load Metric Definitions for Selected Service & Environment
  useEffect(() => {
    if (!organizationId || !selectedServiceId) return;
    api.telemetry
      .getDefinitions(organizationId, selectedServiceId, {
        environmentId: selectedEnvironmentId || undefined,
      })
      .then((defs) => {
        setDefinitions(defs);
        if (defs.length > 0) {
          setSelectedDefinitionId(defs[0]!.id);
        } else {
          setSelectedDefinitionId('');
        }
      })
      .catch((err) => setFormError(`Failed to load metric definitions: ${err.message}`));
  }, [organizationId, selectedServiceId, selectedEnvironmentId]);

  // Metric-Aware Aggregation Filter
  const selectedMetric = definitions.find((d) => d.id === selectedDefinitionId);

  const getValidAggregations = (metric?: MetricDefinitionSummary): AlertAggregation[] => {
    if (!metric) return ['AVG', 'MIN', 'MAX', 'LAST', 'SUM'];
    if (metric.instrumentType === 'GAUGE') {
      return ['AVG', 'MIN', 'MAX', 'LAST'];
    }
    if (metric.instrumentType === 'SUM') {
      return metric.isMonotonic ? ['SUM', 'LAST', 'RATE'] : ['AVG', 'MIN', 'MAX', 'SUM', 'LAST'];
    }
    if (metric.instrumentType === 'HISTOGRAM') {
      return ['P99', 'P90', 'P50', 'AVG', 'MIN', 'MAX', 'SUM', 'LAST'];
    }
    return ['AVG', 'MIN', 'MAX', 'LAST', 'SUM'];
  };

  const validAggregations = getValidAggregations(selectedMetric);

  // Ensure current aggregation is valid for the selected metric
  useEffect(() => {
    if (validAggregations.length > 0 && !validAggregations.includes(aggregation)) {
      setAggregation(validAggregations[0]!);
    }
  }, [selectedDefinitionId, validAggregations]);

  // Auto-generate sensible rule name if blank
  useEffect(() => {
    if (selectedMetric && !name) {
      setName(`${selectedMetric.name} ${aggregation} ${comparisonOperator} ${thresholdValue}`);
    }
  }, [selectedMetric, aggregation, comparisonOperator, thresholdValue]);

  // Handle Filter Management
  const handleAddFilter = () => {
    if (seriesFilters.length >= 8) return;
    setSeriesFilters([...seriesFilters, { key: '', operator: 'EQUALS', value: '' }]);
  };

  const handleRemoveFilter = (index: number) => {
    setSeriesFilters(seriesFilters.filter((_, i) => i !== index));
  };

  const handleUpdateFilter = (
    index: number,
    field: keyof MetricSeriesFilter,
    value: string,
  ) => {
    const updated = [...seriesFilters];
    updated[index] = { ...updated[index]!, [field]: value };
    setSeriesFilters(updated);
  };

  // Run Real Telemetry Preview
  const handlePreview = async () => {
    if (!selectedServiceId || !selectedEnvironmentId || !selectedDefinitionId) {
      setPreviewError('Select Service, Environment, and Metric before previewing.');
      return;
    }

    setIsPreviewing(true);
    setPreviewError(null);
    setPreviewResult(null);

    try {
      const res = await api.alerts.previewRule(organizationId, {
        serviceId: selectedServiceId,
        environmentId: selectedEnvironmentId,
        metricDefinitionId: selectedDefinitionId,
        evaluationMode,
        aggregation,
        seriesReduction: evaluationMode === 'AGGREGATE_SERIES' ? seriesReduction : undefined,
        comparisonOperator,
        thresholdValue: Number(thresholdValue),
        windowSeconds: Number(windowSeconds),
        seriesFilters: seriesFilters.filter((f) => f.key.trim() && f.value.trim()),
      });
      setPreviewResult(res);
    } catch (err: any) {
      setPreviewError(err.message || 'Preview evaluation failed');
    } finally {
      setIsPreviewing(false);
    }
  };

  // Submit & Create Rule
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Rule name is required');
      return;
    }
    if (!selectedServiceId || !selectedEnvironmentId || !selectedDefinitionId) {
      setFormError('Please select Service, Environment, and Metric');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      await api.alerts.createRule(
        organizationId,
        selectedServiceId,
        selectedEnvironmentId,
        {
          name: name.trim(),
          description: description.trim() || undefined,
          metricDefinitionId: selectedDefinitionId,
          severity,
          status: 'ENABLED',
          evaluationMode,
          aggregation,
          seriesReduction: evaluationMode === 'AGGREGATE_SERIES' ? seriesReduction : undefined,
          comparisonOperator,
          thresholdValue: Number(thresholdValue),
          windowSeconds: Number(windowSeconds),
          evaluationIntervalSeconds: Number(evaluationIntervalSeconds),
          pendingDurationSeconds: Number(pendingDurationSeconds),
          recoveryDurationSeconds: Number(recoveryDurationSeconds),
          noDataPolicy,
          seriesFilters: seriesFilters.filter((f) => f.key.trim() && f.value.trim()),
        },
      );

      onRuleCreated();
      onClose();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create alert rule');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Create Alert Rule</h2>
              <p className="text-xs text-slate-400">
                Define sliding window anomaly thresholds and deterministic state evaluation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Error Banner */}
        {formError && (
          <div className="mx-6 mt-4 p-3 bg-red-950/60 border border-red-800/80 rounded-lg flex items-center space-x-3 text-red-200 text-xs">
            <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* 1. Scope: Service, Environment, Metric */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Service <span className="text-red-400">*</span>
              </label>
              <select
                value={selectedServiceId}
                onChange={(e) => setSelectedServiceId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                required
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Environment <span className="text-red-400">*</span>
              </label>
              <select
                value={selectedEnvironmentId}
                onChange={(e) => setSelectedEnvironmentId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                required
              >
                {environments.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.key})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Metric Definition <span className="text-red-400">*</span>
              </label>
              <select
                value={selectedDefinitionId}
                onChange={(e) => setSelectedDefinitionId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                required
              >
                {definitions.length === 0 ? (
                  <option value="">No metrics found for service</option>
                ) : (
                  definitions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.instrumentType})
                    </option>
                  ))
                )}
              </select>
              {selectedMetric && (
                <p className="text-[11px] text-slate-400 mt-1">
                  Type: <span className="text-cyan-400">{selectedMetric.instrumentType}</span>
                  {selectedMetric.unit ? ` | Unit: ${selectedMetric.unit}` : ''}
                </p>
              )}
            </div>
          </div>

          {/* 2. Condition: Mode, Aggregation, Operator, Threshold */}
          <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-lg space-y-4">
            <h3 className="text-xs font-semibold text-slate-200 flex items-center space-x-2 uppercase tracking-wider">
              <Layers className="h-3.5 w-3.5 text-emerald-400" />
              <span>Threshold Condition</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Evaluation Mode
                </label>
                <select
                  value={evaluationMode}
                  onChange={(e) => setEvaluationMode(e.target.value as AlertEvaluationMode)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="PER_SERIES">Per-Series (Evaluate each)</option>
                  <option value="AGGREGATE_SERIES">Aggregate-Series (Reduce)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Window Aggregation
                </label>
                <select
                  value={aggregation}
                  onChange={(e) => setAggregation(e.target.value as AlertAggregation)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  {validAggregations.map((agg) => (
                    <option key={agg} value={agg}>
                      {agg}
                    </option>
                  ))}
                </select>
              </div>

              {evaluationMode === 'AGGREGATE_SERIES' && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Series Reduction
                  </label>
                  <select
                    value={seriesReduction}
                    onChange={(e) => setSeriesReduction(e.target.value as AlertSeriesReduction)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="AVG">AVG across series</option>
                    <option value="MAX">MAX across series</option>
                    <option value="MIN">MIN across series</option>
                    <option value="SUM">SUM across series</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Operator
                </label>
                <select
                  value={comparisonOperator}
                  onChange={(e) => setComparisonOperator(e.target.value as AlertComparisonOperator)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                >
                  <option value="GT">&gt; (Greater than)</option>
                  <option value="GTE">&gt;= (Greater or equal)</option>
                  <option value="LT">&lt; (Less than)</option>
                  <option value="LTE">&lt;= (Less or equal)</option>
                  <option value="EQ">== (Equals)</option>
                  <option value="NEQ">!= (Not equals)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Threshold Value
                </label>
                <input
                  type="number"
                  step="any"
                  value={thresholdValue}
                  onChange={(e) => setThresholdValue(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                  required
                />
              </div>
            </div>

            {/* 3. Series Filters */}
            <div className="pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-slate-300">
                  Exact Metric Attribute Filters ({seriesFilters.length}/8)
                </label>
                <button
                  type="button"
                  onClick={handleAddFilter}
                  disabled={seriesFilters.length >= 8}
                  className="inline-flex items-center space-x-1 text-xs text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
                >
                  <Plus className="h-3 w-3" />
                  <span>Add Filter</span>
                </button>
              </div>

              {seriesFilters.length === 0 ? (
                <p className="text-[11px] text-slate-500 italic">
                  No filters configured. All series for this metric will be evaluated.
                </p>
              ) : (
                <div className="space-y-2">
                  {seriesFilters.map((filter, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <input
                        type="text"
                        placeholder="Attribute key (e.g. http.status_code)"
                        value={filter.key}
                        onChange={(e) => handleUpdateFilter(index, 'key', e.target.value)}
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                      />
                      <select
                        value={filter.operator}
                        onChange={(e) =>
                          handleUpdateFilter(index, 'operator', e.target.value as 'EQUALS' | 'NOT_EQUALS')
                        }
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="EQUALS">==</option>
                        <option value="NOT_EQUALS">!=</option>
                      </select>
                      <input
                        type="text"
                        placeholder="Expected value (e.g. 500)"
                        value={filter.value}
                        onChange={(e) => handleUpdateFilter(index, 'value', e.target.value)}
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveFilter(index)}
                        className="p-1.5 text-slate-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 4. Sliding Windows & Intervals */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Sliding Window
              </label>
              <select
                value={windowSeconds}
                onChange={(e) => setWindowSeconds(parseInt(e.target.value, 10))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value={60}>1 minute (60s)</option>
                <option value={180}>3 minutes (180s)</option>
                <option value={300}>5 minutes (300s)</option>
                <option value={600}>10 minutes (600s)</option>
                <option value={900}>15 minutes (900s)</option>
                <option value={3600}>1 hour (3600s)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Evaluation Interval
              </label>
              <select
                value={evaluationIntervalSeconds}
                onChange={(e) => setEvaluationIntervalSeconds(parseInt(e.target.value, 10))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value={15}>15 seconds</option>
                <option value={30}>30 seconds</option>
                <option value={60}>60 seconds (1m)</option>
                <option value={120}>120 seconds (2m)</option>
                <option value={300}>300 seconds (5m)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Pending Duration (for hold)
              </label>
              <select
                value={pendingDurationSeconds}
                onChange={(e) => setPendingDurationSeconds(parseInt(e.target.value, 10))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value={0}>0s (Fire immediately)</option>
                <option value={30}>30 seconds</option>
                <option value={60}>60 seconds (1m)</option>
                <option value={120}>2 minutes (120s)</option>
                <option value={300}>5 minutes (300s)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Recovery Hold (for clear)
              </label>
              <select
                value={recoveryDurationSeconds}
                onChange={(e) => setRecoveryDurationSeconds(parseInt(e.target.value, 10))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value={0}>0s (Resolve immediately)</option>
                <option value={30}>30 seconds</option>
                <option value={60}>60 seconds (1m)</option>
                <option value={120}>2 minutes (120s)</option>
                <option value={300}>5 minutes (300s)</option>
              </select>
            </div>
          </div>

          {/* 5. Severity & Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Severity Level
              </label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as SeverityLevel)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="SEV-1">SEV-1 (Critical Outage)</option>
                <option value="SEV-2">SEV-2 (High Degradation)</option>
                <option value="SEV-3">SEV-3 (Moderate Anomaly)</option>
                <option value="SEV-4">SEV-4 (Low / Informational)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                No-Data Policy
              </label>
              <select
                value={noDataPolicy}
                onChange={(e) => setNoDataPolicy(e.target.value as AlertNoDataPolicy)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="IGNORE">IGNORE (Maintain state)</option>
                <option value="OK">OK (Treat missing as healthy)</option>
                <option value="ALERT">ALERT (Treat missing as breach)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Rule Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Descriptive alert title"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Description / Runbook Links
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explain the symptom, impact, and immediate triage actions..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* 6. Real-Telemetry Rule Preview */}
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Sparkles className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-semibold text-slate-200">
                  Real Telemetry Preview
                </span>
                <span className="text-[10px] text-slate-500">
                  (Evaluates actual live ingested telemetry without saving)
                </span>
              </div>
              <button
                type="button"
                onClick={handlePreview}
                disabled={isPreviewing || !selectedDefinitionId}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors disabled:opacity-50"
              >
                {isPreviewing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                ) : (
                  <Play className="h-3.5 w-3.5 text-emerald-400" />
                )}
                <span>Run Preview</span>
              </button>
            </div>

            {previewError && (
              <div className="p-2.5 bg-red-950/50 border border-red-900 rounded text-xs text-red-300">
                {previewError}
              </div>
            )}

            {previewResult && (
              <div className="space-y-3 pt-2">
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
                    Series: <strong className="text-slate-100">{previewResult.matchingSeriesCount}</strong>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
                    Total Samples: <strong className="text-slate-100">{previewResult.totalSampleCount}</strong>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
                    Result:{' '}
                    <strong
                      className={
                        previewResult.breached
                          ? 'text-red-400'
                          : previewResult.result === 'NO_DATA'
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }
                    >
                      {previewResult.result}
                    </strong>
                  </span>
                  {previewResult.reducedValue !== null && (
                    <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono">
                      Reduced Value: <strong>{previewResult.reducedValue?.toFixed(2)}</strong>
                    </span>
                  )}
                </div>

                {previewResult.seriesResults.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded border border-slate-800 bg-slate-900/60">
                    <table className="w-full text-[11px] text-left">
                      <thead className="bg-slate-950/80 text-slate-400 uppercase font-mono">
                        <tr>
                          <th className="px-3 py-1.5">Series ID / Labels</th>
                          <th className="px-3 py-1.5">Samples</th>
                          <th className="px-3 py-1.5">Observed Value</th>
                          <th className="px-3 py-1.5">Breached?</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {previewResult.seriesResults.map((sr) => (
                          <tr key={sr.seriesId} className="hover:bg-slate-800/40">
                            <td className="px-3 py-1.5 max-w-[200px] truncate text-slate-300">
                              {Object.keys(sr.attributes).length > 0
                                ? JSON.stringify(sr.attributes)
                                : sr.seriesId.slice(0, 8)}
                            </td>
                            <td className="px-3 py-1.5 text-slate-400">{sr.sampleCount}</td>
                            <td className="px-3 py-1.5 text-slate-200">
                              {sr.observedValue !== null && sr.observedValue !== undefined
                                ? Number(sr.observedValue).toFixed(2)
                                : 'No Data'}
                            </td>
                            <td className="px-3 py-1.5">
                              {sr.breached ? (
                                <span className="text-red-400 font-semibold">BREACH</span>
                              ) : (
                                <span className="text-emerald-400">OK</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-950/30 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              <span>Create Alert Rule</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
