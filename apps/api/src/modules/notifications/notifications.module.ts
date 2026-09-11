import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationRouterService } from './notification-router.service';
import { NotificationsQueueService } from './notifications-queue.service';
import { EmailProvider } from './providers/email.provider';
import { SlackProvider } from './providers/slack.provider';
import { WebhookProvider } from './providers/webhook.provider';
import { RealtimeModule } from '../realtime/realtime.module';
import { RedisModule } from '../redis/redis.module';
import { SecurityModule } from '../security/security.module';
import { AuthModule } from '../auth/auth.module';

@Global()
@Module({
  imports: [RealtimeModule, RedisModule, SecurityModule, AuthModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationRouterService,
    NotificationsQueueService,
    EmailProvider,
    SlackProvider,
    WebhookProvider,
  ],
  exports: [NotificationsService, NotificationRouterService, NotificationsQueueService],
})
export class NotificationsModule {}

