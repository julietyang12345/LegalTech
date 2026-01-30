import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable cookie parsing for HTTP-only auth cookies
  app.use(cookieParser());

  const configService = app.get(ConfigService);

  // Enable CORS
  const frontendUrl = configService.get('frontend.url');
  const allowedOrigins = [
    frontendUrl,
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://10.3.8.169:3000',
    'http://10.3.8.169',
  ].filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, like from Workers edge)
      if (!origin) {
        callback(null, true);
        return;
      }
      // Allow configured origins
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      // Allow flexforge.ai subdomains only
      if (origin.endsWith('.flexforge.ai')) {
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
