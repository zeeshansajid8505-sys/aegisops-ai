import type {
  AuthMeResponse,
  AuthUser,
  OrganizationSummary,
  UserOrganizationMembership,
  InvitationSummary,
  UserRole,
} from '@aegisops/types';

const API_BASE =
  typeof window !== 'undefined'
    ? ''
    : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001');

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetcher<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const contentType = response.headers.get('content-type');
  let data: any = null;
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  }

  if (!response.ok) {
    const message = data?.message
      ? Array.isArray(data.message)
        ? data.message.join(', ')
        : data.message
      : `HTTP ${response.status}: ${response.statusText}`;
    throw new ApiError(response.status, message, data);
  }

  return data as T;
}

export interface MemberDetail {
  id: string;
  userId: string;
  organizationId: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
}

export const api = {
  auth: {
    register: (payload: {
      displayName: string;
      email: string;
      password: string;
      organizationName: string;
    }) =>
      fetcher<{ user: AuthUser; initialOrganizationId: string }>(
        '/api/v1/auth/register',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      ),

    login: (payload: { email: string; password: string }) =>
      fetcher<{ user: AuthUser }>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    me: () => fetcher<AuthMeResponse>('/api/v1/auth/me'),

    logout: () =>
      fetcher<{ success: boolean }>('/api/v1/auth/logout', {
        method: 'POST',
      }),

    logoutAll: () =>
      fetcher<{ success: boolean; revokedCount: number }>(
        '/api/v1/auth/logout-all',
        {
          method: 'POST',
        },
      ),
  },

  organizations: {
    list: () => fetcher<OrganizationSummary[]>('/api/v1/organizations'),

    create: (payload: { name: string; slug?: string }) =>
      fetcher<OrganizationSummary>('/api/v1/organizations', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    get: (organizationId: string) =>
      fetcher<OrganizationSummary>(`/api/v1/organizations/${organizationId}`),

    update: (organizationId: string, payload: { name: string }) =>
      fetcher<OrganizationSummary>(`/api/v1/organizations/${organizationId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
  },

  memberships: {
    list: (organizationId: string) =>
      fetcher<MemberDetail[]>(`/api/v1/organizations/${organizationId}/members`),

    updateRole: (organizationId: string, memberId: string, role: UserRole) =>
      fetcher<MemberDetail>(
        `/api/v1/organizations/${organizationId}/members/${memberId}/role`,
        {
          method: 'PATCH',
          body: JSON.stringify({ role }),
        },
      ),

    remove: (organizationId: string, memberId: string) =>
      fetcher<{ message: string }>(
        `/api/v1/organizations/${organizationId}/members/${memberId}`,
        {
          method: 'DELETE',
        },
      ),
  },

  invitations: {
    list: (organizationId: string) =>
      fetcher<InvitationSummary[]>(
        `/api/v1/organizations/${organizationId}/invitations`,
      ),

    create: (
      organizationId: string,
      payload: { email: string; role: UserRole },
    ) =>
      fetcher<InvitationSummary & { invitationToken?: string }>(
        `/api/v1/organizations/${organizationId}/invitations`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      ),

    revoke: (organizationId: string, invitationId: string) =>
      fetcher<{ message: string }>(
        `/api/v1/organizations/${organizationId}/invitations/${invitationId}`,
        {
          method: 'DELETE',
        },
      ),

    accept: (token: string) =>
      fetcher<{ message: string; organizationId: string }>(
        '/api/v1/invitations/accept',
        {
          method: 'POST',
          body: JSON.stringify({ token }),
        },
      ),
  },

  teams: {
    list: (orgId: string) =>
      fetcher<import('@aegisops/types').TeamSummary[]>(
        `/api/v1/organizations/${orgId}/teams`,
      ),

    get: (orgId: string, teamId: string) =>
      fetcher<import('@aegisops/types').TeamSummary & { members: import('@aegisops/types').TeamMemberSummary[] }>(
        `/api/v1/organizations/${orgId}/teams/${teamId}`,
      ),

    create: (orgId: string, payload: import('@aegisops/types').CreateTeamDto) =>
      fetcher<import('@aegisops/types').TeamSummary>(
        `/api/v1/organizations/${orgId}/teams`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      ),

    update: (orgId: string, teamId: string, payload: import('@aegisops/types').UpdateTeamDto) =>
      fetcher<import('@aegisops/types').TeamSummary>(
        `/api/v1/organizations/${orgId}/teams/${teamId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        },
      ),

    delete: (orgId: string, teamId: string) =>
      fetcher<{ success: boolean; message: string }>(
        `/api/v1/organizations/${orgId}/teams/${teamId}`,
        {
          method: 'DELETE',
        },
      ),

    addMember: (orgId: string, teamId: string, payload: import('@aegisops/types').AddTeamMemberDto) =>
      fetcher<import('@aegisops/types').TeamMemberSummary>(
        `/api/v1/organizations/${orgId}/teams/${teamId}/members`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      ),

    removeMember: (orgId: string, teamId: string, membershipId: string) =>
      fetcher<{ success: boolean; message: string }>(
        `/api/v1/organizations/${orgId}/teams/${teamId}/members/${membershipId}`,
        {
          method: 'DELETE',
        },
      ),
  },

  services: {
    list: (
      orgId: string,
      query?: import('@aegisops/types').ServiceFilterQuery,
    ) => {
      const searchParams = new URLSearchParams();
      if (query?.search) searchParams.set('search', query.search);
      if (query?.tier) searchParams.set('tier', query.tier);
      if (query?.serviceType) searchParams.set('serviceType', query.serviceType);
      if (query?.lifecycleStatus) searchParams.set('lifecycleStatus', query.lifecycleStatus);
      if (query?.ownerTeamId) searchParams.set('ownerTeamId', query.ownerTeamId);
      if (query?.healthStatus) searchParams.set('healthStatus', query.healthStatus);
      if (query?.page) searchParams.set('page', String(query.page));
      if (query?.limit) searchParams.set('limit', String(query.limit));
      const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
      return fetcher<{
        items: import('@aegisops/types').ServiceSummary[];
        total: number;
        page: number;
        limit: number;
      }>(`/api/v1/organizations/${orgId}/services${qs}`);
    },

    get: (orgId: string, serviceId: string) =>
      fetcher<import('@aegisops/types').ServiceDetail>(
        `/api/v1/organizations/${orgId}/services/${serviceId}`,
      ),

    create: (orgId: string, payload: import('@aegisops/types').CreateServiceDto) =>
      fetcher<import('@aegisops/types').ServiceSummary>(
        `/api/v1/organizations/${orgId}/services`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      ),

    update: (orgId: string, serviceId: string, payload: import('@aegisops/types').UpdateServiceDto) =>
      fetcher<import('@aegisops/types').ServiceSummary>(
        `/api/v1/organizations/${orgId}/services/${serviceId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        },
      ),

    updateLifecycle: (
      orgId: string,
      serviceId: string,
      payload: import('@aegisops/types').UpdateServiceLifecycleDto,
    ) =>
      fetcher<import('@aegisops/types').ServiceSummary>(
        `/api/v1/organizations/${orgId}/services/${serviceId}/lifecycle`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        },
      ),

    delete: (orgId: string, serviceId: string) =>
      fetcher<{ success: boolean; message: string }>(
        `/api/v1/organizations/${orgId}/services/${serviceId}`,
        {
          method: 'DELETE',
        },
      ),
  },

  environments: {
    list: (orgId: string, serviceId: string) =>
      fetcher<import('@aegisops/types').EnvironmentSummary[]>(
        `/api/v1/organizations/${orgId}/services/${serviceId}/environments`,
      ),

    create: (
      orgId: string,
      serviceId: string,
      payload: import('@aegisops/types').CreateEnvironmentDto,
    ) =>
      fetcher<import('@aegisops/types').EnvironmentSummary>(
        `/api/v1/organizations/${orgId}/services/${serviceId}/environments`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      ),

    update: (
      orgId: string,
      envId: string,
      payload: import('@aegisops/types').UpdateEnvironmentDto,
    ) =>
      fetcher<import('@aegisops/types').EnvironmentSummary>(
        `/api/v1/organizations/${orgId}/environments/${envId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        },
      ),

    delete: (orgId: string, envId: string) =>
      fetcher<{ success: boolean; message: string }>(
        `/api/v1/organizations/${orgId}/environments/${envId}`,
        {
          method: 'DELETE',
        },
      ),
  },

  dependencies: {
    list: (orgId: string, serviceId: string) =>
      fetcher<import('@aegisops/types').ServiceDependenciesResponse>(
        `/api/v1/organizations/${orgId}/services/${serviceId}/dependencies`,
      ),

    create: (
      orgId: string,
      serviceId: string,
      payload: import('@aegisops/types').CreateDependencyDto,
    ) =>
      fetcher<import('@aegisops/types').DependencySummary>(
        `/api/v1/organizations/${orgId}/services/${serviceId}/dependencies`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      ),

    remove: (orgId: string, serviceId: string, targetServiceId: string) =>
      fetcher<{ success: boolean; message: string }>(
        `/api/v1/organizations/${orgId}/services/${serviceId}/dependencies/${targetServiceId}`,
        {
          method: 'DELETE',
        },
      ),

    getGraph: (orgId: string) =>
      fetcher<import('@aegisops/types').DependencyGraph>(
        `/api/v1/organizations/${orgId}/dependency-graph`,
      ),
  },

  healthProbes: {
    list: (orgId: string, serviceId: string) =>
      fetcher<import('@aegisops/types').HealthProbeSummary[]>(
        `/api/v1/organizations/${orgId}/services/${serviceId}/health-probes`,
      ),

    create: (
      orgId: string,
      serviceId: string,
      payload: import('@aegisops/types').CreateHealthProbeDto,
    ) =>
      fetcher<import('@aegisops/types').HealthProbeSummary>(
        `/api/v1/organizations/${orgId}/services/${serviceId}/health-probes`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      ),

    update: (
      orgId: string,
      probeId: string,
      payload: import('@aegisops/types').UpdateHealthProbeDto,
    ) =>
      fetcher<import('@aegisops/types').HealthProbeSummary>(
        `/api/v1/organizations/${orgId}/health-probes/${probeId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        },
      ),

    delete: (orgId: string, probeId: string) =>
      fetcher<{ success: boolean; message: string }>(
        `/api/v1/organizations/${orgId}/health-probes/${probeId}`,
        {
          method: 'DELETE',
        },
      ),

    runNow: (orgId: string, probeId: string) =>
      fetcher<{ message: string; run: import('@aegisops/types').HealthProbeRunSummary }>(
        `/api/v1/organizations/${orgId}/health-probes/${probeId}/run-now`,
        {
          method: 'POST',
        },
      ),

    listRuns: (
      orgId: string,
      probeId: string,
      params?: { page?: number; limit?: number },
    ) => {
      const searchParams = new URLSearchParams();
      if (params?.page) searchParams.set('page', String(params.page));
      if (params?.limit) searchParams.set('limit', String(params.limit));
      const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
      return fetcher<{
        items: import('@aegisops/types').HealthProbeRunSummary[];
        total: number;
        page: number;
        limit: number;
      }>(`/api/v1/organizations/${orgId}/health-probes/${probeId}/runs${qs}`);
    },

    getServiceHealth: (orgId: string, serviceId: string) =>
      fetcher<{
        serviceId: string;
        serviceName: string;
        status: import('@aegisops/types').ServiceHealthStatus;
        environments: Array<{
          environmentId: string;
          environmentName: string;
          isProduction: boolean;
          status: import('@aegisops/types').ServiceHealthStatus;
          probeCount: number;
        }>;
      }>(`/api/v1/organizations/${orgId}/services/${serviceId}/health`),
  },

  telemetry: {
    listKeys: (orgId: string, serviceId: string, environmentId?: string) => {
      const qs = environmentId ? `?environmentId=${encodeURIComponent(environmentId)}` : '';
      return fetcher<import('@aegisops/types').TelemetryIngestKeySummary[]>(
        `/api/v1/organizations/${orgId}/services/${serviceId}/telemetry-keys${qs}`,
      );
    },

    createKey: (
      orgId: string,
      serviceId: string,
      payload: { name: string; environmentId: string; rateLimitRpm?: number; rateLimitPts?: number; expiresAt?: string },
    ) =>
      fetcher<import('@aegisops/types').TelemetryKeyCreatedResponse>(
        `/api/v1/organizations/${orgId}/services/${serviceId}/telemetry-keys`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      ),

    revokeKey: (orgId: string, serviceId: string, keyId: string) =>
      fetcher<import('@aegisops/types').TelemetryIngestKeySummary>(
        `/api/v1/organizations/${orgId}/services/${serviceId}/telemetry-keys/${keyId}`,
        {
          method: 'DELETE',
        },
      ),

    getStatus: (orgId: string, serviceId: string) =>
      fetcher<import('@aegisops/types').TelemetryStatusResponse>(
        `/api/v1/organizations/${orgId}/services/${serviceId}/telemetry/status`,
      ),

    getDefinitions: (
      orgId: string,
      serviceId: string,
      params?: { environmentId?: string; search?: string },
    ) => {
      const searchParams = new URLSearchParams();
      if (params?.environmentId) searchParams.set('environmentId', params.environmentId);
      if (params?.search) searchParams.set('search', params.search);
      const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
      return fetcher<import('@aegisops/types').MetricDefinitionSummary[]>(
        `/api/v1/organizations/${orgId}/services/${serviceId}/metrics/definitions${qs}`,
      );
    },

    queryMetrics: (
      orgId: string,
      serviceId: string,
      payload: {
        environmentId: string;
        metricNames: string[];
        seriesHash?: string;
        startTime: string;
        endTime: string;
        resolution?: string;
        limit?: number;
      },
    ) =>
      fetcher<import('@aegisops/types').MetricTimeseriesResponse>(
        `/api/v1/organizations/${orgId}/services/${serviceId}/metrics/query`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      ),
  },

  alerts: {
    listRules: (
      orgId: string,
      params?: {
        serviceId?: string;
        environmentId?: string;
        status?: string;
        severity?: string;
        search?: string;
        limit?: number;
        offset?: number;
      },
    ) => {
      const searchParams = new URLSearchParams();
      if (params?.serviceId) searchParams.set('serviceId', params.serviceId);
      if (params?.environmentId) searchParams.set('environmentId', params.environmentId);
      if (params?.status) searchParams.set('status', params.status);
      if (params?.severity) searchParams.set('severity', params.severity);
      if (params?.search) searchParams.set('search', params.search);
      if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
      if (params?.offset !== undefined) searchParams.set('offset', String(params.offset));
      const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
      return fetcher<{ rules: import('@aegisops/types').AlertRuleSummary[]; total: number }>(
        `/api/v1/organizations/${orgId}/alert-rules${qs}`,
      );
    },

    createRule: (
      orgId: string,
      serviceId: string,
      environmentId: string,
      payload: import('@aegisops/types').CreateAlertRuleDto,
    ) =>
      fetcher<import('@aegisops/types').AlertRuleSummary>(
        `/api/v1/organizations/${orgId}/services/${serviceId}/environments/${environmentId}/alert-rules`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      ),

    getRule: (orgId: string, ruleId: string) =>
      fetcher<import('@aegisops/types').AlertRuleDetail>(
        `/api/v1/organizations/${orgId}/alert-rules/${ruleId}`,
      ),

    updateRule: (
      orgId: string,
      ruleId: string,
      payload: import('@aegisops/types').UpdateAlertRuleDto,
    ) =>
      fetcher<import('@aegisops/types').AlertRuleSummary>(
        `/api/v1/organizations/${orgId}/alert-rules/${ruleId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        },
      ),

    enableRule: (orgId: string, ruleId: string) =>
      fetcher<import('@aegisops/types').AlertRuleSummary>(
        `/api/v1/organizations/${orgId}/alert-rules/${ruleId}/enable`,
        {
          method: 'POST',
        },
      ),

    disableRule: (orgId: string, ruleId: string) =>
      fetcher<import('@aegisops/types').AlertRuleSummary>(
        `/api/v1/organizations/${orgId}/alert-rules/${ruleId}/disable`,
        {
          method: 'POST',
        },
      ),

    archiveRule: (orgId: string, ruleId: string) =>
      fetcher<import('@aegisops/types').AlertRuleSummary>(
        `/api/v1/organizations/${orgId}/alert-rules/${ruleId}`,
        {
          method: 'DELETE',
        },
      ),

    evaluateNow: (orgId: string, ruleId: string) =>
      fetcher<{ message: string; runId: string; jobId: string }>(
        `/api/v1/organizations/${orgId}/alert-rules/${ruleId}/evaluate`,
        {
          method: 'POST',
        },
      ),

    previewRule: (
      orgId: string,
      payload: import('@aegisops/types').AlertPreviewRequest,
    ) =>
      fetcher<import('@aegisops/types').AlertPreviewResponse>(
        `/api/v1/organizations/${orgId}/alert-rules/preview`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      ),

    getRuleEvaluations: (orgId: string, ruleId: string, limit?: number) => {
      const qs = limit ? `?limit=${limit}` : '';
      return fetcher<import('@aegisops/types').AlertEvaluationSummary[]>(
        `/api/v1/organizations/${orgId}/alert-rules/${ruleId}/evaluations${qs}`,
      );
    },

    listAlerts: (
      orgId: string,
      params?: {
        serviceId?: string;
        environmentId?: string;
        ruleId?: string;
        state?: string;
        severity?: string;
        search?: string;
        limit?: number;
        offset?: number;
      },
    ) => {
      const searchParams = new URLSearchParams();
      if (params?.serviceId) searchParams.set('serviceId', params.serviceId);
      if (params?.environmentId) searchParams.set('environmentId', params.environmentId);
      if (params?.ruleId) searchParams.set('ruleId', params.ruleId);
      if (params?.state) searchParams.set('state', params.state);
      if (params?.severity) searchParams.set('severity', params.severity);
      if (params?.search) searchParams.set('search', params.search);
      if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
      if (params?.offset !== undefined) searchParams.set('offset', String(params.offset));
      const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
      return fetcher<{ alerts: import('@aegisops/types').AlertInstanceSummary[]; total: number }>(
        `/api/v1/organizations/${orgId}/alerts${qs}`,
      );
    },

    getAlert: (orgId: string, alertInstanceId: string) =>
      fetcher<import('@aegisops/types').AlertInstanceDetail>(
        `/api/v1/organizations/${orgId}/alerts/${alertInstanceId}`,
      ),

    getAlertEvents: (orgId: string, alertInstanceId: string, limit?: number) => {
      const qs = limit ? `?limit=${limit}` : '';
      return fetcher<import('@aegisops/types').AlertEventSummary[]>(
        `/api/v1/organizations/${orgId}/alerts/${alertInstanceId}/events${qs}`,
      );
    },
  },

  incidents: {
    list: (
      orgId: string,
      params?: {
        status?: string;
        severity?: string;
        serviceId?: string;
        environmentId?: string;
        commanderMembershipId?: string;
        source?: string;
        signalsCleared?: boolean;
        search?: string;
        limit?: number;
        offset?: number;
      },
    ) => {
      const searchParams = new URLSearchParams();
      if (params?.status) searchParams.set('status', params.status);
      if (params?.severity) searchParams.set('severity', params.severity);
      if (params?.serviceId) searchParams.set('serviceId', params.serviceId);
      if (params?.environmentId) searchParams.set('environmentId', params.environmentId);
      if (params?.commanderMembershipId)
        searchParams.set('commanderMembershipId', params.commanderMembershipId);
      if (params?.source) searchParams.set('source', params.source);
      if (params?.signalsCleared !== undefined)
        searchParams.set('signalsCleared', String(params.signalsCleared));
      if (params?.search) searchParams.set('search', params.search);
      if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
      if (params?.offset !== undefined) searchParams.set('offset', String(params.offset));
      const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
      return fetcher<{
        incidents: import('@aegisops/types').IncidentSummary[];
        total: number;
      }>(`/api/v1/organizations/${orgId}/incidents${qs}`);
    },

    get: (orgId: string, incidentId: string) =>
      fetcher<import('@aegisops/types').IncidentDetail>(
        `/api/v1/organizations/${orgId}/incidents/${incidentId}`,
      ),

    create: (orgId: string, payload: import('@aegisops/types').CreateIncidentDto) =>
      fetcher<import('@aegisops/types').IncidentSummary>(
        `/api/v1/organizations/${orgId}/incidents`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      ),

    acknowledge: (
      orgId: string,
      incidentId: string,
      payload: import('@aegisops/types').AcknowledgeIncidentDto = {},
    ) =>
      fetcher<import('@aegisops/types').IncidentSummary>(
        `/api/v1/organizations/${orgId}/incidents/${incidentId}/acknowledge`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      ),

    transition: (
      orgId: string,
      incidentId: string,
      payload: import('@aegisops/types').TransitionIncidentDto,
    ) =>
      fetcher<import('@aegisops/types').IncidentSummary>(
        `/api/v1/organizations/${orgId}/incidents/${incidentId}/transition`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      ),

    resolve: (
      orgId: string,
      incidentId: string,
      payload: import('@aegisops/types').ResolveIncidentDto,
    ) =>
      fetcher<import('@aegisops/types').IncidentSummary>(
        `/api/v1/organizations/${orgId}/incidents/${incidentId}/resolve`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      ),

    reopen: (
      orgId: string,
      incidentId: string,
      payload: import('@aegisops/types').ReopenIncidentDto,
    ) =>
      fetcher<import('@aegisops/types').IncidentSummary>(
        `/api/v1/organizations/${orgId}/incidents/${incidentId}/reopen`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      ),

    assignCommander: (
      orgId: string,
      incidentId: string,
      payload: import('@aegisops/types').AssignCommanderDto,
    ) =>
      fetcher<import('@aegisops/types').IncidentSummary>(
        `/api/v1/organizations/${orgId}/incidents/${incidentId}/commander`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        },
      ),

    addResponder: (
      orgId: string,
      incidentId: string,
      payload: import('@aegisops/types').AddResponderDto,
    ) =>
      fetcher<import('@aegisops/types').IncidentResponderSummary>(
        `/api/v1/organizations/${orgId}/incidents/${incidentId}/responders`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      ),

    removeResponder: (orgId: string, incidentId: string, membershipId: string) =>
      fetcher<void>(
        `/api/v1/organizations/${orgId}/incidents/${incidentId}/responders/${membershipId}`,
        {
          method: 'DELETE',
        },
      ),

    addNote: (
      orgId: string,
      incidentId: string,
      payload: import('@aegisops/types').AddIncidentNoteDto,
    ) =>
      fetcher<import('@aegisops/types').IncidentTimelineEventSummary>(
        `/api/v1/organizations/${orgId}/incidents/${incidentId}/notes`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      ),

    getTimeline: (orgId: string, incidentId: string, limit?: number, offset?: number) => {
      const searchParams = new URLSearchParams();
      if (limit !== undefined) searchParams.set('limit', String(limit));
      if (offset !== undefined) searchParams.set('offset', String(offset));
      const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
      return fetcher<{
        events: import('@aegisops/types').IncidentTimelineEventSummary[];
        total: number;
      }>(`/api/v1/organizations/${orgId}/incidents/${incidentId}/timeline${qs}`);
    },

    getAlerts: (orgId: string, incidentId: string) =>
      fetcher<import('@aegisops/types').IncidentAlertSummary[]>(
        `/api/v1/organizations/${orgId}/incidents/${incidentId}/alerts`,
      ),

    attachAlert: (
      orgId: string,
      incidentId: string,
      payload: import('@aegisops/types').AttachAlertDto,
    ) =>
      fetcher<import('@aegisops/types').IncidentAlertSummary>(
        `/api/v1/organizations/${orgId}/incidents/${incidentId}/alerts`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      ),

    unlinkAlert: (
      orgId: string,
      incidentId: string,
      incidentAlertId: string,
      payload: import('@aegisops/types').UnlinkAlertDto,
    ) =>
      fetcher<void>(
        `/api/v1/organizations/${orgId}/incidents/${incidentId}/alerts/${incidentAlertId}`,
        {
          method: 'DELETE',
          body: JSON.stringify(payload),
        },
      ),

    updateSeverity: (
      orgId: string,
      incidentId: string,
      payload: import('@aegisops/types').UpdateSeverityDto,
    ) =>
      fetcher<import('@aegisops/types').IncidentSummary>(
        `/api/v1/organizations/${orgId}/incidents/${incidentId}/severity`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        },
      ),
  },

  operations: {
    getOverview: (orgId: string) =>
      fetcher<import('@aegisops/types').OperationsOverview>(
        `/api/v1/organizations/${orgId}/operations/overview`,
      ),
  },

  rca: {
    triggerAnalysis: (orgId: string, incidentId: string, options?: { force?: boolean; sync?: boolean }) =>
      fetcher<import('@aegisops/types').IncidentAnalysis>(
        `/api/v1/organizations/${orgId}/incidents/${incidentId}/analysis`,
        {
          method: 'POST',
          body: JSON.stringify(options || {}),
        },
      ),

    getLatestAnalysis: (orgId: string, incidentId: string) =>
      fetcher<import('@aegisops/types').IncidentAnalysis | null>(
        `/api/v1/organizations/${orgId}/incidents/${incidentId}/analysis`,
      ),

    getAnalysisHistory: (orgId: string, incidentId: string) =>
      fetcher<import('@aegisops/types').IncidentAnalysis[]>(
        `/api/v1/organizations/${orgId}/incidents/${incidentId}/analysis/history`,
      ),

    confirmRootCause: (
      orgId: string,
      incidentId: string,
      hypothesisId: string,
      summary?: string,
    ) =>
      fetcher<import('@aegisops/types').IncidentAnalysis>(
        `/api/v1/organizations/${orgId}/incidents/${incidentId}/hypotheses/${hypothesisId}/confirm`,
        {
          method: 'POST',
          body: JSON.stringify({ summary }),
        },
      ),

    rejectHypothesis: (
      orgId: string,
      incidentId: string,
      hypothesisId: string,
      rejectionReason: string,
    ) =>
      fetcher<import('@aegisops/types').IncidentHypothesis>(
        `/api/v1/organizations/${orgId}/incidents/${incidentId}/hypotheses/${hypothesisId}/reject`,
        {
          method: 'POST',
          body: JSON.stringify({ rejectionReason }),
        },
      ),
  },

  runbooks: {
    getRunbooks: (orgId: string, serviceId?: string) => {
      const query = serviceId ? `?serviceId=${encodeURIComponent(serviceId)}` : '';
      return fetcher<import('@aegisops/types').Runbook[]>(
        `/api/v1/organizations/${orgId}/runbooks${query}`,
      );
    },

    getRunbookById: (orgId: string, runbookId: string) =>
      fetcher<import('@aegisops/types').Runbook>(
        `/api/v1/organizations/${orgId}/runbooks/${runbookId}`,
      ),

    createRunbook: (orgId: string, payload: import('@aegisops/types').CreateRunbookDto) =>
      fetcher<import('@aegisops/types').Runbook>(
        `/api/v1/organizations/${orgId}/runbooks`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      ),

    updateRunbook: (
      orgId: string,
      runbookId: string,
      payload: import('@aegisops/types').UpdateRunbookDto,
    ) =>
      fetcher<import('@aegisops/types').Runbook>(
        `/api/v1/organizations/${orgId}/runbooks/${runbookId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        },
      ),

    deleteRunbook: (orgId: string, runbookId: string) =>
      fetcher<void>(`/api/v1/organizations/${orgId}/runbooks/${runbookId}`, {
        method: 'DELETE',
      }),

    startExecution: (orgId: string, incidentId: string, runbookId: string) =>
      fetcher<import('@aegisops/types').RunbookExecution>(
        `/api/v1/organizations/${orgId}/incidents/${incidentId}/runbooks/${runbookId}/start`,
        {
          method: 'POST',
        },
      ),

    getExecutions: (orgId: string, incidentId: string) =>
      fetcher<import('@aegisops/types').RunbookExecution[]>(
        `/api/v1/organizations/${orgId}/incidents/${incidentId}/runbook-executions`,
      ),

    completeExecutionStep: (
      orgId: string,
      incidentId: string,
      executionId: string,
      stepId: string,
      note?: string,
    ) =>
      fetcher<import('@aegisops/types').RunbookExecutionStep>(
        `/api/v1/organizations/${orgId}/incidents/${incidentId}/runbook-executions/${executionId}/steps/${stepId}/complete`,
        {
          method: 'POST',
          body: JSON.stringify({ note }),
        },
      ),

    cancelExecution: (orgId: string, incidentId: string, executionId: string) =>
      fetcher<import('@aegisops/types').RunbookExecution>(
        `/api/v1/organizations/${orgId}/incidents/${incidentId}/runbook-executions/${executionId}/cancel`,
        {
          method: 'POST',
        },
      ),
  },

  anomalies: {
    listDetectors: (orgId: string, serviceId?: string, environmentId?: string) => {
      const searchParams = new URLSearchParams();
      if (serviceId) searchParams.set('serviceId', serviceId);
      if (environmentId) searchParams.set('environmentId', environmentId);
      const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
      return fetcher<import('@aegisops/types').AnomalyDetectorSummary[]>(
        `/api/v1/organizations/${orgId}/anomaly-detectors${qs}`,
      );
    },

    getDetector: (orgId: string, detectorId: string) =>
      fetcher<import('@aegisops/types').AnomalyDetectorDetail>(
        `/api/v1/organizations/${orgId}/anomaly-detectors/${detectorId}`,
      ),

    createDetector: (orgId: string, payload: import('@aegisops/types').CreateAnomalyDetectorDto) =>
      fetcher<import('@aegisops/types').AnomalyDetectorSummary>(
        `/api/v1/organizations/${orgId}/anomaly-detectors`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      ),

    updateDetector: (
      orgId: string,
      detectorId: string,
      payload: import('@aegisops/types').UpdateAnomalyDetectorDto,
    ) =>
      fetcher<import('@aegisops/types').AnomalyDetectorSummary>(
        `/api/v1/organizations/${orgId}/anomaly-detectors/${detectorId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        },
      ),

    archiveDetector: (orgId: string, detectorId: string) =>
      fetcher<void>(`/api/v1/organizations/${orgId}/anomaly-detectors/${detectorId}`, {
        method: 'DELETE',
      }),

    triggerTraining: (orgId: string, detectorId: string) =>
      fetcher<{ queued: boolean }>(
        `/api/v1/organizations/${orgId}/anomaly-detectors/${detectorId}/train`,
        {
          method: 'POST',
        },
      ),

    backtest: (orgId: string, detectorId: string, hours = 24) =>
      fetcher<import('@aegisops/types').AnomalyBacktestResult>(
        `/api/v1/organizations/${orgId}/anomaly-detectors/${detectorId}/backtest`,
        {
          method: 'POST',
          body: JSON.stringify({ hours }),
        },
      ),

    listFindings: (
      orgId: string,
      query?: { serviceId?: string; state?: import('@aegisops/types').AnomalyFindingState; limit?: number },
    ) => {
      const searchParams = new URLSearchParams();
      if (query?.serviceId) searchParams.set('serviceId', query.serviceId);
      if (query?.state) searchParams.set('state', query.state);
      if (query?.limit) searchParams.set('limit', String(query.limit));
      const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
      return fetcher<import('@aegisops/types').AnomalyFindingSummary[]>(
        `/api/v1/organizations/${orgId}/anomalies/findings${qs}`,
      );
    },

    getFinding: (orgId: string, findingId: string) =>
      fetcher<import('@aegisops/types').AnomalyFindingDetail>(
        `/api/v1/organizations/${orgId}/anomalies/findings/${findingId}`,
      ),

    submitFeedback: (
      orgId: string,
      findingId: string,
      payload: import('@aegisops/types').AnomalyFeedbackDto,
    ) =>
      fetcher<import('@aegisops/types').AnomalyFeedbackSummary>(
        `/api/v1/organizations/${orgId}/anomalies/findings/${findingId}/feedback`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      ),
  },

  notifications: {
    list: (
      orgId: string,
      query?: { unreadOnly?: boolean; limit?: number; offset?: number },
    ) => {
      const sp = new URLSearchParams();
      if (query?.unreadOnly) sp.set('unreadOnly', 'true');
      if (query?.limit) sp.set('limit', String(query.limit));
      if (query?.offset) sp.set('offset', String(query.offset));
      const qs = sp.toString() ? `?${sp.toString()}` : '';
      return fetcher<{
        items: Array<{
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
        }>;
        totalCount: number;
        unreadCount: number;
        hasMore: boolean;
      }>(`/api/v1/organizations/${orgId}/notifications${qs}`);
    },

    markAsRead: (orgId: string, notificationId: string) =>
      fetcher<{ success: boolean; readAt: string; unreadCount: number }>(
        `/api/v1/organizations/${orgId}/notifications/${notificationId}/read`,
        { method: 'POST' },
      ),

    markAllAsRead: (orgId: string) =>
      fetcher<{ success: boolean; unreadCount: number }>(
        `/api/v1/organizations/${orgId}/notifications/read-all`,
        { method: 'POST' },
      ),

    getPreferences: (orgId: string) =>
      fetcher<Array<{
        id?: string;
        channel: 'IN_APP' | 'EMAIL' | 'SLACK' | 'WEBHOOK';
        isEnabled: boolean;
        minSeverity: string;
      }>>(`/api/v1/organizations/${orgId}/notifications/preferences`),

    updatePreference: (
      orgId: string,
      payload: { channel: string; isEnabled: boolean; minSeverity?: string },
    ) =>
      fetcher(`/api/v1/organizations/${orgId}/notifications/preferences`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
  },

  integrations: {
    list: (orgId: string) =>
      fetcher<Array<{
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
      }>>(`/api/v1/organizations/${orgId}/integrations`),

    create: (
      orgId: string,
      payload: {
        name: string;
        type: string;
        description?: string;
        targetUrl: string;
        secret?: string;
        headers?: Record<string, string>;
        isEnabled?: boolean;
      },
    ) =>
      fetcher(`/api/v1/organizations/${orgId}/integrations`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    update: (
      orgId: string,
      id: string,
      payload: {
        name?: string;
        description?: string;
        targetUrl?: string;
        secret?: string;
        headers?: Record<string, string>;
        isEnabled?: boolean;
      },
    ) =>
      fetcher(`/api/v1/organizations/${orgId}/integrations/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),

    delete: (orgId: string, id: string) =>
      fetcher<{ success: boolean }>(`/api/v1/organizations/${orgId}/integrations/${id}`, {
        method: 'DELETE',
      }),

    test: (orgId: string, id: string) =>
      fetcher<{ success: boolean; error?: string; status?: number; durationMs?: number }>(
        `/api/v1/organizations/${orgId}/integrations/${id}/test`,
        { method: 'POST' },
      ),
  },

  notificationPolicies: {
    list: (orgId: string) =>
      fetcher<Array<{
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
      }>>(`/api/v1/organizations/${orgId}/notification-policies`),

    create: (orgId: string, payload: any) =>
      fetcher(`/api/v1/organizations/${orgId}/notification-policies`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    update: (orgId: string, id: string, payload: any) =>
      fetcher(`/api/v1/organizations/${orgId}/notification-policies/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),

    delete: (orgId: string, id: string) =>
      fetcher<{ success: boolean }>(`/api/v1/organizations/${orgId}/notification-policies/${id}`, {
        method: 'DELETE',
      }),
  },

  deliveries: {
    list: (
      orgId: string,
      query?: { status?: string; channel?: string; limit?: number; offset?: number },
    ) => {
      const sp = new URLSearchParams();
      if (query?.status) sp.set('status', query.status);
      if (query?.channel) sp.set('channel', query.channel);
      if (query?.limit) sp.set('limit', String(query.limit));
      if (query?.offset) sp.set('offset', String(query.offset));
      const qs = sp.toString() ? `?${sp.toString()}` : '';
      return fetcher<{
        items: Array<{
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
        }>;
        total: number;
        hasMore: boolean;
      }>(`/api/v1/organizations/${orgId}/notification-deliveries${qs}`);
    },
  },

  reliability: {
    getSummary: (orgId: string, timeRange: import('@aegisops/types').ReliabilityTimeRange = '30d') =>
      fetcher<import('@aegisops/types').OrganizationReliabilitySummary>(
        `/api/v1/organizations/${orgId}/reliability/summary?timeRange=${timeRange}`,
      ),

    getServiceSummary: (
      orgId: string,
      serviceId: string,
      timeRange: import('@aegisops/types').ReliabilityTimeRange = '30d',
    ) =>
      fetcher<import('@aegisops/types').ServiceReliabilitySummary>(
        `/api/v1/organizations/${orgId}/services/${serviceId}/reliability?timeRange=${timeRange}`,
      ),

    recomputeRollups: (
      orgId: string,
      payload?: { startDate?: string; endDate?: string; serviceId?: string },
    ) =>
      fetcher<{ processed: number; message: string }>(
        `/api/v1/organizations/${orgId}/reliability/rollup/recompute`,
        {
          method: 'POST',
          body: JSON.stringify(payload || {}),
        },
      ),
  },

  postmortems: {
    get: (orgId: string, incidentId: string) =>
      fetcher<import('@aegisops/types').IncidentPostmortemDetail | null>(
        `/api/v1/organizations/${orgId}/incidents/${incidentId}/postmortem`,
      ),

    generate: (orgId: string, incidentId: string) =>
      fetcher<import('@aegisops/types').IncidentPostmortemDetail>(
        `/api/v1/organizations/${orgId}/incidents/${incidentId}/postmortem/generate`,
        {
          method: 'POST',
        },
      ),

    update: (
      orgId: string,
      incidentId: string,
      dto: import('@aegisops/types').UpdatePostmortemDto,
    ) =>
      fetcher<import('@aegisops/types').IncidentPostmortemDetail>(
        `/api/v1/organizations/${orgId}/incidents/${incidentId}/postmortem`,
        {
          method: 'PATCH',
          body: JSON.stringify(dto),
        },
      ),

    submitReview: (orgId: string, incidentId: string) =>
      fetcher<import('@aegisops/types').IncidentPostmortemDetail>(
        `/api/v1/organizations/${orgId}/incidents/${incidentId}/postmortem/submit-review`,
        {
          method: 'POST',
        },
      ),

    approve: (
      orgId: string,
      incidentId: string,
      dto?: import('@aegisops/types').ApprovePostmortemDto,
    ) =>
      fetcher<import('@aegisops/types').IncidentPostmortemDetail>(
        `/api/v1/organizations/${orgId}/incidents/${incidentId}/postmortem/approve`,
        {
          method: 'POST',
          body: JSON.stringify(dto || {}),
        },
      ),

    getRevisions: (orgId: string, incidentId: string) =>
      fetcher<import('@aegisops/types').PostmortemRevisionSummary[]>(
        `/api/v1/organizations/${orgId}/incidents/${incidentId}/postmortem/revisions`,
      ),

    createActionItem: (
      orgId: string,
      incidentId: string,
      dto: import('@aegisops/types').CreatePostmortemActionItemDto,
    ) =>
      fetcher<import('@aegisops/types').PostmortemActionItemSummary>(
        `/api/v1/organizations/${orgId}/incidents/${incidentId}/postmortem/action-items`,
        {
          method: 'POST',
          body: JSON.stringify(dto),
        },
      ),

    updateActionItem: (
      orgId: string,
      incidentId: string,
      actionItemId: string,
      dto: import('@aegisops/types').UpdatePostmortemActionItemDto,
    ) =>
      fetcher<import('@aegisops/types').PostmortemActionItemSummary>(
        `/api/v1/organizations/${orgId}/incidents/${incidentId}/postmortem/action-items/${actionItemId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(dto),
        },
      ),

    deleteActionItem: (orgId: string, incidentId: string, actionItemId: string) =>
      fetcher<void>(
        `/api/v1/organizations/${orgId}/incidents/${incidentId}/postmortem/action-items/${actionItemId}`,
        {
          method: 'DELETE',
        },
      ),
  },
};



