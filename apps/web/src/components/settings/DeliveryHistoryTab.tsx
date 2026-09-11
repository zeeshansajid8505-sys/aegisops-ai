'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCw, Send, CheckCircle2, AlertCircle, Clock, ChevronDown, ChevronRight, Mail, MessageSquare, Globe } from 'lucide-react';
import { api } from '@/lib/api';

export interface DeliveryItem {
  id: string;
  organizationId: string;
  channel: string;
  destination: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt?: string;
  lastError?: string;
  deliveredAt?: string;
  createdAt: string;
  notificationEvent: {
    id: string;
    eventType: string;
    title: string;
    severity: string;
    occurredAt: string;
  };
  notificationPolicy?: { id: string; name: string };
  integrationConnection?: { id: string; name: string; type: string };
  attempts: Array<{
    id: string;
    attemptNumber: number;
    responseStatus?: number;
    responseDurationMs?: number;
    responseBodyExcerpt?: string;
    errorMessage?: string;
    attemptedAt: string;
  }>;
}

interface Props {
  organizationId: string;
}

export const DeliveryHistoryTab: React.FC<Props> = ({ organizationId }) => {
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [channelFilter, setChannelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchDeliveries = async () => {
    try {
      setLoading(true);
      const res = await api.deliveries.list(organizationId, {
        channel: channelFilter || undefined,
        status: statusFilter || undefined,
        limit: 50,
      });
      setDeliveries(res.items);
      setTotal(res.total);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (organizationId) {
      fetchDeliveries();
    }
  }, [organizationId, channelFilter, statusFilter]);

  const getStatusPill = (status: string) => {
    switch (status) {
      case 'DELIVERED':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'PENDING':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'RETRYING':
        return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
      case 'FAILED':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  const getChannelIcon = (ch: string) => {
    switch (ch) {
      case 'EMAIL':
        return <Mail className="h-4 w-4 text-sky-400" />;
      case 'SLACK':
        return <MessageSquare className="h-4 w-4 text-emerald-400" />;
      default:
        return <Globe className="h-4 w-4 text-purple-400" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Delivery Audit History</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Full audit log of outbound webhook dispatches, Slack messages, and emails with retry traces.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Channels</option>
            <option value="EMAIL">Email</option>
            <option value="SLACK">Slack</option>
            <option value="WEBHOOK">Webhook</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Statuses</option>
            <option value="DELIVERED">Delivered</option>
            <option value="PENDING">Pending</option>
            <option value="RETRYING">Retrying</option>
            <option value="FAILED">Failed</option>
          </select>

          <button
            type="button"
            onClick={() => fetchDeliveries()}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>
      </div>

      {loading && deliveries.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-slate-400 text-xs">
          <RefreshCw className="h-4 w-4 animate-spin mr-2 text-emerald-400" />
          Loading delivery audit log...
        </div>
      ) : deliveries.length === 0 ? (
        <div className="p-8 text-center rounded-xl bg-slate-900/50 border border-slate-800 text-slate-400 text-xs">
          <Send className="h-8 w-8 mx-auto mb-2 text-slate-500 opacity-40" />
          <p className="font-medium text-slate-300">No deliveries recorded</p>
          <p className="text-[11px] text-slate-500 mt-1">
            Outbound notification deliveries will appear here as incidents, alerts, or anomalies trigger routing policies.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden divide-y divide-slate-800/80">
          {deliveries.map((del) => {
            const isExpanded = expandedId === del.id;
            return (
              <div key={del.id} className="transition-colors hover:bg-slate-850/40">
                <div
                  onClick={() => setExpandedId(isExpanded ? null : del.id)}
                  className="p-3.5 flex items-center justify-between cursor-pointer text-xs"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="h-8 w-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                      {getChannelIcon(del.channel)}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-slate-200 truncate">
                          {del.notificationEvent?.title || 'Operational Event'}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          {del.notificationEvent?.eventType}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5 font-mono">
                        Destination: {del.destination}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 shrink-0 ml-4">
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${getStatusPill(
                        del.status,
                      )}`}
                    >
                      {del.status}
                    </span>

                    <span className="text-[11px] text-slate-400 font-mono">
                      Attempt {del.attemptCount}/{del.maxAttempts}
                    </span>

                    <span className="text-[11px] text-slate-500 whitespace-nowrap">
                      {new Date(del.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>

                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-slate-500" />
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 bg-slate-950/60 border-t border-slate-800/80 text-xs space-y-3">
                    {del.lastError && (
                      <div className="p-2.5 rounded bg-rose-950/30 border border-rose-800/50 text-rose-300 text-xs flex items-start space-x-2">
                        <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-semibold text-[11px]">Last Error:</div>
                          <div className="font-mono text-[11px]">{del.lastError}</div>
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="text-[11px] font-semibold text-slate-300 mb-1.5">
                        Attempt Traces ({del.attempts.length}):
                      </div>
                      {del.attempts.length === 0 ? (
                        <div className="text-slate-500 text-[11px]">No attempts recorded yet (pending).</div>
                      ) : (
                        <div className="space-y-1.5">
                          {del.attempts.map((att) => (
                            <div
                              key={att.id}
                              className="p-2 rounded bg-slate-900 border border-slate-800 flex items-start justify-between gap-2 font-mono text-[11px]"
                            >
                              <div>
                                <span className="text-slate-300 font-bold">Attempt #{att.attemptNumber}</span>
                                {att.responseStatus && (
                                  <span
                                    className={`ml-2 px-1.5 py-0.2 rounded text-[10px] ${
                                      att.responseStatus >= 200 && att.responseStatus < 300
                                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                        : 'bg-rose-950 text-rose-400 border border-rose-800'
                                    }`}
                                  >
                                    HTTP {att.responseStatus}
                                  </span>
                                )}
                                <span className="ml-2 text-slate-500">{att.responseDurationMs}ms</span>
                                {att.responseBodyExcerpt && (
                                  <div className="text-slate-400 text-[10px] mt-1 break-all line-clamp-2">
                                    Excerpt: {att.responseBodyExcerpt}
                                  </div>
                                )}
                              </div>
                              <span className="text-slate-500 text-[10px] whitespace-nowrap">
                                {new Date(att.attemptedAt).toLocaleTimeString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

