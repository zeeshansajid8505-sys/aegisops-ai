'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  Sliders,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Play,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Clock,
  Activity,
  Layers,
  Archive,
  Power,
  PowerOff,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { RuleBuilderModal } from '@/components/alerts/rule-builder-modal';
import { AlertDetailsDrawer } from '@/components/alerts/alert-details-drawer';
import type {
  AlertInstanceSummary,
  AlertRuleSummary,
  SeverityLevel,
} from '@aegisops/types';

export default function AlertsPage() {
  const { activeOrganization, currentRole } = useAuth();
  const organizationId = activeOrganization?.id ?? '';

  const [activeTab, setActiveTab] = useState<'alerts' | 'rules'>('alerts');

  // Active Alerts State
  const [alerts, setAlerts] = useState<AlertInstanceSummary[]>([]);
  const [alertsTotal, setAlertsTotal] = useState(0);
  const [isAlertsLoading, setIsAlertsLoading] = useState(false);
  const [alertsFilterState, setAlertsFilterState] = useState<'ACTIVE' | 'FIRING' | 'PENDING' | 'ALL'>('ACTIVE');
  const [alertsFilterSeverity, setAlertsFilterSeverity] = useState<string>('');
  const [alertsSearch, setAlertsSearch] = useState('');

  // Alert Rules State
  const [rules, setRules] = useState<AlertRuleSummary[]>([]);
  const [rulesTotal, setRulesTotal] = useState(0);
  const [isRulesLoading, setIsRulesLoading] = useState(false);
  const [rulesSearch, setRulesSearch] = useState('');
  const [rulesFilterSeverity, setRulesFilterSeverity] = useState<string>('');

  // Modals & Drawers
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [evaluatingRuleId, setEvaluatingRuleId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  const canManageRules = ['OWNER', 'ADMIN', 'SRE'].includes(currentRole ?? '');

  // Fetch Alerts
  const fetchAlerts = useCallback(async () => {
    if (!organizationId) return;
    setIsAlertsLoading(true);
    try {
      const stateParam =
        alertsFilterState === 'ACTIVE'
          ? undefined // Default backend handles PENDING & FIRING
          : alertsFilterState === 'ALL'
          ? undefined
          : alertsFilterState;

      const res = await api.alerts.listAlerts(organizationId, {
        state: stateParam,
        severity: alertsFilterSeverity || undefined,
        search: alertsSearch || undefined,
        limit: 100,
      });

      // If filter was explicitly 'ALL', include all returned, otherwise backend defaulted to active
      setAlerts(res.alerts);
      setAlertsTotal(res.total);
      setLastRefreshedAt(new Date());
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch alerts:', err);
    } finally {
      setIsAlertsLoading(false);
    }
  }, [organizationId, alertsFilterState, alertsFilterSeverity, alertsSearch]);

  // Fetch Rules
  const fetchRules = useCallback(async () => {
    if (!organizationId) return;
    setIsRulesLoading(true);
    try {
      const res = await api.alerts.listRules(organizationId, {
        severity: rulesFilterSeverity || undefined,
        search: rulesSearch || undefined,
        limit: 100,
      });
      setRules(res.rules);
      setRulesTotal(res.total);
      setLastRefreshedAt(new Date());
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch alert rules:', err);
    } finally {
      setIsRulesLoading(false);
    }
  }, [organizationId, rulesFilterSeverity, rulesSearch]);

  // Initial and reactive load
  useEffect(() => {
    if (activeTab === 'alerts') {
      fetchAlerts();
    } else {
      fetchRules();
    }
  }, [activeTab, fetchAlerts, fetchRules]);

  // Polling: Auto-refresh active alerts every 15s, rules every 30s
  useEffect(() => {
    const intervalMs = activeTab === 'alerts' ? 15000 : 30000;
    const timer = setInterval(() => {
      if (activeTab === 'alerts') {
        fetchAlerts();
      } else {
        fetchRules();
      }
    }, intervalMs);
    return () => clearInterval(timer);
  }, [activeTab, fetchAlerts, fetchRules]);

  // Rule Actions
  const handleEvaluateNow = async (ruleId: string) => {
    setEvaluatingRuleId(ruleId);
    setActionMessage(null);
    try {
      await api.alerts.evaluateNow(organizationId, ruleId);
      setActionMessage({ text: 'Evaluation enqueued successfully. Telemetry is being evaluated.', type: 'success' });
      setTimeout(() => {
        fetchAlerts();
        fetchRules();
      }, 1500);
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Failed to trigger evaluation', type: 'error' });
    } finally {
      setEvaluatingRuleId(null);
    }
  };

  const handleToggleRuleStatus = async (rule: AlertRuleSummary) => {
    setActionMessage(null);
    try {
      if (rule.status === 'ENABLED') {
        await api.alerts.disableRule(organizationId, rule.id);
        setActionMessage({ text: `Rule '${rule.name}' disabled.`, type: 'success' });
      } else {
        await api.alerts.enableRule(organizationId, rule.id);
        setActionMessage({ text: `Rule '${rule.name}' enabled. Evaluation schedule restored.`, type: 'success' });
      }
      fetchRules();
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Failed to toggle rule status', type: 'error' });
    }
  };

  const handleArchiveRule = async (ruleId: string) => {
    if (!confirm('Are you sure you want to archive this alert rule?')) return;
    setActionMessage(null);
    try {
      await api.alerts.archiveRule(organizationId, ruleId);
      setActionMessage({ text: 'Alert rule archived.', type: 'success' });
      fetchRules();
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Failed to archive rule', type: 'error' });
    }
  };

  // Severity UI Helper
  const getSeverityBadge = (sev: SeverityLevel) => {
    switch (sev) {
      case 'SEV-1':
        return 'bg-red-950/80 text-red-400 border-red-800';
      case 'SEV-2':
        return 'bg-orange-950/80 text-orange-400 border-orange-800';
      case 'SEV-3':
        return 'bg-amber-950/80 text-amber-400 border-amber-800';
      case 'SEV-4':
        return 'bg-blue-950/80 text-blue-400 border-blue-800';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  // Counts for Stats Cards
  const firingCount = alerts.filter((a) => a.state === 'FIRING').length;
  const pendingCount = alerts.filter((a) => a.state === 'PENDING').length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
              Alerts & Static Anomaly Detection
            </h1>
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-800/60">
              Active Engine
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Sliding-window evaluation, deterministic state transitions, and deduplicated active incident prevention
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => (activeTab === 'alerts' ? fetchAlerts() : fetchRules())}
            disabled={isAlertsLoading || isRulesLoading}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium transition-colors"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 text-slate-400 ${
                isAlertsLoading || isRulesLoading ? 'animate-spin text-emerald-400' : ''
              }`}
            />
            <span>Refresh</span>
          </button>

          {canManageRules && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-950/30 transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>Create Alert Rule</span>
            </button>
          )}
        </div>
      </div>

      {/* Action Notifications */}
      {actionMessage && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center justify-between border ${
            actionMessage.type === 'success'
              ? 'bg-emerald-950/50 border-emerald-800 text-emerald-200'
              : 'bg-red-950/50 border-red-800 text-red-200'
          }`}
        >
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-slate-200">
            &times;
          </button>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-400">Firing Violations</span>
            <p className="text-2xl font-bold text-red-400 font-mono mt-0.5">{firingCount}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-red-950/50 border border-red-900/50 text-red-400">
            <AlertCircle className="h-5 w-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-400">Pending Holds</span>
            <p className="text-2xl font-bold text-amber-400 font-mono mt-0.5">{pendingCount}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-amber-950/50 border border-amber-900/50 text-amber-400">
            <Clock className="h-5 w-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-400">Configured Rules</span>
            <p className="text-2xl font-bold text-slate-100 font-mono mt-0.5">{rulesTotal}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-800 border border-slate-700 text-cyan-400">
            <Sliders className="h-5 w-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-400">Auto-Refresh Tick</span>
            <p className="text-xs font-mono text-emerald-400 mt-1">
              Active: {lastRefreshedAt.toLocaleTimeString()}
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-emerald-950/50 border border-emerald-900/50 text-emerald-400">
            <Activity className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Primary Tabs */}
      <div className="border-b border-slate-800 flex items-center space-x-6 text-sm font-medium">
        <button
          onClick={() => setActiveTab('alerts')}
          className={`pb-3 border-b-2 flex items-center space-x-2 transition-colors ${
            activeTab === 'alerts'
              ? 'border-emerald-500 text-slate-100 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Bell className="h-4 w-4" />
          <span>Active Alerts ({alertsTotal})</span>
        </button>

        <button
          onClick={() => setActiveTab('rules')}
          className={`pb-3 border-b-2 flex items-center space-x-2 transition-colors ${
            activeTab === 'rules'
              ? 'border-emerald-500 text-slate-100 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders className="h-4 w-4" />
          <span>Alert Rules ({rulesTotal})</span>
        </button>
      </div>

      {/* Tab 1: Active Alerts Console */}
      {activeTab === 'alerts' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="h-4 w-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search alerts by rule or service name..."
                value={alertsSearch}
                onChange={(e) => setAlertsSearch(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center space-x-2">
              <select
                value={alertsFilterState}
                onChange={(e) => setAlertsFilterState(e.target.value as any)}
                className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
              >
                <option value="ACTIVE">State: Active (Pending & Firing)</option>
                <option value="FIRING">State: FIRING only</option>
                <option value="PENDING">State: PENDING only</option>
                <option value="ALL">State: All (including Inactive)</option>
              </select>

              <select
                value={alertsFilterSeverity}
                onChange={(e) => setAlertsFilterSeverity(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
              >
                <option value="">Severity: All</option>
                <option value="SEV-1">SEV-1</option>
                <option value="SEV-2">SEV-2</option>
                <option value="SEV-3">SEV-3</option>
                <option value="SEV-4">SEV-4</option>
              </select>
            </div>
          </div>

          {/* Alerts Table */}
          {alerts.length === 0 ? (
            <div className="py-16 text-center rounded-xl border border-slate-800 bg-slate-900/40">
              <CheckCircle2 className="h-10 w-10 text-emerald-400/60 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-slate-200">No Active Violations</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                All monitored metric conditions are healthy and operating within nominal anomaly thresholds.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/60 text-slate-400 uppercase font-mono border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Severity & State</th>
                    <th className="px-4 py-3">Alert Rule</th>
                    <th className="px-4 py-3">Service & Environment</th>
                    <th className="px-4 py-3">Observed vs Threshold</th>
                    <th className="px-4 py-3">Duration / Active Since</th>
                    <th className="px-4 py-3">Last Evaluated</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {alerts.map((alert) => (
                    <tr
                      key={alert.id}
                      onClick={() => setSelectedAlertId(alert.id)}
                      className="hover:bg-slate-800/40 cursor-pointer transition-colors group"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-2">
                          <span
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${getSeverityBadge(
                              alert.severity,
                            )}`}
                          >
                            {alert.severity}
                          </span>
                          <span
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${
                              alert.state === 'FIRING'
                                ? 'bg-red-500/10 text-red-400 border-red-500/30 animate-pulse'
                                : alert.state === 'PENDING'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            }`}
                          >
                            {alert.state}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-100 group-hover:text-emerald-400 transition-colors">
                          {alert.ruleName}
                        </span>
                        {alert.seriesAttributes && Object.keys(alert.seriesAttributes).length > 0 && (
                          <div className="text-[10px] font-mono text-slate-400 truncate max-w-xs mt-0.5">
                            {JSON.stringify(alert.seriesAttributes)}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="text-slate-300 font-medium">{alert.serviceName}</div>
                        <div className="text-[11px] text-slate-500">{alert.environmentName}</div>
                      </td>

                      <td className="px-4 py-3 font-mono">
                        <span className="text-slate-100 font-bold">
                          {alert.currentValue !== null && alert.currentValue !== undefined
                            ? alert.currentValue.toFixed(2)
                            : '-'}
                        </span>{' '}
                        <span className="text-slate-500">
                          {alert.comparisonOperator} {alert.thresholdValue}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-slate-400 text-[11px]">
                        {alert.firingStartedAt ? (
                          <span className="text-red-400 font-mono">
                            Firing since {new Date(alert.firingStartedAt).toLocaleTimeString()}
                          </span>
                        ) : alert.pendingSince ? (
                          <span className="text-amber-400 font-mono">
                            Pending since {new Date(alert.pendingSince).toLocaleTimeString()}
                          </span>
                        ) : (
                          <span className="text-slate-500 font-mono">Resolved</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">
                        {new Date(alert.lastEvaluatedAt).toLocaleTimeString()}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <ChevronRight className="h-4 w-4 text-slate-500 group-hover:text-slate-200 inline" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Alert Rules Console */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          {/* Rules Filters & Actions */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="h-4 w-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search rules by title or description..."
                value={rulesSearch}
                onChange={(e) => setRulesSearch(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center space-x-2">
              <select
                value={rulesFilterSeverity}
                onChange={(e) => setRulesFilterSeverity(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
              >
                <option value="">Severity: All</option>
                <option value="SEV-1">SEV-1</option>
                <option value="SEV-2">SEV-2</option>
                <option value="SEV-3">SEV-3</option>
                <option value="SEV-4">SEV-4</option>
              </select>
            </div>
          </div>

          {/* Rules Table */}
          {rules.length === 0 ? (
            <div className="py-16 text-center rounded-xl border border-slate-800 bg-slate-900/40">
              <Sliders className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-slate-200">No Alert Rules Configured</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                Configure threshold alert rules against real service metrics to detect operational anomalies.
              </p>
              {canManageRules && (
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="mt-4 inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create First Rule</span>
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/60 text-slate-400 uppercase font-mono border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Rule Name & Scope</th>
                    <th className="px-4 py-3">Condition Formula</th>
                    <th className="px-4 py-3">Sliding Window</th>
                    <th className="px-4 py-3">Schedule</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Active Alerts</th>
                    <th className="px-4 py-3">Last Evaluated</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {rules.map((rule) => (
                    <tr key={rule.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-2">
                          <span
                            className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase ${getSeverityBadge(
                              rule.severity,
                            )}`}
                          >
                            {rule.severity}
                          </span>
                          <span className="font-semibold text-slate-100">{rule.name}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {rule.serviceName} &bull; {rule.environmentName} &bull;{' '}
                          <span className="font-mono text-cyan-400">{rule.metricName}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3 font-mono">
                        <span className="text-emerald-400 font-semibold">{rule.aggregation}</span>{' '}
                        {rule.comparisonOperator} {rule.thresholdValue}
                        {rule.evaluationMode === 'AGGREGATE_SERIES' && (
                          <span className="text-[10px] text-slate-500 block">
                            (reduced: {rule.seriesReduction})
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-slate-300 font-mono">
                        {rule.windowSeconds >= 60 ? `${rule.windowSeconds / 60}m` : `${rule.windowSeconds}s`}
                      </td>

                      <td className="px-4 py-3 text-slate-300 font-mono">
                        every {rule.evaluationIntervalSeconds}s
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border uppercase ${
                            rule.status === 'ENABLED'
                              ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                              : rule.status === 'DISABLED'
                              ? 'bg-slate-800 text-slate-400 border-slate-700'
                              : 'bg-zinc-950 text-zinc-500 border-zinc-800'
                          }`}
                        >
                          {rule.status}
                        </span>
                      </td>

                      <td className="px-4 py-3 font-mono">
                        {rule.activeAlertCount && rule.activeAlertCount > 0 ? (
                          <span className="px-2 py-0.5 rounded bg-red-950/80 text-red-400 border border-red-800 font-bold">
                            {rule.activeAlertCount} FIRING
                          </span>
                        ) : (
                          <span className="text-slate-500">0</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">
                        {rule.lastEvaluatedAt ? (
                          new Date(rule.lastEvaluatedAt).toLocaleTimeString()
                        ) : (
                          <span className="text-slate-600">Never</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          {canManageRules && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleEvaluateNow(rule.id)}
                                disabled={evaluatingRuleId === rule.id || rule.status === 'ARCHIVED'}
                                title="Evaluate Now"
                                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-emerald-400 transition-colors disabled:opacity-40"
                              >
                                <Play
                                  className={`h-3.5 w-3.5 ${
                                    evaluatingRuleId === rule.id ? 'animate-spin text-emerald-400' : ''
                                  }`}
                                />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleToggleRuleStatus(rule)}
                                disabled={rule.status === 'ARCHIVED'}
                                title={rule.status === 'ENABLED' ? 'Disable Rule' : 'Enable Rule'}
                                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-40"
                              >
                                {rule.status === 'ENABLED' ? (
                                  <PowerOff className="h-3.5 w-3.5 text-amber-400" />
                                ) : (
                                  <Power className="h-3.5 w-3.5 text-emerald-400" />
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleArchiveRule(rule.id)}
                                disabled={rule.status === 'ARCHIVED'}
                                title="Archive Rule"
                                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-red-400 transition-colors disabled:opacity-40"
                              >
                                <Archive className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Rule Builder Modal */}
      <RuleBuilderModal
        organizationId={organizationId}
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onRuleCreated={() => {
          fetchRules();
          fetchAlerts();
        }}
      />

      {/* Alert Details Drawer */}
      <AlertDetailsDrawer
        organizationId={organizationId}
        alertInstanceId={selectedAlertId}
        onClose={() => setSelectedAlertId(null)}
      />
    </div>
  );
}

