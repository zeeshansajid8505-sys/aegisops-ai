import { parseArgs } from 'util';
import { TelemetryAgent, AgentOptions } from './agent';
import { ScenarioName } from './scenarios';

async function main() {
  const { values } = parseArgs({
    options: {
      endpoint: {
        type: 'string',
        short: 'e',
        default: process.env['AEGISOPS_ENDPOINT'] ?? 'http://localhost:3001/api/v1/telemetry/otlp/v1/metrics',
      },
      key: {
        type: 'string',
        short: 'k',
        default: process.env['AEGISOPS_TELEMETRY_KEY'] ?? '',
      },
      scenario: {
        type: 'string',
        short: 's',
        default: 'BASELINE',
      },
      service: {
        type: 'string',
        default: 'order-api',
      },
      environment: {
        type: 'string',
        default: 'production',
      },
      interval: {
        type: 'string',
        short: 'i',
        default: '5000',
      },
      duration: {
        type: 'string',
        short: 'd',
      },
      seed: {
        type: 'string',
        default: '42',
      },
      gzip: {
        type: 'boolean',
        default: false,
      },
      help: {
        type: 'boolean',
        short: 'h',
        default: false,
      },
    },
    allowPositionals: false,
  });

  if (values.help) {
    // eslint-disable-next-line no-console
    console.log(`
AegisOps Telemetry Ingestion Agent
Simulates deterministic production metrics traffic against AegisOps Core OTLP receiver.

Options:
  -e, --endpoint <url>      Target OTLP receiver endpoint (default: http://localhost:3001/api/v1/telemetry/otlp/v1/metrics)
  -k, --key <key>           AegisOps Ingest API Key (aeg_ing_...) [Required]
  -s, --scenario <name>     Scenario name: BASELINE, LATENCY_SPIKE, ERROR_SPIKE, CPU_SPIKE, MEMORY_PRESSURE, QUEUE_BACKLOG, OUTAGE, RECOVERY (default: BASELINE)
      --service <name>      Service name in resource attributes (default: order-api)
      --environment <name>  Environment name (default: production)
  -i, --interval <ms>       Export interval in milliseconds (default: 5000)
  -d, --duration <sec>      Optional duration to run before auto-terminating (seconds)
      --seed <num>          Deterministic PRNG seed for reproducible simulation (default: 42)
      --gzip                Compress OTLP HTTP payloads with gzip
  -h, --help                Show this help message
`);
    process.exit(0);
  }

  const apiKey = values.key;
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.error('Error: Telemetry ingest key is required. Specify with --key <aeg_ing_...> or AEGISOPS_TELEMETRY_KEY env var.');
    process.exit(1);
  }

  const validScenarios: ScenarioName[] = [
    'BASELINE',
    'LATENCY_SPIKE',
    'ERROR_SPIKE',
    'CPU_SPIKE',
    'MEMORY_PRESSURE',
    'QUEUE_BACKLOG',
    'OUTAGE',
    'RECOVERY',
  ];

  const scenario = values.scenario?.toUpperCase() as ScenarioName;
  if (!validScenarios.includes(scenario)) {
    // eslint-disable-next-line no-console
    console.error(`Error: Unknown scenario '${values.scenario}'. Valid: ${validScenarios.join(', ')}`);
    process.exit(1);
  }

  const options: AgentOptions = {
    endpoint: values.endpoint!,
    apiKey,
    serviceName: values.service!,
    environment: values.environment!,
    scenario,
    intervalMs: parseInt(values.interval ?? '5000', 10),
    durationSeconds: values.duration ? parseInt(values.duration, 10) : undefined,
    seed: parseInt(values.seed ?? '42', 10),
    useGzip: values.gzip ?? false,
  };

  const agent = new TelemetryAgent(options);

  const shutdown = () => {
    agent.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await agent.start();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal agent error:', err);
  process.exit(1);
});

