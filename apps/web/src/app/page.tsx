'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  AlertOctagon,
  Bell,
  Server,
  Activity,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  User,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { useRealtimeOrganization } from '@/lib/realtime';
import {
  pageTransitionVariants,
  staggerContainerVariants,
  staggerItemVariants,
  tactileButtonProps,
} from '@/lib/motion';
import { ReliabilitySnapshot } from '@/components/reliability/ReliabilitySnapshot';
import type { AttentionItem, ServiceOperationalSummary } from '@aegisops/types';

export default function OperationsOverviewPage() {
  const { user, activeOrganization, isLoading: authLoading } = useAuth();

  // Connect to real-time WebSocket room for live invalidation
  useRealtimeOrganization(activeOrganization?.id);

  const {
    data: overview,
    isLoading: overviewLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['operations-overview', activeOrganization?.id],
    queryFn: () => api.operations.getOverview(activeOrganization!.id),
    enabled: !!activeOrganization?.id,
    refetchInterval: 30000, // Background heartbeat polling backup
  });

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex items-center space-x-3 text-slate-400">
          <RefreshCw className="h-5 w-5 animate-spin text-emerald-400" />
          <span className="text-sm">Authenticating session...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <motion.div
        variants={pageTransitionVariants}
        initial="initial"
        animate="animate"
        className="max-w-3xl mx-auto py-16 text-center space-y-8"
      >
        <div className="h-16 w-16 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
          <ShieldCheck className="h-8 w-8" />
        </div>
        <div className="space-y-3">
          <h1 className="text-3xl font-bold text-slate-100 tracking-tight">
            AegisOps AI Operations Platform
          </h1>
          <p className="text-slate-400 text-sm max-w-xl mx-auto">
            Real-time incident management, automated alert correlation, telemetry observability, and service reliability engineering.
          </p>
        </div>
        <div className="flex items-center justify-center space-x-4 pt-4">
          <Link
            href="/login"
            className="px-6 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm transition-colors shadow-lg shadow-emerald-950/40"
          >
            Sign In to Console
          </Link>
          <Link
            href="/register"
            className="px-6 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium text-sm transition-colors"
          >
            Create Organization
          </Link>
        </div>
      </motion.div>
    );
  }

  const summary = overview?.summary;
  const needsAttention = overview?.needsAttention ?? [];
  const services = overview?.servicesHealthSummary ?? [];
  const alerts = overview?.activeAlertsPreview ?? [];
  const incidents = overview?.activeIncidentsPreview ?? [];
  const activity = overview?.recentActivity ?? [];

  return (
    <motion.div
      variants={pageTransitionVariants}
      initial="initial"
      animate="animate"
      className="space-y-8"
    >
      {/* Top Operations Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
              Operations Overview
            </h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              {activeOrganization?.name ?? 'Organization'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time service health, active incidents, and prioritized operational signals.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-slate-800/80 hover:bg-slate-800 text-slate-300 text-xs border border-slate-700/60 transition-colors disabled:opacity-50"
            title="Refresh Operations State"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Sync</span>
          </button>
          <Link
            href="/incidents"
            className="flex items-center space-x-1 px-3 py-1.5 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs border border-emerald-500/30 transition-colors font-medium"
          >
            <span>Command Console</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Primary Metrics Strip */}
      <motion.div
        variants={staggerContainerVariants}
        initial="initial"
        animate="animate"
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3"
      >
        {/* Total Services */}
        <motion.div
          variants={staggerItemVariants}
          className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 shadow-sm"
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Services</span>
            <Server className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 font-mono">
            {summary?.servicesCount ?? 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Monitored entities</div>
        </motion.div>

        {/* Healthy Services */}
        <motion.div
          variants={staggerItemVariants}
          className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 shadow-sm"
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Healthy</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 font-mono">
            {summary?.healthyServicesCount ?? 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Passing all probes</div>
        </motion.div>

        {/* Degraded Services */}
        <motion.div
          variants={staggerItemVariants}
          className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 shadow-sm"
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Degraded</span>
            <AlertTriangle className="h-4 w-4 text-amber-400" />
          </div>
          <div className={`text-2xl font-bold font-mono ${(summary?.degradedServicesCount ?? 0) > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
            {summary?.degradedServicesCount ?? 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Partial probe failures</div>
        </motion.div>

        {/* Down Services */}
        <motion.div
          variants={staggerItemVariants}
          className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 shadow-sm"
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Down</span>
            <XCircle className="h-4 w-4 text-rose-400" />
          </div>
          <div className={`text-2xl font-bold font-mono ${(summary?.downServicesCount ?? 0) > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
            {summary?.downServicesCount ?? 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Unhealthy state</div>
        </motion.div>

        {/* Active Alerts */}
        <motion.div
          variants={staggerItemVariants}
          className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 shadow-sm"
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Active Alerts</span>
            <Bell className="h-4 w-4 text-amber-400" />
          </div>
          <div className={`text-2xl font-bold font-mono ${(summary?.activeAlertsCount ?? 0) > 0 ? 'text-amber-400' : 'text-slate-100'}`}>
            {summary?.activeAlertsCount ?? 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Firing & pending rules</div>
        </motion.div>

        {/* Active Incidents */}
        <motion.div
          variants={staggerItemVariants}
          className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 shadow-sm"
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Incidents</span>
            <AlertOctagon className="h-4 w-4 text-rose-400" />
          </div>
          <div className="flex items-baseline space-x-1.5">
            <span className={`text-2xl font-bold font-mono ${(summary?.activeIncidentsCount ?? 0) > 0 ? 'text-rose-400' : 'text-slate-100'}`}>
              {summary?.activeIncidentsCount ?? 0}
            </span>
            {(summary?.criticalIncidentsCount ?? 0) > 0 && (
              <span className="text-[10px] font-mono font-semibold text-rose-400 bg-rose-950/80 px-1.5 py-0.5 rounded border border-rose-800/60">
                {summary?.criticalIncidentsCount} P1
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Active response</div>
        </motion.div>
      </motion.div>

      {/* Compact 30-Day Reliability Snapshot */}
      <ReliabilitySnapshot organizationId={activeOrganization?.id} />

      {/* Needs Attention Section (Prioritized) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
              Needs Attention
            </h2>
            {needsAttention.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-rose-950/80 text-rose-300 border border-rose-800/60 font-semibold">
                {needsAttention.length}
              </span>
            )}
          </div>
          <span className="text-xs text-slate-500">
            Automated priority ranking
          </span>
        </div>

        {overviewLoading ? (
          <div className="p-8 rounded-xl bg-slate-900/40 border border-slate-800 text-center text-slate-400 text-xs">
            <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-slate-500" />
            Analyzing operational signals...
          </div>
        ) : needsAttention.length === 0 ? (
          <div className="p-6 rounded-xl bg-emerald-950/20 border border-emerald-900/40 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-emerald-300">
                  All Systems Nominal
                </p>
                <p className="text-xs text-emerald-400/70">
                  No active P1/P2 incidents, degraded services, or critical alerts firing.
                </p>
              </div>
            </div>
            <span className="text-xs font-mono text-emerald-400/80 bg-emerald-950/60 px-2.5 py-1 rounded border border-emerald-800/60">
              100% OPERATIONAL
            </span>
          </div>
        ) : (
          <div className="grid gap-2">
            {needsAttention.map((item) => (
              <Link
                key={item.id}
                href={item.targetUrl}
                className="group p-3.5 rounded-xl bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-between gap-4"
              >
                <div className="flex items-start space-x-3 min-w-0">
                  <span
                    className={`mt-0.5 px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase flex-shrink-0 border ${
                      item.priority === 'CRITICAL'
                        ? 'bg-rose-950 text-rose-300 border-rose-800'
                        : item.priority === 'HIGH'
                        ? 'bg-amber-950 text-amber-300 border-amber-800'
                        : 'bg-blue-950 text-blue-300 border-blue-800'
                    }`}
                  >
                    {item.priority}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-100 group-hover:text-emerald-400 transition-colors truncate">
                      {item.title}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">
                      {item.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 flex-shrink-0">
                  <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
                    {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-slate-300 group-hover:translate-x-0.5 transition-all" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Services Health Matrix */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
            Service Health Status
          </h2>
          <Link
            href="/services"
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center space-x-1"
          >
            <span>View All Services</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {services.map((svc) => {
            const isUnhealthy = svc.healthStatus === 'UNHEALTHY';
            const isDegraded = svc.healthStatus === 'DEGRADED';
            const isHealthy = svc.healthStatus === 'HEALTHY';

            return (
              <Link
                key={svc.id}
                href={`/services/${svc.id}`}
                className="group p-3.5 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700/80 transition-all flex flex-col justify-between space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 pr-2">
                    <p className="text-xs font-semibold text-slate-200 group-hover:text-emerald-400 transition-colors truncate">
                      {svc.name}
                    </p>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {svc.tier}
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-medium flex items-center space-x-1 border ${
                      isUnhealthy
                        ? 'bg-rose-950/80 text-rose-300 border-rose-800/60'
                        : isDegraded
                        ? 'bg-amber-950/80 text-amber-300 border-amber-800/60'
                        : isHealthy
                        ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isUnhealthy
                          ? 'bg-rose-400'
                          : isDegraded
                          ? 'bg-amber-400'
                          : isHealthy
                          ? 'bg-emerald-400'
                          : 'bg-slate-400'
                      }`}
                    />
                    <span>{svc.healthStatus}</span>
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800/60">
                  <div className="flex items-center space-x-3">
                    <span className={svc.activeAlertsCount > 0 ? 'text-amber-400 font-medium' : 'text-slate-500'}>
                      {svc.activeAlertsCount} alert{svc.activeAlertsCount === 1 ? '' : 's'}
                    </span>
                    <span className={svc.activeIncidentsCount > 0 ? 'text-rose-400 font-medium' : 'text-slate-500'}>
                      {svc.activeIncidentsCount} inc{svc.activeIncidentsCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  <ExternalLink className="h-3 w-3 text-slate-600 group-hover:text-slate-400 transition-colors" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Operational Split Feeds (Alerts Preview & Incidents Preview) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Alerts Preview */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Bell className="h-4 w-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-slate-200">
                Active Alerts Preview
              </h2>
            </div>
            <Link
              href="/alerts"
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center space-x-1"
            >
              <span>Manage Alerts</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 divide-y divide-slate-800/60 overflow-hidden">
            {alerts.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No active firing or pending alerts.
              </div>
            ) : (
              alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="p-3.5 hover:bg-slate-800/40 transition-colors flex items-center justify-between text-xs"
                >
                  <div className="min-w-0 pr-3">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-slate-200 truncate">
                        {alert.ruleName}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-950 text-amber-400 border border-amber-800/60">
                        {alert.state}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {alert.serviceName} • {alert.environmentName}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 font-mono text-[11px] text-slate-400">
                    <div>Val: {alert.currentValue ?? 'N/A'}</div>
                    <div className="text-[10px] text-slate-500">
                      Thresh: {alert.thresholdValue ?? 'N/A'}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Active Incidents Preview */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertOctagon className="h-4 w-4 text-rose-400" />
              <h2 className="text-sm font-semibold text-slate-200">
                Active Incidents Preview
              </h2>
            </div>
            <Link
              href="/incidents"
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center space-x-1"
            >
              <span>Incident Command</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 divide-y divide-slate-800/60 overflow-hidden">
            {incidents.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No open or investigating incidents.
              </div>
            ) : (
              incidents.map((inc) => (
                <Link
                  key={inc.id}
                  href={`/incidents/${inc.id}`}
                  className="group p-3.5 hover:bg-slate-800/40 transition-colors flex items-center justify-between text-xs block"
                >
                  <div className="min-w-0 pr-3">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-[10px] font-bold text-slate-400">
                        {inc.incidentKey}
                      </span>
                      <span className="font-medium text-slate-200 group-hover:text-emerald-400 transition-colors truncate">
                        {inc.title}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Service: {inc.primaryServiceName ?? 'System'} • Cmdr: {inc.commanderName ?? 'Unassigned'}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2 flex-shrink-0">
                    <span
                      className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${
                        inc.severity === 'CRITICAL'
                          ? 'bg-rose-950 text-rose-300 border-rose-800'
                          : inc.severity === 'ERROR'
                          ? 'bg-amber-950 text-amber-300 border-amber-800'
                          : 'bg-blue-950 text-blue-300 border-blue-800'
                      }`}
                    >
                      {inc.severity}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-500 group-hover:text-slate-300" />
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent Operational Activity */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center space-x-2">
          <Activity className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-slate-200">
            Recent Operational Activity
          </h2>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 divide-y divide-slate-800/50 overflow-hidden">
          {activity.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              No recent operational events recorded.
            </div>
          ) : (
            activity.map((act) => (
              <div
                key={act.id}
                className="p-3.5 hover:bg-slate-800/30 transition-colors flex items-center justify-between text-xs"
              >
                <div className="min-w-0 pr-4">
                  <span className="font-medium text-slate-200">{act.title}</span>
                  <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                    {act.description}
                  </p>
                </div>
                <div className="text-right flex-shrink-0 font-mono text-[10px] text-slate-500">
                  <div>{act.actorName}</div>
                  <div>{new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </motion.div>
  );
}
