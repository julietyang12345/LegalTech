import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';

// Entities
import { User } from './database/entities/user.entity';
import { Session } from './database/entities/session.entity';
import { Progress } from './database/entities/progress.entity';
import { Project } from './database/entities/project.entity';
import {
  CurriculumCacheKey,
  CurriculumCacheVariant,
  CurriculumServe,
  SkillAlias,
} from './database/entities/curriculum-cache.entity';

// Modules
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { AiModule } from './modules/ai/ai.module';
import { CurriculumModule } from './modules/curriculum/curriculum.module';
import { SessionModule } from './modules/session/session.module';
import { ProgressModule } from './modules/progress/progress.module';
import { ProjectModule } from './modules/project/project.module';
import { CompanionModule } from './modules/companion/companion.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('database.host'),
        port: configService.get('database.port'),
        username: configService.get('database.username'),
        password: configService.get('database.password'),
        database: configService.get('database.database'),
        entities: [
          User,
          Session,
          Progress,
          Project,
          CurriculumCacheKey,
          CurriculumCacheVariant,
          CurriculumServe,
          SkillAlias,
        ],
        synchronize: configService.get('nodeEnv') === 'development',
        logging: configService.get('nodeEnv') === 'development',
      }),
      inject: [ConfigService],
    }),

    // Rate limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ([{
        ttl: configService.get('rateLimit.ttl'),
        limit: configService.get('rateLimit.limit'),
      }]),
      inject: [ConfigService],
    }),

    // Feature modules
    AuthModule,
    UserModule,
    AiModule,
    CurriculumModule,
    CompanionModule, 
    SessionModule,
    ProgressModule,
    ProjectModule,
  ],
})
export class AppModule {}
