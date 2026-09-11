import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe, ForbiddenException } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import express from 'express';
import { AppModule } from './app.module';
import { validateEnvironment } from './config/env.config';
import { SessionService } from './modules/auth/session.service';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const env = validateEnvironment();

  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'warn', 'error', 'debug'],
    rawBody: true,
  });

  app.enableShutdownHooks();

  const expressApp = app.getHttpAdapter().getInstance();
  if (typeof expressApp?.disable === 'function') {
    expressApp.disable('x-powered-by');
  }

  app.use(express.raw({ type: ['application/x-protobuf', 'application/octet-stream'], limit: '10mb' }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  app.enableCors({
    origin: (origin, callback) => {
      // In production, enforce strictly whitelisted CORS origins; in dev allow localhost/loopback
      if (!origin) {
        callback(null, true);
      } else if (env.corsOrigins.includes(origin)) {
        callback(null, true);
      } else if (env.nodeEnv !== 'production' && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))) {
        callback(null, true);
      } else {
        callback(new ForbiddenException('Blocked by CORS policy'));
      }
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('AegisOps AI Core API')
    .setDescription('Incident Management, Observability and SRE Platform Business API')
    .setVersion('0.1.0')
    .addTag('Health')
    .addTag('Authentication')
    .addTag('Organizations')
    .addTag('Memberships')
    .addTag('Invitations')
    .addCookieAuth(SessionService.COOKIE_NAME, {
      type: 'apiKey',
      in: 'cookie',
      name: SessionService.COOKIE_NAME,
      description: 'Opaque HTTP-only session token cookie',
    })
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(env.port, '0.0.0.0');
  logger.log(`AegisOps AI Core API running on http://localhost:${env.port}/api`);
  logger.log(`Swagger OpenAPI documentation: http://localhost:${env.port}/api/docs`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal API bootstrap error:', err);
  process.exit(1);
});