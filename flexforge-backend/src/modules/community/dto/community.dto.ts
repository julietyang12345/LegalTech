import { IsString, IsOptional, IsEnum, IsObject, IsBoolean, IsNumber } from 'class-validator';

export class CreatePostDto {
  @IsEnum(['project', 'question', 'progress'])
  type: 'project' | 'question' | 'progress';

  @IsString()
  @IsOptional()
  title?: string;

  @IsEnum(['started', 'in-progress', 'paused', 'completed'])
  @IsOptional()
  currentState?: 'started' | 'in-progress' | 'paused' | 'completed';

  @IsString()
  @IsOptional()
  whatDone?: string;

  @IsString()
  @IsOptional()
  feedbackWanted?: string;

  @IsString()
  @IsOptional()
  codeSnippet?: string;

  @IsObject()
  @IsOptional()
  linkedCourse?: {
    sessionId: string;
    skillName: string;
    skillLevel: string;
    durationDays: number;
    currentDay: number;
    progress: number;
  };

  @IsNumber()
  @IsOptional()
  dayNumber?: number;

  @IsString()
  @IsOptional()
  stepType?: string;

  @IsObject()
  @IsOptional()
  sharedContent?: {
    question?: string;
    options?: string[];
    correctAnswer?: string;
  };

  @IsString()
  @IsOptional()
  question?: string;

  @IsString()
  @IsOptional()
  whatTrying?: string;

  @IsString()
  @IsOptional()
  whatTried?: string;

  @IsString()
  @IsOptional()
  whereStuck?: string;

  @IsString()
  @IsOptional()
  progressNote?: string;

  @IsString()
  @IsOptional()
  groupId?: string;
}

export class CreateCommentDto {
  @IsString()
  content: string;

  @IsEnum(['worked-for-me', 'clarification', 'watch-out', 'general'])
  @IsOptional()
  commentType?: 'worked-for-me' | 'clarification' | 'watch-out' | 'general';
}

export class RequestCourseAccessDto {
  @IsString()
  postId: string;

  @IsString()
  @IsOptional()
  message?: string;
}

export class MarkNotificationReadDto {
  @IsString()
  notificationId: string;
}
