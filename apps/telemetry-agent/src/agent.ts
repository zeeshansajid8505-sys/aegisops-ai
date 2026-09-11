import { OtlpHttpExporter, ExporterConfig } from './otlp-exporter';
import { ScenarioName, DeterministicRandom, generateScenarioMetrics } from './scenarios';

export interface AgentOptions extends ExporterConfig {
  scenario: ScenarioName;
  intervalMs: number;
  durationSeconds?: number;
  seed?: number;
}

export class TelemetryAgent {
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private tickCount = 0;
  private rng: DeterministicRandom;
  private exporter: OtlpHttpExporter;

  constructor(private readonly options: AgentOptions) {
    this.rng = new DeterministicRandom(options.seed ?? 42);
    this.exporter = new OtlpHttpExporter(options);
  }

  async start(): Promise<void> {
    this.isRunning = true;
    this.tickCount = 0;

    // eslint-disable-next-line no-console
    console.log('================================================================');
    // eslint-disable-next-line no-console
    console.log('           AEGISOPS AI — TELEMETRY INGESTION AGENT              ');
    // eslint-disable-next-line no-console
    console.log('================================================================');
    // eslint-disable-next-line no-console
    console.log(`Endpoint:    ${this.options.endpoint}`);
    // eslint-disable-next-line no-console
    console.log(`Service:     ${this.options.serviceName} (${this.options.environment})`);
    // eslint-disable-next-line no-console
    console.log(`Scenario:    ${this.options.scenario}`);
    // eslint-disable-next-line no-console
    console.log(`Interval:    ${this.options.intervalMs}ms`);
    // eslint-disable-next-line no-console
    console.log(`Gzip:        ${this.options.useGzip ? 'enabled' : 'disabled'}`);
    // eslint-disable-next-line no-console
    console.log(`Duration:    ${this.options.durationSeconds ? `${this.options.durationSeconds}s` : 'continuous'}`);
    // eslint-disable-next-line no-console
    console.log('================================================================\n');

    // Perform initial tick immediately
    await this.tick();

    if (!this.isRunning) return;

    this.timer = setInterval(async () => {
      await this.tick();
    }, this.options.intervalMs);

    if (this.options.durationSeconds && this.options.durationSeconds > 0) {
      setTimeout(() => {
        // eslint-disable-next-line no-console
        console.log(`\n[Agent] Duration of ${this.options.durationSeconds}s reached. Shutting down...`);
        this.stop();
      }, this.options.durationSeconds * 1000);
    }
  }

  stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // eslint-disable-next-line no-console
    console.log('[Agent] Telemetry Agent stopped cleanly.');
  }

  private async tick(): Promise<void> {
    if (!this.isRunning) return;

    this.tickCount++;
    const now = new Date();
    const metrics = generateScenarioMetrics(this.options.scenario, this.rng, this.tickCount);

    const res = await this.exporter.exportMetrics(metrics, now);

    const ts = now.toISOString().slice(11, 19);
    const statusTag = res.success ? `\x1b[32m[${res.statusCode ?? 200} OK]\x1b[0m` : `\x1b[31m[FAILED ${res.statusCode ?? 'ERR'}]\x1b[0m`;
    const cpuPct = Math.round(metrics.cpuUtilization * 100);
    const memPct = Math.round(metrics.memoryUtilization * 100);
    const totalReqs = metrics.requestsTotal.reduce((acc, r) => acc + r.count, 0);

    // eslint-disable-next-line no-console
    console.log(
      `[${ts}] #${this.tickCount} ${statusTag} scenario=${this.options.scenario} ` +
      `reqs=${totalReqs} cpu=${cpuPct}% mem=${memPct}% p90_lat=${metrics.requestDuration.max}ms ` +
      `active_jobs=${metrics.activeJobs} duration=${res.durationMs}ms`,
    );

    if (!res.success && res.responseBody) {
      // eslint-disable-next-line no-console
      console.warn(`       Rejection detail: ${res.responseBody}`);
    }
  }
}

