import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { TelemetryKeysService } from './telemetry-keys.service';
import { TelemetryKeysController } from './telemetry-keys.controller';
import { MachineTelemetryAuthGuard } from './guards/machine-telemetry-auth.guard';
import { RateLimiterService } from './rate-limiter.service';
import { CardinalityGuardService } from './cardinality-guard.service';
import { OtlpProtobufService } from './otlp-protobuf.service';
import { MetricNormalizerService } from './metric-normalizer.service';
import { TelemetryQueueService } from './telemetry-queue.service';
import { OtlpMetricsController } from './otlp-metrics.controller';
import { MetricQueryService } from './metric-query.service';
import { MetricsController } from './metrics.controller';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [
    TelemetryKeysController,
    OtlpMetricsController,
    MetricsController,
  ],
  providers: [
    TelemetryKeysService,
    MachineTelemetryAuthGuard,
    RateLimiterService,
    CardinalityGuardService,
    OtlpProtobufService,
    MetricNormalizerService,
    TelemetryQueueService,
    MetricQueryService,
  ],
  exports: [
    TelemetryKeysService,
    MetricQueryService,
    RateLimiterService,
    CardinalityGuardService,
    MetricNormalizerService,
  ],
})
export class TelemetryModule {}

