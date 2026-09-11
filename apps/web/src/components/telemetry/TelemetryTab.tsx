'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Key,
  Cpu,
  BarChart3,
  Copy,
  Check,
  RefreshCw,
  FileCode,
  Terminal,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Radio,
  Server,
  Code,
} from 'lucide-react';
import { api } from '@/lib/api';
import type {
  EnvironmentSummary,
  TelemetryIngestKeySummary,
  TelemetryKeyCreatedResponse,
  TelemetryStatusResponse,
  MetricDefinitionSummary,
  MetricTimeseriesResponse,
} from '@aegisops/types';

interface TelemetryTabProps {
  organizationId: string;
  serviceId: string;
  serviceName: string;
  environments: EnvironmentSummary[];
}

export function TelemetryTab({
  organizationId,
  serviceId,
  serviceName,
  environments,
}: TelemetryTabProps) {
  const queryClient = useQueryClient();

  // Modals & form state
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyEnvId, setNewKeyEnvId] = useState(environments[0]?.id ?? '');
  const [newKeyRpm, setNewKeyRpm] = useState(120);
  const [newKeyPts, setNewKeyPts] = useState(100000);

  // One-time secret modal state
  const [createdSecretData, setCreatedSecretData] = useState<TelemetryKeyCreatedResponse | null>(null);
  const [hasCopiedSecret, setHasCopiedSecret] = useState(false);

  // Guide snippet active tab
  const [guideTab, setGuideTab] = useState<'agent' | 'collector' | 'node'>('agent');

  // Metric explorer state
  const [selectedMetric, setSelectedMetric] = useState<string>('');
  const [selectedEnvForQuery, setSelectedEnvForQuery] = useState<string>(environments[0]?.id ?? '');
  const [queryResolution, setQueryResolution] = useState<'raw' | '1m'>('raw');

  // Queries
  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useQuery<TelemetryStatusResponse>({
    queryKey: ['telemetry-status', organizationId, serviceId],
    queryFn: () => api.telemetry.getStatus(organizationId, serviceId),
    refetchInterval: 10000,
  });

  const { data: keys, isLoading: keysLoading, refetch: refetchKeys } = useQuery<TelemetryIngestKeySummary[]>({
    queryKey: ['telemetry-keys', organizationId, serviceId],
    queryFn: () => api.telemetry.listKeys(organizationId, serviceId),
  });

  const { data: definitions, refetch: refetchDefinitions } = useQuery<MetricDefinitionSummary[]>({
    queryKey: ['metric-definitions', organizationId, serviceId],
    queryFn: () => api.telemetry.getDefinitions(organizationId, serviceId),
    refetchInterval: 15000,
  });

  const { data: timeseriesData, isLoading: timeseriesLoading, refetch: refetchTimeseries } = useQuery<MetricTimeseriesResponse>({
    queryKey: ['metric-timeseries', organizationId, serviceId, selectedEnvForQuery, selectedMetric, queryResolution],
    queryFn: () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      return api.telemetry.queryMetrics(organizationId, serviceId, {
        environmentId: selectedEnvForQuery,
        metricNames: [selectedMetric],
        startTime: oneHourAgo.toISOString(),
        endTime: now.toISOString(),
        resolution: queryResolution,
        limit: 100,
      });
    },
    enabled: !!selectedMetric && !!selectedEnvForQuery,
    refetchInterval: 10000,
  });

  // Mutations
  const createKeyMutation = useMutation({
    mutationFn: (payload: { name: string; environmentId: string; rateLimitRpm: number; rateLimitPts: number }) =>
      api.telemetry.createKey(organizationId, serviceId, payload),
    onSuccess: (data) => {
      setShowKeyModal(false);
      setNewKeyName('');
      setCreatedSecretData(data);
      setHasCopiedSecret(false);
      refetchKeys();
      refetchStatus();
    },
  });

  const revokeKeyMutation = useMutation({
    mutationFn: (keyId: string) => api.telemetry.revokeKey(organizationId, serviceId, keyId),
    onSuccess: () => {
      refetchKeys();
      refetchStatus();
    },
  });

  const handleCopySecret = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setHasCopiedSecret(true);
      setTimeout(() => setHasCopiedSecret(false), 3000);
    } catch {
      // Fallback
    }
  };

  const activeKeys = keys?.filter((k) => k.isActive) ?? [];
  const latestKeyPrefix = activeKeys[0]?.keyPrefix ?? 'aeg_ing_...';

  return (
    <div className="space-y-8">
      {/* 1. Ingestion Overview & Metric KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ingestion Status</span>
            <Radio className={`h-4 w-4 ${status?.pointsAccepted24h ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-white">
              {status?.pointsAccepted24h ? 'Active' : 'Awaiting Data'}
            </span>
            <span className="text-xs text-slate-400">
              {status?.activeKeysCount ?? 0} active key{(status?.activeKeysCount ?? 0) !== 1 ? 's' : ''}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {status?.pointsAccepted24h
              ? `${(status.pointsAccepted24h).toLocaleString()} points ingested (24h)`
              : 'Send OTLP metrics to activate'}
          </p>
        </div>

        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Metric Definitions</span>
            <BarChart3 className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-cyan-400">
              {status?.definitionsCount ?? 0}
            </span>
            <span className="text-xs text-slate-400">Discovered</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Across gauges, sums, and histograms
          </p>
        </div>

        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Series</span>
            <Cpu className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-amber-400">
              {status?.seriesCount ?? 0}
            </span>
            <span className="text-xs text-slate-500">Cap: 5,000</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Unique attribute combinations
          </p>
        </div>

        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Rejected Points</span>
            <AlertTriangle className={`h-4 w-4 ${status?.pointsRejected24h ? 'text-rose-400' : 'text-slate-500'}`} />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-rose-400">
              {status?.pointsRejected24h ?? 0}
            </span>
            <span className="text-xs text-slate-500">24h window</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Rate-limit or skew rejections
          </p>
        </div>
      </div>

      {/* 2. Ingestion Keys Section */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-white flex items-center space-x-2">
              <Key className="h-5 w-5 text-cyan-400" />
              <span>Telemetry Ingestion Keys</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Cryptographically scoped keys (<code className="text-cyan-300">aeg_ing_...</code>) for OpenTelemetry Collectors, agents, and SDKs.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (environments.length > 0 && !newKeyEnvId) {
                setNewKeyEnvId(environments[0]?.id ?? '');
              }
              setShowKeyModal(true);
            }}
            className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Generate Ingest Key</span>
          </button>
        </div>

        {keysLoading ? (
          <div className="p-8 text-center text-slate-400 text-xs">Loading ingest keys...</div>
        ) : keys && keys.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3">Key Name</th>
                  <th className="px-5 py-3">Environment</th>
                  <th className="px-5 py-3">Prefix</th>
                  <th className="px-5 py-3">Rate Limits</th>
                  <th className="px-5 py-3">Last Used</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {keys.map((k) => {
                  const env = environments.find((e) => e.id === k.environmentId);
                  return (
                    <tr key={k.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-5 py-3 font-medium text-white">{k.name}</td>
                      <td className="px-5 py-3">
                        <span className="px-2 py-0.5 rounded text-slate-300 bg-slate-800 border border-slate-700">
                          {env?.name ?? k.environmentId.slice(0, 8)}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-mono text-cyan-300">{k.keyPrefix}••••••••</td>
                      <td className="px-5 py-3 text-slate-400">
                        {k.rateLimitRpm ?? 120} RPM / {((k.rateLimitPts ?? 100000) / 1000)}k PTS
                      </td>
                      <td className="px-5 py-3 text-slate-400">
                        {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Never'}
                      </td>
                      <td className="px-5 py-3">
                        {k.isActive ? (
                          <span className="inline-flex items-center text-emerald-400 space-x-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Active</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-rose-400 space-x-1">
                            <XCircle className="h-3.5 w-3.5" />
                            <span>Revoked</span>
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {k.isActive && (
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Are you sure you want to revoke key '${k.name}'? Machines using this key will immediately be rejected.`)) {
                                revokeKeyMutation.mutate(k.id);
                              }
                            }}
                            className="text-rose-400 hover:text-rose-300 transition-colors inline-flex items-center space-x-1"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Revoke</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-slate-500 text-xs">
            No telemetry ingest keys generated yet. Click &quot;Generate Ingest Key&quot; to begin sending OpenTelemetry metrics.
          </div>
        )}
      </div>

      {/* 3. OpenTelemetry Integration & Quick Start Guide */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-800">
          <h3 className="text-base font-semibold text-white flex items-center space-x-2">
            <Code className="h-5 w-5 text-cyan-400" />
            <span>OpenTelemetry Integration Guide</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure standard OpenTelemetry collectors, SDKs, or the included AegisOps Telemetry Agent.
          </p>

          <div className="mt-4 flex space-x-2 border-b border-slate-800">
            <button
              type="button"
              onClick={() => setGuideTab('agent')}
              className={`px-3 py-1.5 text-xs font-medium border-b-2 flex items-center space-x-1.5 ${
                guideTab === 'agent'
                  ? 'border-cyan-400 text-cyan-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>Telemetry Agent (Synthetic Simulator)</span>
            </button>
            <button
              type="button"
              onClick={() => setGuideTab('collector')}
              className={`px-3 py-1.5 text-xs font-medium border-b-2 flex items-center space-x-1.5 ${
                guideTab === 'collector'
                  ? 'border-cyan-400 text-cyan-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Server className="h-3.5 w-3.5" />
              <span>OTel Collector (otel-collector-config.yaml)</span>
            </button>
            <button
              type="button"
              onClick={() => setGuideTab('node')}
              className={`px-3 py-1.5 text-xs font-medium border-b-2 flex items-center space-x-1.5 ${
                guideTab === 'node'
                  ? 'border-cyan-400 text-cyan-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileCode className="h-3.5 w-3.5" />
              <span>Node.js / TypeScript SDK</span>
            </button>
          </div>
        </div>

        <div className="p-5 bg-slate-950/80 font-mono text-xs text-slate-300 overflow-x-auto">
          {guideTab === 'agent' && (
            <div>
              <p className="text-slate-400 mb-2 font-sans text-xs">
                Run deterministic production scenarios (<code className="text-cyan-300">BASELINE</code>, <code className="text-cyan-300">LATENCY_SPIKE</code>, <code className="text-cyan-300">ERROR_SPIKE</code>, <code className="text-cyan-300">CPU_SPIKE</code>, etc.):
              </p>
              <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 flex justify-between items-center">
                <code>
                  pnpm --filter=@aegisops/telemetry-agent start -- \<br />
                  &nbsp;&nbsp;--endpoint http://localhost:3001/api/v1/telemetry/otlp/v1/metrics \<br />
                  &nbsp;&nbsp;--key <span className="text-cyan-300">{latestKeyPrefix}</span> \<br />
                  &nbsp;&nbsp;--scenario BASELINE \<br />
                  &nbsp;&nbsp;--interval 5000
                </code>
                <button
                  type="button"
                  onClick={() =>
                    handleCopySecret(
                      `pnpm --filter=@aegisops/telemetry-agent start -- --endpoint http://localhost:3001/api/v1/telemetry/otlp/v1/metrics --key ${latestKeyPrefix} --scenario BASELINE --interval 5000`,
                    )
                  }
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 text-xs flex items-center space-x-1 ml-4"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy</span>
                </button>
              </div>
            </div>
          )}

          {guideTab === 'collector' && (
            <div>
              <p className="text-slate-400 mb-2 font-sans text-xs">
                Add an OTLP HTTP exporter pipeline in your OpenTelemetry Collector configuration:
              </p>
              <pre className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 whitespace-pre">
{`receivers:
  otlp:
    protocols:
      http:
      grpc:

exporters:
  otlphttp/aegisops:
    endpoint: "http://localhost:3001/api/v1/telemetry/otlp/v1/metrics"
    headers:
      Authorization: "Bearer ${latestKeyPrefix}"

service:
  pipelines:
    metrics:
      receivers: [otlp]
      exporters: [otlphttp/aegisops]`}
              </pre>
            </div>
          )}

          {guideTab === 'node' && (
            <div>
              <p className="text-slate-400 mb-2 font-sans text-xs">
                Export metrics using standard <code className="text-cyan-300">@opentelemetry/exporter-metrics-otlp-http</code>:
              </p>
              <pre className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 whitespace-pre">
{`import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';

const exporter = new OTLPMetricExporter({
  url: 'http://localhost:3001/api/v1/telemetry/otlp/v1/metrics',
  headers: {
    Authorization: 'Bearer ${latestKeyPrefix}',
  },
});

const meterProvider = new MeterProvider({
  readers: [new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 10000 })],
});`}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* 4. Metric Explorer & Discovered Definitions */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-white flex items-center space-x-2">
              <BarChart3 className="h-5 w-5 text-cyan-400" />
              <span>Metric Explorer</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Explore discovered metrics and inspect live data points from the hot buffer and PostgreSQL.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedEnvForQuery}
              onChange={(e) => setSelectedEnvForQuery(e.target.value)}
              className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              {environments.map((e) => (
                <option key={e.id} value={e.id}>
                  Env: {e.name}
                </option>
              ))}
            </select>

            <select
              value={queryResolution}
              onChange={(e) => setQueryResolution(e.target.value as 'raw' | '1m')}
              className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="raw">Resolution: Raw (Hot Buffer)</option>
              <option value="1m">Resolution: 1-Minute Rollups</option>
            </select>

            <button
              type="button"
              onClick={() => {
                refetchDefinitions();
                refetchTimeseries();
              }}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors"
              title="Refresh metric points"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Discovered Definitions List */}
        {definitions && definitions.length > 0 ? (
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Select Discovered Metric:
            </span>
            <div className="flex flex-wrap gap-2">
              {definitions.map((def) => {
                const isSelected = selectedMetric === def.name;
                return (
                  <button
                    key={def.id}
                    type="button"
                    onClick={() => setSelectedMetric(def.name)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all flex items-center space-x-2 border ${
                      isSelected
                        ? 'bg-cyan-950 border-cyan-500 text-cyan-300 font-semibold'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span>{def.name}</span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-800 text-slate-400 font-sans">
                      {def.instrumentType}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-4 bg-slate-950/40 border border-slate-800 rounded-lg text-slate-500 text-xs">
            No metrics discovered yet. Launch the telemetry agent with a valid ingest key to start receiving data.
          </div>
        )}

        {/* Query Results View */}
        {selectedMetric && (
          <div className="mt-4 pt-4 border-t border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold text-white font-mono">{selectedMetric}</span>
                <span className="text-xs text-slate-400">({timeseriesData?.timeseries?.length ?? 0} series)</span>
              </div>
              <span className="text-xs text-slate-500">Last 1 hour window</span>
            </div>

            {timeseriesLoading ? (
              <div className="p-6 text-center text-slate-400 text-xs">Fetching metric data points...</div>
            ) : timeseriesData && timeseriesData.timeseries.length > 0 ? (
              <div className="space-y-3">
                {timeseriesData.timeseries.map((ts, idx) => {
                  const latestPoint = ts.points[ts.points.length - 1];
                  return (
                    <div key={idx} className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center space-x-2 font-mono text-xs">
                          <span className="text-cyan-400">{ts.metricName}</span>
                          <span className="text-slate-500 text-[10px] truncate max-w-xs">
                            {JSON.stringify(ts.attributes)}
                          </span>
                        </div>
                        <div className="flex items-center space-x-3 text-xs">
                          <span className="text-slate-400">{ts.points.length} points</span>
                          <span className="font-semibold text-emerald-400">
                            Latest: {latestPoint ? (latestPoint.doubleValue ?? latestPoint.value) : 'N/A'} {ts.unit ?? ''}
                          </span>
                        </div>
                      </div>

                      {/* Data Point Samples Table */}
                      <div className="max-h-48 overflow-y-auto mt-2 border border-slate-800/80 rounded-lg">
                        <table className="w-full text-left text-xs font-mono">
                          <thead className="bg-slate-900 text-slate-400 text-[11px] sticky top-0">
                            <tr>
                              <th className="px-3 py-1.5">Timestamp</th>
                              <th className="px-3 py-1.5">Value</th>
                              <th className="px-3 py-1.5">Details</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/40 text-slate-300">
                            {ts.points.slice(-10).map((pt, pIdx) => (
                              <tr key={pIdx} className="hover:bg-slate-900/50">
                                <td className="px-3 py-1 text-slate-400">
                                  {new Date(pt.timestamp).toLocaleTimeString()}
                                </td>
                                <td className="px-3 py-1 text-cyan-300 font-semibold">
                                  {pt.doubleValue ?? pt.value}
                                </td>
                                <td className="px-3 py-1 text-slate-500 text-[11px]">
                                  {pt.histogramCount
                                    ? `count: ${pt.histogramCount}, min: ${pt.histogramMin}, max: ${pt.histogramMax}`
                                    : pt.p99
                                    ? `p50: ${pt.p50}, p90: ${pt.p90}, p99: ${pt.p99}`
                                    : 'sample'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 text-center text-slate-500 text-xs">
                No data points found for this metric in the selected environment.
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. Generate Key Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-semibold text-white flex items-center space-x-2">
                <Key className="h-5 w-5 text-cyan-400" />
                <span>Generate Ingest Key</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowKeyModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Key Name / Description</label>
                <input
                  type="text"
                  placeholder="e.g. k8s-otel-daemonset"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Scoped Environment</label>
                <select
                  value={newKeyEnvId}
                  onChange={(e) => setNewKeyEnvId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  {environments.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.kind})
                    </option>
                  ))}
                </select>
                <p className="text-slate-500 mt-1 text-[11px]">
                  Machine auth binds ingested points strictly to this environment.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Max Requests/Min</label>
                  <input
                    type="number"
                    value={newKeyRpm}
                    onChange={(e) => setNewKeyRpm(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Max Points/Min</label>
                  <input
                    type="number"
                    value={newKeyPts}
                    onChange={(e) => setNewKeyPts(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowKeyModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newKeyName.trim() || !newKeyEnvId || createKeyMutation.isPending}
                onClick={() => {
                  createKeyMutation.mutate({
                    name: newKeyName.trim(),
                    environmentId: newKeyEnvId,
                    rateLimitRpm: newKeyRpm,
                    rateLimitPts: newKeyPts,
                  });
                }}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium flex items-center space-x-1"
              >
                {createKeyMutation.isPending ? 'Generating...' : 'Generate Key'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. One-Time Raw Secret Disclosure Modal */}
      {createdSecretData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-slate-900 border border-amber-500/50 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3 text-amber-400 border-b border-slate-800 pb-3">
              <AlertTriangle className="h-6 w-6 shrink-0" />
              <div>
                <h3 className="text-base font-semibold text-white">Save Your Telemetry Ingest Key</h3>
                <span className="text-xs text-amber-400/90 font-medium">
                  This key will NEVER be shown again!
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Below is your full machine ingest key with 256 bits of entropy. AegisOps stores only a SHA-256 hash
              in the database. If you lose this key, you will have to revoke it and generate a new one.
            </p>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Raw Secret Key:
              </span>
              <div className="flex items-center justify-between font-mono text-xs text-cyan-300 break-all select-all">
                <span>{createdSecretData.rawKey}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => handleCopySecret(createdSecretData.rawKey)}
                className={`px-4 py-2 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors ${
                  hasCopiedSecret
                    ? 'bg-emerald-600 text-white'
                    : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                }`}
              >
                {hasCopiedSecret ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                <span>{hasCopiedSecret ? 'Copied to Clipboard!' : 'Copy Key'}</span>
              </button>

              <button
                type="button"
                onClick={() => setCreatedSecretData(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium"
              >
                I Have Saved It Securely
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
