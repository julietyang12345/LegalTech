import { Module, forwardRef } from '@nestjs/common';
import { AiService } from './ai.service';
import { CompanionModule } from '../companion/companion.module';

@Module({
  imports: [forwardRef(() => CompanionModule)],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
