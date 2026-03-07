import { IsArray, IsOptional, IsNumber, ValidateNested, IsString, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

class QuizAnswerDto {
  @IsString()
  questionId: string;

  @IsInt()
  selectedIndex: number;
}

export class CompleteQuizDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuizAnswerDto)
  answers: QuizAnswerDto[];

  @IsNumber()
  @IsOptional()
  confidenceScore?: number;
}
