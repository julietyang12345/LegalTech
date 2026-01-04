import { Injectable, Logger } from '@nestjs/common';
import { AiService, AITask } from '../../ai/ai.service';

export enum SkillType {
  CODE = 'CODE',
  PHYSICAL = 'PHYSICAL',
  KNOWLEDGE = 'KNOWLEDGE',
  DESIGN = 'DESIGN',
  AI_AGENT = 'AI_AGENT', // NEW: AI Agent specific
}

export enum SkillComplexity {
  BEGINNER = 'BEGINNER', // No coding needed
  INTERMEDIATE = 'INTERMEDIATE', // Basic coding skills
  ADVANCED = 'ADVANCED', // Strong coding background
}

export interface SkillDetectionResult {
  skillType: SkillType;
  complexity: SkillComplexity;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  suggestedLanguage?: string;
  safetyLevel?: 'low' | 'medium' | 'high';
  prerequisiteSkills?: string[];
  estimatedDaysNeeded: number;
  cognitiveLoadWarning?: string;
}

@Injectable()
export class SkillDetectorService {
  private readonly logger = new Logger(SkillDetectorService.name);

  constructor(private aiService: AiService) {}

  /**
   * Detect skill type and complexity using Claude
   */
  async detectSkillType(skillName: string): Promise<SkillDetectionResult> {
    this.logger.log(`🔍 Detecting skill type for: "${skillName}"`);

    const prompt = `Analyze this skill and categorize it:

Skill: "${skillName}"

Categories:
1. CODE: Traditional programming, web dev, data analysis, software
   - Examples: Python, React, SQL, Machine Learning
   - Output: Actual code solutions

2. PHYSICAL: Home improvement, crafts, cooking, mechanical work
   - Examples: Fix electrical panel, build deck, plumbing, car repair
   - Output: Checklists, safety warnings, verification criteria
   - Safety levels: low (painting), medium (carpentry), high (electrical/gas)

3. KNOWLEDGE: Languages, history, theory, concepts, academic
   - Examples: Learn Spanish, Music theory, Business concepts
   - Output: Quiz questions, practice exercises, explanations

4. DESIGN: Graphic design, writing, creative work, video/audio editing
   - Examples: Photoshop, Creative writing, Video editing
   - Output: Example outputs, design principles, rubrics

5. AI_AGENT: Using AI tools, prompt engineering, building AI workflows
   - Examples: ChatGPT mastery, AI automation, prompt engineering
   - Output: Prompts, workflows, API integration (if advanced)
   - Complexity levels:
     * BEGINNER: Pure AI tool usage (no coding) - 2-4 days sufficient
     * INTERMEDIATE: AI + basic scripting - 7-10 days needed
     * ADVANCED: Building AI agents - 30+ days needed

Complexity Assessment (CRITICAL):
- BEGINNER: No prerequisites, can learn in 2-5 days
- INTERMEDIATE: Requires some background knowledge, 7-14 days
- ADVANCED: Requires strong foundation, 30+ days

For AI_AGENT skills specifically:
- "Use ChatGPT" / "Prompt engineering" → BEGINNER (2-4 days ✅)
- "Build AI workflows" / "AI automation" → INTERMEDIATE (7-10 days, needs basic coding)
- "Create AI agents" / "Deploy AI systems" → ADVANCED (30+ days, needs strong coding)

Return ONLY valid JSON (no markdown):
{
  "skillType": "CODE" | "PHYSICAL" | "KNOWLEDGE" | "DESIGN" | "AI_AGENT",
  "complexity": "BEGINNER" | "INTERMEDIATE" | "ADVANCED",
  "confidence": "high" | "medium" | "low",
  "reasoning": "Brief explanation",
  "suggestedLanguage": "python" (only for CODE/AI_AGENT if coding involved),
  "safetyLevel": "low" | "medium" | "high" (only for PHYSICAL),
  "prerequisiteSkills": ["Skill 1", "Skill 2"] (if INTERMEDIATE/ADVANCED),
  "estimatedDaysNeeded": 4,
  "cognitiveLoadWarning": "Warning if trying to teach advanced skill in short time"
}`;

    const response = await this.aiService.routeRequest(AITask.BATCH_LOGIC, prompt);

    let result: SkillDetectionResult;
    try {
      result = JSON.parse(response.content);
      
      // Validate AI_AGENT complexity vs days
      if (result.skillType === SkillType.AI_AGENT) {
        if (result.complexity === SkillComplexity.BEGINNER && result.estimatedDaysNeeded <= 5) {
          this.logger.log(`✅ AI Agent skill (BEGINNER) - ${result.estimatedDaysNeeded} days is realistic`);
        } else if (result.complexity === SkillComplexity.INTERMEDIATE && result.estimatedDaysNeeded < 7) {
          result.cognitiveLoadWarning = 
            `WARNING: This requires basic coding knowledge. ${result.estimatedDaysNeeded} days may not be enough. Recommend 7-10 days.`;
          this.logger.warn(result.cognitiveLoadWarning);
        } else if (result.complexity === SkillComplexity.ADVANCED && result.estimatedDaysNeeded < 30) {
          result.cognitiveLoadWarning = 
            `CRITICAL: Building AI agents requires strong coding background. ${result.estimatedDaysNeeded} days is insufficient. Recommend 30+ days or break into multiple courses.`;
          this.logger.error(result.cognitiveLoadWarning);
        }
      }

      this.logger.log(
        `✅ Detected: ${result.skillType} (${result.complexity}) - ${result.estimatedDaysNeeded} days`,
      );
    } catch (error) {
      this.logger.error('Failed to parse skill detection:', error.message);
      // Default to BEGINNER AI_AGENT if parsing fails
      result = {
        skillType: SkillType.AI_AGENT,
        complexity: SkillComplexity.BEGINNER,
        confidence: 'low',
        reasoning: 'Failed to detect, defaulting to AI tool usage',
        estimatedDaysNeeded: 4,
      };
    }

    return result;
  }

  /**
   * Validate if skill can be taught in given timeframe
   */
  validateTimeframe(
    estimatedDaysNeeded: number,
    requestedDays: number,
    complexity: SkillComplexity,
  ): {
    feasible: boolean;
    warning?: string;
    recommendation?: string;
  } {
    if (requestedDays >= estimatedDaysNeeded) {
      return { feasible: true };
    }

    const daysDifference = estimatedDaysNeeded - requestedDays;

    if (complexity === SkillComplexity.BEGINNER && daysDifference <= 2) {
      return {
        feasible: true,
        warning: `Curriculum is condensed. Recommend ${estimatedDaysNeeded} days for comfortable learning.`,
      };
    }

    if (complexity === SkillComplexity.INTERMEDIATE && daysDifference <= 3) {
      return {
        feasible: true,
        warning: `This is an aggressive timeline. Users will need to dedicate extra time each day.`,
        recommendation: `Consider extending to ${estimatedDaysNeeded} days or increasing daily hours.`,
      };
    }

    if (complexity === SkillComplexity.ADVANCED) {
      return {
        feasible: false,
        warning: `CRITICAL: ${requestedDays} days is insufficient for this advanced skill.`,
        recommendation: `This skill requires ${estimatedDaysNeeded}+ days. Consider breaking into multiple courses or creating a longer learning path.`,
      };
    }

    return {
      feasible: false,
      warning: `${requestedDays} days is too short for this skill.`,
      recommendation: `Recommend at least ${estimatedDaysNeeded} days.`,
    };
  }
}