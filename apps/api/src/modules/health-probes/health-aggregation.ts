import { ServiceHealthStatus } from '@prisma/client';

export interface ProbeWithState {
  enabled: boolean;
  isCritical: boolean;
  state?: {
    status: ServiceHealthStatus;
  } | null;
}

export interface EnvironmentWithProbes {
  id: string;
  isProduction: boolean;
  isActive: boolean;
  healthProbes?: ProbeWithState[];
}

/**
 * Aggregates environment health from enabled probes based on Step 30 policy:
 * - No enabled probes: UNKNOWN
 * - Any critical probe unhealthy: UNHEALTHY
 * - All enabled probes failing: UNHEALTHY
 * - All enabled probes healthy: HEALTHY
 * - Some probe degraded or non-critical unhealthy: DEGRADED
 */
export function aggregateEnvironmentHealth(probes?: ProbeWithState[]): ServiceHealthStatus {
  if (!probes || probes.length === 0) return 'UNKNOWN';

  const enabledProbes = probes.filter((p) => p.enabled);
  if (enabledProbes.length === 0) return 'UNKNOWN';

  // Check critical probes
  const criticalProbes = enabledProbes.filter((p) => p.isCritical);
  for (const cp of criticalProbes) {
    if (cp.state?.status === 'UNHEALTHY') {
      return 'UNHEALTHY';
    }
  }

  const statuses = enabledProbes.map((p) => p.state?.status || 'UNKNOWN');

  // If all are UNHEALTHY
  if (statuses.every((s) => s === 'UNHEALTHY')) {
    return 'UNHEALTHY';
  }

  // If all are HEALTHY
  if (statuses.every((s) => s === 'HEALTHY')) {
    return 'HEALTHY';
  }

  // If any is UNHEALTHY or DEGRADED
  if (statuses.some((s) => s === 'UNHEALTHY' || s === 'DEGRADED')) {
    return 'DEGRADED';
  }

  return 'UNKNOWN';
}

/**
 * Aggregates service health based on Step 31 policy:
 * - If one or more active PRODUCTION environments exist: derive from production environments.
 * - Otherwise: derive from all active environments.
 * - Severity ordering: UNHEALTHY > DEGRADED > UNKNOWN > HEALTHY.
 */
export function aggregateServiceHealth(environments?: EnvironmentWithProbes[]): ServiceHealthStatus {
  if (!environments || environments.length === 0) return 'UNKNOWN';

  const activeEnvs = environments.filter((e) => e.isActive);
  if (activeEnvs.length === 0) return 'UNKNOWN';

  const prodEnvs = activeEnvs.filter((e) => e.isProduction);
  const targetEnvs = prodEnvs.length > 0 ? prodEnvs : activeEnvs;

  const envStatuses = targetEnvs.map((env) =>
    aggregateEnvironmentHealth(env.healthProbes),
  );

  if (envStatuses.includes('UNHEALTHY')) return 'UNHEALTHY';
  if (envStatuses.includes('DEGRADED')) return 'DEGRADED';
  if (envStatuses.includes('UNKNOWN')) return 'UNKNOWN';
  if (envStatuses.every((s) => s === 'HEALTHY')) return 'HEALTHY';

  return 'UNKNOWN';
}

