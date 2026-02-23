import { IsObject } from 'class-validator';

export class StartRepDto {
  @IsObject()
  scenario: {
    title: string;
    briefing: string;
    tasks: Array<{
      id: string;
      title: string;
      description: string;
      estimatedMinutes: number;
    }>;
    estimatedMinutes: number;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    skillTags: string[];
  };
}
