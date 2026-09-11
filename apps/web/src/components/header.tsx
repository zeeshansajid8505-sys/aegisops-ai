'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShieldCheck,
  Activity,
  Building2,
  User,
  LogOut,
  ChevronDown,
  Check,
  PlusCircle,
  Server,
  Bell,
  AlertOctagon,
  Settings,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useRealtimeStatus } from '@/lib/realtime';
import { NotificationBell } from './NotificationBell';

export const Header: React.FC = () => {
  const pathname = usePathname();
  const {
    user,
    memberships,
    activeOrganization,
    currentRole,
    switchOrganization,
    logout,
  } = useAuth();

  const { status: realtimeStatus, isConnected } = useRealtimeStatus();

  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const getRoleBadgeColor = (role: string | null) => {
    switch (role) {
      case 'OWNER':
        return 'bg-purple-950/80 text-purple-300 border-purple-800/60';
      case 'ADMIN':
        return 'bg-blue-950/80 text-blue-300 border-blue-800/60';
      case 'SRE':
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60';
      case 'ENGINEER':
        return 'bg-cyan-950/80 text-cyan-300 border-cyan-800/60';
      case 'MANAGER':
        return 'bg-amber-950/80 text-amber-300 border-amber-800/60';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const navLinks = [
    { href: '/', label: 'Overview', icon: Activity, exact: true },
    { href: '/services', label: 'Services', icon: Server, exact: false },
    { href: '/alerts', label: 'Alerts', icon: Bell, exact: false },
    { href: '/incidents', label: 'Incidents', icon: AlertOctagon, exact: false },
    { href: '/settings', label: 'Settings', icon: Settings, exact: false },
  ];

  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand & Org Switcher */}
        <div className="flex items-center space-x-4">
          <Link href="/" className="flex items-center space-x-2.5 group">
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:border-emerald-500/40 transition-colors">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <span className="font-bold text-base text-slate-100 tracking-tight">
                AegisOps AI
              </span>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                SRE & Incident Platform
              </p>
            </div>
          </Link>

          {/* Org Switcher (When Authenticated) */}
          {user && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setOrgDropdownOpen(!orgDropdownOpen)}
                className="flex items-center space-x-2 px-3 py-1.5 rounded-md bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-xs text-slate-200 transition-colors"
              >
                <Building2 className="h-3.5 w-3.5 text-slate-400" />
                <span className="font-medium max-w-[140px] truncate">
                  {activeOrganization?.name || 'Select Org'}
                </span>
                {currentRole && (
                  <span
                    className={`text-[9px] font-mono font-semibold uppercase px-1.5 py-0.2 rounded border ${getRoleBadgeColor(
                      currentRole,
                    )}`}
                  >
                    {currentRole}
                  </span>
                )}
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>

              {orgDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setOrgDropdownOpen(false)}
                  />
                  <div className="absolute left-0 mt-1.5 w-72 rounded-lg bg-slate-900 border border-slate-800 shadow-xl z-20 py-1.5 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-2 border-b border-slate-800 text-[11px] font-medium text-slate-400">
                      Switch Organization
                    </div>
                    <div className="max-h-60 overflow-y-auto py-1">
                      {memberships.map((m) => {
                        const isActive = m.organization.id === activeOrganization?.id;
                        return (
                          <button
                            key={m.id}
                            onClick={() => {
                              switchOrganization(m.organization.id);
                              setOrgDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 flex items-center justify-between text-xs hover:bg-slate-800/70 transition-colors ${
                              isActive ? 'bg-slate-800/40 text-emerald-400' : 'text-slate-300'
                            }`}
                          >
                            <div className="flex flex-col truncate pr-2">
                              <span className="font-medium truncate">{m.organization.name}</span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                /{m.organization.slug}
                              </span>
                            </div>
                            <div className="flex items-center space-x-2 flex-shrink-0">
                              <span
                                className={`text-[9px] font-mono font-semibold uppercase px-1.5 py-0.5 rounded border ${getRoleBadgeColor(
                                  m.role,
                                )}`}
                              >
                                {m.role}
                              </span>
                              {isActive && <Check className="h-3.5 w-3.5 text-emerald-400" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <div className="border-t border-slate-800 mt-1 pt-1">
                      <Link
                        href="/organizations"
                        onClick={() => setOrgDropdownOpen(false)}
                        className="w-full text-left px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 flex items-center space-x-2"
                      >
                        <PlusCircle className="h-3.5 w-3.5" />
                        <span>Manage Organizations</span>
                      </Link>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Center Nav: Exactly 5 items */}
        <nav className="hidden md:flex items-center space-x-1 font-medium text-xs">
          {navLinks.map((link) => {
            const isActive = link.exact
              ? pathname === link.href
              : pathname === link.href || pathname?.startsWith(`${link.href}/`);
            const Icon = link.icon;

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded-md flex items-center space-x-1.5 transition-colors ${
                  isActive
                    ? 'bg-slate-800 text-slate-100 font-semibold'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                <Icon
                  className={`h-3.5 w-3.5 ${
                    isActive ? 'text-emerald-400' : 'text-slate-400'
                  }`}
                />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right Actions: Real-time Status Indicator & Profile */}
        <div className="flex items-center space-x-3">
          {/* Live Realtime Status Pill */}
          <div
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-[11px] font-mono"
            title={`Realtime WebSocket: ${realtimeStatus}`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isConnected
                  ? 'bg-emerald-400 animate-pulse'
                  : realtimeStatus === 'reconnecting'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-slate-500'
              }`}
            />
            <span
              className={
                isConnected
                  ? 'text-emerald-400 font-medium'
                  : realtimeStatus === 'reconnecting'
                  ? 'text-amber-400 font-medium'
                  : 'text-slate-400'
              }
            >
              {isConnected ? 'Live' : realtimeStatus === 'reconnecting' ? 'Reconnecting' : 'Offline'}
            </span>
          </div>

          <NotificationBell />

          {user ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center space-x-2 p-1.5 rounded-md hover:bg-slate-800 border border-transparent hover:border-slate-700/60 transition-colors"
              >
                <div className="h-7 w-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 text-xs font-medium">
                  {user.displayName.charAt(0).toUpperCase()}
                </div>
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>

              {userDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setUserDropdownOpen(false)}
                  />
                  <div className="absolute right-0 mt-1.5 w-60 rounded-lg bg-slate-900 border border-slate-800 shadow-xl z-20 py-1 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-2 border-b border-slate-800">
                      <p className="text-xs font-medium text-slate-200 truncate">
                        {user.displayName}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                    </div>
                    <Link
                      href="/settings?tab=profile"
                      onClick={() => setUserDropdownOpen(false)}
                      className="px-3 py-2 text-xs text-slate-300 hover:bg-slate-800/70 hover:text-slate-100 flex items-center space-x-2"
                    >
                      <User className="h-3.5 w-3.5 text-slate-400" />
                      <span>User Profile</span>
                    </Link>
                    <Link
                      href="/settings"
                      onClick={() => setUserDropdownOpen(false)}
                      className="px-3 py-2 text-xs text-slate-300 hover:bg-slate-800/70 hover:text-slate-100 flex items-center space-x-2"
                    >
                      <Settings className="h-3.5 w-3.5 text-slate-400" />
                      <span>Settings & Access</span>
                    </Link>
                    <div className="border-t border-slate-800 my-1" />
                    <button
                      type="button"
                      onClick={() => {
                        setUserDropdownOpen(false);
                        logout();
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-rose-400 hover:bg-rose-950/30 hover:text-rose-300 flex items-center space-x-2"
                    >
                      <LogOut className="h-3.5 w-3.5 text-rose-400" />
                      <span>Log out</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <Link
                href="/login"
                className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-slate-100 hover:bg-slate-800/60 rounded-md transition-colors"
              >
                Log In
              </Link>
              <Link
                href="/register"
                className="px-3 py-1.5 text-xs font-medium text-slate-900 bg-emerald-400 hover:bg-emerald-300 rounded-md transition-colors"
              >
                Register
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
