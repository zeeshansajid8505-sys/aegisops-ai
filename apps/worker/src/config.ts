export interface WorkerConfig {
  redisHost: string;
  redisPort: number;
  concurrency: number;
  environment: string;
}

export function loadWorkerConfig(): WorkerConfig {
  return {
    redisHost: process.env['REDIS_HOST'] ?? 'localhost',
    redisPort: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
    concurrency: parseInt(process.env['WORKER_CONCURRENCY'] ?? '5', 10),
    environment: process.env['NODE_ENV'] ?? 'development',
  };
}
