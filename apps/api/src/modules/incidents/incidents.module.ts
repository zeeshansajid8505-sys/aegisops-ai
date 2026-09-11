import { Module } from '@nestjs/common';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
import { IncidentsQueueService } from './incidents-queue.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [PrismaModule, AuthModule, RealtimeModule],
  controllers: [IncidentsController],
  providers: [IncidentsService, IncidentsQueueService],
  exports: [IncidentsService, IncidentsQueueService],
})
export class IncidentsModule {}

