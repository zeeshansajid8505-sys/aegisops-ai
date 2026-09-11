import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { AuthModule } from '../auth/auth.module';
import { AlertRulesController } from './alert-rules.controller';
import { AlertsController } from './alerts.controller';
import { AlertRulesService } from './alert-rules.service';
import { AlertsService } from './alerts.service';
import { AlertsQueueService } from './alerts-queue.service';
import { MetricWindowEvaluator } from './evaluator/metric-window-evaluator';

@Module({
  imports: [PrismaModule, RedisModule, AuthModule],
  controllers: [AlertRulesController, AlertsController],
  providers: [
    AlertRulesService,
    AlertsService,
    AlertsQueueService,
    MetricWindowEvaluator,
  ],
  exports: [
    AlertRulesService,
    AlertsService,
    AlertsQueueService,
    MetricWindowEvaluator,
  ],
})
export class AlertsModule {}

