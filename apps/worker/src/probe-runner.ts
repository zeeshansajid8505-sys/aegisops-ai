import * as grpc from '@grpc/grpc-js';
import { PrismaClient, ServiceHealthStatus } from '@prisma/client';
import { WorkerSSRFValidator } from './ssrf-validator';

export interface ExecutionResult {
  status: ServiceHealthStatus;
  latencyMs: number;
  httpStatusCode?: number | null;
  failureCode?: string | null;
  failureMessage?: string | null;
}

const grpcHealthCheckMethod: grpc.MethodDefinition<any, any> = {
  path: '/grpc.health.v1.Health/Check',
  requestStream: false,
  responseStream: false,
  requestSerialize: (arg: { service?: string }) => {
    const serviceName = arg?.service || '';
    if (!serviceName) return Buffer.alloc(0);
    const buf = Buffer.from(serviceName, 'utf8');
    const out = Buffer.alloc(2 + buf.length);
    out[0] = 0x0a;
    out[1] = buf.length;
    buf.copy(out, 2);
    return out;
  },
  requestDeserialize: (buffer: Buffer) => ({ service: buffer.toString() }),
  responseSerialize: (arg: { status?: number }) => Buffer.from([0x08, arg?.status ?? 0]),
  responseDeserialize: (buffer: Buffer) => {
    if (buffer.length >= 2 && buffer[0] === 0x08) {
      return { status: buffer[1] };
    }
    return { status: 0 };
  },
};

export class ProbeRunner {
  private ssrfValidator: WorkerSSRFValidator;

  constructor(private readonly prisma: PrismaClient) {
    this.ssrfValidator = new WorkerSSRFValidator();
  }

  async executeHttpProbe(
    targetUrl: string,
    method: string,
    timeoutMs: number,
    minStatus: number,
    maxStatus: number,
  ): Promise<ExecutionResult> {
    const ssrfCheck = await this.ssrfValidator.validateTargetUrl(targetUrl);
    if (!ssrfCheck.valid) {
      return {
        status: 'UNHEALTHY',
        latencyMs: 0,
        failureCode: 'BLOCKED_TARGET',
        failureMessage: ssrfCheck.error || 'Destination IP or protocol is prohibited by SSRF policy',
      };
    }

    const startTime = performance.now();
    try {
      const response = await fetch(targetUrl, {
        method: method || 'GET',
        headers: {
          'User-Agent': 'AegisOps-WorkerHealthProbe/1.0',
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });

      const latencyMs = Math.round(performance.now() - startTime);
      const statusCode = response.status;

      if (statusCode >= minStatus && statusCode <= maxStatus) {
        return {
          status: 'HEALTHY',
          latencyMs,
          httpStatusCode: statusCode,
        };
      }

      return {
        status: 'UNHEALTHY',
        latencyMs,
        httpStatusCode: statusCode,
        failureCode: 'HTTP_STATUS',
        failureMessage: `HTTP ${statusCode} outside expected [${minStatus}, ${maxStatus}] range`,
      };
    } catch (err: any) {
      const latencyMs = Math.round(performance.now() - startTime);
      let failureCode = 'INTERNAL_PROBE_ERROR';
      const msg = (err.message || '').toLowerCase();

      if (err.name === 'TimeoutError' || msg.includes('timeout') || msg.includes('aborted')) {
        failureCode = 'TIMEOUT';
      } else if (msg.includes('econnrefused')) {
        failureCode = 'CONNECTION_REFUSED';
      } else if (msg.includes('enotfound') || msg.includes('getaddrinfo')) {
        failureCode = 'DNS_FAILURE';
      } else if (msg.includes('tls') || msg.includes('certificate') || msg.includes('ssl')) {
        failureCode = 'TLS_ERROR';
      }

      return {
        status: 'UNHEALTHY',
        latencyMs,
        failureCode,
        failureMessage: (err.message || 'Probe request failed').slice(0, 300),
      };
    }
  }

  async executeGrpcProbe(
    targetHostPort: string,
    serviceName: string | null | undefined,
    useTls: boolean,
    timeoutMs: number,
  ): Promise<ExecutionResult> {
    const ssrfCheck = await this.ssrfValidator.validateGrpcTarget(targetHostPort);
    if (!ssrfCheck.valid) {
      return {
        status: 'UNHEALTHY',
        latencyMs: 0,
        failureCode: 'BLOCKED_TARGET',
        failureMessage: ssrfCheck.error || 'Destination target is prohibited by SSRF policy',
      };
    }

    const startTime = performance.now();

    return new Promise<ExecutionResult>((resolve) => {
      const credentials = useTls
        ? grpc.credentials.createSsl()
        : grpc.credentials.createInsecure();

      const client = new grpc.Client(targetHostPort, credentials);
      const deadline = new Date(Date.now() + timeoutMs);

      client.makeUnaryRequest(
        grpcHealthCheckMethod.path,
        grpcHealthCheckMethod.requestSerialize,
        grpcHealthCheckMethod.responseDeserialize,
        { service: serviceName || '' },
        new grpc.Metadata(),
        { deadline },
        (error, response) => {
          const latencyMs = Math.round(performance.now() - startTime);
          client.close();

          if (error) {
            let failureCode = 'INTERNAL_PROBE_ERROR';
            if (error.code === grpc.status.DEADLINE_EXCEEDED) {
              failureCode = 'TIMEOUT';
            } else if (error.code === grpc.status.UNAVAILABLE) {
              failureCode = 'CONNECTION_REFUSED';
            } else if (error.code === grpc.status.UNAUTHENTICATED) {
              failureCode = 'AUTH_ERROR';
            }

            resolve({
              status: 'UNHEALTHY',
              latencyMs,
              failureCode,
              failureMessage: `gRPC error ${error.code}: ${error.details || error.message}`.slice(0, 300),
            });
            return;
          }

          if (response && response.status === 1) {
            resolve({
              status: 'HEALTHY',
              latencyMs,
            });
            return;
          }

          resolve({
            status: 'UNHEALTHY',
            latencyMs,
            failureCode: 'GRPC_STATUS',
            failureMessage: `gRPC service reported NOT_SERVING or UNKNOWN status: ${response?.status}`,
          });
        },
      );
    });
  }

  async executeAndRecordProbe(probeId: string): Promise<ExecutionResult> {
    const probe = await this.prisma.healthProbe.findUnique({
      where: { id: probeId },
      include: {
        environment: true,
        state: true,
      },
    });

    if (!probe) {
      throw new Error(`HealthProbe ${probeId} not found`);
    }

    if (!probe.enabled) {
      return {
        status: 'UNKNOWN',
        latencyMs: 0,
        failureMessage: 'Probe is disabled',
      };
    }

    const startedAt = new Date();
    let execResult: ExecutionResult;

    if (probe.probeType === 'HTTP') {
      const baseUrl = (probe.environment?.baseUrl || '').replace(/\/$/, '');
      const path = probe.httpPath.startsWith('/') ? probe.httpPath : `/${probe.httpPath}`;
      const targetUrl = baseUrl ? `${baseUrl}${path}` : path;

      execResult = await this.executeHttpProbe(
        targetUrl,
        probe.httpMethod,
        probe.timeoutMs,
        probe.httpExpectedStatusMin,
        probe.httpExpectedStatusMax,
      );
    } else if (probe.probeType === 'GRPC') {
      execResult = await this.executeGrpcProbe(
        probe.grpcHost || '',
        probe.grpcService,
        probe.grpcUseTls,
        probe.timeoutMs,
      );
    } else {
      execResult = {
        status: 'UNHEALTHY',
        latencyMs: 0,
        failureCode: 'UNKNOWN_PROBE_TYPE',
        failureMessage: `Unsupported probe type: ${probe.probeType}`,
      };
    }

    const completedAt = new Date();

    // Hysteresis logic
    const currentState = probe.state || {
      status: 'UNKNOWN' as ServiceHealthStatus,
      consecutiveSuccesses: 0,
      consecutiveFailures: 0,
    };

    let consecutiveSuccesses = currentState.consecutiveSuccesses;
    let consecutiveFailures = currentState.consecutiveFailures;
    let newStatus: ServiceHealthStatus = currentState.status;

    if (execResult.status === 'HEALTHY') {
      consecutiveSuccesses += 1;
      consecutiveFailures = 0;
      if (consecutiveSuccesses >= probe.successThreshold) {
        newStatus = 'HEALTHY';
      } else if (currentState.status === 'UNHEALTHY') {
        newStatus = 'DEGRADED';
      }
    } else {
      consecutiveFailures += 1;
      consecutiveSuccesses = 0;
      if (consecutiveFailures >= probe.failureThreshold) {
        newStatus = 'UNHEALTHY';
      } else if (currentState.status === 'HEALTHY') {
        newStatus = 'DEGRADED';
      }
    }

    // Persist in transaction
    await this.prisma.$transaction(async (tx) => {
      await tx.healthProbeRun.create({
        data: {
          organizationId: probe.organizationId,
          probeId: probe.id,
          serviceId: probe.serviceId,
          environmentId: probe.environmentId,
          status: execResult.status,
          startedAt,
          completedAt,
          latencyMs: execResult.latencyMs,
          httpStatusCode: execResult.httpStatusCode ?? null,
          failureCode: execResult.failureCode ?? null,
          failureMessage: execResult.failureMessage ?? null,
        },
      });

      await tx.healthProbeState.upsert({
        where: { probeId: probe.id },
        create: {
          probeId: probe.id,
          organizationId: probe.organizationId,
          status: newStatus,
          consecutiveSuccesses,
          consecutiveFailures,
          lastCheckedAt: completedAt,
          lastSuccessfulAt: execResult.status === 'HEALTHY' ? completedAt : undefined,
          lastFailedAt: execResult.status !== 'HEALTHY' ? completedAt : undefined,
          lastLatencyMs: execResult.latencyMs,
          lastFailureCode: execResult.failureCode ?? null,
        },
        update: {
          status: newStatus,
          consecutiveSuccesses,
          consecutiveFailures,
          lastCheckedAt: completedAt,
          lastSuccessfulAt: execResult.status === 'HEALTHY' ? completedAt : undefined,
          lastFailedAt: execResult.status !== 'HEALTHY' ? completedAt : undefined,
          lastLatencyMs: execResult.latencyMs,
          lastFailureCode: execResult.failureCode ?? null,
        },
      });

      await tx.healthProbe.update({
        where: { id: probe.id },
        data: {
          nextRunAt: new Date(Date.now() + probe.intervalSeconds * 1000),
        },
      });
    });

    return execResult;
  }
}

