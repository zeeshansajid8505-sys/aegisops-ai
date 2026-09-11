'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Server,
  ArrowLeft,
  Activity,
  Layers,
  Network,
  Radio,
  History,
  Play,
  Plus,
  Trash2,
  ExternalLink,
  Shield,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Users,
  Settings,
  Bell,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { TelemetryTab } from '@/components/telemetry/TelemetryTab';
import { AnomaliesTab } from '@/components/observability/anomalies/AnomaliesTab';
import { ServiceReliabilitySection } from '@/components/reliability/ServiceReliabilitySection';
import { useRealtimeService } from '@/lib/realtime';
import type {
  ServiceDetail,
  ServiceTier,
  ServiceLifecycle,
  ServiceHealthStatus,
  EnvironmentKind,
  DependencyType,
  ProbeType,
  HealthProbeSummary,
  HealthProbeRunSummary,
} from '@aegisops/types';

export default function ServiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const serviceId = params?.['serviceId'] as string;

  const { activeOrganization } = useAuth();
  const orgId = activeOrganization?.id;

  // Real-time service room subscription
  useRealtimeService(orgId, serviceId);

  const searchParams = useSearchParams();
  const initialTab = searchParams?.get('tab');
  const initialSubtab = searchParams?.get('subtab');

  const [activeTab, setActiveTab] = useState<
    'overview' | 'observability' | 'reliability' | 'dependencies' | 'configuration'
  >(
    initialTab === 'observability'
      ? 'observability'
      : initialTab === 'reliability'
      ? 'reliability'
      : 'overview',
  );

  const [observabilitySubTab, setObservabilitySubTab] = useState<
    'probes' | 'telemetry' | 'alerts' | 'anomalies' | 'history'
  >(initialSubtab === 'anomalies' ? 'anomalies' : 'probes');

  useEffect(() => {
    const tab = searchParams?.get('tab');
    const subtab = searchParams?.get('subtab');
    if (tab === 'observability') {
      setActiveTab('observability');
    } else if (tab === 'reliability') {
      setActiveTab('reliability');
    }
    if (subtab === 'anomalies') {
      setObservabilitySubTab('anomalies');
    }
  }, [searchParams]);


  // Modals state
  const [showEnvModal, setShowEnvModal] = useState(false);
  const [showDepModal, setShowDepModal] = useState(false);
  const [showProbeModal, setShowProbeModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [runFeedback, setRunFeedback] = useState<string | null>(null);

  // New Env Form State
  const [newEnvName, setNewEnvName] = useState('');
  const [newEnvKey, setNewEnvKey] = useState('');
  const [newEnvKind, setNewEnvKind] = useState<EnvironmentKind>('DEVELOPMENT');
  const [newEnvBaseUrl, setNewEnvBaseUrl] = useState('');
  const [newEnvIsProd, setNewEnvIsProd] = useState(false);

  // New Dep Form State
  const [newDepTargetId, setNewDepTargetId] = useState('');
  const [newDepType, setNewDepType] = useState<DependencyType>('SYNCHRONOUS');
  const [newDepIsCritical, setNewDepIsCritical] = useState(false);
  const [newDepDescription, setNewDepDescription] = useState('');

  // New Probe Form State
  const [newProbeName, setNewProbeName] = useState('');
  const [newProbeEnvId, setNewProbeEnvId] = useState('');
  const [newProbeType, setNewProbeType] = useState<ProbeType>('HTTP');
  const [newProbeHttpMethod, setNewProbeHttpMethod] = useState('GET');
  const [newProbeHttpPath, setNewProbeHttpPath] = useState('/health');
  const [newProbeMinStatus, setNewProbeMinStatus] = useState(200);
  const [newProbeMaxStatus, setNewProbeMaxStatus] = useState(299);
  const [newProbeGrpcHost, setNewProbeGrpcHost] = useState('');
  const [newProbeGrpcService, setNewProbeGrpcService] = useState('');
  const [newProbeGrpcTls, setNewProbeGrpcTls] = useState(false);
  const [newProbeInterval, setNewProbeInterval] = useState(30);
  const [newProbeTimeout, setNewProbeTimeout] = useState(5000);
  const [newProbeSuccessThresh, setNewProbeSuccessThresh] = useState(2);
  const [newProbeFailureThresh, setNewProbeFailureThresh] = useState(3);
  const [newProbeIsCritical, setNewProbeIsCritical] = useState(false);

  // History Run Filter
  const [selectedProbeFilter, setSelectedProbeFilter] = useState<string>('ALL');

  // Queries
  const { data: service, isLoading: serviceLoading, refetch: refetchService } = useQuery({
    queryKey: ['service', orgId, serviceId],
    queryFn: () => api.services.get(orgId!, serviceId),
    enabled: !!orgId && !!serviceId,
  });

  const { data: allServices } = useQuery({
    queryKey: ['services', orgId],
    queryFn: () => api.services.list(orgId!, { limit: 100 }),
    enabled: !!orgId,
  });

  const { data: environments, refetch: refetchEnvs } = useQuery({
    queryKey: ['environments', orgId, serviceId],
    queryFn: () => api.environments.list(orgId!, serviceId),
    enabled: !!orgId && !!serviceId,
  });

  const { data: dependenciesData, refetch: refetchDeps } = useQuery({
    queryKey: ['dependencies', orgId, serviceId],
    queryFn: () => api.dependencies.list(orgId!, serviceId),
    enabled: !!orgId && !!serviceId,
  });

  const { data: probes, refetch: refetchProbes } = useQuery({
    queryKey: ['probes', orgId, serviceId],
    queryFn: () => api.healthProbes.list(orgId!, serviceId),
    enabled: !!orgId && !!serviceId,
  });

  const { data: serviceAlerts, isLoading: serviceAlertsLoading, refetch: refetchAlerts } = useQuery({
    queryKey: ['service-alerts', orgId, serviceId],
    queryFn: () => api.alerts.listAlerts(orgId!, { serviceId }),
    enabled: !!orgId && !!serviceId,
    refetchInterval: 15000,
  });

  const { data: serviceRules, isLoading: serviceRulesLoading, refetch: refetchRules } = useQuery({
    queryKey: ['service-rules', orgId, serviceId],
    queryFn: () => api.alerts.listRules(orgId!, { serviceId }),
    enabled: !!orgId && !!serviceId,
  });

  // Selected probe for history runs
  const activeProbeForHistory =
    selectedProbeFilter !== 'ALL'
      ? selectedProbeFilter
      : probes && probes.length > 0
      ? probes[0]?.id
      : null;

  const { data: runsData, refetch: refetchRuns } = useQuery({
    queryKey: ['probe-runs', orgId, activeProbeForHistory],
    queryFn: () => api.healthProbes.listRuns(orgId!, activeProbeForHistory!, { limit: 25 }),
    enabled: !!orgId && !!activeProbeForHistory,
  });

  // Mutations
  const lifecycleMutation = useMutation({
    mutationFn: (lifecycleStatus: ServiceLifecycle) =>
      api.services.updateLifecycle(orgId!, serviceId, { lifecycleStatus }),
    onSuccess: () => {
      refetchService();
      queryClient.invalidateQueries({ queryKey: ['services', orgId] });
    },
  });

  const createEnvMutation = useMutation({
    mutationFn: () =>
      api.environments.create(orgId!, serviceId, {
        name: newEnvName.trim(),
        key: newEnvKey.trim() || newEnvName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        kind: newEnvKind,
        baseUrl: newEnvBaseUrl.trim() || undefined,
        isProduction: newEnvIsProd,
      }),
    onSuccess: () => {
      setShowEnvModal(false);
      setNewEnvName('');
      setNewEnvKey('');
      setNewEnvBaseUrl('');
      refetchEnvs();
      refetchService();
    },
    onError: (err: any) => {
      setErrorMessage(err?.message || 'Failed to create environment');
    },
  });

  const deleteEnvMutation = useMutation({
    mutationFn: (envId: string) => api.environments.delete(orgId!, envId),
    onSuccess: () => {
      refetchEnvs();
      refetchService();
    },
  });

  const createDepMutation = useMutation({
    mutationFn: () =>
      api.dependencies.create(orgId!, serviceId, {
        targetServiceId: newDepTargetId,
        dependencyType: newDepType,
        isCritical: newDepIsCritical,
        description: newDepDescription.trim() || undefined,
      }),
    onSuccess: () => {
      setShowDepModal(false);
      setNewDepTargetId('');
      setNewDepDescription('');
      refetchDeps();
      refetchService();
    },
    onError: (err: any) => {
      setErrorMessage(err?.message || 'Failed to add dependency');
    },
  });

  const removeDepMutation = useMutation({
    mutationFn: (targetId: string) =>
      api.dependencies.remove(orgId!, serviceId, targetId),
    onSuccess: () => {
      refetchDeps();
      refetchService();
    },
  });

  const createProbeMutation = useMutation({
    mutationFn: () =>
      api.healthProbes.create(orgId!, serviceId, {
        name: newProbeName.trim(),
        environmentId: newProbeEnvId,
        probeType: newProbeType,
        isCritical: newProbeIsCritical,
        intervalSeconds: Number(newProbeInterval),
        timeoutMs: Number(newProbeTimeout),
        successThreshold: Number(newProbeSuccessThresh),
        failureThreshold: Number(newProbeFailureThresh),
        httpMethod: newProbeType === 'HTTP' ? newProbeHttpMethod : undefined,
        httpPath: newProbeType === 'HTTP' ? newProbeHttpPath : undefined,
        httpExpectedStatusMin: newProbeType === 'HTTP' ? Number(newProbeMinStatus) : undefined,
        httpExpectedStatusMax: newProbeType === 'HTTP' ? Number(newProbeMaxStatus) : undefined,
        grpcHost: newProbeType === 'GRPC' ? newProbeGrpcHost : undefined,
        grpcService: newProbeType === 'GRPC' ? newProbeGrpcService : undefined,
        grpcUseTls: newProbeType === 'GRPC' ? newProbeGrpcTls : undefined,
      }),
    onSuccess: () => {
      setShowProbeModal(false);
      setNewProbeName('');
      refetchProbes();
      refetchService();
    },
    onError: (err: any) => {
      setErrorMessage(err?.message || 'Failed to create probe');
    },
  });

  const runProbeMutation = useMutation({
    mutationFn: (probeId: string) => api.healthProbes.runNow(orgId!, probeId),
    onSuccess: (data) => {
      setRunFeedback(
        `Probe run finished: Status ${data.run.status} (${data.run.latencyMs ?? 0}ms)${
          data.run.failureMessage ? ` — ${data.run.failureMessage}` : ''
        }`,
      );
      refetchProbes();
      refetchRuns();
      refetchService();
      setTimeout(() => setRunFeedback(null), 8000);
    },
    onError: (err: any) => {
      setRunFeedback(`Probe execution error: ${err.message}`);
      setTimeout(() => setRunFeedback(null), 8000);
    },
  });

  const deleteProbeMutation = useMutation({
    mutationFn: (probeId: string) => api.healthProbes.delete(orgId!, probeId),
    onSuccess: () => {
      refetchProbes();
      refetchRuns();
      refetchService();
    },
  });

  const getHealthBadge = (status: ServiceHealthStatus) => {
    switch (status) {
      case 'HEALTHY':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse mr-1" />
            Healthy
          </span>
        );
      case 'DEGRADED':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span className="h-2 w-2 rounded-full bg-amber-400 mr-1" />
            Degraded
          </span>
        );
      case 'UNHEALTHY':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <span className="h-2 w-2 rounded-full bg-rose-400 animate-ping mr-1" />
            Unhealthy
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            <HelpCircle className="h-3 w-3 mr-1" />
            Unknown
          </span>
        );
    }
  };

  if (serviceLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 space-y-4">
        <div className="h-10 w-48 bg-slate-800 animate-pulse rounded" />
        <div className="h-40 bg-slate-900/60 rounded-xl border border-slate-800 animate-pulse" />
      </div>
    );
  }

  if (!service) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-center text-slate-400">
        Service not found or you do not have access.
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Breadcrumb & Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <Link
            href="/services"
            className="inline-flex items-center space-x-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Service Catalog</span>
          </Link>
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-100 flex items-center space-x-3">
                <span>{service.name}</span>
                {getHealthBadge(service.healthStatus)}
              </h1>
              <div className="flex items-center space-x-3 text-xs text-slate-400 mt-0.5">
                <span className="font-mono text-slate-500">{service.slug}</span>
                <span>•</span>
                <span className="font-mono text-slate-300">{service.serviceType}</span>
                <span>•</span>
                <span className="text-slate-300">{service.tier.replace('_', ' ')}</span>
                {service.ownerTeam && (
                  <>
                    <span>•</span>
                    <span className="flex items-center space-x-1 text-indigo-400">
                      <Users className="h-3 w-3" />
                      <span>{service.ownerTeam.name}</span>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Lifecycle Selector */}
        <div className="flex items-center space-x-2">
          <span className="text-xs text-slate-400 font-medium">Lifecycle:</span>
          <select
            value={service.lifecycleStatus}
            onChange={(e) => lifecycleMutation.mutate(e.target.value as ServiceLifecycle)}
            className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-semibold text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="DEVELOPMENT">Development</option>
            <option value="ACTIVE">Active</option>
            <option value="DEPRECATED">Deprecated</option>
            <option value="RETIRED">Retired</option>
          </select>
        </div>
      </div>

      {/* Global alert feedback */}
      {runFeedback && (
        <div className="p-3 bg-cyan-950/50 border border-cyan-800 rounded-lg text-cyan-300 text-xs flex items-center justify-between">
          <span>{runFeedback}</span>
          <button
            type="button"
            onClick={() => setRunFeedback(null)}
            className="text-cyan-400 hover:text-white text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-rose-950/40 border border-rose-800 rounded-lg text-rose-300 text-xs flex items-center justify-between">
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-rose-400 hover:text-white text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Navigation Tabs: 4 Major Sections */}
      <div className="border-b border-slate-800 flex space-x-1">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2.5 text-xs font-medium border-b-2 flex items-center space-x-2 transition-colors ${
            activeTab === 'overview'
              ? 'border-cyan-400 text-cyan-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="h-4 w-4" />
          <span>Overview</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('observability')}
          className={`px-4 py-2.5 text-xs font-medium border-b-2 flex items-center space-x-2 transition-colors ${
            activeTab === 'observability'
              ? 'border-cyan-400 text-cyan-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Radio className="h-4 w-4" />
          <span>Observability</span>
          {serviceAlerts?.alerts && serviceAlerts.alerts.filter((a) => a.state === 'FIRING').length > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
              {serviceAlerts.alerts.filter((a) => a.state === 'FIRING').length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('reliability')}
          className={`px-4 py-2.5 text-xs font-medium border-b-2 flex items-center space-x-2 transition-colors ${
            activeTab === 'reliability'
              ? 'border-indigo-400 text-indigo-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <TrendingUp className="h-4 w-4" />
          <span>Reliability</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('dependencies')}
          className={`px-4 py-2.5 text-xs font-medium border-b-2 flex items-center space-x-2 transition-colors ${
            activeTab === 'dependencies'
              ? 'border-cyan-400 text-cyan-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Network className="h-4 w-4" />
          <span>
            Dependencies (
            {(dependenciesData?.upstream?.length ?? 0) +
              (dependenciesData?.downstream?.length ?? 0)}
            )
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('configuration')}
          className={`px-4 py-2.5 text-xs font-medium border-b-2 flex items-center space-x-2 transition-colors ${
            activeTab === 'configuration'
              ? 'border-cyan-400 text-cyan-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Settings className="h-4 w-4" />
          <span>Configuration</span>
        </button>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-900/60 p-6 rounded-xl border border-slate-800 space-y-4">
              <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
                Service Description & Role
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                {service.description || 'No description provided.'}
              </p>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-800 text-xs">
                <div>
                  <span className="text-slate-500 block mb-1">Repository</span>
                  {service.repositoryUrl ? (
                    <a
                      href={service.repositoryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:underline flex items-center space-x-1"
                    >
                      <span className="truncate">{service.repositoryUrl}</span>
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    </a>
                  ) : (
                    <span className="text-slate-500">Not linked</span>
                  )}
                </div>

                <div>
                  <span className="text-slate-500 block mb-1">Documentation</span>
                  {service.documentationUrl ? (
                    <a
                      href={service.documentationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:underline flex items-center space-x-1"
                    >
                      <span className="truncate">{service.documentationUrl}</span>
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    </a>
                  ) : (
                    <span className="text-slate-500">Not linked</span>
                  )}
                </div>
              </div>
            </div>

            {/* Environments Quick View */}
            <div className="bg-slate-900/60 p-6 rounded-xl border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
                  Configured Environments
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('configuration')}
                  className="text-xs text-cyan-400 hover:underline"
                >
                  Manage All
                </button>
              </div>

              {environments && environments.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {environments.map((env) => (
                    <div
                      key={env.id}
                      className="p-3 bg-slate-800/50 rounded-lg border border-slate-800 flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-xs text-slate-200">
                            {env.name}
                          </span>
                          {env.isProduction && (
                            <span className="px-1.5 py-0.2 text-[9px] bg-rose-950/80 text-rose-300 border border-rose-800 rounded font-semibold uppercase">
                              Prod
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono block truncate max-w-[200px]">
                          {env.baseUrl || 'No base URL'}
                        </span>
                      </div>
                      {getHealthBadge(env.healthStatus)}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">No environments created yet.</p>
              )}
            </div>
          </div>

          {/* Right Sidebar Details */}
          <div className="space-y-6">
            <div className="bg-slate-900/60 p-6 rounded-xl border border-slate-800 space-y-4 text-xs">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Ownership & Tiering
              </h3>

              <div className="space-y-3">
                <div>
                  <span className="text-slate-500 block">Owner Team</span>
                  <span className="font-medium text-slate-200">
                    {service.ownerTeam?.name || 'Unassigned'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block">Service Tier</span>
                  <span className="font-medium text-slate-200">
                    {service.tier.replace('_', ' ')}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block">Registered On</span>
                  <span className="font-mono text-slate-400">
                    {new Date(service.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block">Dependencies</span>
                  <span className="text-slate-300">
                    Upstream: {dependenciesData?.upstream?.length ?? 0} | Downstream:{' '}
                    {dependenciesData?.downstream?.length ?? 0}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: CONFIGURATION */}
      {activeTab === 'configuration' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-base font-semibold text-slate-200">
                Runtime Environments
              </h3>
              <p className="text-xs text-slate-400">
                Multi-environment deployment stages (Production, Staging, Dev) with dedicated health tracking.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowEnvModal(true)}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Environment</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {environments?.map((env) => (
              <div
                key={env.id}
                className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-sm text-slate-200">{env.name}</span>
                      {env.isProduction && (
                        <span className="px-1.5 py-0.5 text-[9px] bg-rose-950/80 text-rose-300 border border-rose-800 rounded font-semibold uppercase">
                          Production
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-slate-500">{env.key}</span>
                  </div>
                  {getHealthBadge(env.healthStatus)}
                </div>

                <div className="text-xs space-y-1 text-slate-400 pt-2 border-t border-slate-800/60">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Kind:</span>
                    <span className="font-mono text-slate-300">{env.kind}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Base URL:</span>
                    <span className="font-mono text-cyan-400 truncate max-w-[180px]">
                      {env.baseUrl || 'None'}
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800/60 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Delete environment "${env.name}"? Probes targeting it will be removed.`)) {
                        deleteEnvMutation.mutate(env.id);
                      }
                    }}
                    className="text-rose-400 hover:text-rose-300 text-xs flex items-center space-x-1"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: DEPENDENCIES & DAG */}
      {activeTab === 'dependencies' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-base font-semibold text-slate-200">
                Service Dependency Mapping (DAG)
              </h3>
              <p className="text-xs text-slate-400">
                Directed graph of upstream service dependencies and downstream consumers with cycle detection.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowDepModal(true)}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Dependency</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Upstream Dependencies */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <h4 className="text-sm font-semibold text-slate-200 flex items-center space-x-2">
                  <span className="h-2 w-2 rounded-full bg-cyan-400" />
                  <span>Upstream Dependencies (This service calls)</span>
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Services required by {service.name} for healthy operations.
                </p>
              </div>

              {!dependenciesData?.upstream || dependenciesData.upstream.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-4 text-center">
                  No upstream dependencies declared.
                </p>
              ) : (
                <div className="space-y-2">
                  {dependenciesData.upstream.map((up) => (
                    <div
                      key={up.id}
                      className="p-3 bg-slate-800/40 border border-slate-800 rounded-lg flex items-center justify-between"
                    >
                      <div>
                        <Link
                          href={`/services/${up.id}`}
                          className="font-semibold text-xs text-slate-200 hover:text-cyan-400 transition-colors"
                        >
                          {up.name}
                        </Link>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {up.serviceType} • {up.tier}
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        {getHealthBadge(up.healthStatus)}
                        <button
                          type="button"
                          onClick={() => removeDepMutation.mutate(up.id)}
                          className="text-slate-500 hover:text-rose-400 transition-colors"
                          title="Remove dependency"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Downstream Dependents */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <h4 className="text-sm font-semibold text-slate-200 flex items-center space-x-2">
                  <span className="h-2 w-2 rounded-full bg-indigo-400" />
                  <span>Downstream Dependents (Callers)</span>
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Services that depend on {service.name} (blast radius).
                </p>
              </div>

              {!dependenciesData?.downstream || dependenciesData.downstream.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-4 text-center">
                  No downstream dependents consuming this service.
                </p>
              ) : (
                <div className="space-y-2">
                  {dependenciesData.downstream.map((down) => (
                    <div
                      key={down.id}
                      className="p-3 bg-slate-800/40 border border-slate-800 rounded-lg flex items-center justify-between"
                    >
                      <div>
                        <Link
                          href={`/services/${down.id}`}
                          className="font-semibold text-xs text-slate-200 hover:text-cyan-400 transition-colors"
                        >
                          {down.name}
                        </Link>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {down.serviceType} • {down.tier}
                        </div>
                      </div>
                      {getHealthBadge(down.healthStatus)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SECTION: OBSERVABILITY */}
      {activeTab === 'observability' && (
        <div className="space-y-6">
          <div className="flex items-center space-x-1.5 p-1 bg-slate-900/80 border border-slate-800 rounded-lg w-fit">
            <button
              type="button"
              onClick={() => setObservabilitySubTab('probes')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                observabilitySubTab === 'probes'
                  ? 'bg-slate-800 text-cyan-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Health Probes ({probes?.length ?? 0})
            </button>
            <button
              type="button"
              onClick={() => setObservabilitySubTab('telemetry')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                observabilitySubTab === 'telemetry'
                  ? 'bg-slate-800 text-cyan-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Telemetry Stream
            </button>
            <button
              type="button"
              onClick={() => setObservabilitySubTab('alerts')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                observabilitySubTab === 'alerts'
                  ? 'bg-slate-800 text-cyan-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Alert Rules
            </button>
            <button
              type="button"
              onClick={() => setObservabilitySubTab('anomalies')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center space-x-1.5 ${
                observabilitySubTab === 'anomalies'
                  ? 'bg-slate-800 text-purple-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="h-3 w-3" />
              <span>Anomalies</span>
            </button>
            <button
              type="button"
              onClick={() => setObservabilitySubTab('history')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                observabilitySubTab === 'history'
                  ? 'bg-slate-800 text-cyan-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Probe Runs
            </button>
          </div>

          {observabilitySubTab === 'probes' && (
            <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-base font-semibold text-slate-200">
                Active Health Probes
              </h3>
              <p className="text-xs text-slate-400">
                Periodic HTTP/gRPC synthetic health probes with hysteresis state management and SSRF protection.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!environments || environments.length === 0) {
                  alert('Please create at least one Environment before configuring health probes.');
                  return;
                }
                setNewProbeEnvId(environments[0]!.id);
                setShowProbeModal(true);
              }}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Configure Probe</span>
            </button>
          </div>

          <div className="space-y-4">
            {!probes || probes.length === 0 ? (
              <div className="p-8 text-center bg-slate-900/40 rounded-xl border border-dashed border-slate-800 text-slate-500 text-xs">
                No health probes configured for this service yet.
              </div>
            ) : (
              probes.map((probe) => (
                <div
                  key={probe.id}
                  className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 max-w-xl">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-sm text-slate-200">{probe.name}</span>
                      <span className="px-1.5 py-0.5 text-[9px] bg-slate-800 text-slate-300 font-mono rounded border border-slate-700">
                        {probe.probeType}
                      </span>
                      {probe.environmentName && (
                        <span className="px-1.5 py-0.5 text-[9px] bg-cyan-950/60 text-cyan-300 font-mono rounded border border-cyan-800">
                          {probe.environmentName}
                        </span>
                      )}
                      {probe.isCritical && (
                        <span className="px-1.5 py-0.5 text-[9px] bg-rose-950/60 text-rose-300 font-mono rounded border border-rose-800">
                          Critical
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-400 font-mono">
                      {probe.probeType === 'HTTP' ? (
                        <span>
                          {probe.httpMethod} {probe.httpPath} (expected{' '}
                          {probe.httpExpectedStatusMin}..{probe.httpExpectedStatusMax})
                        </span>
                      ) : (
                        <span>
                          gRPC {probe.grpcHost} ({probe.grpcService || 'default'})
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-4 text-[11px] text-slate-500">
                      <span>Interval: {probe.intervalSeconds}s</span>
                      <span>Timeout: {probe.timeoutMs}ms</span>
                      <span>
                        Hysteresis: {probe.successThreshold} succ / {probe.failureThreshold} fail
                      </span>
                    </div>

                    {probe.state && (
                      <div className="pt-2 flex items-center space-x-3 text-xs">
                        <span className="text-slate-400">State:</span>
                        {getHealthBadge(probe.state.status)}
                        {probe.state.lastLatencyMs !== null && (
                          <span className="text-slate-400 font-mono text-[11px]">
                            {probe.state.lastLatencyMs}ms
                          </span>
                        )}
                        {probe.state.lastCheckedAt && (
                          <span className="text-slate-500 text-[10px]">
                            Checked {new Date(probe.state.lastCheckedAt).toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      disabled={runProbeMutation.isPending}
                      onClick={() => runProbeMutation.mutate(probe.id)}
                      className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors shadow-sm"
                    >
                      <Play className="h-3 w-3" />
                      <span>Run Now</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Delete probe "${probe.name}"?`)) {
                          deleteProbeMutation.mutate(probe.id);
                        }
                      }}
                      className="p-1.5 bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-slate-700 rounded-lg transition-colors"
                      title="Delete probe"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB: HISTORY */}
      {observabilitySubTab === 'history' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-200">
                Health Probe Execution Log
              </h3>
              <p className="text-xs text-slate-400">
                Chronological history of probe executions, latencies, and response codes.
              </p>
            </div>

            {probes && probes.length > 0 && (
              <select
                value={selectedProbeFilter}
                onChange={(e) => setSelectedProbeFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="ALL">Select Probe for Logs</option>
                {probes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {!runsData?.items || runsData.items.length === 0 ? (
            <div className="p-8 text-center bg-slate-900/40 rounded-xl border border-slate-800 text-slate-500 text-xs">
              No execution runs recorded yet. Use &quot;Run Now&quot; on the Health Probes tab to trigger immediate runs.
            </div>
          ) : (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80 text-slate-400 uppercase tracking-wider text-[10px]">
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Latency</th>
                    <th className="px-4 py-3">HTTP Code</th>
                    <th className="px-4 py-3">Failure Info</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {runsData.items.map((run: HealthProbeRunSummary) => (
                    <tr key={run.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                        {new Date(run.startedAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {getHealthBadge(run.status)}
                      </td>
                      <td className="px-4 py-3 text-slate-300 font-mono text-[11px]">
                        {run.latencyMs !== null ? `${run.latencyMs}ms` : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-300 font-mono text-[11px]">
                        {run.httpStatusCode ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-rose-400 text-[11px] truncate max-w-xs">
                        {run.failureMessage || run.failureCode || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB: TELEMETRY */}
      {observabilitySubTab === 'telemetry' && (
        <TelemetryTab
          organizationId={orgId!}
          serviceId={serviceId}
          serviceName={service.name}
          environments={environments ?? []}
        />
      )}

      {/* TAB: ALERTS */}
      {observabilitySubTab === 'alerts' && (
        <div className="space-y-6">
          {/* Header & Quick stats */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 p-5 rounded-xl border border-slate-800">
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                <Bell className="h-5 w-5 text-cyan-400" />
                <span>Service Alerts & Detection Rules</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Real-time active alerts and configured threshold rules protecting {service.name}
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <Link
                href="/alerts"
                className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors"
              >
                <span>Alerts Console</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {/* Metric Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400 font-medium">Firing Alerts</span>
                <p className="text-2xl font-bold text-rose-400 mt-1">
                  {serviceAlerts?.alerts?.filter((a) => a.state === 'FIRING').length ?? 0}
                </p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-rose-400" />
              </div>
            </div>

            <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400 font-medium">Pending Alerts</span>
                <p className="text-2xl font-bold text-amber-400 mt-1">
                  {serviceAlerts?.alerts?.filter((a) => a.state === 'PENDING').length ?? 0}
                </p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-400" />
              </div>
            </div>

            <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400 font-medium">Configured Rules</span>
                <p className="text-2xl font-bold text-cyan-400 mt-1">
                  {serviceRules?.rules?.length ?? 0}
                </p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                <Shield className="h-5 w-5 text-cyan-400" />
              </div>
            </div>
          </div>

          {/* Active Alerts Table */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-4 w-4 text-rose-400" />
                <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                  Active Alert Instances
                </h4>
              </div>
              <span className="text-xs text-slate-400">
                {serviceAlerts?.alerts?.length ?? 0} total active
              </span>
            </div>

            {serviceAlertsLoading ? (
              <div className="p-8 text-center text-slate-500 text-xs animate-pulse">
                Loading active service alerts...
              </div>
            ) : !serviceAlerts?.alerts || serviceAlerts.alerts.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto" />
                <p className="text-xs font-semibold text-slate-300">All Systems Nominal</p>
                <p className="text-[11px] text-slate-500">
                  No firing or pending alert instances recorded for this service.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Severity</th>
                      <th className="px-4 py-3 font-semibold">State</th>
                      <th className="px-4 py-3 font-semibold">Rule Name</th>
                      <th className="px-4 py-3 font-semibold">Environment</th>
                      <th className="px-4 py-3 font-semibold">Current Value</th>
                      <th className="px-4 py-3 font-semibold">Threshold</th>
                      <th className="px-4 py-3 font-semibold">Triggered</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {serviceAlerts.alerts.map((alert) => (
                      <tr key={alert.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                              alert.severity === 'SEV-1'
                                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                : alert.severity === 'SEV-2'
                                ? 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                                : alert.severity === 'SEV-3'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                            }`}
                          >
                            {alert.severity}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold border ${
                              alert.state === 'FIRING'
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                : alert.state === 'PENDING'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            }`}
                          >
                            {alert.state === 'FIRING' && (
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse mr-1" />
                            )}
                            {alert.state}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-200">
                          {alert.ruleName || alert.fingerprint.substring(0, 8)}
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          {alert.environmentName || 'All Envs'}
                        </td>
                        <td className="px-4 py-3 font-mono text-rose-400 font-semibold">
                          {alert.currentValue !== null && alert.currentValue !== undefined ? Number(alert.currentValue).toFixed(2) : '—'}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-400">
                          {alert.thresholdValue !== null && alert.thresholdValue !== undefined ? Number(alert.thresholdValue).toFixed(2) : '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                          {new Date(alert.lastStateChangeAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Configured Detection Rules Section */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Shield className="h-4 w-4 text-cyan-400" />
                <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                  Configured Alert Rules
                </h4>
              </div>
              <span className="text-xs text-slate-400">
                {serviceRules?.rules?.length ?? 0} rules
              </span>
            </div>

            {serviceRulesLoading ? (
              <div className="p-8 text-center text-slate-500 text-xs animate-pulse">
                Loading configured alert rules...
              </div>
            ) : !serviceRules?.rules || serviceRules.rules.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <p className="text-xs text-slate-400">No alert rules configured for this service yet.</p>
                <Link
                  href="/alerts"
                  className="inline-flex items-center space-x-1 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Configure Rule in Alerts Console</span>
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/60">
                {serviceRules.rules.map((rule) => (
                  <div key={rule.id} className="p-4 hover:bg-slate-800/20 transition-colors flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            rule.severity === 'SEV-1'
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                              : rule.severity === 'SEV-2'
                              ? 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                              : rule.severity === 'SEV-3'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                          }`}
                        >
                          {rule.severity}
                        </span>
                        <span className="text-xs font-semibold text-slate-200">{rule.name}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            rule.status === 'ENABLED'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          {rule.status}
                        </span>
                      </div>
                      <div className="flex items-center space-x-3 text-[11px] text-slate-400">
                        <span>
                          Metric: <code className="text-cyan-400 font-mono">{rule.metricName || 'unknown'}</code>
                        </span>
                        <span>
                          Condition: <code className="text-slate-300 font-mono">{rule.aggregation}({rule.windowSeconds}s) {rule.comparisonOperator} {rule.thresholdValue}</code>
                        </span>
                        <span>Mode: <span className="text-slate-300">{rule.evaluationMode}</span></span>
                      </div>
                    </div>
                    <Link
                      href="/alerts"
                      className="text-xs text-slate-400 hover:text-cyan-400 flex items-center space-x-1"
                    >
                      <span>View</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: ANOMALIES */}
      {observabilitySubTab === 'anomalies' && (
        <AnomaliesTab
          organizationId={orgId!}
          serviceId={serviceId}
          serviceName={service.name}
          environments={environments ?? []}
        />
      )}
    </div>
  )}

      {/* SECTION: RELIABILITY */}
      {activeTab === 'reliability' && (
        <ServiceReliabilitySection
          organizationId={orgId!}
          serviceId={serviceId}
        />
      )}

      {/* CREATE ENVIRONMENT MODAL */}
      {showEnvModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-slate-100">Add Service Environment</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Environment Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Staging, EU Production"
                  value={newEnvName}
                  onChange={(e) => {
                    setNewEnvName(e.target.value);
                    setNewEnvKey(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
                  }}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Key Identifier
                </label>
                <input
                  type="text"
                  placeholder="staging"
                  value={newEnvKey}
                  onChange={(e) => setNewEnvKey(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Kind
                </label>
                <select
                  value={newEnvKind}
                  onChange={(e) => setNewEnvKind(e.target.value as EnvironmentKind)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="DEVELOPMENT">Development</option>
                  <option value="STAGING">Staging</option>
                  <option value="PRODUCTION">Production</option>
                  <option value="TEST">Test</option>
                  <option value="CUSTOM">Custom</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Base URL
                </label>
                <input
                  type="url"
                  placeholder="https://staging.service.internal"
                  value={newEnvBaseUrl}
                  onChange={(e) => setNewEnvBaseUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="isProd"
                  checked={newEnvIsProd}
                  onChange={(e) => setNewEnvIsProd(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-cyan-500"
                />
                <label htmlFor="isProd" className="text-xs text-slate-300">
                  Mark as Primary Production environment
                </label>
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowEnvModal(false)}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-lg text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newEnvName.trim() || createEnvMutation.isPending}
                onClick={() => createEnvMutation.mutate()}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE DEPENDENCY MODAL */}
      {showDepModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-slate-100">Add Service Dependency</h3>
            <p className="text-xs text-slate-400">
              Declare an upstream dependency edge. Cycles are strictly blocked.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Target Service <span className="text-rose-400">*</span>
                </label>
                <select
                  value={newDepTargetId}
                  onChange={(e) => setNewDepTargetId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="">-- Select Target Service --</option>
                  {allServices?.items
                    ?.filter((s) => s.id !== serviceId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.tier})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Dependency Type
                </label>
                <select
                  value={newDepType}
                  onChange={(e) => setNewDepType(e.target.value as DependencyType)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="SYNCHRONOUS">Synchronous (REST / gRPC request)</option>
                  <option value="ASYNCHRONOUS">Asynchronous (Queue / Event bus)</option>
                  <option value="DATA">Data / Shared datastore</option>
                  <option value="INFRASTRUCTURE">Infrastructure dependency</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Description / Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Fetches user billing tokens on checkout"
                  value={newDepDescription}
                  onChange={(e) => setNewDepDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="isCritical"
                  checked={newDepIsCritical}
                  onChange={(e) => setNewDepIsCritical(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-rose-500"
                />
                <label htmlFor="isCritical" className="text-xs text-slate-300">
                  Critical Dependency (Outage propagates immediately)
                </label>
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowDepModal(false)}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-lg text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newDepTargetId || createDepMutation.isPending}
                onClick={() => createDepMutation.mutate()}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium"
              >
                Add Dependency
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE HEALTH PROBE MODAL */}
      {showProbeModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl my-8">
            <h3 className="text-base font-bold text-slate-100">Configure Health Probe</h3>
            <p className="text-xs text-slate-400">
              Set up active synthetic monitoring with hysteresis thresholds.
            </p>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Probe Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Primary Liveness"
                    value={newProbeName}
                    onChange={(e) => setNewProbeName(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Environment
                  </label>
                  <select
                    value={newProbeEnvId}
                    onChange={(e) => setNewProbeEnvId(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                  >
                    {environments?.map((env) => (
                      <option key={env.id} value={env.id}>
                        {env.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Probe Protocol
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewProbeType('HTTP')}
                    className={`py-1.5 text-xs font-semibold rounded-lg border text-center transition-colors ${
                      newProbeType === 'HTTP'
                        ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    HTTP / HTTPS
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewProbeType('GRPC')}
                    className={`py-1.5 text-xs font-semibold rounded-lg border text-center transition-colors ${
                      newProbeType === 'GRPC'
                        ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    gRPC Health/Check
                  </button>
                </div>
              </div>

              {newProbeType === 'HTTP' ? (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Method
                      </label>
                      <select
                        value={newProbeHttpMethod}
                        onChange={(e) => setNewProbeHttpMethod(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                      >
                        <option value="GET">GET</option>
                        <option value="HEAD">HEAD</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Path
                      </label>
                      <input
                        type="text"
                        placeholder="/health"
                        value={newProbeHttpPath}
                        onChange={(e) => setNewProbeHttpPath(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Expected Status Min
                      </label>
                      <input
                        type="number"
                        value={newProbeMinStatus}
                        onChange={(e) => setNewProbeMinStatus(Number(e.target.value))}
                        className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Expected Status Max
                      </label>
                      <input
                        type="number"
                        value={newProbeMaxStatus}
                        onChange={(e) => setNewProbeMaxStatus(Number(e.target.value))}
                        className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 font-mono"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Target Host:Port
                    </label>
                    <input
                      type="text"
                      placeholder="grpc.internal.net:50051"
                      value={newProbeGrpcHost}
                      onChange={(e) => setNewProbeGrpcHost(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Service Name (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. auth.v1"
                        value={newProbeGrpcService}
                        onChange={(e) => setNewProbeGrpcService(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 font-mono"
                      />
                    </div>
                    <div className="flex items-center pt-5 space-x-2">
                      <input
                        type="checkbox"
                        id="grpcTls"
                        checked={newProbeGrpcTls}
                        onChange={(e) => setNewProbeGrpcTls(e.target.checked)}
                        className="rounded bg-slate-800 border-slate-700 text-cyan-500"
                      />
                      <label htmlFor="grpcTls" className="text-xs text-slate-300">
                        Enable TLS
                      </label>
                    </div>
                  </div>
                </>
              )}

              {/* Intervals & Hysteresis */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Interval (Seconds)
                  </label>
                  <input
                    type="number"
                    min={10}
                    value={newProbeInterval}
                    onChange={(e) => setNewProbeInterval(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Timeout (ms)
                  </label>
                  <input
                    type="number"
                    min={500}
                    value={newProbeTimeout}
                    onChange={(e) => setNewProbeTimeout(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Success Threshold
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={newProbeSuccessThresh}
                    onChange={(e) => setNewProbeSuccessThresh(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Failure Threshold
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={newProbeFailureThresh}
                    onChange={(e) => setNewProbeFailureThresh(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="probeCrit"
                  checked={newProbeIsCritical}
                  onChange={(e) => setNewProbeIsCritical(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-rose-500"
                />
                <label htmlFor="probeCrit" className="text-xs text-slate-300">
                  Critical Probe (Directly influences overall Service Health status)
                </label>
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowProbeModal(false)}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-lg text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newProbeName.trim() || createProbeMutation.isPending}
                onClick={() => createProbeMutation.mutate()}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium"
              >
                Save Probe
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

