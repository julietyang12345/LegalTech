import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Rep } from '../../database/entities/rep.entity';
import { User } from '../../database/entities/user.entity';
import { AiModule } from '../ai/ai.module';
import { UserModule } from '../user/user.module';
import { CurriculumModule } from '../curriculum/curriculum.module';
import { AbilityModule } from '../ability/ability.module';
import { RepsController } from './reps.controller';
import { RepsService } from './reps.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Rep, User]),
    AiModule,
    UserModule,
    CurriculumModule,
    AbilityModule,
  ],
  controllers: [RepsController],
  providers: [RepsService],
  exports: [RepsService],
})
export class RepsModule {}
