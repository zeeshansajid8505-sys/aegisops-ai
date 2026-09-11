import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AnomalyDetectorsController } from './anomaly-detectors.controller';
import { AnomaliesController } from './anomalies.controller';
import { AnomalyDetectorsService } from './anomaly-detectors.service';
import { AnomalyFindingsService } from './anomaly-findings.service';
import { AnomaliesQueueService } from './anomalies-queue.service';
import { FeatureWindowEngine } from './feature-window.engine';
import { CleanBaselineFilter } from './clean-baseline.filter';

@Module({
  imports: [PrismaModule, RedisModule, AuthModule, RealtimeModule],
  controllers: [AnomalyDetectorsController, AnomaliesController],
  providers: [
    AnomalyDetectorsService,
    AnomalyFindingsService,
    AnomaliesQueueService,
    FeatureWindowEngine,
    CleanBaselineFilter,
  ],
  exports: [
    AnomalyDetectorsService,
    AnomalyFindingsService,
    AnomaliesQueueService,
    FeatureWindowEngine,
    CleanBaselineFilter,
  ],
})
export class AnomaliesModule {}

