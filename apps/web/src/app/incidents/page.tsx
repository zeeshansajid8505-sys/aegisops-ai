'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  AlertOctagon,
  ShieldAlert,
  Search,
  Filter,
  Plus,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  User,
  ExternalLink,
  Flame,
  Radio,
  Bell,
  ArrowUpRight,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import type {
  IncidentSummary,
  IncidentSeverity,
  IncidentStatus,
  ServiceSummary,
  EnvironmentSummary,
} from '@aegisops/types';

export default function IncidentsPage() {
  const { activeOrganization, currentRole } = useAuth();
  const organizationId = activeOrganization?.id ?? '';

  const [incidents, setIncidents] = useState<IncidentSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [signalsClearedOnly, setSignalsClearedOnly] = useState(false);

  // Quick Action feedback
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Create Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [services, setServices] = useState<ServiceSummary[]>([]);
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [members, setMembers] = useState<any[]>([]);

  // Create Form State
  const [newTitle, setNewTitle] = useState('');
  const [newSummary, setNewSummary] = useState('');
  const [newSeverity, setNewSeverity] = useState<IncidentSeverity>('WARNING');
  const [newServiceId, setNewServiceId] = useState('');
  const [newEnvironmentId, setNewEnvironmentId] = useState('');
  const [newCommanderId, setNewCommanderId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchIncidents = useCallback(async () => {
    if (!organizationId) return;
    setIsLoading(true);
    setError(null);
    try {
      const params: Record<string, any> = {
        limit: 100,
        offset: 0,
      };

      if (statusFilter === 'ACTIVE') {
        // Will filter client-side or leave unset for active
      } else if (statusFilter !== 'ALL') {
        params.status = statusFilter;
      }

      if (severityFilter !== 'ALL') {
        params.severity = severityFilter;
      }

      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      if (signalsClearedOnly) {
        params.signalsCleared = true;
      }

      const res = await api.incidents.list(organizationId, params);
      let list = res.incidents;

      if (statusFilter === 'ACTIVE') {
        list = list.filter((i) => i.status !== 'RESOLVED');
      }

      setIncidents(list);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load incidents');
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, statusFilter, severityFilter, searchQuery, signalsClearedOnly]);

  useEffect(() => {
    fetchIncidents();
    // 15-second polling interval
    const timer = setInterval(() => {
      fetchIncidents();
    }, 15000);
    return () => clearInterval(timer);
  }, [fetchIncidents]);

  // Load dropdowns for creation modal
  useEffect(() => {
    if (!organizationId || !isCreateModalOpen) return;

    api.services.list(organizationId).then((res) => {
      setServices(res.items || []);
    }).catch(() => {});

    api.memberships.list(organizationId).then((res) => {
      setMembers(res || []);
    }).catch(() => {});
  }, [organizationId, isCreateModalOpen]);

  // Load environments when service changes in modal
  useEffect(() => {
    if (!organizationId || !newServiceId) {
      setEnvironments([]);
      return;
    }
    api.environments.list(organizationId, newServiceId).then((envs) => {
      setEnvironments(envs || []);
    }).catch(() => {});
  }, [organizationId, newServiceId]);

  const handleCreateIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId || !newTitle.trim()) return;

    setIsSubmitting(true);
    try {
      await api.incidents.create(organizationId, {
        title: newTitle.trim(),
        summary: newSummary.trim() || undefined,
        severity: newSeverity,
        primaryServiceId: newServiceId || undefined,
        environmentId: newEnvironmentId || undefined,
        commanderMembershipId: newCommanderId || undefined,
      });

      setIsCreateModalOpen(false);
      setNewTitle('');
      setNewSummary('');
      setNewServiceId('');
      setNewEnvironmentId('');
      setNewCommanderId('');
      setActionMessage({ text: 'Incident created successfully', type: 'success' });
      fetchIncidents();
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Failed to create incident', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickAcknowledge = async (incidentId: string) => {
    try {
      await api.incidents.acknowledge(organizationId, incidentId, {
        note: 'Quick acknowledged from SRE incident list',
      });
      setActionMessage({ text: 'Incident acknowledged', type: 'success' });
      fetchIncidents();
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Failed to acknowledge incident', type: 'error' });
    }
  };

  // Metrics calculation
  const activeIncidents = incidents.filter((i) => i.status !== 'RESOLVED');
  const criticalCount = activeIncidents.filter((i) => i.severity === 'CRITICAL' || i.severity === 'ERROR').length;
  const unassignedCommanderCount = activeIncidents.filter((i) => !i.commanderMembershipId).length;
  const signalsClearedCount = activeIncidents.filter((i) => i.allSignalsClearedAt !== null).length;

  const getSeverityBadge = (sev: IncidentSeverity) => {
    switch (sev) {
      case 'CRITICAL':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-xs font-bold bg-rose-950/80 text-rose-300 border border-rose-800 shadow-[0_0_10px_rgba(244,63,94,0.2)]">
            <Flame className="h-3 w-3 text-rose-400 animate-pulse" />
            <span>CRITICAL</span>
          </span>
        );
      case 'ERROR':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-xs font-semibold bg-orange-950/80 text-orange-300 border border-orange-800">
            <AlertTriangle className="h-3 w-3 text-orange-400" />
            <span>ERROR</span>
          </span>
        );
      case 'WARNING':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-950/70 text-amber-300 border border-amber-800/80">
            <AlertCircle className="h-3 w-3 text-amber-400" />
            <span>WARNING</span>
          </span>
        );
      case 'INFO':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-xs font-medium bg-sky-950/70 text-sky-300 border border-sky-800">
            <Radio className="h-3 w-3 text-sky-400" />
            <span>INFO</span>
          </span>
        );
    }
  };

  const getStatusBadge = (status: IncidentStatus) => {
    switch (status) {
      case 'OPEN':
        return (
          <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-ping" />
            <span>OPEN</span>
          </span>
        );
      case 'ACKNOWLEDGED':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/30">
            <span>ACKNOWLEDGED</span>
          </span>
        );
      case 'INVESTIGATING':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/30">
            <Radio className="h-3 w-3 text-purple-400 animate-spin" />
            <span>INVESTIGATING</span>
          </span>
        );
      case 'MITIGATED':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-500/10 text-teal-400 border border-teal-500/30">
            <ShieldCheck className="h-3 w-3 text-teal-400" />
            <span>MITIGATED</span>
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
            <Check className="h-3 w-3 text-emerald-400" />
            <span>RESOLVED</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <AlertOctagon className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-100">
                Incident Command Center
              </h1>
              <p className="text-xs text-slate-400">
                Automated multi-alert incident correlation, deduplication & SRE command console
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={() => fetchIncidents()}
            disabled={isLoading}
            className="px-3 py-2 text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 rounded-lg flex items-center space-x-2 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          {(currentRole === 'OWNER' || currentRole === 'ADMIN' || currentRole === 'SRE' || currentRole === 'ENGINEER') && (
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-lg flex items-center space-x-2 shadow-lg shadow-rose-900/20 transition-all"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Declare Incident</span>
            </button>
          )}
        </div>
      </div>

      {/* Action Toast Feedback */}
      {actionMessage && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center justify-between border ${
            actionMessage.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-300'
              : 'bg-rose-950/60 border-rose-800/60 text-rose-300'
          }`}
        >
          <span>{actionMessage.text}</span>
          <button
            type="button"
            onClick={() => setActionMessage(null)}
            className="text-slate-400 hover:text-slate-200 text-sm font-bold"
          >
            &times;
          </button>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Active Incidents</span>
            <AlertOctagon className="h-4 w-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100">{activeIncidents.length}</div>
          <div className="text-[11px] text-slate-500">Unresolved operational events</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
          <div className="flex items-center justify-between text-xs text-rose-400">
            <span>Critical & Error</span>
            <Flame className="h-4 w-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-400">{criticalCount}</div>
          <div className="text-[11px] text-slate-500">Highest escalation priority</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
          <div className="flex items-center justify-between text-xs text-amber-400">
            <span>Unassigned Commander</span>
            <User className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400">{unassignedCommanderCount}</div>
          <div className="text-[11px] text-slate-500">Awaiting leadership assignment</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
          <div className="flex items-center justify-between text-xs text-teal-400">
            <span>Signals Cleared</span>
            <CheckCircle2 className="h-4 w-4 text-teal-400" />
          </div>
          <div className="text-2xl font-bold text-teal-400">{signalsClearedCount}</div>
          <div className="text-[11px] text-slate-500">All alerts recovered (review needed)</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Tabs */}
          <div className="flex items-center p-0.5 bg-slate-950 rounded-lg border border-slate-800 text-xs font-medium">
            {['ACTIVE', 'ALL', 'OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'MITIGATED', 'RESOLVED'].map(
              (status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    statusFilter === status
                      ? 'bg-slate-800 text-slate-100 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {status}
                </button>
              ),
            )}
          </div>

          {/* Severity Dropdown */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-rose-500"
          >
            <option value="ALL">All Severities</option>
            <option value="CRITICAL">CRITICAL</option>
            <option value="ERROR">ERROR</option>
            <option value="WARNING">WARNING</option>
            <option value="INFO">INFO</option>
          </select>

          {/* Signals Cleared Toggle */}
          <label className="flex items-center space-x-2 text-xs text-slate-400 cursor-pointer px-2 py-1 bg-slate-950/60 border border-slate-800 rounded-lg hover:border-slate-700">
            <input
              type="checkbox"
              checked={signalsClearedOnly}
              onChange={(e) => setSignalsClearedOnly(e.target.checked)}
              className="rounded border-slate-700 bg-slate-900 text-rose-600 focus:ring-0"
            />
            <span>Signals Cleared Only</span>
          </label>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-64">
          <Search className="h-3.5 w-3.5 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search key or title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500"
          />
        </div>
      </div>

      {/* Incidents Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
        {isLoading && incidents.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-500 flex items-center justify-center space-x-2">
            <RefreshCw className="h-4 w-4 animate-spin text-rose-500" />
            <span>Loading incidents...</span>
          </div>
        ) : error ? (
          <div className="py-12 text-center text-xs text-rose-400">{error}</div>
        ) : incidents.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <ShieldCheck className="h-10 w-10 text-emerald-500/40 mx-auto" />
            <div className="text-sm font-medium text-slate-300">No matching incidents</div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              All systems operational. When an alert breaches its thresholds, it will automatically correlate here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300 border-collapse">
              <thead>
                <tr className="border-b border-slate-800/80 bg-slate-950/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Key / Title</th>
                  <th className="py-3 px-3">Severity</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Service & Env</th>
                  <th className="py-3 px-3">Commander</th>
                  <th className="py-3 px-3">Linked Signals</th>
                  <th className="py-3 px-3">Detected</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {incidents.map((incident) => (
                  <tr
                    key={incident.id}
                    className="hover:bg-slate-800/40 transition-colors group"
                  >
                    {/* Key & Title */}
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col space-y-1">
                        <div className="flex items-center space-x-2">
                          <Link
                            href={`/incidents/${incident.id}`}
                            className="font-mono font-bold text-rose-400 hover:text-rose-300 hover:underline flex items-center space-x-1"
                          >
                            <span>{incident.incidentKey}</span>
                            <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </Link>
                          <span
                            className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${
                              incident.source === 'AUTOMATED'
                                ? 'bg-indigo-950/60 text-indigo-300 border-indigo-800/60'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                          >
                            {incident.source}
                          </span>
                        </div>
                        <Link
                          href={`/incidents/${incident.id}`}
                          className="font-medium text-slate-100 hover:text-rose-300 line-clamp-1"
                        >
                          {incident.title}
                        </Link>
                      </div>
                    </td>

                    {/* Severity */}
                    <td className="py-3.5 px-3">
                      {getSeverityBadge(incident.severity)}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-3">
                      {getStatusBadge(incident.status)}
                    </td>

                    {/* Primary Service & Environment */}
                    <td className="py-3.5 px-3">
                      <div className="flex flex-col space-y-0.5">
                        <span className="font-medium text-slate-200">
                          {incident.primaryServiceName || 'Cross-Service'}
                        </span>
                        {incident.environmentName && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            {incident.environmentName}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Commander */}
                    <td className="py-3.5 px-3">
                      {incident.commanderName ? (
                        <div className="flex items-center space-x-1.5">
                          <div className="h-5 w-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] text-slate-300">
                            {incident.commanderName.charAt(0)}
                          </div>
                          <span className="text-slate-300 truncate max-w-[120px]">
                            {incident.commanderName}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-amber-500/80 font-mono italic">
                          Unassigned
                        </span>
                      )}
                    </td>

                    {/* Linked Signals & Cleared status */}
                    <td className="py-3.5 px-3">
                      <div className="flex items-center space-x-2">
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-800/80 text-[11px] font-mono text-slate-300 border border-slate-700">
                          <Bell className="h-3 w-3 text-slate-400" />
                          <span>{incident.totalAlertsCount}</span>
                        </span>

                        {incident.allSignalsClearedAt ? (
                          <span
                            className="inline-flex items-center space-x-1 text-[10px] text-teal-400 font-medium"
                            title={`All signals cleared at ${new Date(incident.allSignalsClearedAt).toLocaleTimeString()}`}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Cleared</span>
                          </span>
                        ) : incident.activeAlertsCount > 0 ? (
                          <span className="text-[10px] text-rose-400 font-medium">
                            {incident.activeAlertsCount} firing
                          </span>
                        ) : null}
                      </div>
                    </td>

                    {/* Detected At */}
                    <td className="py-3.5 px-3 text-slate-400 font-mono text-[11px]">
                      {new Date(incident.detectedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        {incident.status === 'OPEN' && (
                          <button
                            type="button"
                            onClick={() => handleQuickAcknowledge(incident.id)}
                            className="px-2 py-1 text-[11px] font-semibold text-blue-300 bg-blue-950/60 hover:bg-blue-900/60 border border-blue-800/70 rounded transition-colors"
                          >
                            Ack
                          </button>
                        )}
                        <Link
                          href={`/incidents/${incident.id}`}
                          className="px-2.5 py-1 text-[11px] font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded transition-colors"
                        >
                          Command &rarr;
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Declare Incident Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl space-y-4 p-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-rose-400 font-semibold text-sm">
                <AlertOctagon className="h-4 w-4" />
                <span>Declare New Incident</span>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateIncident} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Incident Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Payment Gateway degraded latency breach"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Summary / Initial Assessment
                </label>
                <textarea
                  rows={3}
                  placeholder="Brief description of observed symptoms..."
                  value={newSummary}
                  onChange={(e) => setNewSummary(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Severity Level
                  </label>
                  <select
                    value={newSeverity}
                    onChange={(e) => setNewSeverity(e.target.value as IncidentSeverity)}
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-rose-500"
                  >
                    <option value="CRITICAL">CRITICAL (Sev 1)</option>
                    <option value="ERROR">ERROR (Sev 2)</option>
                    <option value="WARNING">WARNING (Sev 3)</option>
                    <option value="INFO">INFO (Sev 4)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Incident Commander
                  </label>
                  <select
                    value={newCommanderId}
                    onChange={(e) => setNewCommanderId(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-rose-500"
                  >
                    <option value="">Unassigned</option>
                    {members.map((m: any) => (
                      <option key={m.id} value={m.id}>
                        {m.user?.displayName || m.user?.email} ({m.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Primary Service
                  </label>
                  <select
                    value={newServiceId}
                    onChange={(e) => setNewServiceId(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-rose-500"
                  >
                    <option value="">None / Cross-Service</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Environment
                  </label>
                  <select
                    value={newEnvironmentId}
                    disabled={!newServiceId || environments.length === 0}
                    onChange={(e) => setNewEnvironmentId(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-rose-500 disabled:opacity-50"
                  >
                    <option value="">None</option>
                    {environments.map((env) => (
                      <option key={env.id} value={env.id}>
                        {env.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-3 py-2 text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newTitle.trim()}
                  className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-lg shadow disabled:opacity-50 transition-colors"
                >
                  {isSubmitting ? 'Declaring...' : 'Declare Incident'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
