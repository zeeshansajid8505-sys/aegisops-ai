import * as path from 'path';
import * as fs from 'fs';
import { BackgroundWorkerService } from './worker';

// Load environment variables
const envPaths = [
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../api/.env'),
  path.resolve(__dirname, '../../../.env'),
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath) && typeof (process as any).loadEnvFile === 'function') {
    try {
      (process as any).loadEnvFile(envPath);
      break;
    } catch {
      // ignore
    }
  }
}

const worker = new BackgroundWorkerService();

async function main() {
  await worker.start();

  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`[AegisOps Worker] Received ${signal}. Shutting down cleanly...`);
    await worker.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[AegisOps Worker] Fatal startup failure:', err);
  process.exit(1);
});
