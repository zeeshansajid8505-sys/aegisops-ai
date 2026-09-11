import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';

export interface RcaInferencePayload {
  incident: any;
  candidateServices: any[];
  topology: {
    services: any[];
    dependencies: any[];
  };
  metricEvidence: any[];
  alertEvidence: any[];
  healthEvidence: any[];
  humanNotes: any[];
  availableRunbooks?: any[];
  anomalyEvidence?: any[];
}

export interface RcaInferenceResult {
  algorithmVersion: string;
  embeddingVersion: string;
  modelVersion: string;
  summary: string;
  observedFacts: any[];
  rankedCandidates: any[];
  recommendedNextChecks: string[];
  recommendedRunbooks: any[];
}

@Injectable()
export class AiServiceClient {
  private readonly logger = new Logger(AiServiceClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor() {
    this.baseUrl = process.env['AI_SERVICE_URL'] || 'http://localhost:8000';
    this.apiKey = process.env['AI_INTERNAL_API_KEY'] || 'aegisops-ai-internal-key-change-in-prod';
    const timeoutSeconds = parseInt(process.env['RCA_INFERENCE_TIMEOUT_SECONDS'] || '30', 10);
    this.timeoutMs = timeoutSeconds * 1000;
  }

  async getReadiness(): Promise<{ ready: boolean; [key: string]: any }> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/rca/ready`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        return { ready: false, status: res.status };
      }
      return (await res.json()) as any;
    } catch (err: any) {
      this.logger.warn(`FastAPI AI service readiness check failed: ${err.message}`);
      return { ready: false, error: err.message };
    }
  }

  async analyze(payload: RcaInferencePayload): Promise<RcaInferenceResult> {
    const url = `${this.baseUrl}/v1/rca/analyze`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Service-Key': this.apiKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        this.logger.error(`FastAPI RCA inference failed [${res.status}]: ${errorText}`);
        throw new HttpException(
          `AI inference engine returned status ${res.status}: ${errorText}`,
          res.status >= 500 ? HttpStatus.BAD_GATEWAY : res.status,
        );
      }

      const result: RcaInferenceResult = (await res.json()) as any;
      return result;
    } catch (err: any) {
      if (err.name === 'TimeoutError' || err.code === 'ABORT_ERR') {
        this.logger.error(`FastAPI RCA inference timed out after ${this.timeoutMs}ms`);
        throw new HttpException(
          `AI inference timed out after ${this.timeoutMs / 1000}s`,
          HttpStatus.GATEWAY_TIMEOUT,
        );
      }
      if (err instanceof HttpException) {
        throw err;
      }
      this.logger.error(`Failed to connect to FastAPI AI service at ${url}: ${err.message}`);
      throw new HttpException(
        `AI inference service unavailable: ${err.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}

