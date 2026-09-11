'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCw, Check, Bell, Mail, MessageSquare, Globe, Sliders } from 'lucide-react';
import { api } from '@/lib/api';

export interface PreferenceItem {
  id?: string;
  channel: 'IN_APP' | 'EMAIL' | 'SLACK' | 'WEBHOOK';
  isEnabled: boolean;
  minSeverity: string;
}

interface Props {
  organizationId: string;
}

const CHANNEL_DESCRIPTIONS: Record<string, { label: string; desc: string; icon: any }> = {
  IN_APP: {
    label: 'In-App Notification Center',
    desc: 'Real-time popover notifications delivered directly to the header bell while using the platform.',
    icon: Bell,
  },
  EMAIL: {
    label: 'Email Dispatch',
    desc: 'Direct email notifications formatted with operational context, incident severity, and deep-links.',
    icon: Mail,
  },
  SLACK: {
    label: 'Slack Channel Notifications',
    desc: 'Automated Slack block-kit messages dispatched to integrated channels.',
    icon: MessageSquare,
  },
  WEBHOOK: {
    label: 'Signed Outbound Webhooks',
    desc: 'HMAC-SHA256 authenticated webhook events dispatched to external automation systems.',
    icon: Globe,
  },
};

export const NotificationPreferencesTab: React.FC<Props> = ({ organizationId }) => {
  const [preferences, setPreferences] = useState<PreferenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingChannel, setSavingChannel] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState<string | null>(null);

  const fetchPreferences = async () => {
    try {
      setLoading(true);
      const data = await api.notifications.getPreferences(organizationId);
      setPreferences(data);
    } catch {
      // Handled
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (organizationId) {
      fetchPreferences();
    }
  }, [organizationId]);

  const handleToggle = async (channel: 'IN_APP' | 'EMAIL' | 'SLACK' | 'WEBHOOK', current: boolean, minSeverity: string) => {
    const updatedState = !current;
    setSavingChannel(channel);
    try {
      await api.notifications.updatePreference(organizationId, {
        channel,
        isEnabled: updatedState,
        minSeverity,
      });
      setPreferences((prev) =>
        prev.map((p) => (p.channel === channel ? { ...p, isEnabled: updatedState } : p)),
      );
      setSavedSuccess(`Preferences updated for ${channel}`);
      setTimeout(() => setSavedSuccess(null), 3000);
    } catch {
      // Ignore
    } finally {
      setSavingChannel(null);
    }
  };

  const handleSeverityChange = async (
    channel: 'IN_APP' | 'EMAIL' | 'SLACK' | 'WEBHOOK',
    isEnabled: boolean,
    newSeverity: string,
  ) => {
    setSavingChannel(channel);
    try {
      await api.notifications.updatePreference(organizationId, {
        channel,
        isEnabled,
        minSeverity: newSeverity,
      });
      setPreferences((prev) =>
        prev.map((p) => (p.channel === channel ? { ...p, minSeverity: newSeverity } : p)),
      );
      setSavedSuccess(`Severity threshold updated for ${channel}`);
      setTimeout(() => setSavedSuccess(null), 3000);
    } catch {
      // Ignore
    } finally {
      setSavingChannel(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Personal Notification Preferences</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Customize which operational alerts and incident notifications you receive across different delivery channels.
          </p>
        </div>

        {savedSuccess && (
          <div className="flex items-center space-x-1 text-emerald-400 text-xs bg-emerald-950/40 px-3 py-1 rounded-full border border-emerald-800/60 animate-in fade-in duration-150">
            <Check className="h-3.5 w-3.5" />
            <span>Saved</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400 text-xs">
          <RefreshCw className="h-4 w-4 animate-spin mr-2 text-emerald-400" />
          Loading notification preferences...
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 divide-y divide-slate-800/80 overflow-hidden">
          {preferences.map((pref) => {
            const meta = CHANNEL_DESCRIPTIONS[pref.channel] || {
              label: pref.channel,
              desc: 'Notification channel',
              icon: Sliders,
            };
            const Icon = meta.icon;
            const isSaving = savingChannel === pref.channel;

            return (
              <div
                key={pref.channel}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors hover:bg-slate-850/40"
              >
                <div className="flex items-start space-x-3 max-w-xl">
                  <div className="h-9 w-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0 mt-0.5">
                    <Icon className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200">{meta.label}</h3>
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{meta.desc}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-4 shrink-0 sm:self-center">
                  <div className="flex items-center space-x-2">
                    <label className="text-xs text-slate-400 font-medium">Min Severity:</label>
                    <select
                      disabled={!pref.isEnabled || isSaving}
                      value={pref.minSeverity}
                      onChange={(e) => handleSeverityChange(pref.channel, pref.isEnabled, e.target.value)}
                      className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-emerald-500 disabled:opacity-40"
                    >
                      <option value="INFO">INFO (All)</option>
                      <option value="WARNING">WARNING+</option>
                      <option value="ERROR">ERROR+</option>
                      <option value="CRITICAL">CRITICAL</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => handleToggle(pref.channel, pref.isEnabled, pref.minSeverity)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      pref.isEnabled ? 'bg-emerald-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        pref.isEnabled ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

