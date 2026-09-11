import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { EvidenceBuilderService } from './evidence-builder.service';
import { PostmortemsService } from './postmortems.service';
import { PostmortemsController } from './postmortems.controller';

@Module({
  imports: [PrismaModule, RealtimeModule],
  controllers: [PostmortemsController],
  providers: [EvidenceBuilderService, PostmortemsService],
  exports: [EvidenceBuilderService, PostmortemsService],
})
export class PostmortemsModule {}

