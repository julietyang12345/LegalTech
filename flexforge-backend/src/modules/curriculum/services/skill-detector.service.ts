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

// Supported languages for language learning
export type TargetLanguage =
  | 'chinese'
  | 'japanese'
  | 'korean'
  | 'arabic'
  | 'spanish'
  | 'french'
  | 'german'
  | 'italian'
  | 'portuguese'
  | 'russian'
  | 'hindi'
  | 'thai'
  | 'vietnamese'
  | 'other';

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

  // Language learning specific (when skillType is KNOWLEDGE + human language)
  isLanguageLearning?: boolean;
  targetLanguage?: TargetLanguage;
  proficiencyLevel?: string; // HSK1, N5, A1, etc.

  // Hybrid skill sections (when skill spans multiple categories)
  customSections?: {
    task1: string[]; // e.g., ['quiz', 'outputPrediction', 'designCritique']
    intensive: string[]; // e.g., ['codeCompletion', 'designCritique', 'quiz']
  } | null;
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

CATEGORIZATION RULES (in order of priority):

1. CODE - Use when the skill produces EXECUTABLE CODE as output
   - The learner will write, read, or debug code
   - Includes: programming languages, frameworks, libraries, APIs, databases, DevOps
   - Includes: data analysis/science that involves writing code
   - Output type: runnable code files
   - KEY TEST: Will the learner produce .js/.py/.ts/.sql/etc files?

2. AI_AGENT - Use when the skill is about USING or BUILDING with AI tools
   - Working with LLMs, chatbots, AI automation
   - Prompt engineering, AI workflows
   - Output type: prompts, AI configurations, or AI-integrated code

3. DESIGN - Use when the skill produces VISUAL or CREATIVE output
   - Graphic design, UI/UX, illustration, video/audio production
   - Creative writing, content creation
   - Output type: images, videos, designs, written content

4. PHYSICAL - Use when the skill requires BODILY practice or produces PHYSICAL results
   - Sports, instruments, dance, cooking, crafts
   - Home improvement, mechanical work, construction
   - Output type: physical actions, built objects, prepared items
   - Safety levels: low/medium/high based on injury risk

5. KNOWLEDGE - Use ONLY when NO practical output is produced
   - Pure academic learning: human languages, history, philosophy, theory
   - Exam preparation for non-practical subjects
   - Output type: knowledge recall, written explanations only
   - KEY TEST: If the learner will CREATE something (code/design/physical), do NOT use KNOWLEDGE
   - LANGUAGE LEARNING: If learning a human language (Chinese, Spanish, Japanese, etc.):
     - Set isLanguageLearning: true
     - Set targetLanguage to one of: chinese, japanese, korean, arabic, spanish, french, german, italian, portuguese, russian, hindi, thai, vietnamese, other
     - Set proficiencyLevel if mentioned (HSK1-6, JLPT N5-N1, CEFR A1-C2, etc.)

CRITICAL: "Learning" or "understanding" something does NOT make it KNOWLEDGE category.
- Learning a programming language → CODE (produces code)
- Learning a human language → KNOWLEDGE (produces speech/writing only)
- Learning a framework → CODE (produces code)
- Learning music theory → KNOWLEDGE (theory only)
- Learning an instrument → PHYSICAL (requires practice)

HYBRID SKILLS: Some skills span multiple categories. If a skill doesn't fit cleanly into one category:
- Pick the PRIMARY category as skillType
- Set customSections to mix exercise types from both categories
- Example: "Data Visualization" = CODE primary + DESIGN elements
  → customSections: {task1: ["quiz", "outputPrediction", "designCritique"], intensive: ["codeCompletion", "designCritique", "quiz"]}
- Example: "Music Production" = DESIGN primary + CODE elements (for DAWs)
  → customSections: {task1: ["quiz", "designCritique", "fillBlank"], intensive: ["designCritique", "quiz", "matching"]}

Available section types:
- Universal: quiz, matching, fillBlank
- CODE/AI_AGENT: outputPrediction, codeCompletion, debugging
- PHYSICAL: reorder, formCheck, safetyCheck
- DESIGN: designCritique
- KNOWLEDGE: reorder (for sequential topics)

Complexity Assessment:
- BEGINNER: No prerequisites, achievable in 2-5 days
- INTERMEDIATE: Requires background knowledge, 7-14 days
- ADVANCED: Requires strong foundation, 30+ days

Return ONLY valid JSON:
{
  "skillType": "CODE" | "PHYSICAL" | "KNOWLEDGE" | "DESIGN" | "AI_AGENT",
  "complexity": "BEGINNER" | "INTERMEDIATE" | "ADVANCED",
  "confidence": "high" | "medium" | "low",
  "reasoning": "Brief explanation of why this category",
  "suggestedLanguage": "language" (only for CODE/AI_AGENT),
  "safetyLevel": "low" | "medium" | "high" (only for PHYSICAL),
  "prerequisiteSkills": ["skill1", "skill2"] (if INTERMEDIATE/ADVANCED),
  "estimatedDaysNeeded": number,
  "cognitiveLoadWarning": "warning if timeframe is too short",
  "isLanguageLearning": true/false (only for KNOWLEDGE - human language learning),
  "targetLanguage": "chinese" | ... | "other" (only if isLanguageLearning),
  "proficiencyLevel": "HSK1" | "N5" | "A1" | etc. (only if mentioned in skill name),
  "customSections": null | {task1: ["section1", "section2", ...], intensive: ["section1", ...]} (only for hybrid skills)
}`;

    const response = await this.aiService.routeRequest(
      AITask.BATCH_LOGIC,
      prompt,
    );

    let result: SkillDetectionResult;
    try {
      // Strip markdown code blocks if present (```json ... ``` or ``` ... ```)
      let jsonContent = response.content.trim();
      this.logger.log(
        `🔍 Raw AI response (first 500 chars): ${jsonContent.substring(0, 500)}`,
      );

      if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent
          .replace(/^```(?:json)?\s*\n?/, '')
          .replace(/\n?```\s*$/, '');
        this.logger.log(
          `🔍 After stripping markdown: ${jsonContent.substring(0, 500)}`,
        );
      }
      result = JSON.parse(jsonContent);

      // Ensure estimatedDaysNeeded has a default value based on complexity
      if (!result.estimatedDaysNeeded) {
        const defaultDays = {
          [SkillComplexity.BEGINNER]: 5,
          [SkillComplexity.INTERMEDIATE]: 10,
          [SkillComplexity.ADVANCED]: 30,
        };
        result.estimatedDaysNeeded = defaultDays[result.complexity] || 7;
        this.logger.warn(
          `⚠️ AI did not return estimatedDaysNeeded, defaulting to ${result.estimatedDaysNeeded} days`,
        );
      }

      // DEBUG: Log full parsed result
      this.logger.log(
        `🔍 Parsed skill detection result:`,
        JSON.stringify({
          skillType: result.skillType,
          complexity: result.complexity,
          isLanguageLearning: result.isLanguageLearning,
          targetLanguage: result.targetLanguage,
          proficiencyLevel: result.proficiencyLevel,
          customSections: result.customSections,
          confidence: result.confidence,
          reasoning: result.reasoning?.substring(0, 100),
        }),
      );

      // Validate AI_AGENT complexity vs days
      if (result.skillType === SkillType.AI_AGENT) {
        if (
          result.complexity === SkillComplexity.BEGINNER &&
          result.estimatedDaysNeeded <= 5
        ) {
          this.logger.log(
            `✅ AI Agent skill (BEGINNER) - ${result.estimatedDaysNeeded} days is realistic`,
          );
        } else if (
          result.complexity === SkillComplexity.INTERMEDIATE &&
          result.estimatedDaysNeeded < 7
        ) {
          result.cognitiveLoadWarning = `WARNING: This requires basic coding knowledge. ${result.estimatedDaysNeeded} days may not be enough. Recommend 7-10 days.`;
          this.logger.warn(result.cognitiveLoadWarning);
        } else if (
          result.complexity === SkillComplexity.ADVANCED &&
          result.estimatedDaysNeeded < 30
        ) {
          result.cognitiveLoadWarning = `CRITICAL: Building AI agents requires strong coding background. ${result.estimatedDaysNeeded} days is insufficient. Recommend 30+ days or break into multiple courses.`;
          this.logger.error(result.cognitiveLoadWarning);
        }
      }

      this.logger.log(
        `✅ Detected: ${result.skillType} (${result.complexity}) - ${result.estimatedDaysNeeded} days`,
      );

      // Log language learning detection
      if (result.isLanguageLearning) {
        this.logger.log(
          `🌍 Language learning detected: ${result.targetLanguage} (${result.proficiencyLevel || 'beginner'})`,
        );
      }
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
