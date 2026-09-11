'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Server, ArrowLeft, Plus, Check } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import type {
  ServiceType,
  ServiceTier,
  CreateServiceDto,
} from '@aegisops/types';

export default function NewServicePage() {
  const router = useRouter();
  const { activeOrganization } = useAuth();
  const orgId = activeOrganization?.id;

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [serviceType, setServiceType] = useState<ServiceType>('API');
  const [tier, setTier] = useState<ServiceTier>('TIER_2');
  const [ownerTeamId, setOwnerTeamId] = useState<string>('');
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [documentationUrl, setDocumentationUrl] = useState('');

  // Optional Initial Environment
  const [createInitialEnv, setCreateInitialEnv] = useState(true);
  const [envName, setEnvName] = useState('Production');
  const [envBaseUrl, setEnvBaseUrl] = useState('');

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: teams } = useQuery({
    queryKey: ['teams', orgId],
    queryFn: () => api.teams.list(orgId!),
    enabled: !!orgId,
  });

  const handleNameChange = (val: string) => {
    setName(val);
    const autoSlug = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    setSlug(autoSlug);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      setErrorMessage(null);
      if (!orgId) throw new Error('No organization selected');
      if (!name.trim()) throw new Error('Service name is required');

      const payload: CreateServiceDto = {
        name: name.trim(),
        slug: slug.trim() || undefined,
        description: description.trim() || undefined,
        serviceType,
        tier,
        ownerTeamId: ownerTeamId || undefined,
        repositoryUrl: repositoryUrl.trim() || undefined,
        documentationUrl: documentationUrl.trim() || undefined,
      };

      const created = await api.services.create(orgId, payload);

      if (createInitialEnv) {
        try {
          await api.environments.create(orgId, created.id, {
            name: envName || 'Production',
            key: (envName || 'production').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            kind: 'PRODUCTION',
            baseUrl: envBaseUrl.trim() || undefined,
            isProduction: true,
          });
        } catch {
          // If initial env fails, service is already created
        }
      }

      return created;
    },
    onSuccess: (data) => {
      router.push(`/services/${data.id}`);
    },
    onError: (err: any) => {
      setErrorMessage(err?.message || 'Failed to create service');
    },
  });

  if (!orgId) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center text-slate-400">
        Please select an organization first.
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <Link
        href="/services"
        className="inline-flex items-center space-x-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>Back to Service Catalog</span>
      </Link>

      <div className="border-b border-slate-800 pb-4">
        <h1 className="text-2xl font-bold text-slate-100 flex items-center space-x-3">
          <Server className="h-6 w-6 text-cyan-400" />
          <span>Register New Service</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Catalog a microservice or system component into AegisOps SRE platform.
        </p>
      </div>

      {errorMessage && (
        <div className="p-4 bg-rose-950/40 border border-rose-800 rounded-lg text-rose-300 text-xs">
          {errorMessage}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate();
        }}
        className="space-y-6 bg-slate-900/60 p-6 rounded-xl border border-slate-800"
      >
        {/* Basic Identity */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Service Name <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Payment Processing Service"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Slug Identifier
            </label>
            <input
              type="text"
              placeholder="e.g. payment-processing-service"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">
            Description
          </label>
          <textarea
            rows={2}
            placeholder="Brief explanation of the service responsibility and scope..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Tier & Type */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Service Tier <span className="text-rose-400">*</span>
            </label>
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value as ServiceTier)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="TIER_1">Tier 1 — Mission Critical (Direct user/revenue impact)</option>
              <option value="TIER_2">Tier 2 — Standard Operational (High priority backend)</option>
              <option value="TIER_3">Tier 3 — Supporting / Auxiliary (Internal tools, batch)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Service Type <span className="text-rose-400">*</span>
            </label>
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value as ServiceType)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="API">API Gateway / REST / gRPC API</option>
              <option value="WEB_APP">Web Application / Frontend</option>
              <option value="WORKER">Background Worker / Consumer</option>
              <option value="DATABASE">Database / Datastore</option>
              <option value="QUEUE">Message Broker / Queue</option>
              <option value="AI_SERVICE">AI / ML Model Service</option>
              <option value="INTERNAL_SERVICE">Internal Platform Service</option>
              <option value="EXTERNAL_SERVICE">External Third-Party Service</option>
              <option value="OTHER">Other Component</option>
            </select>
          </div>
        </div>

        {/* Team Ownership */}
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">
            Owner Team
          </label>
          <select
            value={ownerTeamId}
            onChange={(e) => setOwnerTeamId(e.target.value)}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="">-- No Team Assigned --</option>
            {teams?.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name} ({team.memberCount} members)
              </option>
            ))}
          </select>
        </div>

        {/* Metadata URLs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Repository URL
            </label>
            <input
              type="url"
              placeholder="https://github.com/org/repo"
              value={repositoryUrl}
              onChange={(e) => setRepositoryUrl(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Documentation URL
            </label>
            <input
              type="url"
              placeholder="https://wiki.internal.net/service"
              value={documentationUrl}
              onChange={(e) => setDocumentationUrl(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        {/* Initial Environment Toggle */}
        <div className="border-t border-slate-800 pt-4 space-y-3">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="initialEnv"
              checked={createInitialEnv}
              onChange={(e) => setCreateInitialEnv(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-cyan-500/20"
            />
            <label htmlFor="initialEnv" className="text-xs font-medium text-slate-200 select-none">
              Create initial runtime environment now (Production)
            </label>
          </div>

          {createInitialEnv && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-800/40 p-3 rounded-lg border border-slate-800">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Environment Name
                </label>
                <input
                  type="text"
                  value={envName}
                  onChange={(e) => setEnvName(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Base URL (Optional)
                </label>
                <input
                  type="url"
                  placeholder="https://api.prod.company.com"
                  value={envBaseUrl}
                  onChange={(e) => setEnvBaseUrl(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
          <Link
            href="/services"
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-medium text-slate-300 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-xs font-medium text-white transition-colors shadow-sm"
          >
            {createMutation.isPending ? 'Registering...' : 'Register Service'}
          </button>
        </div>
      </form>
    </div>
  );
}

