import {
  aggregateEnvironmentHealth,
  aggregateServiceHealth,
  ProbeWithState,
  EnvironmentWithProbes,
} from './health-aggregation';

describe('Health Aggregation Engine', () => {
  describe('aggregateEnvironmentHealth', () => {
    it('returns UNKNOWN when no probes are configured', () => {
      expect(aggregateEnvironmentHealth([])).toBe('UNKNOWN');
      expect(aggregateEnvironmentHealth(undefined)).toBe('UNKNOWN');
    });

    it('returns UNKNOWN when all probes are disabled', () => {
      const probes: ProbeWithState[] = [
        { enabled: false, isCritical: false, state: { status: 'HEALTHY' } },
        { enabled: false, isCritical: true, state: { status: 'UNHEALTHY' } },
      ];
      expect(aggregateEnvironmentHealth(probes)).toBe('UNKNOWN');
    });

    it('returns HEALTHY when all enabled probes are healthy', () => {
      const probes: ProbeWithState[] = [
        { enabled: true, isCritical: false, state: { status: 'HEALTHY' } },
        { enabled: true, isCritical: true, state: { status: 'HEALTHY' } },
      ];
      expect(aggregateEnvironmentHealth(probes)).toBe('HEALTHY');
    });

    it('returns UNHEALTHY if any CRITICAL probe is unhealthy', () => {
      const probes: ProbeWithState[] = [
        { enabled: true, isCritical: false, state: { status: 'HEALTHY' } },
        { enabled: true, isCritical: true, state: { status: 'UNHEALTHY' } },
      ];
      expect(aggregateEnvironmentHealth(probes)).toBe('UNHEALTHY');
    });

    it('returns DEGRADED if non-critical probe is unhealthy but critical probe is healthy', () => {
      const probes: ProbeWithState[] = [
        { enabled: true, isCritical: false, state: { status: 'UNHEALTHY' } },
        { enabled: true, isCritical: true, state: { status: 'HEALTHY' } },
      ];
      expect(aggregateEnvironmentHealth(probes)).toBe('DEGRADED');
    });

    it('returns UNHEALTHY if all enabled probes are unhealthy even if none are critical', () => {
      const probes: ProbeWithState[] = [
        { enabled: true, isCritical: false, state: { status: 'UNHEALTHY' } },
        { enabled: true, isCritical: false, state: { status: 'UNHEALTHY' } },
      ];
      expect(aggregateEnvironmentHealth(probes)).toBe('UNHEALTHY');
    });
  });

  describe('aggregateServiceHealth', () => {
    it('returns UNKNOWN when no environments exist or all are inactive', () => {
      expect(aggregateServiceHealth([])).toBe('UNKNOWN');
      expect(
        aggregateServiceHealth([
          { id: 'env-1', isProduction: true, isActive: false, healthProbes: [] },
        ]),
      ).toBe('UNKNOWN');
    });

    it('prioritizes active PRODUCTION environment over staging/dev', () => {
      const environments: EnvironmentWithProbes[] = [
        {
          id: 'dev',
          isProduction: false,
          isActive: true,
          healthProbes: [
            { enabled: true, isCritical: true, state: { status: 'UNHEALTHY' } },
          ],
        },
        {
          id: 'prod',
          isProduction: true,
          isActive: true,
          healthProbes: [
            { enabled: true, isCritical: true, state: { status: 'HEALTHY' } },
          ],
        },
      ];
      // Dev is UNHEALTHY, but Prod is HEALTHY -> Service Health should be HEALTHY!
      expect(aggregateServiceHealth(environments)).toBe('HEALTHY');
    });

    it('reports UNHEALTHY if production environment is UNHEALTHY', () => {
      const environments: EnvironmentWithProbes[] = [
        {
          id: 'dev',
          isProduction: false,
          isActive: true,
          healthProbes: [
            { enabled: true, isCritical: false, state: { status: 'HEALTHY' } },
          ],
        },
        {
          id: 'prod',
          isProduction: true,
          isActive: true,
          healthProbes: [
            { enabled: true, isCritical: true, state: { status: 'UNHEALTHY' } },
          ],
        },
      ];
      expect(aggregateServiceHealth(environments)).toBe('UNHEALTHY');
    });

    it('derives from all active environments when no production environment exists', () => {
      const environments: EnvironmentWithProbes[] = [
        {
          id: 'dev',
          isProduction: false,
          isActive: true,
          healthProbes: [
            { enabled: true, isCritical: false, state: { status: 'DEGRADED' } },
          ],
        },
        {
          id: 'staging',
          isProduction: false,
          isActive: true,
          healthProbes: [
            { enabled: true, isCritical: false, state: { status: 'HEALTHY' } },
          ],
        },
      ];
      expect(aggregateServiceHealth(environments)).toBe('DEGRADED');
    });
  });
});

