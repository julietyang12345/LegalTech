import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  UNIVERSITY_SOURCES,
  UniversityResource,
  UniversityResourceType,
  isUniversityUrl,
} from './university-sources';

// ============================================
// UNIVERSITY RESOURCE SERVICE
// ============================================
// Searches for educational resources from universities:
// - MIT OCW, Stanford, Berkeley, CMU, Harvard
// - Lecture videos, notes, problem sets
// - Uses Google Custom Search API (100 free/day)
// ============================================

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
      this.logger.warn('Google CSE not configured - university search will be limited');
    }
  }

  /**
   * Search for university resources on a topic
   * Uses Google Custom Search API with .edu domain filter
   */
  async searchResources(
    concept: string,
    resourceType: UniversityResourceType = 'lecture_video',
    limit: number = 5,
  ): Promise<UniversitySearchResult> {
    this.logger.log(`🎓 Searching university resources for: "${concept}" (${resourceType})`);

    if (!this.apiKey || !this.engineId) {
      return {
        success: false,
        resources: [],
        error: 'Google CSE not configured',
      };
    }

    try {
      // Build search query based on resource type
      const typeKeyword = resourceType === 'lecture_video' ? 'lecture video'
        : resourceType === 'problem_set' ? 'problem set solutions'
        : resourceType === 'slides' ? 'slides pdf'
        : 'lecture notes';

      const searchQuery = `${concept} ${typeKeyword}`;

      // Search with .edu site restriction
      const resources = await this.searchGoogleCSE(searchQuery, resourceType, limit);

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
  ): Promise<UniversityResource[]> {
    try {
      const response = await axios.get<GoogleCSEResponse>(
        'https://www.googleapis.com/customsearch/v1',
        {
          params: {
            key: this.apiKey,
            cx: this.engineId,
            q: query + ' site:edu',  // Restrict to .edu domains
            num: Math.min(limit, 10), // Max 10 per request
          },
          timeout: 10000,
        },
      );

      const items = response.data.items || [];
      const resources: UniversityResource[] = [];

      for (const item of items) {
        // Verify it's from a trusted university
        const { trusted, source } = isUniversityUrl(item.link);

        // Accept any .edu domain
        const isEdu = item.link.includes('.edu');
        if (!trusted && !isEdu) continue;

        resources.push({
          type: resourceType,
          source: source?.shortName || this.extractUniversityName(item.displayLink || item.link),
          title: item.title,
          url: item.link,
          description: item.snippet || '',
        });
      }

      return resources;

    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 429) {
        this.logger.warn('Google CSE rate limit reached (100/day)');
      }
      throw error;
    }
  }

  /**
   * Search for resources from specific universities
   * More targeted search for high-quality results
   */
  async searchSpecificUniversity(
    concept: string,
    universityShortName: 'MIT' | 'Stanford' | 'Berkeley' | 'Harvard' | 'CMU',
    resourceType: UniversityResourceType = 'lecture_video',
  ): Promise<UniversitySearchResult> {
    const university = UNIVERSITY_SOURCES.find(u => u.shortName === universityShortName);
    if (!university) {
      return { success: false, resources: [], error: 'University not found' };
    }

    const typeKeyword = resourceType === 'lecture_video' ? 'lecture video'
      : resourceType === 'problem_set' ? 'problem set'
      : resourceType === 'slides' ? 'slides'
      : 'lecture notes';

    const query = `${concept} ${typeKeyword} site:${university.domain}`;

    try {
      const response = await axios.get<GoogleCSEResponse>(
        'https://www.googleapis.com/customsearch/v1',
        {
          params: {
            key: this.apiKey,
            cx: this.engineId,
            q: query,
            num: 5,
          },
          timeout: 10000,
        },
      );

      const items = response.data.items || [];
      const resources: UniversityResource[] = items.map(item => ({
        type: resourceType,
        source: university.shortName,
        title: item.title,
        url: item.link,
        description: item.snippet || '',
      }));

      return { success: true, resources };

    } catch (error) {
      return { success: false, resources: [], error: error.message };
    }
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
