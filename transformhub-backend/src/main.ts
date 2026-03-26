import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { TRANSFORMHUB_REQUEST_BODY_LIMIT } from './modules/transformhub/transformhub.constants';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  app.use(cookieParser());

  const configService = app.get(ConfigService);
  const isProduction = configService.get('nodeEnv') === 'production';
  const requestBodyLimit = configService.get('transformhub.requestBodyLimit') || TRANSFORMHUB_REQUEST_BODY_LIMIT;

  app.use(express.json({ limit: requestBodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: requestBodyLimit }));
  app.use(helmet({ contentSecurityPolicy: isProduction ? undefined : false, crossOriginEmbedderPolicy: false }));

  const frontendUrl = configService.get('frontend.url');
  const allowedOrigins = [
    frontendUrl,
    'https://flexforge.ai',
    'https://app.flexforge.ai',
    ...(isProduction ? [] : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:4010']),
  ].filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'X-TransformHub-Api-Key'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.setGlobalPrefix('api/v1');

  const port = configService.get('port') || 4010;
  await app.listen(port);

  console.log('');
  console.log('🚀 TransformHub Backend running!');
  console.log(`🚀 http://localhost:${port}/api/v1/transformhub/health`);
  console.log(`🚀 Environment: ${configService.get('nodeEnv')}`);
  console.log('');
}

bootstrap();
