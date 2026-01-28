import { Injectable, Logger } from '@nestjs/common';
import { AiService, AITask } from '../../ai/ai.service';
import * as fs from 'fs/promises';
import * as path from 'path';

interface GeneratedFiles {
  starter: string;
  hints: string;
  solution: string;
}

@Injectable()
export class FileGeneratorService {
  private readonly logger = new Logger(FileGeneratorService.name);
  private readonly storagePath = path.join(process.cwd(), 'generated_files');

  constructor(private aiService: AiService) {
    this.ensureStorageDir();
  }

  private async ensureStorageDir() {
    try {
      await fs.mkdir(this.storagePath, { recursive: true });
    } catch (error) {
      this.logger.error('Failed to create storage directory:', error);
    }
  }

  /**
   * Generate starter, hints, and solution files for a task
   * NOW INCLUDES THE ACTUAL ANSWER
   */
  async generateTaskFiles(params: {
    taskId: string;
    taskTitle: string;
    taskDescription: string;
    answer: string; // The actual solution from curriculum
    language?: string;
  }): Promise<GeneratedFiles> {
    this.logger.log(`📝 Generating files for task: ${params.taskTitle}`);

    const language = params.language || 'python';
    const extension = this.getFileExtension(language);

    const prompt = `Generate 3 ${language} files for this learning task:

Task: ${params.taskTitle}
Description: ${params.taskDescription}

ACTUAL ANSWER/SOLUTION:
${params.answer}

Generate:
1. STARTER FILE: 
   - Code skeleton based on the answer above
   - Include TODO comments showing what to implement
   - Remove the actual implementation but keep structure
   
2. HINTS FILE: 
   - Progressive hints (Level 1, 2, 3)
   - Level 1: Gentle nudge about approach
   - Level 2: More specific guidance with pseudo-code
   - Level 3: Almost the answer (very detailed)
   
3. SOLUTION FILE: 
   - Use the ACTUAL ANSWER provided above
   - Add explanatory comments
   - Ensure it's well-formatted and production-ready

Return ONLY valid JSON (no markdown code blocks):
{
  "starter": "# Starter code with TODO comments",
  "hints": "# Progressive hints (3 levels)",
  "solution": "# ACTUAL ANSWER with comments"
}`;

    const response = await this.aiService.routeRequest(
      AITask.CODE_GENERATION,
      prompt,
    );

    // Parse response
    const files = JSON.parse(response.content);

    // Save files to disk
    const savedFiles = await this.saveFiles(params.taskId, files, extension);

    return savedFiles;
  }

  /**
   * Generate boss project files
   * NOW INCLUDES THE ACTUAL ANSWER
   */
  async generateBossProjectFiles(params: {
    projectId: string;
    title: string;
    requirements: string[];
    answer: string; // The actual solution from curriculum
    dayNumber: number;
    language?: string;
  }): Promise<GeneratedFiles> {
    this.logger.log(`🏆 Generating Boss Project files: ${params.title}`);

    const language = params.language || 'python';
    const extension = this.getFileExtension(language);

    const prompt = `Generate boss project files for Day ${params.dayNumber}:

Title: ${params.title}
Requirements:
${params.requirements.map((req, i) => `${i + 1}. ${req}`).join('\n')}

ACTUAL SOLUTION:
${params.answer}

Generate:
1. STARTER: 
   - Full skeleton based on the solution
   - Detailed TODO comments for each section
   - Keep structure but remove implementation
   
2. HINTS: 
   - 5 progressive hint levels
   - Level 1-2: High-level approach
   - Level 3-4: Specific implementation guidance
   - Level 5: Nearly complete pseudo-code
   
3. SOLUTION: 
   - Use the ACTUAL SOLUTION provided above
   - Add comprehensive comments explaining logic
   - Production-quality code with best practices

Return ONLY valid JSON (no markdown):
{
  "starter": "# Boss project starter",
  "hints": "# 5 levels of progressive hints",
  "solution": "# ACTUAL SOLUTION with detailed comments"
}`;

    const response = await this.aiService.routeRequest(
      AITask.CODE_GENERATION,
      prompt,
    );

    const files = JSON.parse(response.content);
    const savedFiles = await this.saveFiles(params.projectId, files, extension);

    return savedFiles;
  }

  /**
   * Save files to disk and return URLs
   */
  private async saveFiles(
    baseId: string,
    files: { starter: string; hints: string; solution: string },
    extension: string,
  ): Promise<GeneratedFiles> {
    const urls: GeneratedFiles = {
      starter: '',
      hints: '',
      solution: '',
    };

    for (const [fileType, content] of Object.entries(files)) {
      const filename = `${baseId}_${fileType}.${extension}`;
      const filepath = path.join(this.storagePath, filename);

      // Save file
      await fs.writeFile(filepath, content, 'utf-8');

      // In production, upload to S3/CDN and return URL
      // For now, return local file path
      urls[fileType as keyof GeneratedFiles] = `/files/${filename}`;

      this.logger.log(`  ✅ Saved: ${filename}`);
    }

    return urls;
  }

  /**
   * Get file extension for language
   */
  private getFileExtension(language: string): string {
    const extensions: Record<string, string> = {
      python: 'py',
      javascript: 'js',
      typescript: 'ts',
      java: 'java',
      cpp: 'cpp',
      csharp: 'cs',
      go: 'go',
      rust: 'rs',
      html: 'html',
      css: 'css',
    };

    return extensions[language.toLowerCase()] || 'txt';
  }
}
