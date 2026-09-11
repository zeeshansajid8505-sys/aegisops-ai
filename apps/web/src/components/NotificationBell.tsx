'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, ExternalLink, SlidersHorizontal, AlertCircle, Info, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useRealtimeSocket } from '@/lib/realtime';

export interface NotificationItem {
  id: string;
  receiptId: string;
  title: string;
  message: string;
  severity: string;
  deepLink?: string;
  createdAt: string;
  readAt?: string;
  isRead: boolean;
  metadata?: any;
}

export const NotificationBell: React.FC = () => {
  const router = useRouter();
  const { activeOrganization } = useAuth();
  const socket = useRealtimeSocket();

  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const orgId = activeOrganization?.id;

  const fetchNotifications = async () => {
    if (!orgId) return;
    try {
      const res = await api.notifications.list(orgId, { limit: 15 });
      setNotifications(res.items);
      setUnreadCount(res.unreadCount);
    } catch {
      // Ignored if user not authorized
    }
  };

  useEffect(() => {
    if (orgId) {
      fetchNotifications();
    }
  }, [orgId]);

  // Listen to realtime socket notifications
  useEffect(() => {
    if (!socket || !orgId) return;

    const handleNewNotification = (envelope: any) => {
      if (envelope?.type === 'notification.created') {
        fetchNotifications();
      }
    };

    const handleReadNotification = (envelope: any) => {
      if (envelope?.type === 'notification.read') {
        if (envelope.payload?.all) {
          setUnreadCount(0);
          setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        } else if (envelope.payload?.notificationId) {
          setNotifications((prev) =>
            prev.map((n) =>
              n.id === envelope.payload.notificationId ? { ...n, isRead: true } : n,
            ),
          );
          if (typeof envelope.payload?.unreadCount === 'number') {
            setUnreadCount(envelope.payload.unreadCount);
          }
        }
      }
    };

    socket.on('notification.created', handleNewNotification);
    socket.on('notification.read', handleReadNotification);

    return () => {
      socket.off('notification.created', handleNewNotification);
      socket.off('notification.read', handleReadNotification);
    };
  }, [socket, orgId]);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleMarkAllAsRead = async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      await api.notifications.markAllAsRead(orgId);
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  };

  const handleNotificationClick = async (notif: NotificationItem) => {
    if (!orgId) return;
    if (!notif.isRead) {
      try {
        await api.notifications.markAsRead(orgId, notif.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n)),
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        // Ignore
      }
    }
    setIsOpen(false);
    if (notif.deepLink) {
      router.push(notif.deepLink);
    }
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'CRITICAL':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      case 'ERROR':
        return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
      case 'WARNING':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      default:
        return 'bg-sky-500/10 text-sky-400 border-sky-500/30';
    }
  };

  if (!orgId) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        aria-label="Notification Center"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) fetchNotifications();
        }}
        className="relative p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 border border-transparent hover:border-slate-700/50 transition-colors focus:outline-none"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-slate-900 animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="px-4 py-3 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-sm text-slate-100">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  {unreadCount} unread
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                disabled={loading}
                onClick={handleMarkAllAsRead}
                className="text-xs text-slate-400 hover:text-slate-200 flex items-center space-x-1 hover:underline transition-colors"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-800/60">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">No notifications yet</p>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Operational alerts, incidents, and anomalies will appear here
                </p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`p-3.5 hover:bg-slate-800/50 cursor-pointer transition-colors ${
                    !n.isRead ? 'bg-slate-800/25' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-1.5 mb-1">
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${getSeverityBadge(
                          n.severity,
                        )}`}
                      >
                        {n.severity}
                      </span>
                      {!n.isRead && (
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500 inline-block" />
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 whitespace-nowrap">
                      {new Date(n.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-slate-200 line-clamp-1">{n.title}</p>
                  <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5 leading-relaxed">
                    {n.message}
                  </p>
                  {n.deepLink && (
                    <div className="mt-2 flex items-center text-[11px] text-emerald-400 hover:text-emerald-300 font-medium">
                      <span>View details</span>
                      <ExternalLink className="h-3 w-3 ml-1" />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-xs">
            <Link
              href="/settings?tab=preferences"
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-slate-200 flex items-center space-x-1.5 transition-colors"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Notification Preferences</span>
            </Link>
            <Link
              href="/settings?tab=integrations"
              onClick={() => setIsOpen(false)}
              className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
            >
              Integrations →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

