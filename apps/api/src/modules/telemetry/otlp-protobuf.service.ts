import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as path from 'path';
import * as protobuf from 'protobufjs';

@Injectable()
export class OtlpProtobufService implements OnModuleInit {
  private readonly logger = new Logger(OtlpProtobufService.name);
  private root: protobuf.Root | null = null;
  private requestType: protobuf.Type | null = null;
  private responseType: protobuf.Type | null = null;

  async onModuleInit(): Promise<void> {
    try {
      const protoPath = path.resolve(__dirname, 'proto', 'otlp-metrics.proto');
      this.root = await protobuf.load(protoPath);
      this.requestType = this.root.lookupType('opentelemetry.proto.metrics.v1.ExportMetricsServiceRequest');
      this.responseType = this.root.lookupType('opentelemetry.proto.metrics.v1.ExportMetricsServiceResponse');
      this.logger.log('OTLP metrics protobuf schemas initialized successfully');
    } catch (err) {
      this.logger.error(`Failed to load OTLP protobuf schemas: ${(err as Error).message}`);
    }
  }

  decodeMetricsRequest(buffer: Buffer): any {
    if (!this.requestType) {
      throw new Error('Protobuf request type not initialized');
    }
    const decodedMessage = this.requestType.decode(buffer);
    return this.requestType.toObject(decodedMessage, {
      defaults: false,
      longs: String, // Ensure 64-bit integers are stringified for safe parsing
      enums: String,
      bytes: String,
    });
  }

  encodeMetricsResponse(partialSuccess?: { rejectedDataPoints: number; errorMessage: string }): Uint8Array {
    if (!this.responseType) {
      throw new Error('Protobuf response type not initialized');
    }
    const payload: Record<string, unknown> = {};
    if (partialSuccess && (partialSuccess.rejectedDataPoints > 0 || partialSuccess.errorMessage)) {
      payload['partial_success'] = {
        rejected_data_points: partialSuccess.rejectedDataPoints,
        error_message: partialSuccess.errorMessage,
      };
    }
    const message = this.responseType.create(payload);
    return this.responseType.encode(message).finish();
  }
}

