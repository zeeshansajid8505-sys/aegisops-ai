import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './modules/health/health.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { RedisModule } from './modules/redis/redis.module';
import { SecurityModule } from './modules/security/security.module';
import { AuthModule } from './modules/auth/auth.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { MembershipsModule } from './modules/memberships/memberships.module';
import { InvitationsModule } from './modules/invitations/invitations.module';
import { TeamsModule } from './modules/teams/teams.module';
import { ServicesModule } from './modules/services/services.module';
import { EnvironmentsModule } from './modules/environments/environments.module';
import { DependenciesModule } from './modules/dependencies/dependencies.module';
import { HealthProbesModule } from './modules/health-probes/health-probes.module';
import { TelemetryModule } from './modules/telemetry/telemetry.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { OperationsModule } from './modules/operations/operations.module';
import { AiModule } from './modules/ai/ai.module';
import { RunbooksModule } from './modules/runbooks/runbooks.module';
import { AnomaliesModule } from './modules/anomalies/anomalies.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReliabilityModule } from './modules/reliability/reliability.module';
import { PostmortemsModule } from './modules/postmortems/postmortems.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { SecurityHeadersMiddleware } from './common/middleware/security-headers.middleware';
import { StructuredLoggerMiddleware } from './common/middleware/structured-logger.middleware';
import { OriginCsrfGuard } from './modules/auth/guards/origin-csrf.guard';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    PrismaModule,
    RedisModule,
    SecurityModule,
    HealthModule,
    AuthModule,
    OrganizationsModule,
    MembershipsModule,
    InvitationsModule,
    TeamsModule,
    ServicesModule,
    EnvironmentsModule,
    DependenciesModule,
    HealthProbesModule,
    TelemetryModule,
    AlertsModule,
    IncidentsModule,
    RealtimeModule,
    OperationsModule,
    AiModule,
    RunbooksModule,
    AnomaliesModule,
    NotificationsModule,
    ReliabilityModule,
    PostmortemsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: OriginCsrfGuard,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(CorrelationIdMiddleware, SecurityHeadersMiddleware, StructuredLoggerMiddleware)
      .forRoutes('*');
  }
}