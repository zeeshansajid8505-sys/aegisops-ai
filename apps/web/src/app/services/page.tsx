'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Server,
  Plus,
  Search,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Users,
  Layers,
  ArrowUpDown,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import type {
  ServiceSummary,
  ServiceTier,
  ServiceType,
  ServiceLifecycle,
  ServiceHealthStatus,
} from '@aegisops/types';

export default function ServicesPage() {
  const { activeOrganization } = useAuth();
  const orgId = activeOrganization?.id;

  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [lifecycleFilter, setLifecycleFilter] = useState<string>('ALL');
  const [healthFilter, setHealthFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [
      'services',
      orgId,
      search,
      tierFilter,
      typeFilter,
      lifecycleFilter,
      healthFilter,
      page,
    ],
    queryFn: () =>
      api.services.list(orgId!, {
        search: search || undefined,
        tier: tierFilter !== 'ALL' ? (tierFilter as ServiceTier) : undefined,
        serviceType: typeFilter !== 'ALL' ? (typeFilter as ServiceType) : undefined,
        lifecycleStatus:
          lifecycleFilter !== 'ALL' ? (lifecycleFilter as ServiceLifecycle) : undefined,
        healthStatus:
          healthFilter !== 'ALL' ? (healthFilter as ServiceHealthStatus) : undefined,
        page,
        limit: 20,
      }),
    enabled: !!orgId,
  });

  const getHealthBadge = (status: ServiceHealthStatus) => {
    switch (status) {
      case 'HEALTHY':
        return (
          <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Healthy</span>
          </span>
        );
      case 'DEGRADED':
        return (
          <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            <span>Degraded</span>
          </span>
        );
      case 'UNHEALTHY':
        return (
          <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-ping" />
            <span>Unhealthy</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
            <HelpCircle className="h-3 w-3" />
            <span>Unknown</span>
          </span>
        );
    }
  };

  const getTierBadge = (tier: ServiceTier) => {
    switch (tier) {
      case 'TIER_1':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-950/80 text-rose-300 border border-rose-800/60 font-mono">
            Tier 1 (Mission-Critical)
          </span>
        );
      case 'TIER_2':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-950/80 text-amber-300 border border-amber-800/60 font-mono">
            Tier 2 (Standard)
          </span>
        );
      case 'TIER_3':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700 font-mono">
            Tier 3 (Supporting)
          </span>
        );
    }
  };

  const getLifecycleBadge = (status: ServiceLifecycle) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="text-[11px] text-emerald-400 font-medium bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
            Active
          </span>
        );
      case 'DEVELOPMENT':
        return (
          <span className="text-[11px] text-cyan-400 font-medium bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/40">
            Development
          </span>
        );
      case 'DEPRECATED':
        return (
          <span className="text-[11px] text-amber-400 font-medium bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40">
            Deprecated
          </span>
        );
      case 'RETIRED':
        return (
          <span className="text-[11px] text-slate-400 font-medium bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
            Retired
          </span>
        );
    }
  };

  if (!orgId) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="p-8 rounded-xl border border-slate-800 bg-slate-900/60 text-center">
          <p className="text-slate-400">Please select an organization to view the Service Catalog.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center space-x-3">
            <Server className="h-7 w-7 text-cyan-400" />
            <span>Service Catalog</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            System of record for microservices, team ownership, runtime environments, and active health.
          </p>
        </div>
        <Link
          href="/services/new"
          className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" />
          <span>Register Service</span>
        </Link>
      </div>

      {/* Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-slate-900/70 p-4 rounded-xl border border-slate-800">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search services..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div>
          <select
            value={tierFilter}
            onChange={(e) => {
              setTierFilter(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Tiers</option>
            <option value="TIER_1">Tier 1 (Mission-Critical)</option>
            <option value="TIER_2">Tier 2 (Standard)</option>
            <option value="TIER_3">Tier 3 (Supporting)</option>
          </select>
        </div>

        <div>
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Types</option>
            <option value="API">API</option>
            <option value="WEB_APP">Web App</option>
            <option value="WORKER">Worker</option>
            <option value="DATABASE">Database</option>
            <option value="AI_SERVICE">AI Service</option>
            <option value="INTERNAL_SERVICE">Internal Service</option>
            <option value="EXTERNAL_SERVICE">External Service</option>
          </select>
        </div>

        <div>
          <select
            value={lifecycleFilter}
            onChange={(e) => {
              setLifecycleFilter(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Lifecycles</option>
            <option value="ACTIVE">Active</option>
            <option value="DEVELOPMENT">Development</option>
            <option value="DEPRECATED">Deprecated</option>
            <option value="RETIRED">Retired</option>
          </select>
        </div>

        <div>
          <select
            value={healthFilter}
            onChange={(e) => {
              setHealthFilter(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Health States</option>
            <option value="HEALTHY">Healthy</option>
            <option value="DEGRADED">Degraded</option>
            <option value="UNHEALTHY">Unhealthy</option>
            <option value="UNKNOWN">Unknown</option>
          </select>
        </div>
      </div>

      {/* Services List / Table */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-slate-900/60 rounded-xl border border-slate-800 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="p-6 bg-rose-950/20 border border-rose-900/50 rounded-xl text-center text-rose-300 text-sm">
          Failed to load services: {(error as any)?.message || 'Internal error'}
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/40 rounded-xl border border-dashed border-slate-800 space-y-4">
          <Server className="h-12 w-12 text-slate-600 mx-auto" />
          <div>
            <h3 className="text-base font-semibold text-slate-300">No Services Registered</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              Start building your service catalog by registering your first service, microservice, or API.
            </p>
          </div>
          <Link
            href="/services/new"
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Register First Service</span>
          </Link>
        </div>
      ) : (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                <th className="px-6 py-3.5">Service</th>
                <th className="px-4 py-3.5">Tier</th>
                <th className="px-4 py-3.5">Type</th>
                <th className="px-4 py-3.5">Owner Team</th>
                <th className="px-4 py-3.5">Lifecycle</th>
                <th className="px-4 py-3.5">Environments</th>
                <th className="px-6 py-3.5 text-right">Health Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {data.items.map((service: ServiceSummary) => (
                <tr
                  key={service.id}
                  className="hover:bg-slate-800/40 transition-colors group cursor-pointer"
                >
                  <td className="px-6 py-4">
                    <Link href={`/services/${service.id}`} className="block">
                      <div className="font-semibold text-slate-200 group-hover:text-cyan-400 transition-colors">
                        {service.name}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        {service.slug}
                      </div>
                      {service.description && (
                        <div className="text-slate-400 text-[11px] line-clamp-1 mt-1">
                          {service.description}
                        </div>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    {getTierBadge(service.tier)}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-slate-300 font-mono text-[11px]">
                    {service.serviceType}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    {service.ownerTeam ? (
                      <span className="inline-flex items-center space-x-1.5 text-slate-300">
                        <Users className="h-3 w-3 text-indigo-400" />
                        <span>{service.ownerTeam.name}</span>
                      </span>
                    ) : (
                      <span className="text-slate-500 italic">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    {getLifecycleBadge(service.lifecycleStatus)}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-slate-400">
                    <span className="inline-flex items-center space-x-1">
                      <Layers className="h-3.5 w-3.5 text-slate-500" />
                      <span>{service.environmentCount} envs</span>
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    {getHealthBadge(service.healthStatus)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {data.total > data.limit && (
            <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <div>
                Showing {(data.page - 1) * data.limit + 1} to{' '}
                {Math.min(data.page * data.limit, data.total)} of {data.total} services
              </div>
              <div className="flex space-x-2">
                <button
                  type="button"
                  disabled={data.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed rounded border border-slate-700 text-slate-300"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={data.page * data.limit >= data.total}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed rounded border border-slate-700 text-slate-300"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

