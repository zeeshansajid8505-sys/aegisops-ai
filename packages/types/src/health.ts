export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface ComponentHealth {
  status: HealthStatus;
  message?: string;
  details?: Record<string, unknown>;
  latencyMs?: number;
}

export interface SystemHealthResponse {
  status: HealthStatus;
  service: string;
  version: string;
  timestamp: string;
  uptimeSeconds: number;
  components: Record<string, ComponentHealth>;
}
