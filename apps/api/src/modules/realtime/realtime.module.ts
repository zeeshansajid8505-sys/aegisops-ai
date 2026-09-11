import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { AuthModule } from '../auth/auth.module';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeEventPublisher } from './realtime-event.publisher';

@Module({
  imports: [PrismaModule, RedisModule, AuthModule],
  providers: [RealtimeGateway, RealtimeEventPublisher],
  exports: [RealtimeGateway, RealtimeEventPublisher],
})
export class RealtimeModule {}

