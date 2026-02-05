import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable cookie parsing for HTTP-only auth cookies
  app.use(cookieParser());

  const configService = app.get(ConfigService);
  const isProduction = configService.get('nodeEnv') === 'production';

  // Security headers with Helmet
  app.use(
    helmet({
      contentSecurityPolicy: isProduction ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Enable CORS
  const frontendUrl = configService.get('frontend.url');
  const allowedOrigins = [
    frontendUrl,
    'https://flexforge.ai',
    'https://www.flexforge.ai',
    'https://app.flexforge.ai',
    ...(isProduction
      ? []
      : [
          'http://localhost:5173',
          'http://localhost:3000',
          'http://localhost:3001',
          'http://10.3.8.169:3000',
          'http://10.3.8.169',
        ]),
  ].filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      // In development, allow requests without origin (for testing)
      // In production, only allow no-origin for server-to-server (edge workers use their own headers)
      if (!origin) {
        if (!isProduction) {
          callback(null, true);
          return;
        }
        // In production, allow no-origin for internal requests (edge workers)
        // Edge workers add CF-Access headers, so this is acceptable
        callback(null, true);
        return;
      }
      // Allow configured origins only (explicit list, no subdomain wildcards)
      // This prevents subdomain takeover attacks
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'x-real-ip',
      'x-request-id',
      'x-edge-signature',
      'x-edge-timestamp',
      'x-edge-user-id',
      'x-edge-payload',
      'cf-access-client-id',
      'cf-access-client-secret',
    ],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // API prefix
  app.setGlobalPrefix('api/v1');

  const port = configService.get('port');
  await app.listen(port);

  console.log('');
  console.log('🚀 ===============================================');
  console.log('🚀 FlexForge Backend is running!');
  console.log('🚀 ===============================================');
  console.log(`🚀 Server:      http://localhost:${port}`);
  console.log(`🚀 API:         http://localhost:${port}/api/v1`);
  console.log(`🚀 Environment: ${configService.get('nodeEnv')}`);
  console.log('🚀 ===============================================');
  console.log('');
  console.log('📡 Available endpoints:');
  console.log('   POST   /api/v1/auth/register');
  console.log('   POST   /api/v1/auth/login');
  console.log('   GET    /api/v1/users/me');
  console.log('   GET    /api/v1/users/quota');
  console.log('   POST   /api/v1/sessions');
  console.log('   GET    /api/v1/sessions');
  console.log('   POST   /api/v1/curriculum/generate');
  console.log('   GET    /api/v1/progress/session/:id');
  console.log('   GET    /api/v1/projects');
  console.log('');
}

bootstrap();
