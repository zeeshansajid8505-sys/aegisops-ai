export type ScenarioName =
  | 'BASELINE'
  | 'LATENCY_SPIKE'
  | 'ERROR_SPIKE'
  | 'CPU_SPIKE'
  | 'MEMORY_PRESSURE'
  | 'QUEUE_BACKLOG'
  | 'OUTAGE'
  | 'RECOVERY';

export interface GeneratedMetrics {
  requestsTotal: {
    count: number;
    statusCode: number;
    method: string;
    route: string;
  }[];
  requestDuration: {
    count: number;
    sum: number;
    min: number;
    max: number;
    bucketCounts: number[];
    explicitBounds: number[];
    route: string;
    method: string;
  };
  cpuUtilization: number;
  memoryUtilization: number;
  memoryUsageBytes: number;
  activeJobs: number;
  queueLatencyMs: number;
}

// Deterministic Pseudo-Random Number Generator (Mulberry32)
export class DeterministicRandom {
  private state: number;

  constructor(seed: number = 42) {
    this.state = seed >>> 0;
  }

  // Returns [0, 1)
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  intRange(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
}

export const DURATION_BOUNDS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

export function generateScenarioMetrics(
  scenario: ScenarioName,
  rng: DeterministicRandom,
  tickCount: number = 0,
): GeneratedMetrics {
  const routes = ['/api/v1/orders', '/api/v1/inventory', '/api/v1/users', '/api/v1/payments'];

  switch (scenario) {
    case 'BASELINE': {
      // Normal healthy operations
      const cpu = rng.range(0.12, 0.28);
      const mem = rng.range(0.35, 0.45);
      const reqCount = rng.intRange(40, 80);
      const avgDuration = rng.range(25, 45); // 25-45ms

      return {
        requestsTotal: [
          { count: Math.floor(reqCount * 0.98), statusCode: 200, method: 'GET', route: routes[0]! },
          { count: Math.floor(reqCount * 0.02), statusCode: 404, method: 'GET', route: routes[1]! },
        ],
        requestDuration: buildHistogram(avgDuration, reqCount, rng),
        cpuUtilization: cpu,
        memoryUtilization: mem,
        memoryUsageBytes: Math.floor(mem * 4 * 1024 * 1024 * 1024), // 4GB total
        activeJobs: rng.intRange(2, 10),
        queueLatencyMs: rng.range(5, 25),
      };
    }

    case 'LATENCY_SPIKE': {
      // Degraded latency: 350ms - 1200ms
      const cpu = rng.range(0.40, 0.65);
      const mem = rng.range(0.45, 0.55);
      const reqCount = rng.intRange(30, 60);
      const avgDuration = rng.range(350, 1200);

      return {
        requestsTotal: [
          { count: Math.floor(reqCount * 0.90), statusCode: 200, method: 'POST', route: routes[3]! },
          { count: Math.floor(reqCount * 0.10), statusCode: 504, method: 'POST', route: routes[3]! },
        ],
        requestDuration: buildHistogram(avgDuration, reqCount, rng),
        cpuUtilization: cpu,
        memoryUtilization: mem,
        memoryUsageBytes: Math.floor(mem * 4 * 1024 * 1024 * 1024),
        activeJobs: rng.intRange(25, 60),
        queueLatencyMs: rng.range(400, 1500),
      };
    }

    case 'ERROR_SPIKE': {
      // High 5xx error rate: 35-60% errors
      const cpu = rng.range(0.30, 0.50);
      const mem = rng.range(0.40, 0.50);
      const reqCount = rng.intRange(50, 100);
      const errorCount = Math.floor(reqCount * rng.range(0.35, 0.60));
      const successCount = reqCount - errorCount;
      const avgDuration = rng.range(80, 200);

      return {
        requestsTotal: [
          { count: successCount, statusCode: 200, method: 'POST', route: routes[0]! },
          { count: errorCount, statusCode: 500, method: 'POST', route: routes[0]! },
        ],
        requestDuration: buildHistogram(avgDuration, reqCount, rng),
        cpuUtilization: cpu,
        memoryUtilization: mem,
        memoryUsageBytes: Math.floor(mem * 4 * 1024 * 1024 * 1024),
        activeJobs: rng.intRange(15, 30),
        queueLatencyMs: rng.range(50, 150),
      };
    }

    case 'CPU_SPIKE': {
      // CPU utilization pinned at 88% - 98%
      const cpu = rng.range(0.88, 0.98);
      const mem = rng.range(0.50, 0.65);
      const reqCount = rng.intRange(80, 150);
      const avgDuration = rng.range(150, 450);

      return {
        requestsTotal: [
          { count: Math.floor(reqCount * 0.85), statusCode: 200, method: 'GET', route: routes[2]! },
          { count: Math.floor(reqCount * 0.15), statusCode: 503, method: 'GET', route: routes[2]! },
        ],
        requestDuration: buildHistogram(avgDuration, reqCount, rng),
        cpuUtilization: cpu,
        memoryUtilization: mem,
        memoryUsageBytes: Math.floor(mem * 4 * 1024 * 1024 * 1024),
        activeJobs: rng.intRange(40, 90),
        queueLatencyMs: rng.range(200, 800),
      };
    }

    case 'MEMORY_PRESSURE': {
      // Memory continuously climbs: 75% -> 95%
      const baseMem = Math.min(0.95, 0.70 + (tickCount * 0.03));
      const mem = rng.range(baseMem, Math.min(0.98, baseMem + 0.05));
      const cpu = rng.range(0.35, 0.55);
      const reqCount = rng.intRange(40, 70);
      const avgDuration = rng.range(60, 180);

      return {
        requestsTotal: [
          { count: Math.floor(reqCount * 0.92), statusCode: 200, method: 'GET', route: routes[1]! },
          { count: Math.floor(reqCount * 0.08), statusCode: 500, method: 'GET', route: routes[1]! },
        ],
        requestDuration: buildHistogram(avgDuration, reqCount, rng),
        cpuUtilization: cpu,
        memoryUtilization: mem,
        memoryUsageBytes: Math.floor(mem * 4 * 1024 * 1024 * 1024),
        activeJobs: rng.intRange(20, 45),
        queueLatencyMs: rng.range(80, 300),
      };
    }

    case 'QUEUE_BACKLOG': {
      // Asynchronous background jobs pile up
      const cpu = rng.range(0.55, 0.75);
      const mem = rng.range(0.60, 0.70);
      const reqCount = rng.intRange(50, 90);
      const avgDuration = rng.range(40, 90);

      return {
        requestsTotal: [
          { count: reqCount, statusCode: 200, method: 'POST', route: '/api/v1/jobs' },
        ],
        requestDuration: buildHistogram(avgDuration, reqCount, rng),
        cpuUtilization: cpu,
        memoryUtilization: mem,
        memoryUsageBytes: Math.floor(mem * 4 * 1024 * 1024 * 1024),
        activeJobs: rng.intRange(400, 1200), // Massive job backlog
        queueLatencyMs: rng.range(5000, 25000), // High job delay
      };
    }

    case 'OUTAGE': {
      // Total failure: 100% 503 / 500 errors
      const cpu = rng.range(0.05, 0.15);
      const mem = rng.range(0.20, 0.30);
      const reqCount = rng.intRange(20, 40);
      const avgDuration = rng.range(2000, 5000);

      return {
        requestsTotal: [
          { count: reqCount, statusCode: 503, method: 'GET', route: routes[0]! },
        ],
        requestDuration: buildHistogram(avgDuration, reqCount, rng),
        cpuUtilization: cpu,
        memoryUtilization: mem,
        memoryUsageBytes: Math.floor(mem * 4 * 1024 * 1024 * 1024),
        activeJobs: rng.intRange(0, 2),
        queueLatencyMs: rng.range(10000, 30000),
      };
    }

    case 'RECOVERY': {
      // Graceful return from elevated state back to baseline
      const decayFactor = Math.max(0, 1.0 - (tickCount * 0.15));
      const cpu = 0.20 + (0.50 * decayFactor) + rng.range(-0.03, 0.03);
      const mem = 0.40 + (0.30 * decayFactor) + rng.range(-0.02, 0.02);
      const reqCount = rng.intRange(40, 75);
      const avgDuration = 35 + (300 * decayFactor) + rng.range(0, 20);
      const errorPct = 0.02 + (0.25 * decayFactor);

      const errorCount = Math.floor(reqCount * errorPct);
      const successCount = reqCount - errorCount;

      return {
        requestsTotal: [
          { count: successCount, statusCode: 200, method: 'GET', route: routes[0]! },
          ...(errorCount > 0
            ? [{ count: errorCount, statusCode: 500, method: 'GET', route: routes[0]! }]
            : []),
        ],
        requestDuration: buildHistogram(avgDuration, reqCount, rng),
        cpuUtilization: Math.max(0.1, Math.min(0.9, cpu)),
        memoryUtilization: Math.max(0.2, Math.min(0.9, mem)),
        memoryUsageBytes: Math.floor(mem * 4 * 1024 * 1024 * 1024),
        activeJobs: Math.floor(5 + (50 * decayFactor)),
        queueLatencyMs: 15 + (400 * decayFactor),
      };
    }
  }
}

function buildHistogram(
  avgMs: number,
  count: number,
  rng: DeterministicRandom,
): {
  count: number;
  sum: number;
  min: number;
  max: number;
  bucketCounts: number[];
  explicitBounds: number[];
  route: string;
  method: string;
} {
  const bucketCounts = new Array(DURATION_BOUNDS.length + 1).fill(0);
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;

  for (let i = 0; i < count; i++) {
    // Generate sample with standard deviation around avgMs
    const val = Math.max(1, avgMs + (rng.range(-0.4, 0.4) * avgMs));
    sum += val;
    if (val < min) min = val;
    if (val > max) max = val;

    let placed = false;
    for (let b = 0; b < DURATION_BOUNDS.length; b++) {
      if (val <= DURATION_BOUNDS[b]!) {
        bucketCounts[b]!++;
        placed = true;
        break;
      }
    }
    if (!placed) {
      bucketCounts[DURATION_BOUNDS.length]!++;
    }
  }

  return {
    count,
    sum: Math.round(sum * 100) / 100,
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    bucketCounts,
    explicitBounds: DURATION_BOUNDS,
    route: '/api/v1/orders',
    method: 'GET',
  };
}
