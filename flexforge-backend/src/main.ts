import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  // Enable CORS
  app.enableCors({
    origin: configService.get('frontend.url'),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
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
