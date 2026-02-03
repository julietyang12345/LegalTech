import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { AppController } from './app.controller';
import { AppService } from './app.service';

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
  DayContentCache,
  DayContentCacheVariant,
  DayContentServe,
} from './database/entities/curriculum-cache.entity';
import { AuditLog } from './database/entities/audit-log.entity';
import { Waitlist } from './database/entities/waitlist.entity';
import { CommunityPost, CommunityComment } from './database/entities/community-post.entity';
import { Notification } from './database/entities/notification.entity';

// Modules
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { AiModule } from './modules/ai/ai.module';
import { CurriculumModule } from './modules/curriculum/curriculum.module';
import { SessionModule } from './modules/session/session.module';
import { ProgressModule } from './modules/progress/progress.module';
import { ProjectModule } from './modules/project/project.module';
import { CompanionModule } from './modules/companion/companion.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { TtsModule } from './modules/tts/tts.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { WaitlistModule } from './modules/waitlist/waitlist.module';
import { CommunityModule } from './modules/community/community.module';

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
          DayContentCache,
          DayContentCacheVariant,
          DayContentServe,
          AuditLog,
          Waitlist,
          CommunityPost,
          CommunityComment,
          Notification,
        ],
        synchronize: configService.get('nodeEnv') === 'development',
        logging: configService.get('nodeEnv') === 'development',
        ssl: configService.get('database.ssl')
          ? { rejectUnauthorized: false }
          : false,
      }),
      inject: [ConfigService],
    }),

    // Rate limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => [
        {
          ttl: configService.get('rateLimit.ttl'),
          limit: configService.get('rateLimit.limit'),
        },
      ],
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
    OnboardingModule,
    TtsModule,
    AnalyticsModule,
    WaitlistModule,
    CommunityModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
