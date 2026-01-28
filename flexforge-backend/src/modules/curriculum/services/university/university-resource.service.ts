import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

// ============================================
// UNIVERSITY RESOURCE SERVICE
// ============================================
// Searches for educational resources from .edu domains
// Uses Google Custom Search API (100 free/day)
// ============================================

export type UniversityResourceType =
  | 'lecture_video'
  | 'lecture_notes'
  | 'slides'
  | 'problem_set'
  | 'assignment'
  | 'syllabus'
  | 'reading';

export interface UniversityResource {
  type: UniversityResourceType;
  source: string;
  title: string;
  url: string;
  description?: string;
  confidence: number; // 0-100 relevance score
}

export interface UniversitySearchResult {
  success: boolean;
  resources: UniversityResource[];
  error?: string;
}

interface GoogleCSEItem {
  title: string;
  link: string;
  snippet?: string;
  displayLink?: string;
}

interface GoogleCSEResponse {
  items?: GoogleCSEItem[];
  searchInformation?: {
    totalResults: string;
  };
}

@Injectable()
export class UniversityResourceService {
  private readonly logger = new Logger(UniversityResourceService.name);
  private readonly apiKey: string;
  private readonly engineId: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('google.cse.apiKey') || '';
    this.engineId = this.configService.get<string>('google.cse.engineId') || '';

    if (!this.apiKey || !this.engineId) {
      this.logger.warn(
        'Google CSE not configured - university search will be limited',
      );
    }
  }

  /**
   * Search for university resources on a topic
   * Uses Google Custom Search API with .edu domain filter
   * @param dayObjectives - Learning objectives for content matching
   */
  async searchResources(
    concept: string,
    resourceType: UniversityResourceType = 'lecture_video',
    limit: number = 5,
    dayObjectives: string[] = [],
  ): Promise<UniversitySearchResult> {
    this.logger.log(
      `🎓 Searching university resources for: "${concept}" (${resourceType})`,
    );

    if (!this.apiKey || !this.engineId) {
      return {
        success: false,
        resources: [],
        error: 'Google CSE not configured',
      };
    }

    try {
      // Build search query based on resource type
      const typeKeyword =
        resourceType === 'lecture_video'
          ? 'lecture video'
          : resourceType === 'problem_set'
            ? 'problem set solutions'
            : resourceType === 'slides'
              ? 'slides pdf'
              : 'lecture notes';

      const searchQuery = `${concept} ${typeKeyword}`;

      // Search with .edu site restriction
      const resources = await this.searchGoogleCSE(
        searchQuery,
        resourceType,
        limit,
        dayObjectives,
      );

      if (resources.length === 0) {
        return {
          success: false,
          resources: [],
          error: 'No university resources found for this topic',
        };
      }

      this.logger.log(`✅ Found ${resources.length} university resources`);
      return { success: true, resources };
    } catch (error) {
      this.logger.error(`❌ University search failed: ${error.message}`);
      return {
        success: false,
        resources: [],
        error: error.message,
      };
    }
  }

  /**
   * Search using Google Custom Search API
   */
  private async searchGoogleCSE(
    query: string,
    resourceType: UniversityResourceType,
    limit: number,
    dayObjectives: string[] = [],
  ): Promise<UniversityResource[]> {
    // Extract search concept from query (remove type keywords)
    const searchConcept = query
      .replace(
        /\b(lecture video|problem set solutions|slides pdf|lecture notes)\b/gi,
        '',
      )
      .trim()
      .toLowerCase();

    try {
      const response = await axios.get<GoogleCSEResponse>(
        'https://www.googleapis.com/customsearch/v1',
        {
          params: {
            key: this.apiKey,
            cx: this.engineId,
            q: query + ' site:edu', // Restrict to .edu domains
            num: Math.min(limit, 10), // Max 10 per request
          },
          timeout: 10000,
        },
      );

      const items = response.data.items || [];
      const resources: UniversityResource[] = [];

      for (const item of items) {
        const source = this.extractUniversityName(
          item.displayLink || item.link,
        );
        const confidence = this.calculateConfidence(
          item.title,
          item.snippet || '',
          source,
          searchConcept,
          resourceType,
          dayObjectives,
        );

        resources.push({
          type: resourceType,
          source,
          title: item.title,
          url: item.link,
          description: item.snippet || '',
          confidence,
        });
      }

      // Sort by confidence descending
      resources.sort((a, b) => b.confidence - a.confidence);

      return resources;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 429) {
        this.logger.warn('Google CSE rate limit reached (100/day)');
      }
      throw error;
    }
  }

  /**
   * Calculate confidence score for a university resource
   * Uses both search concept and day objectives for content matching
   */
  private calculateConfidence(
    title: string,
    description: string,
    source: string,
    searchConcept: string,
    resourceType: UniversityResourceType,
    dayObjectives: string[] = [],
  ): number {
    let score = 0;
    const titleLower = title.toLowerCase();
    const descLower = description.toLowerCase();
    const conceptWords = searchConcept.split(/\s+/).filter((w) => w.length > 2);

    // Title contains search concept words (+20 max)
    const titleMatches = conceptWords.filter((w) =>
      titleLower.includes(w),
    ).length;
    score += Math.min(20, titleMatches * 10);

    // Top-tier university (+20)
    const topUniversities = ['MIT', 'Stanford', 'Harvard'];
    const goodUniversities = [
      'Berkeley',
      'CMU',
      'Princeton',
      'Yale',
      'Cornell',
    ];
    if (topUniversities.includes(source)) {
      score += 20;
    } else if (goodUniversities.includes(source)) {
      score += 15;
    } else {
      score += 5; // Any .edu gets some credit
    }

    // Title contains resource type indicator (+10)
    const typeIndicators: Record<UniversityResourceType, string[]> = {
      lecture_video: ['lecture', 'video', 'course', 'class'],
      lecture_notes: ['notes', 'lecture', 'slides', 'handout'],
      slides: ['slides', 'presentation', 'ppt'],
      problem_set: [
        'problem',
        'exercise',
        'homework',
        'assignment',
        'solution',
      ],
      assignment: ['assignment', 'project', 'homework'],
      syllabus: ['syllabus', 'course', 'outline'],
      reading: ['reading', 'chapter', 'textbook'],
    };
    const indicators = typeIndicators[resourceType] || [];
    if (indicators.some((ind) => titleLower.includes(ind))) {
      score += 10;
    }

    // Description contains search concept (+10 max)
    const descMatches = conceptWords.filter((w) =>
      descLower.includes(w),
    ).length;
    score += Math.min(10, descMatches * 5);

    // Content matches day objectives (+20 max) - KEY FOR RELEVANCE
    // Only match on SPECIFIC terms, not the generic search concept
    if (dayObjectives.length > 0) {
      const combinedText = `${titleLower} ${descLower}`;
      let objectiveMatches = 0;

      // Get search concept words to exclude from matching
      const conceptWordsToExclude = new Set(conceptWords);

      for (const objective of dayObjectives) {
        // Extract key terms from objective, excluding generic words AND search concept
        const objTerms = objective
          .toLowerCase()
          .replace(
            /\b(understand|learn|master|apply|create|build|implement|use|know|identify|explain|describe|analyze|develop|practice|the|a|an|and|or|to|for|with|how|what|why|when|different|various|basic|advanced|effective|key|main|core|essential|important)\b/g,
            '',
          )
          .split(/\s+/)
          .filter((w) => w.length > 3)
          .filter((w) => !conceptWordsToExclude.has(w)); // Exclude search concept words

        // Check if any SPECIFIC objective terms appear in title or description
        for (const term of objTerms) {
          if (combinedText.includes(term)) {
            objectiveMatches++;
            break; // Count each objective once
          }
        }
      }

      // Score based on percentage of objectives matched (+30 max)
      const matchRatio = objectiveMatches / dayObjectives.length;
      score += Math.round(matchRatio * 30);
    }

    // Has substantial description (+5)
    if (description.length > 50) {
      score += 5;
    }

    // Penalty for generic/listing pages (-15)
    const genericIndicators = [
      'index',
      'search results',
      'all courses',
      'course catalog',
    ];
    if (genericIndicators.some((ind) => titleLower.includes(ind))) {
      score -= 15;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Extract university name from URL
   */
  private extractUniversityName(url: string): string {
    try {
      const hostname = new URL(url).hostname;

      // Check known universities
      if (hostname.includes('mit.edu')) return 'MIT';
      if (hostname.includes('stanford.edu')) return 'Stanford';
      if (hostname.includes('berkeley.edu')) return 'Berkeley';
      if (hostname.includes('harvard.edu')) return 'Harvard';
      if (hostname.includes('cmu.edu')) return 'CMU';
      if (hostname.includes('princeton.edu')) return 'Princeton';
      if (hostname.includes('cornell.edu')) return 'Cornell';
      if (hostname.includes('yale.edu')) return 'Yale';

      // Extract from hostname (e.g., "cs.ucla.edu" -> "UCLA")
      const parts = hostname.split('.');
      const eduIndex = parts.indexOf('edu');
      if (eduIndex > 0) {
        return parts[eduIndex - 1].toUpperCase();
      }

      return 'University';
    } catch {
      return 'University';
    }
  }
}
