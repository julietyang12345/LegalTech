import {
  Controller,
  Post,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { CurriculumService } from './curriculum.service';
import { GenerateCurriculumDto } from './dto/generate-curriculum.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('curriculum')
@UseGuards(JwtAuthGuard)
export class CurriculumController {
  constructor(private curriculumService: CurriculumService) {}

  /**
   * POST /api/v1/curriculum/generate
   * Generate curriculum (for preview, not saved to session)
   */
  @Post('generate')
  async generate(@Body() dto: GenerateCurriculumDto) {
    try {
      const result = await this.curriculumService.generateCurriculum(dto);

      return {
        message: 'Curriculum generated successfully',
        curriculum: result.curriculum,
        metadata: {
          tokensUsed: result.tokensUsed,
          cost: result.cost,
        },
      };
    } catch (error) {
      throw new BadRequestException(
        error.message || 'Failed to generate curriculum',
      );
    }
  }

  /**
   * POST /api/v1/curriculum/starter-code
   * Generate starter code template
   */
  @Post('starter-code')
  async generateStarterCode(
    @Body()
    body: {
      projectTitle: string;
      projectDescription: string;
      language: string;
    },
  ) {
    const result = await this.curriculumService.generateStarterCode(body);

    return {
      message: 'Starter code generated successfully',
      code: result.code,
      metadata: {
        tokensUsed: result.tokensUsed,
        cost: result.cost,
      },
    };
  }
}