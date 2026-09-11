import {
  DeterministicRandom,
  generateScenarioMetrics,
  ScenarioName,
} from './scenarios';

describe('Telemetry Agent Scenarios', () => {
  it('should generate deterministic numbers with same seed', () => {
    const rng1 = new DeterministicRandom(12345);
    const rng2 = new DeterministicRandom(12345);

    const values1 = [rng1.next(), rng1.next(), rng1.next()];
    const values2 = [rng2.next(), rng2.next(), rng2.next()];

    expect(values1).toEqual(values2);
  });

  const scenarios: ScenarioName[] = [
    'BASELINE',
    'LATENCY_SPIKE',
    'ERROR_SPIKE',
    'CPU_SPIKE',
    'MEMORY_PRESSURE',
    'QUEUE_BACKLOG',
    'OUTAGE',
    'RECOVERY',
  ];

  for (const scenario of scenarios) {
    it(`should successfully generate valid metrics for ${scenario}`, () => {
      const rng = new DeterministicRandom(42);
      const metrics = generateScenarioMetrics(scenario, rng, 1);

      expect(metrics).toBeDefined();
      expect(metrics.requestsTotal.length).toBeGreaterThan(0);
      expect(metrics.requestDuration.count).toBeGreaterThan(0);
      expect(metrics.requestDuration.bucketCounts.length).toBe(11);
      expect(metrics.cpuUtilization).toBeGreaterThanOrEqual(0);
      expect(metrics.cpuUtilization).toBeLessThanOrEqual(1.0);
      expect(metrics.memoryUtilization).toBeGreaterThanOrEqual(0);
      expect(metrics.memoryUtilization).toBeLessThanOrEqual(1.0);
      expect(metrics.activeJobs).toBeGreaterThanOrEqual(0);
      expect(metrics.queueLatencyMs).toBeGreaterThanOrEqual(0);
    });
  }

  it('should reflect error spike in 5xx status codes', () => {
    const rng = new DeterministicRandom(999);
    const metrics = generateScenarioMetrics('ERROR_SPIKE', rng, 0);

    const errorEntry = metrics.requestsTotal.find((r) => r.statusCode === 500);
    expect(errorEntry).toBeDefined();
    expect(errorEntry!.count).toBeGreaterThan(0);
  });

  it('should reflect outage scenario with 100% 503 errors', () => {
    const rng = new DeterministicRandom(100);
    const metrics = generateScenarioMetrics('OUTAGE', rng, 0);

    for (const req of metrics.requestsTotal) {
      expect(req.statusCode).toBe(503);
    }
  });
});

