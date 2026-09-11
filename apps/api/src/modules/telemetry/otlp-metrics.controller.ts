import {
  Controller,
  Post,
  Req,
  Res,
  UseGuards,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader, ApiSecurity } from '@nestjs/swagger';
import { Response } from 'express';
import * as zlib from 'zlib';
import { MachineTelemetryAuthGuard, TelemetryRequest } from './guards/machine-telemetry-auth.guard';
import { RateLimiterService } from './rate-limiter.service';
import { CardinalityGuardService } from './cardinality-guard.service';
import { OtlpProtobufService } from './otlp-protobuf.service';
import { MetricNormalizerService, NormalizedMetricPoint } from './metric-normalizer.service';
import { TelemetryQueueService } from './telemetry-queue.service';
import { PrismaService } from '../prisma/prisma.service';

export const MAX_UNCOMPRESSED_PAYLOAD_BYTES = 8 * 1024 * 1024; // 8 MiB
export const MAX_DATA_POINTS_PER_REQUEST = 5000;

@ApiTags('Telemetry Ingestion')
@Controller('v1/telemetry/otlp/v1')
@ApiSecurity('MachineKey')
export class OtlpMetricsController {
  private readonly logger = new Logger(OtlpMetricsController.name);

  constructor(
    private readonly rateLimiterService: RateLimiterService,
    private readonly cardinalityGuardService: CardinalityGuardService,
    private readonly protobufService: OtlpProtobufService,
    private readonly normalizerService: MetricNormalizerService,
    private readonly queueService: TelemetryQueueService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('metrics')
  @UseGuards(MachineTelemetryAuthGuard)
  @ApiOperation({
    summary: 'Ingest OTLP/HTTP metric batches (Protobuf or JSON, gzip supported)',
    description:
      'Standard OpenTelemetry metrics receiver supporting GAUGE, SUM, and HISTOGRAM instruments with automatic rate-limiting, cardinality guards, and sensitive label redaction.',
  })
  @ApiHeader({ name: 'Content-Type', description: 'application/json or application/x-protobuf' })
  @ApiHeader({ name: 'Content-Encoding', required: false, description: 'gzip if payload is compressed' })
  @ApiHeader({ name: 'Authorization', required: false, description: 'Bearer aeg_ing_...' })
  @ApiHeader({ name: 'X-Aegis-Telemetry-Key', required: false, description: 'aeg_ing_...' })
  @ApiResponse({ status: 200, description: 'Metrics batch ingested successfully' })
  @ApiResponse({ status: 400, description: 'Malformed payload or excessive points' })
  @ApiResponse({ status: 401, description: 'Missing or invalid telemetry ingest key' })
  @ApiResponse({ status: 413, description: 'Payload exceeds 8 MiB uncompressed limit' })
  @ApiResponse({ status: 429, description: 'Ingestion rate limit exceeded' })
  async ingestMetrics(
    @Req() req: TelemetryRequest,
    @Res() res: Response,
  ): Promise<void> {
    const auth = req.telemetryAuth!;
    const contentType = (req.headers['content-type'] ?? 'application/json').toLowerCase();
    const contentEncoding = (req.headers['content-encoding'] ?? '').toLowerCase();
    const clientIp = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const userAgent = (req.headers['user-agent'] ?? '').slice(0, 255);

    // 1. Read raw body buffer
    let rawBuffer: Buffer;
    if (Buffer.isBuffer((req as any).rawBody)) {
      rawBuffer = (req as any).rawBody;
    } else if (Buffer.isBuffer(req.body)) {
      rawBuffer = req.body;
    } else if (typeof req.body === 'string') {
      rawBuffer = Buffer.from(req.body, 'utf-8');
    } else if (req.body && typeof req.body === 'object') {
      // Body was pre-parsed as JSON by Express
      rawBuffer = Buffer.from(JSON.stringify(req.body), 'utf-8');
    } else {
      rawBuffer = Buffer.alloc(0);
    }

    const payloadBytes = rawBuffer.length;

    // 2. Handle decompression if gzipped
    let uncompressedBuffer: Buffer;
    if (contentEncoding === 'gzip') {
      try {
        uncompressedBuffer = zlib.gunzipSync(rawBuffer, {
          maxOutputLength: MAX_UNCOMPRESSED_PAYLOAD_BYTES,
        });
      } catch (err) {
        const isTooLarge = (err as Error).message.includes('maxOutputLength');
        if (isTooLarge) {
          await this.recordIngestionEvent(auth, 0, 0, payloadBytes, contentType, clientIp, userAgent, 'Payload exceeds 8 MiB limit');
          throw new HttpException(
            'Decompressed payload exceeds maximum size of 8 MiB',
            HttpStatus.PAYLOAD_TOO_LARGE,
          );
        }
        await this.recordIngestionEvent(auth, 0, 0, payloadBytes, contentType, clientIp, userAgent, 'Decompression failure');
        throw new HttpException('Failed to decompress gzipped payload', HttpStatus.BAD_REQUEST);
      }
    } else {
      if (rawBuffer.length > MAX_UNCOMPRESSED_PAYLOAD_BYTES) {
        await this.recordIngestionEvent(auth, 0, 0, payloadBytes, contentType, clientIp, userAgent, 'Payload exceeds 8 MiB limit');
        throw new HttpException(
          'Payload exceeds maximum size of 8 MiB',
          HttpStatus.PAYLOAD_TOO_LARGE,
        );
      }
      uncompressedBuffer = rawBuffer;
    }

    // 3. Parse payload into JS Object
    let parsedPayload: any;
    const isProtobuf = contentType.includes('protobuf') || contentType.includes('octet-stream');

    try {
      if (isProtobuf) {
        parsedPayload = this.protobufService.decodeMetricsRequest(uncompressedBuffer);
      } else {
        const text = uncompressedBuffer.toString('utf-8');
        parsedPayload = JSON.parse(text);
      }
    } catch (err) {
      await this.recordIngestionEvent(auth, 0, 0, payloadBytes, contentType, clientIp, userAgent, `Parse error: ${(err as Error).message}`);
      throw new HttpException(
        `Failed to parse ${isProtobuf ? 'protobuf' : 'json'} payload: ${(err as Error).message}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // 4. Normalize and validate payload structure
    const normResult = this.normalizerService.normalizePayload(parsedPayload, auth, true);
    const totalPointsReceived = normResult.accepted.length + normResult.rejectedCount;

    if (totalPointsReceived > MAX_DATA_POINTS_PER_REQUEST) {
      await this.recordIngestionEvent(
        auth,
        0,
        totalPointsReceived,
        payloadBytes,
        contentType,
        clientIp,
        userAgent,
        `Exceeded ${MAX_DATA_POINTS_PER_REQUEST} points per request`,
      );
      throw new HttpException(
        `Payload contains ${totalPointsReceived} points, exceeding maximum limit of ${MAX_DATA_POINTS_PER_REQUEST}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // 5. Rate limiting check (requests per minute + points per minute)
    const rateCheck = await this.rateLimiterService.checkRateLimit(
      auth.ingestKeyId,
      totalPointsReceived,
      auth.rateLimitRpm,
      auth.rateLimitPts,
    );

    if (!rateCheck.allowed) {
      await this.recordIngestionEvent(
        auth,
        0,
        totalPointsReceived,
        payloadBytes,
        contentType,
        clientIp,
        userAgent,
        `Rate limit exceeded (${rateCheck.limitType?.toUpperCase()} quota: ${rateCheck.limit})`,
      );

      res.setHeader('Retry-After', String(rateCheck.resetSeconds));
      throw new HttpException(
        `Rate limit exceeded: ${rateCheck.limitType?.toUpperCase()} quota is ${rateCheck.limit}`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 6. Cardinality check for series
    const acceptedPoints: NormalizedMetricPoint[] = [];
    let cardinalityRejected = 0;

    for (const point of normResult.accepted) {
      const cardCheck = await this.cardinalityGuardService.canAcceptSeries(
        point.environmentId,
        point.seriesHash,
      );
      if (cardCheck.allowed) {
        acceptedPoints.push(point);
      } else {
        cardinalityRejected++;
      }
    }

    const finalRejectedCount = normResult.rejectedCount + cardinalityRejected;
    const finalAcceptedCount = acceptedPoints.length;

    // 7. Enqueue valid points to BullMQ background processor
    if (acceptedPoints.length > 0) {
      await this.queueService.enqueueMetricPoints(acceptedPoints, auth.ingestKeyId);
    }

    // 8. Record telemetry ingestion event asynchronously
    let rejectionReason: string | undefined;
    if (finalRejectedCount > 0) {
      const reasons = [...normResult.rejectionReasons];
      if (cardinalityRejected > 0) {
        reasons.push(`${cardinalityRejected} points rejected by cardinality cap (5,000 series max)`);
      }
      rejectionReason = reasons.slice(0, 3).join('; ');
    }

    this.recordIngestionEvent(
      auth,
      finalAcceptedCount,
      finalRejectedCount,
      payloadBytes,
      contentType,
      clientIp,
      userAgent,
      rejectionReason,
    ).catch(() => {});

    // 9. Format response
    if (isProtobuf) {
      const responseBytes = this.protobufService.encodeMetricsResponse(
        finalRejectedCount > 0
          ? {
              rejectedDataPoints: finalRejectedCount,
              errorMessage: rejectionReason ?? 'Some data points were rejected',
            }
          : undefined,
      );
      res.setHeader('Content-Type', 'application/x-protobuf');
      res.status(HttpStatus.OK).send(Buffer.from(responseBytes));
      return;
    }

    const responsePayload: Record<string, unknown> = {};
    if (finalRejectedCount > 0) {
      responsePayload['partialSuccess'] = {
        rejectedDataPoints: finalRejectedCount,
        errorMessage: rejectionReason,
      };
    }

    res.status(HttpStatus.OK).json(responsePayload);
  }

  private async recordIngestionEvent(
    auth: { organizationId: string; serviceId: string; environmentId: string; ingestKeyId: string },
    accepted: number,
    rejected: number,
    payloadBytes: number,
    contentType: string,
    clientIp: string,
    userAgent: string,
    rejectionReason?: string,
  ): Promise<void> {
    try {
      await this.prisma.telemetryIngestionEvent.create({
        data: {
          organizationId: auth.organizationId,
          serviceId: auth.serviceId,
          environmentId: auth.environmentId,
          ingestKeyId: auth.ingestKeyId,
          pointsAccepted: accepted,
          pointsRejected: rejected,
          payloadBytes,
          contentType,
          clientIp,
          userAgent,
          rejectionReason,
        },
      });
    } catch (err) {
      this.logger.debug(`Failed to record ingestion event: ${(err as Error).message}`);
    }
  }
}
