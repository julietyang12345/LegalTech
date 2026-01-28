import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class TaskProgressDto {
  taskId: string;
  completed: boolean;
  confidenceScore?: number;
  timeSpentMinutes?: number;
}

export class BulkUpdateProgressDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaskProgressDto)
  tasks: TaskProgressDto[];
}
