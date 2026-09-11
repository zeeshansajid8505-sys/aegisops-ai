import { Injectable, Logger } from '@nestjs/common';
import * as grpc from '@grpc/grpc-js';
import { ServiceHealthStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SSRFValidatorService } from '../security/ssrf-validator.service';
import { SecurityLoggerService } from '../security/security-logger.service';

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
    out[0] = 0x0a; // field 1, wire type 2 (length delimited)
    out[1] = buf.length;
    buf.copy(out, 2);
    return out;
  },
  requestDeserialize: (buffer: Buffer) => ({ service: buffer.toString() }),
  responseSerialize: (arg: { status?: number }) => Buffer.from([0x08, arg?.status ?? 0]),
  responseDeserialize: (buffer: Buffer) => {
    if (buffer.length >= 2 && buffer[0] === 0x08) {
      return { status: buffer[1] }; // 1 = SERVING, 2 = NOT_SERVING
    }
    return { status: 0 };
  },
};

@Injectable()
export class ProbeExecutorService {
  private readonly logger = new Logger(ProbeExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ssrfValidator: SSRFValidatorService,
    private readonly securityLogger: SecurityLoggerService,
  ) {}

  async executeHttpProbe(
    targetUrl: string,
    method: string,
    timeoutMs: number,
    minStatus: number,
    maxStatus: number,
  ): Promise<ExecutionResult> {
    const ssrfCheck = await this.ssrfValidator.validateTargetUrl(targetUrl);
    if (!ssrfCheck.valid) {
      this.logger.warn(`SSRF check failed for HTTP probe target: ${targetUrl} (${ssrfCheck.error})`);
      this.securityLogger.logEvent({
        type: 'UNAUTHORIZED_ACCESS_ATTEMPT',
        details: { action: 'PROBE_SSRF_BLOCKED', targetUrl, reason: ssrfCheck.error },
      });
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
          'User-Agent': 'AegisOps-HealthProbe/1.0',
        },
        redirect: 'manual', // Disable redirects to prevent bypass
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
      this.logger.warn(`SSRF check failed for gRPC probe target: ${targetHostPort} (${ssrfCheck.error})`);
      this.securityLogger.logEvent({
        type: 'UNAUTHORIZED_ACCESS_ATTEMPT',
        details: { action: 'PROBE_SSRF_BLOCKED', targetHostPort, reason: ssrfCheck.error },
      });
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
            } else if (error.code === grpc.status.UNIMPLEMENTED) {
              failureCode = 'GRPC_UNIMPLEMENTED';
            }

            resolve({
              status: 'UNHEALTHY',
              latencyMs,
              failureCode,
              failureMessage: (error.details || error.message || 'gRPC call failed').slice(0, 300),
            });
            return;
          }

          // 1 = SERVING, 2 = NOT_SERVING
          if (response && response.status === 1) {
            resolve({
              status: 'HEALTHY',
              latencyMs,
            });
          } else {
            resolve({
              status: 'UNHEALTHY',
              latencyMs,
              failureCode: 'GRPC_NOT_SERVING',
              failureMessage: `gRPC Health Check returned non-serving status (${response?.status ?? 'unknown'})`,
            });
          }
        },
      );
    });
  }

  async executeAndRecordProbe(
    probeId: string,
    organizationId: string,
  ): Promise<{ run: any; state: any }> {
    const probe = await this.prisma.healthProbe.findFirst({
      where: { id: probeId, organizationId },
      include: {
        environment: true,
        state: true,
      },
    });

    if (!probe) {
      throw new Error(`Probe ${probeId} not found in organization ${organizationId}`);
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
    } else {
      execResult = await this.executeGrpcProbe(
        probe.grpcHost || '',
        probe.grpcService,
        probe.grpcUseTls,
        probe.timeoutMs,
      );
    }

    const completedAt = new Date();

    // Apply Hysteresis state machine
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

    // Persist run and state in an atomic transaction
    const [run, state] = await this.prisma.$transaction(async (tx) => {
      const recordedRun = await tx.healthProbeRun.create({
        data: {
          organizationId: probe.organizationId,
          probeId: probe.id,
          serviceId: probe.serviceId,
          environmentId: probe.environmentId,
          status: execResult.status,
          startedAt,
          completedAt,
          latencyMs: execResult.latencyMs,
          httpStatusCode: execResult.httpStatusCode,
          failureCode: execResult.failureCode,
          failureMessage: execResult.failureMessage,
        },
      });

      const upsertedState = await tx.healthProbeState.upsert({
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
          lastFailureCode: execResult.failureCode,
        },
        update: {
          status: newStatus,
          consecutiveSuccesses,
          consecutiveFailures,
          lastCheckedAt: completedAt,
          lastSuccessfulAt: execResult.status === 'HEALTHY' ? completedAt : undefined,
          lastFailedAt: execResult.status !== 'HEALTHY' ? completedAt : undefined,
          lastLatencyMs: execResult.latencyMs,
          lastFailureCode: execResult.failureCode,
        },
      });

      // Update nextRunAt on the probe
      await tx.healthProbe.update({
        where: { id: probe.id },
        data: {
          nextRunAt: new Date(Date.now() + probe.intervalSeconds * 1000),
        },
      });

      return [recordedRun, upsertedState];
    });

    return { run, state };
  }
}
