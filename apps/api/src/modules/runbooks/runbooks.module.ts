import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { RunbooksService } from './runbooks.service';
import { RunbooksController } from './runbooks.controller';

@Module({
  imports: [PrismaModule, RealtimeModule],
  controllers: [RunbooksController],
  providers: [RunbooksService],
  exports: [RunbooksService],
})
export class RunbooksModule {}

