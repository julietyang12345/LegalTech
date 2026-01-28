import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from '../../database/entities/session.entity';
import { User } from '../../database/entities/user.entity';
import { SessionService } from './session.service';
import { SessionController } from './session.controller';
import { CurriculumModule } from '../curriculum/curriculum.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Session, User]),
    CurriculumModule,
    UserModule,
  ],
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
