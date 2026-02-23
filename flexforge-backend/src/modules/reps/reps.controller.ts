import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RepsService } from './reps.service';
import { GenerateScenariosDto } from './dto/generate-scenarios.dto';
import { SaveIntakeDto } from './dto/save-intake.dto';
import { StartRepDto } from './dto/start-rep.dto';
import { CompleteRepDto } from './dto/complete-rep.dto';

@Controller('reps')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class RepsController {
  constructor(private readonly repsService: RepsService) {}

  @Get('intake')
  async checkIntake(@Request() req) {
    return this.repsService.checkIntake(req.user.id);
  }

  @Post('intake')
  async saveIntake(@Request() req, @Body() dto: SaveIntakeDto) {
    return this.repsService.saveIntake(req.user.id, dto);
  }

  @Post('scenarios')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async generateScenarios(@Request() req, @Body() dto: GenerateScenariosDto) {
    return this.repsService.generateScenarios(req.user.id, dto);
  }

  @Post()
  async startRep(@Request() req, @Body() dto: StartRepDto) {
    return this.repsService.startRep(req.user.id, dto);
  }

  @Post(':id/hint')
  async getHint(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { taskIndex: number },
  ) {
    return this.repsService.getHint(req.user.id, id, body.taskIndex);
  }

  @Post(':id/coach')
  async coachMessage(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { message: string },
  ) {
    return this.repsService.coachMessage(req.user.id, id, body.message);
  }

  @Post(':id/complete')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async completeRep(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: CompleteRepDto,
  ) {
    return this.repsService.completeRep(req.user.id, id, dto);
  }

  @Get()
  async getHistory(@Request() req) {
    return this.repsService.getHistory(req.user.id);
  }
}
