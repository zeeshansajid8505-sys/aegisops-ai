'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Check, RefreshCw, AlertCircle, Trash2, Send, Shield, Globe, MessageSquare } from 'lucide-react';
import { api } from '@/lib/api';

export interface IntegrationItem {
  id: string;
  organizationId: string;
  name: string;
  type: 'SLACK_WEBHOOK' | 'GENERIC_WEBHOOK' | 'PAGERDUTY_WEBHOOK';
  description?: string;
  targetUrl: string;
  secretMask?: string;
  headers?: Record<string, string>;
  isEnabled: boolean;
  lastTestedAt?: string;
  lastTestStatus?: string;
  lastTestError?: string;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  organizationId: string;
  canManage: boolean;
}

export const IntegrationsTab: React.FC<Props> = ({ organizationId, canManage }) => {
  const [integrations, setIntegrations] = useState<IntegrationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<IntegrationItem | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [type, setType] = useState<'SLACK_WEBHOOK' | 'GENERIC_WEBHOOK'>('SLACK_WEBHOOK');
  const [description, setDescription] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [headersJson, setHeadersJson] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchIntegrations = async () => {
    try {
      setLoading(true);
      const data = await api.integrations.list(organizationId);
      setIntegrations(data);
    } catch {
      // Handled
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (organizationId) {
      fetchIntegrations();
    }
  }, [organizationId]);

  const handleOpenModal = (item?: IntegrationItem) => {
    setFormError(null);
    if (item) {
      setEditingItem(item);
      setName(item.name);
      setType(item.type === 'GENERIC_WEBHOOK' ? 'GENERIC_WEBHOOK' : 'SLACK_WEBHOOK');
      setDescription(item.description || '');
      setTargetUrl(item.targetUrl);
      setSecret('');
      setHeadersJson(item.headers ? JSON.stringify(item.headers, null, 2) : '');
    } else {
      setEditingItem(null);
      setName('');
      setType('SLACK_WEBHOOK');
      setDescription('');
      setTargetUrl('');
      setSecret('');
      setHeadersJson('');
    }
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    let parsedHeaders: Record<string, string> | undefined;
    if (headersJson.trim()) {
      try {
        parsedHeaders = JSON.parse(headersJson.trim());
      } catch {
        setFormError('Invalid JSON format for custom headers');
        return;
      }
    }

    try {
      setSubmitting(true);
      if (editingItem) {
        await api.integrations.update(organizationId, editingItem.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          targetUrl: targetUrl.trim(),
          secret: secret.trim() || undefined,
          headers: parsedHeaders,
        });
      } else {
        await api.integrations.create(organizationId, {
          name: name.trim(),
          type,
          description: description.trim() || undefined,
          targetUrl: targetUrl.trim(),
          secret: secret.trim() || undefined,
          headers: parsedHeaders,
        });
      }
      setShowModal(false);
      fetchIntegrations();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save integration connection');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this integration connection?')) return;
    try {
      await api.integrations.delete(organizationId, id);
      fetchIntegrations();
    } catch (err: any) {
      alert(err?.message || 'Failed to delete integration');
    }
  };

  const handleTest = async (item: IntegrationItem) => {
    setTestingId(item.id);
    setTestResult(null);
    try {
      const res = await api.integrations.test(organizationId, item.id);
      setTestResult({
        id: item.id,
        success: res.success,
        message: res.success
          ? `Delivery test succeeded (${res.status} OK in ${res.durationMs}ms)`
          : `Delivery test failed: ${res.error || `HTTP ${res.status}`}`,
      });
      fetchIntegrations();
    } catch (err: any) {
      setTestResult({
        id: item.id,
        success: false,
        message: err?.message || 'Test request failed',
      });
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Outbound Integrations</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure secure Slack incoming webhooks and HMAC-signed HTTP webhooks with SSRF guardrails.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => handleOpenModal()}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg text-xs font-semibold transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Add Integration</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400 text-xs">
          <RefreshCw className="h-4 w-4 animate-spin mr-2 text-emerald-400" />
          Loading integrations...
        </div>
      ) : integrations.length === 0 ? (
        <div className="p-8 text-center rounded-xl bg-slate-900/50 border border-slate-800 text-slate-400 text-xs">
          <Globe className="h-8 w-8 mx-auto mb-2 text-slate-500 opacity-40" />
          <p className="font-medium text-slate-300">No outbound integrations configured</p>
          <p className="text-[11px] text-slate-500 mt-1">
            Connect a Slack channel or external webhook endpoint to receive automated operational notifications.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {integrations.map((item) => (
            <div
              key={item.id}
              className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3 relative group"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="h-8 w-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                    {item.type === 'SLACK_WEBHOOK' ? (
                      <MessageSquare className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Globe className="h-4 w-4 text-sky-400" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200">{item.name}</h3>
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700/60">
                      {item.type.replace('_WEBHOOK', '')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-1">
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => handleOpenModal(item)}
                      className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 hover:bg-slate-800 rounded transition-colors"
                    >
                      Edit
                    </button>
                  )}
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      className="text-xs text-rose-400 hover:text-rose-300 p-1 hover:bg-rose-950/30 rounded transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {item.description && (
                <p className="text-xs text-slate-400 leading-relaxed">{item.description}</p>
              )}

              <div className="bg-slate-950/80 rounded p-2 text-[11px] font-mono text-slate-400 border border-slate-800/80 break-all">
                <div className="text-slate-500 text-[10px] uppercase font-sans mb-0.5">Target Endpoint</div>
                {item.targetUrl}
              </div>

              {item.secretMask && (
                <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-950/40 px-2.5 py-1.5 rounded border border-slate-800/60">
                  <div className="flex items-center space-x-1.5">
                    <Shield className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Signing Secret:</span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-300">{item.secretMask}</span>
                </div>
              )}

              {/* Status & Test Trigger */}
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                <div className="text-[11px]">
                  {item.lastTestedAt ? (
                    <span className="flex items-center space-x-1.5">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          item.lastTestStatus === 'SUCCESS' ? 'bg-emerald-400' : 'bg-rose-400'
                        }`}
                      />
                      <span className="text-slate-400">
                        {item.lastTestStatus === 'SUCCESS' ? 'Verified' : 'Failed'} (
                        {new Date(item.lastTestedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        )
                      </span>
                    </span>
                  ) : (
                    <span className="text-slate-500">Not yet tested</span>
                  )}
                </div>

                <button
                  type="button"
                  disabled={testingId === item.id}
                  onClick={() => handleTest(item)}
                  className="flex items-center space-x-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700/80 text-slate-200 rounded text-xs font-medium border border-slate-700/60 transition-colors disabled:opacity-50"
                >
                  {testingId === item.id ? (
                    <RefreshCw className="h-3 w-3 animate-spin text-emerald-400" />
                  ) : (
                    <Send className="h-3 w-3 text-slate-400" />
                  )}
                  <span>Test Payload</span>
                </button>
              </div>

              {/* Inline Test Result Alert */}
              {testResult && testResult.id === item.id && (
                <div
                  className={`p-2 rounded text-[11px] flex items-center space-x-1.5 border ${
                    testResult.success
                      ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60'
                      : 'bg-rose-950/40 text-rose-300 border-rose-800/60'
                  }`}
                >
                  {testResult.success ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                  )}
                  <span className="truncate">{testResult.message}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-100">
              {editingItem ? 'Edit Integration Connection' : 'New Outbound Integration'}
            </h3>

            {formError && (
              <div className="p-2.5 rounded bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Connection Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. SRE Production Slack Channel"
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {!editingItem && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Integration Type</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as any)}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="SLACK_WEBHOOK">Slack Incoming Webhook</option>
                    <option value="GENERIC_WEBHOOK">Generic HMAC-Signed Webhook</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Description (Optional)</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Critical alerts channel for primary tier 1 services"
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Target Webhook URL</label>
                <input
                  type="url"
                  required
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder={
                    type === 'SLACK_WEBHOOK'
                      ? 'https://hooks.slack.com/services/...'
                      : 'https://api.yourcompany.com/webhooks/aegisops'
                  }
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Validated against cloud metadata, link-local, and unauthorized internal IP ranges (SSRF protection).
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  {type === 'SLACK_WEBHOOK' ? 'Secret / Token (Optional)' : 'HMAC Signing Secret'}
                </label>
                <input
                  type="password"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder={
                    editingItem?.secretMask
                      ? `Leave blank to keep (${editingItem.secretMask})`
                      : 'Secret key for X-AegisOps-Signature'
                  }
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Encrypted at rest using AES-256-GCM. Never logged or exposed in responses.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Custom Headers JSON (Optional)
                </label>
                <textarea
                  rows={2}
                  value={headersJson}
                  onChange={(e) => setHeadersJson(e.target.value)}
                  placeholder='{"X-Custom-Auth": "token"}'
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

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
                  {submitting ? 'Saving...' : editingItem ? 'Save Changes' : 'Create Integration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

