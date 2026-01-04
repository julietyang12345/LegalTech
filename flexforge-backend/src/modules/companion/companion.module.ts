import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanionService } from './companion.service';
import { CompanionController } from './companion.controller';
import { User } from '../../database/entities/user.entity';
import { Session } from '../../database/entities/session.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Session])],
  controllers: [CompanionController],
  providers: [CompanionService],
  exports: [CompanionService],
})
export class CompanionModule {}
