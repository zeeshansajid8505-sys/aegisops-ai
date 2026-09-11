import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AiServiceClient } from './ai-service.client';
import { RcaEvidenceBuilder } from './rca-evidence.builder';
import { AiQueueService } from './ai-queue.service';
import { RcaService } from './rca.service';
import { RcaController } from './rca.controller';

@Module({
  imports: [PrismaModule, RealtimeModule],
  controllers: [RcaController],
  providers: [
    AiServiceClient,
    RcaEvidenceBuilder,
    AiQueueService,
    RcaService,
  ],
  exports: [
    AiServiceClient,
    RcaEvidenceBuilder,
    AiQueueService,
    RcaService,
  ],
})
export class AiModule {}

