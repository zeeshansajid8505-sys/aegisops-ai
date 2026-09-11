import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReliabilityRollupService } from './reliability-rollup.service';
import { ReliabilityAnalyticsService } from './reliability-analytics.service';
import { ReliabilityController } from './reliability.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ReliabilityController],
  providers: [ReliabilityRollupService, ReliabilityAnalyticsService],
  exports: [ReliabilityRollupService, ReliabilityAnalyticsService],
})
export class ReliabilityModule {}

