// Phase 2: Service Catalog, Teams, Environments, Dependencies, Health Probes

export type TeamRole = 'LEAD' | 'MEMBER';

export interface TeamSummary {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description?: string | null;
  memberCount: number;
  ownedServiceCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMemberSummary {
  id: string;
  teamId: string;
  membershipId: string;
  role: TeamRole;
  user: {
    id: string;
    displayName: string;
    email: string;
  };
  createdAt: string;
}

export interface CreateTeamDto {
  name: string;
  slug?: string;
  description?: string;
}

export interface UpdateTeamDto {
  name?: string;
  description?: string;
}

export interface AddTeamMemberDto {
  membershipId: string;
  role?: TeamRole;
}

// Service Catalog
export type ServiceType =
  | 'WEB_APP'
  | 'API'
  | 'WORKER'
  | 'DATABASE'
  | 'QUEUE'
  | 'AI_SERVICE'
  | 'INTERNAL_SERVICE'
  | 'EXTERNAL_SERVICE'
  | 'OTHER';

export type ServiceTier = 'TIER_1' | 'TIER_2' | 'TIER_3';

export type ServiceLifecycle = 'DEVELOPMENT' | 'ACTIVE' | 'DEPRECATED' | 'RETIRED';

export type ServiceHealthStatus = 'UNKNOWN' | 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
export type HealthState = ServiceHealthStatus;

export interface ServiceSummary {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description?: string | null;
  serviceType: ServiceType;
  tier: ServiceTier;
  lifecycleStatus: ServiceLifecycle;
  ownerTeamId?: string | null;
  ownerTeam?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  healthStatus: ServiceHealthStatus;
  environmentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceDetail extends ServiceSummary {
  environments: EnvironmentSummary[];
  upstreamCount: number;
  downstreamCount: number;
  repositoryUrl?: string | null;
  documentationUrl?: string | null;
}

export interface CreateServiceDto {
  name: string;
  slug?: string;
  description?: string;
  serviceType: ServiceType;
  tier: ServiceTier;
  lifecycleStatus?: ServiceLifecycle;
  ownerTeamId?: string;
  repositoryUrl?: string;
  documentationUrl?: string;
}

export interface UpdateServiceDto {
  name?: string;
  description?: string;
  serviceType?: ServiceType;
  tier?: ServiceTier;
  ownerTeamId?: string | null;
  repositoryUrl?: string;
  documentationUrl?: string;
}

export interface UpdateServiceLifecycleDto {
  lifecycleStatus: ServiceLifecycle;
}

export interface ServiceFilterQuery {
  search?: string;
  tier?: ServiceTier;
  serviceType?: ServiceType;
  lifecycleStatus?: ServiceLifecycle;
  ownerTeamId?: string;
  healthStatus?: ServiceHealthStatus;
  page?: number;
  limit?: number;
}

// Environments
export type EnvironmentKind = 'PRODUCTION' | 'STAGING' | 'DEVELOPMENT' | 'TEST' | 'CUSTOM';

export interface EnvironmentSummary {
  id: string;
  organizationId: string;
  serviceId: string;
  name: string;
  key: string;
  kind: EnvironmentKind;
  baseUrl?: string | null;
  isProduction: boolean;
  isActive: boolean;
  healthStatus: ServiceHealthStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEnvironmentDto {
  name: string;
  key?: string;
  kind: EnvironmentKind;
  baseUrl?: string;
  isProduction?: boolean;
}

export interface UpdateEnvironmentDto {
  name?: string;
  baseUrl?: string;
  isProduction?: boolean;
  isActive?: boolean;
}

// Dependencies
export type DependencyType =
  | 'SYNCHRONOUS'
  | 'ASYNCHRONOUS'
  | 'DATA'
  | 'INFRASTRUCTURE'
  | 'OTHER';

export interface DependencySummary {
  id: string;
  organizationId: string;
  sourceServiceId: string;
  targetServiceId: string;
  sourceService?: {
    id: string;
    name: string;
    slug: string;
    tier: ServiceTier;
    healthStatus: ServiceHealthStatus;
  };
  targetService?: {
    id: string;
    name: string;
    slug: string;
    tier: ServiceTier;
    healthStatus: ServiceHealthStatus;
  };
  dependencyType: DependencyType;
  isCritical: boolean;
  description?: string | null;
  createdAt: string;
}

export interface CreateDependencyDto {
  targetServiceId: string;
  dependencyType?: DependencyType;
  isCritical?: boolean;
  description?: string;
}

export interface DependencyNode {
  id: string;
  name: string;
  slug: string;
  tier: ServiceTier;
  serviceType: ServiceType;
  healthStatus: ServiceHealthStatus;
  ownerTeamName?: string | null;
}

export interface DependencyEdge {
  id: string;
  source: string;
  target: string;
  dependencyType: DependencyType;
  isCritical: boolean;
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}

export interface ServiceDependenciesResponse {
  upstream: ServiceSummary[];
  downstream: ServiceSummary[];
}

// Health Probes
export type ProbeType = 'HTTP' | 'GRPC';

export interface HealthProbeStateSummary {
  status: ServiceHealthStatus;
  consecutiveSuccesses: number;
  consecutiveFailures: number;
  lastCheckedAt?: string | null;
  lastSuccessfulAt?: string | null;
  lastFailedAt?: string | null;
  lastLatencyMs?: number | null;
  lastFailureCode?: string | null;
}

export interface HealthProbeSummary {
  id: string;
  organizationId: string;
  serviceId: string;
  environmentId: string;
  environmentName?: string;
  name: string;
  probeType: ProbeType;
  enabled: boolean;
  isCritical: boolean;
  intervalSeconds: number;
  timeoutMs: number;
  failureThreshold: number;
  successThreshold: number;
  httpMethod?: string;
  httpPath?: string;
  httpExpectedStatusMin?: number;
  httpExpectedStatusMax?: number;
  grpcHost?: string | null;
  grpcService?: string | null;
  grpcUseTls?: boolean;
  state?: HealthProbeStateSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface HealthProbeRunSummary {
  id: string;
  organizationId: string;
  probeId: string;
  serviceId: string;
  environmentId: string;
  status: ServiceHealthStatus;
  startedAt: string;
  completedAt: string;
  latencyMs?: number | null;
  httpStatusCode?: number | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  createdAt: string;
}

export interface CreateHealthProbeDto {
  name: string;
  environmentId: string;
  probeType: ProbeType;
  enabled?: boolean;
  isCritical?: boolean;
  intervalSeconds?: number;
  timeoutMs?: number;
  failureThreshold?: number;
  successThreshold?: number;
  httpMethod?: string;
  httpPath?: string;
  httpExpectedStatusMin?: number;
  httpExpectedStatusMax?: number;
  grpcHost?: string;
  grpcService?: string;
  grpcUseTls?: boolean;
}

export interface UpdateHealthProbeDto {
  name?: string;
  enabled?: boolean;
  isCritical?: boolean;
  intervalSeconds?: number;
  timeoutMs?: number;
  failureThreshold?: number;
  successThreshold?: number;
  httpMethod?: string;
  httpPath?: string;
  httpExpectedStatusMin?: number;
  httpExpectedStatusMax?: number;
  grpcHost?: string;
  grpcService?: string;
  grpcUseTls?: boolean;
}
