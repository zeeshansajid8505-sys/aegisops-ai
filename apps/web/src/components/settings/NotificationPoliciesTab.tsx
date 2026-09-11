'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Check, RefreshCw, Trash2, ShieldAlert, Mail, MessageSquare, Globe, Clock, Layers } from 'lucide-react';
import { api } from '@/lib/api';

export interface PolicyItem {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  isEnabled: boolean;
  eventTypes: string[];
  minSeverity: string;
  serviceIds: string[];
  environmentIds: string[];
  channels: string[];
  emailRecipients: string[];
  slackConnectionId?: string;
  webhookConnectionId?: string;
  cooldownSeconds: number;
  createdAt: string;
  updatedAt: string;
  slackConnection?: { id: string; name: string; targetUrl: string };
  webhookConnection?: { id: string; name: string; targetUrl: string };
}

interface Props {
  organizationId: string;
  canManage: boolean;
}

const AVAILABLE_EVENTS = [
  { id: '*', label: 'All Operational Events (*)' },
  { id: 'incident.created', label: 'Incident Created' },
  { id: 'incident.severity.updated', label: 'Incident Severity Escalated' },
  { id: 'incident.resolved', label: 'Incident Resolved' },
  { id: 'anomaly.detected', label: 'ML Anomaly Detected' },
  { id: 'anomaly.resolved', label: 'ML Anomaly Resolved' },
];

export const NotificationPoliciesTab: React.FC<Props> = ({ organizationId, canManage }) => {
  const [policies, setPolicies] = useState<PolicyItem[]>([]);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<PolicyItem | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isEnabled, setIsEnabled] = useState(true);
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['*']);
  const [minSeverity, setMinSeverity] = useState('INFO');
  const [channels, setChannels] = useState<string[]>(['EMAIL']);
  const [emailRecipientsText, setEmailRecipientsText] = useState('');
  const [slackConnId, setSlackConnId] = useState('');
  const [webhookConnId, setWebhookConnId] = useState('');
  const [cooldownSeconds, setCooldownSeconds] = useState(60);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [policiesData, integrationsData] = await Promise.all([
        api.notificationPolicies.list(organizationId),
        api.integrations.list(organizationId),
      ]);
      setPolicies(policiesData);
      setIntegrations(integrationsData);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (organizationId) {
      fetchData();
    }
  }, [organizationId]);

  const handleOpenModal = (item?: PolicyItem) => {
    setFormError(null);
    if (item) {
      setEditingItem(item);
      setName(item.name);
      setDescription(item.description || '');
      setIsEnabled(item.isEnabled);
      setSelectedEvents(item.eventTypes);
      setMinSeverity(item.minSeverity);
      setChannels(item.channels);
      setEmailRecipientsText(item.emailRecipients.join(', '));
      setSlackConnId(item.slackConnectionId || '');
      setWebhookConnId(item.webhookConnectionId || '');
      setCooldownSeconds(item.cooldownSeconds || 60);
    } else {
      setEditingItem(null);
      setName('');
      setDescription('');
      setIsEnabled(true);
      setSelectedEvents(['incident.created', 'incident.severity.updated', 'anomaly.detected']);
      setMinSeverity('WARNING');
      setChannels(['EMAIL']);
      setEmailRecipientsText('');
      setSlackConnId('');
      setWebhookConnId('');
      setCooldownSeconds(60);
    }
    setShowModal(true);
  };

  const toggleEvent = (ev: string) => {
    if (ev === '*') {
      setSelectedEvents(['*']);
      return;
    }
    let updated = selectedEvents.filter((e) => e !== '*');
    if (updated.includes(ev)) {
      updated = updated.filter((e) => e !== ev);
    } else {
      updated.push(ev);
    }
    if (updated.length === 0) updated = ['*'];
    setSelectedEvents(updated);
  };

  const toggleChannel = (ch: string) => {
    if (channels.includes(ch)) {
      setChannels(channels.filter((c) => c !== ch));
    } else {
      setChannels([...channels, ch]);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const emailRecipients = emailRecipientsText
      .split(',')
      .map((e) => e.trim())
      .filter((e) => e.length > 0);

    if (channels.includes('EMAIL') && emailRecipients.length === 0) {
      setFormError('Email channel is selected; please provide at least one recipient email address.');
      return;
    }

    if (channels.includes('SLACK') && !slackConnId) {
      setFormError('Slack channel is selected; please choose a Slack connection.');
      return;
    }

    if (channels.includes('WEBHOOK') && !webhookConnId) {
      setFormError('Webhook channel is selected; please choose a Webhook connection.');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        isEnabled,
        eventTypes: selectedEvents,
        minSeverity,
        channels,
        emailRecipients,
        slackConnectionId: slackConnId || undefined,
        webhookConnectionId: webhookConnId || undefined,
        cooldownSeconds: Number(cooldownSeconds) || 60,
      };

      if (editingItem) {
        await api.notificationPolicies.update(organizationId, editingItem.id, payload);
      } else {
        await api.notificationPolicies.create(organizationId, payload);
      }
      setShowModal(false);
      fetchData();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save notification policy');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this notification policy?')) return;
    try {
      await api.notificationPolicies.delete(organizationId, id);
      fetchData();
    } catch (err: any) {
      alert(err?.message || 'Failed to delete notification policy');
    }
  };

  const slackIntegrations = integrations.filter((i) => i.type === 'SLACK_WEBHOOK');
  const genericIntegrations = integrations.filter((i) => i.type !== 'SLACK_WEBHOOK');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Event Routing Policies</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Define multi-channel dispatch rules, minimum severity thresholds, and anti-storm cooldowns.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => handleOpenModal()}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg text-xs font-semibold transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Create Policy</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400 text-xs">
          <RefreshCw className="h-4 w-4 animate-spin mr-2 text-emerald-400" />
          Loading routing policies...
        </div>
      ) : policies.length === 0 ? (
        <div className="p-8 text-center rounded-xl bg-slate-900/50 border border-slate-800 text-slate-400 text-xs">
          <Layers className="h-8 w-8 mx-auto mb-2 text-slate-500 opacity-40" />
          <p className="font-medium text-slate-300">No routing policies defined</p>
          <p className="text-[11px] text-slate-500 mt-1">
            Create an event policy to route high-severity incidents, ML anomalies, and alert transitions to Slack, email, or webhooks.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {policies.map((p) => (
            <div
              key={p.id}
              className={`p-4 rounded-xl border transition-colors space-y-3 ${
                p.isEnabled
                  ? 'bg-slate-900/70 border-slate-800'
                  : 'bg-slate-950/40 border-slate-800/50 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-sm font-semibold text-slate-100">{p.name}</h3>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                        p.isEnabled
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-slate-800 text-slate-500 border-slate-700'
                      }`}
                    >
                      {p.isEnabled ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  {p.description && (
                    <p className="text-xs text-slate-400 mt-1">{p.description}</p>
                  )}
                </div>

                <div className="flex items-center space-x-1">
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => handleOpenModal(p)}
                      className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 hover:bg-slate-800 rounded transition-colors"
                    >
                      Edit
                    </button>
                  )}
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => handleDelete(p.id)}
                      className="text-xs text-rose-400 hover:text-rose-300 p-1 hover:bg-rose-950/30 rounded transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Event types & Min Severity */}
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[10px] text-slate-500 uppercase font-semibold">Min:</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {p.minSeverity}
                </span>

                <span className="text-[10px] text-slate-500 uppercase font-semibold ml-2">Events:</span>
                {p.eventTypes.map((ev) => (
                  <span
                    key={ev}
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-950 text-emerald-400 border border-emerald-900/50"
                  >
                    {ev}
                  </span>
                ))}
              </div>

              {/* Channels & Targets */}
              <div className="pt-2 border-t border-slate-800/80 space-y-1 text-xs">
                <div className="flex items-center space-x-3 text-slate-300">
                  {p.channels.includes('EMAIL') && (
                    <span className="flex items-center space-x-1 text-slate-400">
                      <Mail className="h-3.5 w-3.5 text-sky-400" />
                      <span>{p.emailRecipients.length} Recipient(s)</span>
                    </span>
                  )}
                  {p.channels.includes('SLACK') && (
                    <span className="flex items-center space-x-1 text-slate-400">
                      <MessageSquare className="h-3.5 w-3.5 text-emerald-400" />
                      <span>{p.slackConnection?.name || 'Slack'}</span>
                    </span>
                  )}
                  {p.channels.includes('WEBHOOK') && (
                    <span className="flex items-center space-x-1 text-slate-400">
                      <Globe className="h-3.5 w-3.5 text-purple-400" />
                      <span>{p.webhookConnection?.name || 'Webhook'}</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-1 text-[11px] text-slate-500 pt-1">
                  <Clock className="h-3 w-3" />
                  <span>Anti-storm cooldown: {p.cooldownSeconds}s</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-slate-100">
              {editingItem ? 'Edit Routing Policy' : 'Create Event Routing Policy'}
            </h3>

            {formError && (
              <div className="p-2.5 rounded bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Policy Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Critical Incident On-Call Escalation"
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Description (Optional)</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Routes SEV-1/SEV-2 incidents directly to SRE team"
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isEnabled"
                  checked={isEnabled}
                  onChange={(e) => setIsEnabled(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-800 text-emerald-500 focus:ring-0"
                />
                <label htmlFor="isEnabled" className="text-xs text-slate-300">
                  Policy is active and enabled
                </label>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Triggering Event Types</label>
                <div className="grid grid-cols-2 gap-2">
                  {AVAILABLE_EVENTS.map((ev) => (
                    <label
                      key={ev.id}
                      className={`flex items-center space-x-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                        selectedEvents.includes(ev.id)
                          ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-300'
                          : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:bg-slate-800/40'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedEvents.includes(ev.id)}
                        onChange={() => toggleEvent(ev.id)}
                        className="rounded bg-slate-950 border-slate-800 text-emerald-500 focus:ring-0"
                      />
                      <span className="truncate">{ev.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Minimum Severity</label>
                  <select
                    value={minSeverity}
                    onChange={(e) => setMinSeverity(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="INFO">INFO (All events)</option>
                    <option value="WARNING">WARNING or higher</option>
                    <option value="ERROR">ERROR or higher</option>
                    <option value="CRITICAL">CRITICAL only</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Cooldown Seconds</label>
                  <input
                    type="number"
                    min={0}
                    max={86400}
                    value={cooldownSeconds}
                    onChange={(e) => setCooldownSeconds(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-[10px] text-slate-500">Prevents rapid alert storms</span>
                </div>
              </div>

              {/* Delivery Channels */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <label className="block text-xs font-medium text-slate-300">Delivery Channels</label>
                <div className="flex items-center space-x-4">
                  {['EMAIL', 'SLACK', 'WEBHOOK'].map((ch) => (
                    <label key={ch} className="flex items-center space-x-1.5 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={channels.includes(ch)}
                        onChange={() => toggleChannel(ch)}
                        className="rounded bg-slate-950 border-slate-800 text-emerald-500 focus:ring-0"
                      />
                      <span>{ch}</span>
                    </label>
                  ))}
                </div>
              </div>

              {channels.includes('EMAIL') && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Email Recipients (Comma-separated)
                  </label>
                  <input
                    type="text"
                    value={emailRecipientsText}
                    onChange={(e) => setEmailRecipientsText(e.target.value)}
                    placeholder="sre-team@example.com, oncall@example.com"
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              {channels.includes('SLACK') && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Slack Integration</label>
                  <select
                    value={slackConnId}
                    onChange={(e) => setSlackConnId(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">-- Choose Slack Webhook --</option>
                    {slackIntegrations.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({i.targetUrl.slice(0, 35)}...)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {channels.includes('WEBHOOK') && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Webhook Integration</label>
                  <select
                    value={webhookConnId}
                    onChange={(e) => setWebhookConnId(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">-- Choose Outbound Webhook --</option>
                    {genericIntegrations.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({i.targetUrl.slice(0, 35)}...)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingItem ? 'Save Changes' : 'Create Policy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

