export interface EnvironmentConfig {
  nodeEnv: string;
  port: number;
  apiBaseUrl: string;
  corsOrigins: string[];
  databaseUrl: string;
  redisUrl: string;
  aiServiceUrl: string;
}

export function validateEnvironment(): EnvironmentConfig {
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  const port = parseInt(process.env['API_PORT'] ?? process.env['PORT'] ?? '3001', 10);
  const apiBaseUrl = process.env['API_BASE_URL'] ?? `http://localhost:${port}`;
  const corsOrigins = (process.env['CORS_ORIGINS'] ?? 'http://localhost:3000').split(',').map(s => s.trim());
  const databaseUrl = process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@localhost:5432/aegisops_dev?schema=public';
  const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
  const aiServiceUrl = process.env['AI_SERVICE_URL'] ?? 'http://localhost:8000';

  return {
    nodeEnv,
    port,
    apiBaseUrl,
    corsOrigins,
    databaseUrl,
    redisUrl,
    aiServiceUrl,
  };
}
