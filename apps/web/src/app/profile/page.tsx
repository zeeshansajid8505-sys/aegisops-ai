'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  User,
  Building2,
  Shield,
  Key,
  LogOut,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

export default function ProfilePage() {
  const router = useRouter();
  const { user, memberships, logout, logoutAll, isLoading } = useAuth();

  const [revokingAll, setRevokingAll] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <div className="h-12 w-12 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-4">
          <Lock className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-100">Authentication Required</h2>
        <p className="text-xs text-slate-400 mt-2 mb-6">
          You must be signed in to view your profile and security sessions.
        </p>
        <button
          type="button"
          onClick={() => router.push('/login')}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold"
        >
          Go to Sign In
        </button>
      </div>
    );
  }

  const handleLogoutAll = async () => {
    if (
      !confirm(
        'Are you sure you want to invalidate all active sessions across all devices?',
      )
    ) {
      return;
    }

    setRevokingAll(true);
    try {
      await logoutAll();
      router.push('/login');
    } catch {
      setRevokingAll(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-100">Security & Account Profile</h1>
        <p className="text-xs text-slate-400 mt-1">
          Identity credentials, active tenant memberships, and session lifecycle controls.
        </p>
      </div>

      {successMsg && (
        <div className="p-3 rounded-lg bg-emerald-950/50 border border-emerald-800/60 text-emerald-300 text-xs flex items-center space-x-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* User Identity Card */}
        <div className="md:col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
          <div className="flex items-center space-x-4">
            <div className="h-14 w-14 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xl">
              {user.displayName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-slate-100 truncate">
                {user.displayName}
              </h2>
              <p className="text-xs text-slate-400 truncate">{user.email}</p>
              <div className="flex items-center space-x-1.5 mt-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                <span className="text-[11px] font-mono text-emerald-400">
                  Active Account
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-4 space-y-3 text-xs">
            <div>
              <span className="text-slate-500 font-mono text-[11px] block">
                USER ID
              </span>
              <span className="font-mono text-slate-300 text-[11px] break-all">
                {user.id}
              </span>
            </div>
            <div>
              <span className="text-slate-500 font-mono text-[11px] block">
                PASSWORD HASHING
              </span>
              <span className="font-mono text-slate-300 text-[11px]">
                Argon2id (64MB, 3 iter, 4 p)
              </span>
            </div>
            <div>
              <span className="text-slate-500 font-mono text-[11px] block">
                AUTH TOKEN STORAGE
              </span>
              <span className="font-mono text-slate-300 text-[11px]">
                Opaque SHA-256 (HttpOnly)
              </span>
            </div>
          </div>
        </div>

        {/* Memberships & Organizations Card */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Building2 className="h-4 w-4 text-purple-400" />
                <h3 className="text-sm font-bold text-slate-200">
                  Organization Memberships ({memberships.length})
                </h3>
              </div>
            </div>

            <div className="divide-y divide-slate-800">
              {memberships.map((m) => (
                <div
                  key={m.id}
                  className="py-3.5 flex items-center justify-between first:pt-0 last:pb-0"
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-semibold text-slate-100">
                        {m.organization.name}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        /{m.organization.slug}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono mt-0.5 block">
                      ID: {m.organization.id}
                    </span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span
                      className={`text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded border ${
                        m.role === 'OWNER'
                          ? 'bg-purple-950/80 text-purple-300 border-purple-800/60'
                          : m.role === 'ADMIN'
                          ? 'bg-blue-950/80 text-blue-300 border-blue-800/60'
                          : 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60'
                      }`}
                    >
                      {m.role}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Session Management Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center space-x-2">
              <Shield className="h-4 w-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-slate-200">
                Session Lifecycle & Security
              </h3>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              AegisOps AI implements an opaque server-managed session architecture.
              Raw token secrets never exist in the database or client-side storage
              (no localStorage). Authentication cookies are stored as secure,
              HttpOnly, SameSite cookies with SHA-256 hashed records in PostgreSQL.
            </p>

            <div className="pt-2 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => logout()}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium flex items-center space-x-2 transition-colors"
              >
                <LogOut className="h-3.5 w-3.5 text-slate-400" />
                <span>Sign Out This Device</span>
              </button>

              <button
                type="button"
                disabled={revokingAll}
                onClick={handleLogoutAll}
                className="px-4 py-2 bg-rose-950/60 hover:bg-rose-900/60 text-rose-200 border border-rose-800/60 rounded-lg text-xs font-medium flex items-center space-x-2 transition-colors disabled:opacity-50"
              >
                {revokingAll ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                )}
                <span>Revoke All Other Sessions</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

